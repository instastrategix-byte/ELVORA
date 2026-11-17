-- Professional profiles: member type, skills, networking preferences, achievements,
-- social links and a work-experience timeline.
--
-- Every new profile column is member-editable (granted per column, like the existing
-- editable fields). Trusted columns (account_status, verified_kinds, onboarding_completed_at)
-- remain non-writable. Experience rows inherit the visibility of the profile they belong to.

create type public.member_type as enum (
  'founder', 'executive', 'investor', 'professional', 'public_figure', 'creative', 'business'
);

-- Array element checks need an immutable helper (subqueries are not allowed in CHECK).
create or replace function public.text_array_max_len(p_values text[], p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(v) between 1 and p_max), true) from unnest(p_values) as v;
$$;

alter table public.profiles
  add column member_type public.member_type,
  add column skills text[] not null default '{}'
    constraint profiles_skills_check check (cardinality(skills) <= 30 and public.text_array_max_len(skills, 40)),
  add column open_to text[] not null default '{}'
    constraint profiles_open_to_check check (
      open_to <@ array['investing', 'advisory', 'partnerships', 'hiring', 'mentoring', 'speaking', 'board_roles', 'introductions']::text[]
    ),
  add column achievements text[] not null default '{}'
    constraint profiles_achievements_check check (cardinality(achievements) <= 10 and public.text_array_max_len(achievements, 160)),
  add column linkedin_url text
    constraint profiles_linkedin_url_check check (linkedin_url is null or (linkedin_url ~ '^https://' and char_length(linkedin_url) <= 200)),
  add column x_url text
    constraint profiles_x_url_check check (x_url is null or (x_url ~ '^https://' and char_length(x_url) <= 200)),
  add column instagram_url text
    constraint profiles_instagram_url_check check (instagram_url is null or (instagram_url ~ '^https://' and char_length(instagram_url) <= 200));

grant update (member_type, skills, open_to, achievements, linkedin_url, x_url, instagram_url)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Work experience
-- ---------------------------------------------------------------------------
create table public.profile_experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  company text not null check (char_length(company) between 1 and 80),
  location text check (char_length(location) <= 120),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  description text check (char_length(description) <= 600),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index profile_experiences_profile_idx on public.profile_experiences (profile_id, starts_on desc);

-- At most 20 entries per profile.
create or replace function public.enforce_experience_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.profile_experiences e where e.profile_id = new.profile_id) >= 20 then
    raise exception 'a profile can list at most 20 experiences' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profile_experiences_limit
  before insert on public.profile_experiences
  for each row execute function public.enforce_experience_limit();

alter table public.profile_experiences enable row level security;
revoke all on public.profile_experiences from anon, authenticated;
revoke execute on function public.enforce_experience_limit() from anon, authenticated;

grant select on public.profile_experiences to anon, authenticated;
grant insert (profile_id, title, company, location, starts_on, ends_on, description, position)
  on public.profile_experiences to authenticated;
grant update (title, company, location, starts_on, ends_on, description, position)
  on public.profile_experiences to authenticated;
grant delete on public.profile_experiences to authenticated;

-- Visible exactly when the owning profile is visible (the subquery runs under profiles RLS).
create policy "experiences visible with their profile" on public.profile_experiences
  for select
  using (exists (select 1 from public.profiles p where p.id = profile_id));

create policy "members add own experiences" on public.profile_experiences
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "members edit own experiences" on public.profile_experiences
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "members delete own experiences" on public.profile_experiences
  for delete to authenticated
  using (profile_id = (select auth.uid()));
