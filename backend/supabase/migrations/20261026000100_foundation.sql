-- ELVORA foundation: shared enums, helper functions, profiles, staff roles, audit log.
--
-- Security model (see docs/SECURITY_THREAT_MODEL.md):
--   * Every table has RLS enabled.
--   * Privileges are granted explicitly per column. Supabase's default "grant all" to
--     anon/authenticated is revoked so that columns such as account_status, verified_kinds
--     and staff roles can never be written by a client, even if an RLS policy allows the row.
--   * Privileged state transitions happen in SECURITY DEFINER functions that re-check
--     auth.uid() and staff membership, or through the service role from trusted webhooks.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('active', 'suspended', 'deactivated');
create type public.visibility as enum ('public', 'members', 'connections');
create type public.messaging_policy as enum ('connections', 'members', 'nobody');
create type public.staff_role as enum ('support', 'moderator', 'admin');
create type public.verification_kind as enum ('identity', 'public_figure', 'executive');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Contains no email or other auth PII.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 1000),
  job_title text check (char_length(job_title) <= 80),
  company text check (char_length(company) <= 80),
  industry text check (char_length(industry) <= 60),
  location text check (char_length(location) <= 120),
  website text check (website is null or website ~ '^https://'),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  avatar_path text,
  cover_path text,
  profile_visibility public.visibility not null default 'members',
  discoverable boolean not null default true,
  messaging_policy public.messaging_policy not null default 'connections',
  -- Trusted columns: never client-writable (see grants below).
  verified_kinds public.verification_kind[] not null default '{}',
  account_status public.account_status not null default 'active',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_discovery_idx on public.profiles (created_at desc)
  where account_status = 'active' and discoverable and onboarding_completed_at is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile for every new auth user. The handle is a placeholder the member
-- replaces during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    'member_' || substr(replace(new.id::text, '-', ''), 1, 12),
    left(coalesce(v_name, 'New member'), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Staff roles. Granted only by admins (grant_staff_role) or directly via SQL.
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

-- Staff rank: admin > moderator > support.
create or replace function public.is_staff(p_min_role public.staff_role default 'support')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles s
    where s.user_id = auth.uid()
      and array_position(enum_range(null::public.staff_role), s.role)
          >= array_position(enum_range(null::public.staff_role), p_min_role)
  );
$$;

-- An "active member" is a signed-in, non-suspended account that completed onboarding.
create or replace function public.is_active_member(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user
      and p.account_status = 'active'
      and p.onboarding_completed_at is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written from SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- Status history for every workflow entity (applications, verifications, subscriptions,
-- businesses, listings, campaigns, and account restrictions on profiles).
create table public.status_history (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  subject_user_id uuid,
  from_status text,
  to_status text not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index status_history_entity_idx on public.status_history (entity_type, entity_id, created_at);
create index status_history_subject_idx on public.status_history (subject_user_id, created_at desc);

-- Trigger args: (entity_type, status_column, owner_column)
create or replace function public.track_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := to_jsonb(new) ->> tg_argv[1];
  v_old text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> tg_argv[1] end;
begin
  if tg_op = 'INSERT' or v_new is distinct from v_old then
    insert into public.status_history (entity_type, entity_id, subject_user_id, from_status, to_status, actor_id)
    values (tg_argv[0], (to_jsonb(new) ->> 'id')::uuid,
            case when tg_argv[2] <> '' then (to_jsonb(new) ->> tg_argv[2])::uuid end,
            v_old, v_new, auth.uid());
  end if;
  return null;
end;
$$;

create trigger profiles_status_history after update on public.profiles
  for each row execute function public.track_status_change('profile', 'account_status', 'id');

create or replace function public.write_audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'));
$$;

create or replace function public.grant_staff_role(p_user uuid, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.staff_roles (user_id, role, granted_by)
  values (p_user, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  perform public.write_audit('staff_role.granted', 'profile', p_user::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.revoke_staff_role(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'admins cannot revoke their own role' using errcode = '42501';
  end if;
  delete from public.staff_roles where user_id = p_user;
  perform public.write_audit('staff_role.revoked', 'profile', p_user::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.status_history enable row level security;

revoke all on public.profiles, public.staff_roles, public.audit_log, public.status_history from anon, authenticated;

grant select on public.status_history to authenticated;
create policy "subjects and staff read status history" on public.status_history
  for select to authenticated
  using (subject_user_id = auth.uid() or public.is_staff('support'));

grant select on public.profiles to anon, authenticated;
grant update (
  handle, display_name, headline, bio, job_title, company, industry, location, website,
  interests, avatar_path, cover_path, profile_visibility, discoverable, messaging_policy
) on public.profiles to authenticated;

grant select on public.staff_roles to authenticated;
grant select on public.audit_log to authenticated;

create policy "staff see own role, admins see all" on public.staff_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff('admin'));

create policy "staff read audit log" on public.audit_log
  for select to authenticated
  using (public.is_staff('moderator'));

create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- profile select policy is defined in the social migration, after connections exist.

revoke execute on function public.grant_staff_role(uuid, public.staff_role) from public, anon;
revoke execute on function public.revoke_staff_role(uuid) from public, anon;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
