-- Marketplace: a "Premium brands & services" category and staff-curated featured listings.
--
-- Featuring is editorial curation by ELVORA staff (moderator or admin). It is deliberately separate
-- from paid "Sponsored" ad placements (ad_campaigns): nobody can pay for, or set, featured_until.

alter type public.listing_category add value if not exists 'brand';

alter table public.listings add column featured_until timestamptz;

comment on column public.listings.featured_until is
  'Staff-curated feature window (set only via set_listing_featured). Not client-writable; not a paid placement.';

-- The existing column-level grants on listings (insert/update) don't include featured_until, so
-- clients can't write it. Re-state the restriction explicitly in case of future table-level grants.
revoke update (featured_until) on public.listings from anon, authenticated;
revoke insert (featured_until) on public.listings from anon, authenticated;

create index listings_featured_idx on public.listings (featured_until desc) where featured_until is not null;

-- Feature (p_days 1..90) or unfeature (p_days 0) a published listing. Moderators and admins only; audited.
create or replace function public.set_listing_featured(p_listing uuid, p_days int)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days < 0 or p_days > 90 then
    raise exception 'Feature length must be between 0 and 90 days' using errcode = '22023';
  end if;
  v_until := case when p_days = 0 then null else now() + make_interval(days => p_days) end;
  update public.listings
     set featured_until = v_until
   where id = p_listing
     and (p_days = 0 or status = 'published');
  if not found then
    raise exception 'Only published listings can be featured' using errcode = 'P0001';
  end if;
  perform public.write_audit(
    case when p_days = 0 then 'listing.unfeatured' else 'listing.featured' end,
    'listing', p_listing::text, jsonb_build_object('days', p_days, 'until', v_until));
  return v_until;
end;
$$;

revoke execute on function public.set_listing_featured(uuid, int) from public, anon;
grant execute on function public.set_listing_featured(uuid, int) to authenticated;
