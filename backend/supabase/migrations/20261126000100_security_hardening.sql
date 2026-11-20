-- Security hardening from the database audit. Corrective only: no features or data are removed.
--
-- 1. businesses: verification-only columns (registration number, evidence document paths,
--    reviewer note/identity/time) were readable by anyone who could see an approved business,
--    including signed-out visitors, through the Data API. The UI promises "Used only for
--    verification". They are now readable only by the business owner and moderators, through
--    business_private_details().
-- 2. listings: reviewed_by (a staff member's user id) was publicly readable. Hidden.
-- 3. post_reposts: the table kept Supabase's default ALL privileges for anon/authenticated
--    (TRUNCATE, UPDATE, INSERT of every column) because the original migration never revoked
--    them. RLS still blocked row writes, but TRUNCATE is not subject to RLS. Grants are now
--    exactly what the feature needs.
-- 4. grant_plan / revoke_plan_grant: staff-only functions were executable by signed-out
--    callers (they re-check staff rank, so this was defence in depth). Revoked from anon.
--
-- NOTE for future migrations: SELECT on businesses and listings is now granted per column.
-- A new column on either table must be granted explicitly if clients should read it.

-- 1. businesses ---------------------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'businesses'
    and column_name not in ('registration_number', 'evidence_paths', 'review_note', 'reviewed_by', 'reviewed_at');
  execute 'revoke select on public.businesses from anon, authenticated';
  execute format('grant select (%s) on public.businesses to anon, authenticated', v_cols);
end;
$$;

-- Private verification details for businesses the caller owns, or for moderators. Rows the
-- caller may not see are silently omitted.
create or replace function public.business_private_details(p_ids uuid[])
returns table (id uuid, registration_number text, evidence_paths text[], review_note text, reviewed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.registration_number, b.evidence_paths, b.review_note, b.reviewed_at
  from public.businesses b
  where b.id = any (p_ids[1:200])
    and ((select auth.uid()) is not null)
    and (b.owner_id = (select auth.uid()) or public.is_staff('moderator'));
$$;

revoke all on function public.business_private_details(uuid[]) from public, anon;
grant execute on function public.business_private_details(uuid[]) to authenticated;

-- 2. listings -----------------------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'listings'
    and column_name not in ('reviewed_by');
  execute 'revoke select on public.listings from anon, authenticated';
  execute format('grant select (%s) on public.listings to anon, authenticated', v_cols);
end;
$$;

-- 3. post_reposts -------------------------------------------------------------------------------
revoke all on public.post_reposts from anon, authenticated;
grant select, delete on public.post_reposts to authenticated;
grant insert (user_id, post_id) on public.post_reposts to authenticated;

-- 4. staff-only plan grants ---------------------------------------------------------------------
revoke execute on function public.grant_plan(uuid, text, integer, text) from public, anon;
revoke execute on function public.revoke_plan_grant(uuid, text) from public, anon;
grant execute on function public.grant_plan(uuid, text, integer, text) to authenticated;
grant execute on function public.revoke_plan_grant(uuid, text) to authenticated;
