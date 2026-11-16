-- ---------------------------------------------------------------------------
-- Performance at scale (Supabase advisor: unindexed_foreign_keys, auth_rls_initplan).
-- No behaviour change: same rows are visible/writable before and after.
-- ---------------------------------------------------------------------------

-- 1. Covering indexes for foreign keys (joins, cascades and "my items" lookups).
create index if not exists ad_campaigns_advertiser_account_id_idx on public.ad_campaigns (advertiser_account_id);
create index if not exists ad_campaigns_listing_id_idx on public.ad_campaigns (listing_id);
create index if not exists ad_campaigns_reviewed_by_idx on public.ad_campaigns (reviewed_by);
create index if not exists advertiser_accounts_business_id_idx on public.advertiser_accounts (business_id);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
create index if not exists businesses_reviewed_by_idx on public.businesses (reviewed_by);
create index if not exists invitations_created_by_idx on public.invitations (created_by);
create index if not exists invitations_plan_id_idx on public.invitations (plan_id);
create index if not exists listing_saves_listing_id_idx on public.listing_saves (listing_id);
create index if not exists listings_reviewed_by_idx on public.listings (reviewed_by);
create index if not exists membership_applications_invitation_id_idx on public.membership_applications (invitation_id);
create index if not exists membership_applications_plan_id_idx on public.membership_applications (plan_id);
create index if not exists membership_applications_reviewer_id_idx on public.membership_applications (reviewer_id);
create index if not exists moderation_actions_actor_id_idx on public.moderation_actions (actor_id);
create index if not exists moderation_actions_report_id_idx on public.moderation_actions (report_id);
create index if not exists moderation_actions_target_user_id_idx on public.moderation_actions (target_user_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create index if not exists post_comments_author_id_idx on public.post_comments (author_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists post_media_owner_id_idx on public.post_media (owner_id);
create index if not exists post_saves_post_id_idx on public.post_saves (post_id);
create index if not exists reports_handled_by_idx on public.reports (handled_by);
create index if not exists staff_roles_granted_by_idx on public.staff_roles (granted_by);
create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_price_id_idx on public.subscriptions (price_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);
create index if not exists verifications_reviewer_id_idx on public.verifications (reviewer_id);

-- 2. Evaluate auth.uid() once per statement instead of once per row: wrap it in a scalar
--    sub-select (an InitPlan). Rewrites every public policy in place, preserving its logic.
do $$
declare
  p record;
  v_using text;
  v_check text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)')
  loop
    v_using := regexp_replace(p.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    v_check := regexp_replace(p.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    execute format(
      'alter policy %I on public.%I%s%s',
      p.policyname,
      p.tablename,
      case when v_using is not null then format(' using (%s)', v_using) else '' end,
      case when v_check is not null then format(' with check (%s)', v_check) else '' end
    );
  end loop;
end;
$$;
