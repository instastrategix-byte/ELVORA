-- Profile links: any number of social / web links per member (up to 12), each with its own
-- visibility. Replaces profiles.linkedin_url / x_url / instagram_url / website for display;
-- those columns are kept (deprecated) so nothing reading them breaks, but the app no longer
-- writes them.

create type public.profile_link_platform as enum (
  'instagram', 'linkedin', 'x', 'facebook', 'youtube', 'tiktok', 'pinterest', 'github', 'website', 'other'
);

-- Platform-aware URL rule, shared by the CHECK constraint and mirrored in
-- backend/src/modules/profiles/links.ts. https only, no whitespace, a real host, and for named
-- platforms the host must belong to that platform.
create or replace function public.profile_link_url_ok(p_platform public.profile_link_platform, p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with h as (
    select lower(substring(p_url from '^https://([^/?#:@\s]+)(?::[0-9]{1,5})?(?:[/?#]|$)')) as host
  )
  select
    p_url is not null
    and char_length(p_url) <= 300
    and p_url !~ '\s'
    and h.host is not null
    and h.host ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
    and case p_platform
      when 'instagram' then h.host ~ '^(www\.)?instagram\.com$'
      when 'linkedin' then h.host ~ '(^|\.)linkedin\.com$'
      when 'x' then h.host ~ '^(www\.|mobile\.)?(x|twitter)\.com$'
      when 'facebook' then h.host ~ '(^|\.)(facebook\.com|fb\.com)$'
      when 'youtube' then h.host ~ '(^|\.)youtube\.com$' or h.host = 'youtu.be'
      when 'tiktok' then h.host ~ '(^|\.)tiktok\.com$'
      when 'pinterest' then h.host ~ '(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$' or h.host = 'pin.it'
      when 'github' then h.host ~ '^(www\.)?github\.com$'
      else true
    end
  from h;
$$;

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform public.profile_link_platform not null,
  url text not null,
  label text check (label is null or char_length(trim(label)) between 1 and 40),
  visibility public.visibility not null default 'members',
  position smallint not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  constraint profile_links_url_valid check (public.profile_link_url_ok(platform, url)),
  constraint profile_links_other_needs_label check (platform <> 'other' or label is not null)
);

create index profile_links_profile_idx on public.profile_links (profile_id, position);
-- One link per named platform; websites and custom links may repeat (within the overall cap).
create unique index profile_links_one_per_platform on public.profile_links (profile_id, platform)
  where platform not in ('website', 'other');

-- Cap (12 per profile) and default ordering. Locks per profile so concurrent inserts can't
-- both slip past the cap.
create or replace function public.profile_links_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('profile_links:' || new.profile_id::text, 0));
  select count(*), coalesce(max(position) + 1, 0) into v_count, new.position
  from public.profile_links where profile_id = new.profile_id;
  if v_count >= 12 then
    raise exception 'You can add up to 12 links' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger profile_links_before_insert before insert on public.profile_links
  for each row execute function public.profile_links_before_insert();

-- Whether the caller may see a link with this visibility on this profile. SECURITY DEFINER so it
-- can check the connection between the caller and the profile owner (the shared are_connected
-- helper only answers about the caller's own relationships); it reveals nothing beyond the
-- yes/no answer for the caller.
create or replace function public.can_view_profile_link(p_profile uuid, p_visibility public.visibility)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile
      and (
        p.id = (select auth.uid())
        or public.is_staff('support')
        or (
          public.can_view_profile(p.id, p.profile_visibility, p.account_status, p.onboarding_completed_at is not null)
          and case p_visibility
            when 'public' then true
            when 'members' then (select auth.uid()) is not null and public.is_active_member((select auth.uid()))
            when 'connections' then exists (
              select 1 from public.connections c
              where c.status = 'accepted'
                and ((c.requester_id = p.id and c.addressee_id = (select auth.uid()))
                  or (c.addressee_id = p.id and c.requester_id = (select auth.uid())))
            )
          end
        )
      )
  );
$$;

revoke execute on function public.can_view_profile_link(uuid, public.visibility) from public;
grant execute on function public.can_view_profile_link(uuid, public.visibility) to anon, authenticated;
revoke execute on function public.profile_links_before_insert() from public, anon, authenticated;

alter table public.profile_links enable row level security;
revoke all on public.profile_links from anon, authenticated;
grant select on public.profile_links to anon, authenticated;
grant insert (profile_id, platform, url, label, visibility) on public.profile_links to authenticated;
grant update (url, label, visibility, position) on public.profile_links to authenticated;
grant delete on public.profile_links to authenticated;

create policy "profile links visible per link visibility" on public.profile_links
  for select
  using (profile_id = (select auth.uid()) or public.can_view_profile_link(profile_id, visibility));

create policy "members add own links" on public.profile_links
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "members edit own links" on public.profile_links
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "members remove own links" on public.profile_links
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Carry existing links over. They were shown to whoever could see the profile, so they keep the
-- profile's visibility. Values that don't match their platform's host become labelled custom
-- links rather than being dropped; anything that isn't a valid https URL at all is skipped.
insert into public.profile_links (profile_id, platform, url, label, visibility)
select p.id,
       case when public.profile_link_url_ok(src.platform, src.url) then src.platform else 'other'::public.profile_link_platform end,
       src.url,
       case when public.profile_link_url_ok(src.platform, src.url) then null else src.label end,
       p.profile_visibility
from public.profiles p
cross join lateral (
  values
    ('website'::public.profile_link_platform, p.website, 'Website'),
    ('linkedin'::public.profile_link_platform, p.linkedin_url, 'LinkedIn'),
    ('x'::public.profile_link_platform, p.x_url, 'X'),
    ('instagram'::public.profile_link_platform, p.instagram_url, 'Instagram')
) as src(platform, url, label)
where src.url is not null
  and public.profile_link_url_ok('other', src.url);

comment on column public.profiles.linkedin_url is 'Deprecated: use public.profile_links. Kept for compatibility; no longer written by the app.';
comment on column public.profiles.x_url is 'Deprecated: use public.profile_links. Kept for compatibility; no longer written by the app.';
comment on column public.profiles.instagram_url is 'Deprecated: use public.profile_links. Kept for compatibility; no longer written by the app.';
comment on column public.profiles.website is 'Deprecated for display: use public.profile_links (platform website). Kept for compatibility.';
