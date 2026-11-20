-- Relationship manager: private notes, tags, stage and follow-up reminders a member keeps about
-- their own contacts.
--
-- Privacy: every row belongs to its owner and is readable ONLY by the owner. The contact never
-- sees anything (not even that a note exists), and neither does anyone else — there is
-- deliberately no staff read policy.
--
-- Scope: notes and reminders can only be created or edited for people the owner is connected to
-- or shares a conversation with. Existing notes stay readable and deletable by the owner if that
-- relationship later ends.
--
-- Reminders are surfaced in the app when due; there is no scheduled job or email.

create or replace function public.crm_contact_allowed(p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_contact is distinct from (select auth.uid())
    and (
      exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester_id = (select auth.uid()) and c.addressee_id = p_contact)
            or (c.requester_id = p_contact and c.addressee_id = (select auth.uid())))
      )
      or exists (
        select 1 from public.conversation_participants a
        join public.conversation_participants b on b.conversation_id = a.conversation_id
        where a.user_id = (select auth.uid()) and b.user_id = p_contact
      )
    );
$$;
revoke execute on function public.crm_contact_allowed(uuid) from public, anon;
grant execute on function public.crm_contact_allowed(uuid) to authenticated;

create table public.contact_notes (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 10
    and array_position(tags, null) is null
  ),
  stage text not null default 'none' check (stage in ('none', 'warm', 'active', 'deal')),
  last_contacted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);
create index contact_notes_owner_updated_idx on public.contact_notes (owner_id, updated_at desc);

-- Tags: trimmed, lower-cased, 1–32 characters, no duplicates.
create or replace function public.contact_notes_normalise()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tag text;
begin
  new.tags := coalesce(
    (select array_agg(distinct t order by t) from (select lower(btrim(x)) as t from unnest(new.tags) as x) s where t <> ''),
    '{}'
  );
  foreach v_tag in array new.tags loop
    if char_length(v_tag) > 32 then
      raise exception 'Tags can be up to 32 characters' using errcode = '22023';
    end if;
  end loop;
  if cardinality(new.tags) > 10 then
    raise exception 'Use up to 10 tags' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger contact_notes_normalise before insert or update on public.contact_notes
  for each row execute function public.contact_notes_normalise();

create table public.contact_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  due_on date not null,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  check (owner_id <> contact_id)
);
create index contact_reminders_owner_due_idx on public.contact_reminders (owner_id, due_on) where done_at is null;
create index contact_reminders_owner_contact_idx on public.contact_reminders (owner_id, contact_id);

alter table public.contact_notes enable row level security;
alter table public.contact_reminders enable row level security;
revoke all on public.contact_notes, public.contact_reminders from anon, authenticated;
grant select, delete on public.contact_notes, public.contact_reminders to authenticated;
grant insert (contact_id, body, tags, stage, last_contacted_on) on public.contact_notes to authenticated;
grant update (body, tags, stage, last_contacted_on) on public.contact_notes to authenticated;
grant insert (contact_id, due_on, body) on public.contact_reminders to authenticated;
grant update (due_on, body, done_at) on public.contact_reminders to authenticated;

create policy "contact notes: owner reads" on public.contact_notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "contact notes: owner creates for own contacts" on public.contact_notes
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.crm_contact_allowed(contact_id));
create policy "contact notes: owner edits for own contacts" on public.contact_notes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.crm_contact_allowed(contact_id));
create policy "contact notes: owner deletes" on public.contact_notes
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "contact reminders: owner reads" on public.contact_reminders
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "contact reminders: owner creates for own contacts" on public.contact_reminders
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.crm_contact_allowed(contact_id));
create policy "contact reminders: owner edits" on public.contact_reminders
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "contact reminders: owner deletes" on public.contact_reminders
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Abuse/size guard: at most 200 open reminders per member.
create or replace function public.contact_reminders_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.contact_reminders where owner_id = new.owner_id and done_at is null) >= 200 then
    raise exception 'You have too many open reminders' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger contact_reminders_limit before insert on public.contact_reminders
  for each row execute function public.contact_reminders_limit();

revoke execute on function public.contact_notes_normalise() from public, anon, authenticated;
revoke execute on function public.contact_reminders_limit() from public, anon, authenticated;
