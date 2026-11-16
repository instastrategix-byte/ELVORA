-- ---------------------------------------------------------------------------
-- Complimentary plan grants: admins give a member a plan's features for a fixed period
-- (partners, press, testers, staff) without creating a fake subscription or payment.
-- Grants are separate from billing, always time-limited, audited, and revocable.
-- ---------------------------------------------------------------------------

create table public.plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.membership_plans (id),
  reason text not null check (char_length(reason) between 3 and 500),
  granted_by uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index plan_grants_user_idx on public.plan_grants (user_id, expires_at desc);
create index plan_grants_plan_id_idx on public.plan_grants (plan_id);
create index plan_grants_granted_by_idx on public.plan_grants (granted_by);
create index plan_grants_revoked_by_idx on public.plan_grants (revoked_by);

alter table public.plan_grants enable row level security;
revoke all on public.plan_grants from anon, authenticated;
grant select on public.plan_grants to authenticated;

create policy "members see their own grants; staff see all" on public.plan_grants
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

create or replace function public.grant_plan(p_user uuid, p_plan_id text, p_days integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_expires timestamptz;
begin
  if not public.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'Grants last between 1 and 366 days.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Please give a reason for the grant.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_plans p where p.id = p_plan_id and p.active and not p.is_free) then
    raise exception 'That plan cannot be granted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Member not found.' using errcode = 'P0001';
  end if;

  v_expires := now() + make_interval(days => p_days);
  insert into public.plan_grants (user_id, plan_id, reason, granted_by, expires_at)
  values (p_user, p_plan_id, left(trim(p_reason), 500), auth.uid(), v_expires)
  returning id into v_id;

  perform public.write_audit('plan_grant.created', 'profile', p_user::text,
    jsonb_build_object('grant_id', v_id, 'plan_id', p_plan_id, 'days', p_days, 'expires_at', v_expires));
  perform public.notify(p_user, 'membership_update', auth.uid(), 'plan_grant', v_id,
    jsonb_build_object('plan_id', p_plan_id, 'expires_at', v_expires, 'complimentary', true), 'plan_grant:' || v_id);
  return v_id;
end;
$$;

create or replace function public.revoke_plan_grant(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.plan_grants
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_id and revoked_at is null and expires_at > now()
  returning user_id into v_user;
  if v_user is null then
    raise exception 'That grant is not active.' using errcode = 'P0001';
  end if;
  perform public.write_audit('plan_grant.revoked', 'profile', v_user::text,
    jsonb_build_object('grant_id', p_id, 'reason', left(p_reason, 500)));
end;
$$;

-- Entitlements now include active complimentary grants (same member-state guard as before).
create or replace function public.user_features(p_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.can_read_member_state(p_user) then '{}'::text[] else (
    select coalesce(array_agg(distinct f), '{}')
    from (
      select unnest(p.features) as f
      from public.membership_plans p
      where p.is_free and p.active and public.is_active_member(p_user)
      union
      select unnest(p.features)
      from public.subscriptions s
      join public.membership_plans p on p.id = s.plan_id
      where s.user_id = p_user
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
        and public.is_active_member(p_user)
      union
      select unnest(p.features)
      from public.plan_grants g
      join public.membership_plans p on p.id = g.plan_id
      where g.user_id = p_user
        and g.revoked_at is null
        and now() >= g.starts_at and now() < g.expires_at
        and public.is_active_member(p_user)
    ) features
  ) end;
$$;
