-- ---------------------------------------------------------------------------
-- Privacy fix: RLS helper functions are SECURITY DEFINER and, being in `public`, are also callable
-- through the API (/rest/v1/rpc/...). Taking arbitrary user ids, they let anyone learn whether two
-- members are connected or blocked, whether a member pays, and which features they hold.
--
-- Policies only ever ask about the signed-in user (auth.uid()), so each helper now answers for
-- other users only to staff and to non-API callers (migrations, service role, SQL editor).
-- Everyone else gets the "nothing" answer, which is exactly what the policies needed anyway.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_member_state(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not distinct from auth.uid()
    or coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         nullif(current_setting('request.jwt.claim.role', true), ''),
         'internal'
       ) not in ('anon', 'authenticated')
    or public.is_staff();
$$;

create or replace function public.has_active_subscription(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_member_state(p_user) and exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

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
    ) features
  ) end;
$$;

create or replace function public.is_eligible_for_plan(p_plan_id text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_member_state(p_user) and exists (
    select 1 from public.membership_plans p
    where p.id = p_plan_id and p.active and not p.is_free
      and public.is_active_member(p_user)
      and (not p.requires_application or exists (
        select 1 from public.membership_applications a
        where a.user_id = p_user and a.plan_id = p.id and a.status = 'approved'))
      and (cardinality(p.required_verifications) = 0 or exists (
        select 1 from public.verifications v
        where v.user_id = p_user and v.status = 'approved' and v.kind = any(p.required_verifications)))
  );
$$;

create or replace function public.are_connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.can_read_member_state(p_a) or public.can_read_member_state(p_b)) and exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and least(c.requester_id, c.addressee_id) = least(p_a, p_b)
      and greatest(c.requester_id, c.addressee_id) = greatest(p_a, p_b)
  );
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.can_read_member_state(p_a) or public.can_read_member_state(p_b)) and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.is_conversation_participant(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_member_state(p_user) and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id = p_user
  );
$$;
