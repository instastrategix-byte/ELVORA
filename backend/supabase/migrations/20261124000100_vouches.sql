-- Vouching: members publicly stand behind people they know.
--
-- * A member vouches for a connection (or for someone who asked them to be a referee on a
--   membership application). One active vouch per pair, never for yourself, at most
--   10 vouches per calendar month (withdrawn ones still count, so the cap can't be churned).
-- * Vouchers can withdraw; the vouchee can hide any vouch from their profile. The voucher is
--   never told that a vouch was hidden (the flag isn't readable by them).
-- * Vouch requests: a member asks a connection, or an applicant names a referee. Declines are
--   silent — the requester keeps seeing "pending" until the request lapses after 30 days, and
--   can't re-ask the same member for 30 days.
-- * Everyone else sees a vouch only when they can see both profiles and nobody is blocked.
-- * Staff (moderator+) see everything, including referees on applications. Vouches don't change
--   any approval rule; they are shown to reviewers only.
--
-- Every write goes through the SECURITY DEFINER functions below.

alter type public.notification_type add value if not exists 'vouch_received';
alter type public.notification_type add value if not exists 'vouch_requested';
-- Used by 20261124000200_introduction_double_opt_in.sql. A new enum value can't be used in the
-- transaction that adds it, so it is added here, one migration earlier.
alter type public.introduction_status add value if not exists 'expired';

create type public.vouch_relationship as enum ('worked_together', 'invested', 'client', 'personal', 'other');
create type public.vouch_request_status as enum ('pending', 'accepted', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.vouch_requests (
  id uuid primary key default gen_random_uuid(),
  -- The member asking to be vouched for.
  requester_id uuid not null references public.profiles (id) on delete cascade,
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  -- Set when the requester named this member as a referee on a membership application.
  application_id uuid references public.membership_applications (id) on delete cascade,
  message text check (char_length(message) <= 400),
  status public.vouch_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  requester_cancelled_at timestamptz,
  check (requester_id <> voucher_id)
);
create unique index vouch_requests_one_pending on public.vouch_requests (requester_id, voucher_id) where status = 'pending';
create index vouch_requests_voucher_idx on public.vouch_requests (voucher_id, status, created_at desc);
create index vouch_requests_requester_idx on public.vouch_requests (requester_id, created_at desc);
create index vouch_requests_application_idx on public.vouch_requests (application_id) where application_id is not null;

create table public.vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  vouchee_id uuid not null references public.profiles (id) on delete cascade,
  relationship public.vouch_relationship not null,
  note text check (char_length(note) <= 280),
  request_id uuid references public.vouch_requests (id) on delete set null,
  hidden_by_vouchee boolean not null default false,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (voucher_id <> vouchee_id)
);
create unique index vouches_one_active on public.vouches (voucher_id, vouchee_id) where withdrawn_at is null;
create index vouches_vouchee_idx on public.vouches (vouchee_id, created_at desc) where withdrawn_at is null;
create index vouches_voucher_month_idx on public.vouches (voucher_id, created_at);
create index vouches_request_idx on public.vouches (request_id) where request_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------------------------
-- Whether the caller may see a vouch between these two members: both profiles visible to the
-- caller, nobody blocked, voucher still an active member.
create or replace function public.can_see_vouch(p_voucher uuid, p_vouchee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.is_active_member(p_voucher)
    and not public.is_blocked_between((select auth.uid()), p_voucher)
    and not public.is_blocked_between((select auth.uid()), p_vouchee)
    and exists (
      select 1 from public.profiles p
      where p.id = p_voucher
        and public.can_view_profile(p.id, p.profile_visibility, p.account_status, p.onboarding_completed_at is not null)
    )
    and exists (
      select 1 from public.profiles p
      where p.id = p_vouchee
        and public.can_view_profile(p.id, p.profile_visibility, p.account_status, p.onboarding_completed_at is not null)
    );
$$;
revoke execute on function public.can_see_vouch(uuid, uuid) from public, anon;
grant execute on function public.can_see_vouch(uuid, uuid) to authenticated;

alter table public.vouches enable row level security;
alter table public.vouch_requests enable row level security;
revoke all on public.vouches, public.vouch_requests from anon, authenticated;

-- hidden_by_vouchee is deliberately not readable: the vouchee reads it through
-- my_received_vouches(), and nobody else needs it (hidden vouches are filtered by the policy).
grant select (id, voucher_id, vouchee_id, relationship, note, created_at, withdrawn_at) on public.vouches to authenticated;

create policy "read visible vouches" on public.vouches
  for select to authenticated
  using (
    voucher_id = (select auth.uid())
    or (vouchee_id = (select auth.uid()) and withdrawn_at is null)
    or (withdrawn_at is null and not hidden_by_vouchee and public.can_see_vouch(voucher_id, vouchee_id))
    or public.is_staff('moderator')
  );

-- The voucher sees requests addressed to them (pending ones only — answered requests are
-- history they don't need); requesters read their own through my_sent_vouch_requests(), which
-- hides declines. Staff see everything.
grant select on public.vouch_requests to authenticated;
create policy "voucher or staff read vouch requests" on public.vouch_requests
  for select to authenticated
  using (
    (voucher_id = (select auth.uid()) and status = 'pending' and created_at > now() - interval '30 days')
    or public.is_staff('moderator')
  );

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------------------------
create or replace function public.vouch_connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = p_a and c.addressee_id = p_b) or (c.requester_id = p_b and c.addressee_id = p_a))
  );
$$;
revoke execute on function public.vouch_connected(uuid, uuid) from public, anon, authenticated;

-- Writes a vouch from p_voucher, enforcing every rule except "how do they know each other",
-- which the callers check.
create or replace function public.insert_vouch(p_voucher uuid, p_vouchee uuid, p_relationship public.vouch_relationship, p_note text, p_request uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_month int;
begin
  if p_voucher = p_vouchee then
    raise exception 'You can''t vouch for yourself' using errcode = '22023';
  end if;
  if not public.is_active_member(p_voucher) then
    raise exception 'Your account can''t vouch for members right now' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_vouchee and account_status = 'active') then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(p_voucher, p_vouchee) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.vouches where voucher_id = p_voucher and vouchee_id = p_vouchee and withdrawn_at is null) then
    raise exception 'You already vouch for this member' using errcode = '23505';
  end if;
  -- Serialise per voucher so two concurrent vouches can't both slip under the cap.
  perform pg_advisory_xact_lock(hashtext('vouch:' || p_voucher::text));
  select count(*) into v_month from public.vouches
  where voucher_id = p_voucher and created_at >= date_trunc('month', now());
  if v_month >= 10 then
    raise exception 'You can vouch for up to 10 members a month' using errcode = '54000';
  end if;

  insert into public.vouches (voucher_id, vouchee_id, relationship, note, request_id)
  values (p_voucher, p_vouchee, p_relationship, nullif(trim(coalesce(p_note, '')), ''), p_request)
  returning id into v_id;

  perform public.notify(p_vouchee, 'vouch_received', p_voucher, 'vouch', v_id, jsonb_build_object('relationship', p_relationship));
  return v_id;
end;
$$;
revoke execute on function public.insert_vouch(uuid, uuid, public.vouch_relationship, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------------------------------
-- Vouch directly for a connection. If they had asked you, their request is marked accepted.
create or replace function public.vouch_for(p_vouchee uuid, p_relationship public.vouch_relationship, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_request uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to vouch for members' using errcode = '42501';
  end if;
  select id into v_request from public.vouch_requests
  where requester_id = p_vouchee and voucher_id = v_me and status = 'pending' and created_at > now() - interval '30 days'
  for update;
  if v_request is null and not public.vouch_connected(v_me, p_vouchee) then
    raise exception 'You can only vouch for your connections' using errcode = '42501';
  end if;
  v_id := public.insert_vouch(v_me, p_vouchee, p_relationship, p_note, v_request);
  if v_request is not null then
    update public.vouch_requests set status = 'accepted', responded_at = now() where id = v_request;
  end if;
  return v_id;
end;
$$;

create or replace function public.withdraw_vouch(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.vouches set withdrawn_at = now()
  where id = p_id and voucher_id = auth.uid() and withdrawn_at is null;
  if not found then
    raise exception 'Vouch not found' using errcode = 'P0002';
  end if;
end;
$$;

-- The vouchee decides which vouches appear on their profile.
create or replace function public.set_vouch_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.vouches set hidden_by_vouchee = coalesce(p_hidden, false)
  where id = p_id and vouchee_id = auth.uid() and withdrawn_at is null;
  if not found then
    raise exception 'Vouch not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Ask a member to vouch for you: a connection, or a referee named on your open application.
create or replace function public.request_vouch(p_voucher uuid, p_message text default null, p_application uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_recent int;
begin
  if v_me is null then
    raise exception 'Sign in to ask for a vouch' using errcode = '42501';
  end if;
  if not public.is_active_member(v_me) then
    raise exception 'Your account can''t ask for vouches right now' using errcode = '42501';
  end if;
  if p_voucher is null or p_voucher = v_me then
    raise exception 'Choose another member' using errcode = '22023';
  end if;
  -- Blocked, inactive and unknown members look the same to the caller.
  if not public.is_active_member(p_voucher) or public.is_blocked_between(v_me, p_voucher) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if p_application is not null then
    if not exists (
      select 1 from public.membership_applications a
      where a.id = p_application and a.user_id = v_me and a.status in ('submitted', 'under_review')
    ) then
      raise exception 'Application not found' using errcode = 'P0002';
    end if;
    if (select count(*) from public.vouch_requests where application_id = p_application) >= 5 then
      raise exception 'You can name up to 5 referees per application' using errcode = '54000';
    end if;
  elsif not public.vouch_connected(v_me, p_voucher) then
    raise exception 'You can only ask your connections for a vouch' using errcode = '42501';
  end if;
  if exists (select 1 from public.vouches where voucher_id = p_voucher and vouchee_id = v_me and withdrawn_at is null) then
    raise exception 'This member already vouches for you' using errcode = '23505';
  end if;
  -- One request per member per 30 days, whatever happened to it, so neither re-asking nor
  -- cancelling can reveal whether an earlier request was declined.
  if exists (
    select 1 from public.vouch_requests
    where requester_id = v_me and voucher_id = p_voucher and created_at > now() - interval '30 days'
  ) then
    raise exception 'You''ve already asked this member recently' using errcode = '23505';
  end if;
  select count(*) into v_recent from public.vouch_requests
  where requester_id = v_me and created_at > now() - interval '30 days';
  if v_recent >= 20 then
    raise exception 'You''ve reached the limit of 20 vouch requests a month' using errcode = '54000';
  end if;
  -- A lapsed pending request would block the unique index; close it first.
  update public.vouch_requests set status = 'cancelled', responded_at = now()
  where requester_id = v_me and voucher_id = p_voucher and status = 'pending';

  insert into public.vouch_requests (requester_id, voucher_id, application_id, message)
  values (v_me, p_voucher, p_application, nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_id;

  perform public.notify(p_voucher, 'vouch_requested', v_me, 'vouch_request', v_id,
    jsonb_build_object('application', p_application is not null));
  return v_id;
end;
$$;

-- The asked member accepts (writes the vouch) or declines (silently).
create or replace function public.respond_vouch_request(
  p_id uuid, p_accept boolean, p_relationship public.vouch_relationship default null, p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  r public.vouch_requests;
  v_id uuid;
begin
  select * into r from public.vouch_requests where id = p_id for update;
  if not found or r.voucher_id is distinct from v_me or r.status <> 'pending' or r.created_at <= now() - interval '30 days' then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if p_accept then
    if p_relationship is null then
      raise exception 'Say how you know this member' using errcode = '22023';
    end if;
    v_id := public.insert_vouch(v_me, r.requester_id, p_relationship, p_note, r.id);
    update public.vouch_requests set status = 'accepted', responded_at = now() where id = p_id;
    return v_id;
  end if;
  update public.vouch_requests set status = 'declined', responded_at = now() where id = p_id;
  return null;
end;
$$;

create or replace function public.cancel_vouch_request(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- A declined request can be "cancelled" too (it keeps its real status for staff), so
  -- cancelling never reveals a decline.
  update public.vouch_requests
    set requester_cancelled_at = now(),
        status = case when status = 'pending' then 'cancelled'::public.vouch_request_status else status end,
        responded_at = coalesce(responded_at, now())
  where id = p_id and requester_id = auth.uid() and status in ('pending', 'declined') and requester_cancelled_at is null;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

-- The caller's own requests. Declines are reported as pending until the request lapses.
create or replace function public.my_sent_vouch_requests()
returns table (id uuid, voucher_id uuid, application_id uuid, message text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.voucher_id, r.application_id, r.message,
    case
      when r.status = 'accepted' then 'accepted'
      when r.requester_cancelled_at is not null then 'cancelled'
      when r.created_at <= now() - interval '30 days' then 'expired'
      else 'pending'
    end,
    r.created_at
  from public.vouch_requests r
  where r.requester_id = (select auth.uid())
  order by r.created_at desc
  limit 100;
$$;

-- Vouches about the caller, including hidden ones (with the flag) so they can manage them.
create or replace function public.my_received_vouches()
returns table (id uuid, voucher_id uuid, relationship public.vouch_relationship, note text, hidden boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.voucher_id, v.relationship, v.note, v.hidden_by_vouchee, v.created_at
  from public.vouches v
  where v.vouchee_id = (select auth.uid()) and v.withdrawn_at is null
    and not public.is_blocked_between(v.voucher_id, v.vouchee_id)
  order by v.created_at desc;
$$;

-- How many vouches the caller has used this month.
create or replace function public.my_vouch_allowance()
returns table (used int, cap int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, 10
  from public.vouches
  where voucher_id = (select auth.uid()) and created_at >= date_trunc('month', now());
$$;

revoke execute on function public.vouch_for(uuid, public.vouch_relationship, text) from public, anon;
revoke execute on function public.withdraw_vouch(uuid) from public, anon;
revoke execute on function public.set_vouch_hidden(uuid, boolean) from public, anon;
revoke execute on function public.request_vouch(uuid, text, uuid) from public, anon;
revoke execute on function public.respond_vouch_request(uuid, boolean, public.vouch_relationship, text) from public, anon;
revoke execute on function public.cancel_vouch_request(uuid) from public, anon;
revoke execute on function public.my_sent_vouch_requests() from public, anon;
revoke execute on function public.my_received_vouches() from public, anon;
revoke execute on function public.my_vouch_allowance() from public, anon;
grant execute on function public.vouch_for(uuid, public.vouch_relationship, text) to authenticated;
grant execute on function public.withdraw_vouch(uuid) to authenticated;
grant execute on function public.set_vouch_hidden(uuid, boolean) to authenticated;
grant execute on function public.request_vouch(uuid, text, uuid) to authenticated;
grant execute on function public.respond_vouch_request(uuid, boolean, public.vouch_relationship, text) to authenticated;
grant execute on function public.cancel_vouch_request(uuid) to authenticated;
grant execute on function public.my_sent_vouch_requests() to authenticated;
grant execute on function public.my_received_vouches() to authenticated;
grant execute on function public.my_vouch_allowance() to authenticated;
