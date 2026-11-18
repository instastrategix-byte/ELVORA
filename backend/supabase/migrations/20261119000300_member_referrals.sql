-- Member referrals: established members vouch for people they know with personal, single-use
-- invitation codes. Built on the existing invitations table so redemption stays one path
-- (check_invitation / redeem_invitation → a membership application that staff still review).
--
-- Codes are stored hashed (as for staff invitations); the plain code is returned exactly once,
-- when it is created. Members read their own invitations only through list_member_invitations,
-- which exposes status, expiry and the redeemer's profile id — never the code hash.

alter type public.notification_type add value if not exists 'referral_joined';

alter table public.invitations
  add column if not exists is_referral boolean not null default false,
  add column if not exists note text check (char_length(note) <= 200);

create index if not exists invitations_referrals_idx on public.invitations (created_by, created_at desc) where is_referral;

-- Plan referred people apply for. Applications are always reviewed (never pre-approved).
create or replace function public.referral_plan_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select id from public.membership_plans where id = 'premium' and active),
    (select id from public.membership_plans where active and requires_application order by sort_order limit 1)
  );
$$;

-- Who may vouch: active onboarded members with a paid subscription, an active complimentary
-- grant, or an approved verification.
create or replace function public.can_refer_members(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and p_user = auth.uid()
    and public.is_active_member(p_user)
    and (
      public.has_active_subscription(p_user)
      or exists (
        select 1 from public.plan_grants g
        where g.user_id = p_user and g.revoked_at is null and now() >= g.starts_at and now() < g.expires_at
      )
      or exists (select 1 from public.profiles p where p.id = p_user and cardinality(p.verified_kinds) > 0)
    );
$$;

create or replace function public.create_member_invitation(p_email text default null, p_note text default null)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_open int;
  v_recent int;
  v_code text;
  v_plan text := public.referral_plan_id();
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_row public.invitations;
begin
  if not public.can_refer_members(v_me) then
    raise exception 'Invitations are available to verified members and members with an active membership' using errcode = '42501';
  end if;
  if v_plan is null then
    raise exception 'Invitations are not available right now' using errcode = '55000';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  -- Serialize per member so concurrent requests can't exceed the quotas.
  perform pg_advisory_xact_lock(hashtextextended('member_invitations:' || v_me::text, 0));

  select count(*) into v_open from public.invitations i
  where i.created_by = v_me and i.is_referral and i.revoked_at is null
    and i.use_count < i.max_uses and (i.expires_at is null or i.expires_at > now());
  if v_open >= 5 then
    raise exception 'You can have up to 5 open invitations at a time' using errcode = '54000';
  end if;

  select count(*) into v_recent from public.invitations i
  where i.created_by = v_me and i.is_referral and i.created_at > now() - interval '30 days';
  if v_recent >= 20 then
    raise exception 'You have reached the limit of 20 invitations in 30 days' using errcode = '54000';
  end if;

  -- 80 random bits from gen_random_uuid (cryptographically random), formatted ELV-XXXX-XXXX-XXXX-XXXX.
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  v_code := 'ELV-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4) || '-' || substr(v_code, 13, 4);

  insert into public.invitations (code_hash, plan_id, email, pre_approved, max_uses, expires_at, created_by, is_referral, note)
  values (public.hash_invitation_code(v_code), v_plan, v_email, false, 1, now() + interval '14 days', v_me, true,
          nullif(left(trim(coalesce(p_note, '')), 200), ''))
  returning * into v_row;

  perform public.write_audit('invitation.referral_created', 'invitation', v_row.id::text, jsonb_build_object('has_email', v_email is not null));
  return query select v_row.id, v_code, v_row.expires_at;
end;
$$;

create or replace function public.revoke_member_invitation(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.invitations set revoked_at = now()
  where id = p_id and created_by = auth.uid() and is_referral and revoked_at is null and use_count = 0;
  if not found then
    raise exception 'Invitation not found or already used' using errcode = 'P0002';
  end if;
end;
$$;

-- The caller's own referral invitations. Never exposes the code hash.
create or replace function public.list_member_invitations()
returns table (
  id uuid,
  email text,
  note text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.email, i.note,
    case
      when i.use_count >= i.max_uses then 'joined'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at is not null and i.expires_at <= now() then 'expired'
      else 'pending'
    end,
    i.created_at, i.expires_at, a.created_at, a.user_id
  from public.invitations i
  left join lateral (
    select ma.created_at, ma.user_id from public.membership_applications ma
    where ma.invitation_id = i.id order by ma.created_at limit 1
  ) a on true
  where i.created_by = (select auth.uid()) and i.is_referral
  order by i.created_at desc
  limit 100;
$$;

-- Tell the member who vouched when their invitation is used.
create or replace function public.notify_referral_redeemed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter uuid;
begin
  if new.invitation_id is null then
    return new;
  end if;
  select i.created_by into v_inviter from public.invitations i where i.id = new.invitation_id and i.is_referral;
  if v_inviter is not null then
    perform public.notify(v_inviter, 'referral_joined', new.user_id, 'invitation', new.invitation_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger membership_applications_referral_notify
  after insert on public.membership_applications
  for each row execute function public.notify_referral_redeemed();

revoke execute on function public.can_refer_members(uuid) from public, anon;
revoke execute on function public.create_member_invitation(text, text) from public, anon;
revoke execute on function public.revoke_member_invitation(uuid) from public, anon;
revoke execute on function public.list_member_invitations() from public, anon;
revoke execute on function public.notify_referral_redeemed() from public, anon, authenticated;
grant execute on function public.can_refer_members(uuid) to authenticated;
grant execute on function public.create_member_invitation(text, text) to authenticated;
grant execute on function public.revoke_member_invitation(uuid) to authenticated;
grant execute on function public.list_member_invitations() to authenticated;
