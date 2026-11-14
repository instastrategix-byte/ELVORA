# ELVORA — Database Design

Migrations in `backend/supabase/migrations/` are the **only** source of truth. Never change a hosted database by hand.
TypeScript types are generated from them (`npm run db:types`); CI fails if they drift.

| Migration | Contents |
|---|---|
| `…0100_foundation.sql` | Enums, `profiles`, `staff_roles`, `audit_log`, `status_history`, helpers (`is_staff`, `is_active_member`) |
| `…0200_membership.sql` | Plans, prices, verifications, invitations, applications, billing customers, subscriptions, payments, webhook ledger, entitlement functions |
| `…0300_social.sql` | Connections, follows, blocks, posts, media, likes, comments, saves, conversations, messages, notifications, preferences, reports, moderation |
| `…0400_commerce.sql` | Businesses, listings, listing media/saves/inquiries, advertiser accounts, rate cards, campaigns, ad events, deletion requests |
| `…0500_storage_realtime.sql` | Storage buckets and object policies, realtime topic authorization and broadcast triggers |

## Principles

- **RLS on every table.** Supabase's default `grant all` is revoked; privileges are granted per column, so trusted
  columns (`account_status`, `verified_kinds`, `status`, prices, counters) can never be written by clients.
- **State transitions in functions.** Workflow changes go through `SECURITY DEFINER` functions with
  `set search_path = ''` that re-check `auth.uid()`, staff rank and current state, and write the audit log.
- **Profiles ≠ identity.** `auth.users` holds credentials/email; `profiles` holds no email or auth data.
- **No card data.** Only provider references (customer, subscription, invoice/payment ids) are stored.
- **Keyset pagination** on `(created_at, id)` with supporting indexes; queries are bounded (max 50 per page).

## Entities (abridged)

### Identity and access
- `profiles` — handle, display name, professional fields, interests, media paths, `profile_visibility`
  (`public|members|connections`), `discoverable`, `messaging_policy` (`connections|members|nobody`); trusted:
  `verified_kinds`, `account_status`, `onboarding_completed_at`.
- `staff_roles` — `support < moderator < admin`. Granted by admins via `grant_staff_role()` or SQL bootstrap.
- `audit_log` — append-only record of privileged actions. `status_history` — every workflow status change
  (applications, verifications, subscriptions, businesses, listings, campaigns, account restrictions).

### Membership and billing
- `membership_plans` (catalog + feature keys), `plan_prices` (amount, currency, interval, provider price ids).
- `membership_applications` (`submitted → under_review → approved | rejected`, or `withdrawn`).
- `invitations` (SHA-256 hashed codes, plan, pre-approval, uses, expiry). `check_invitation()` / `redeem_invitation()`.
- `verifications` (`identity | public_figure | executive`; `pending → approved | rejected`, `approved → revoked`);
  a trigger maintains `profiles.verified_kinds`.
- `subscriptions`, `payments` (with `refunded_amount_minor`), `billing_customers`, `webhook_events` — **service role
  only** for writes.
- `user_features()` = free-plan features for active members ∪ features of live subscriptions. Used by RLS.
- `is_eligible_for_plan()` = active member + approved application (if required) + approved verification (if required).

### Social
- `connections` (`pending → accepted | declined`; unique open pair), `follows`, `user_blocks` (blocking deletes
  connections and follows both ways).
- `posts` (`visibility`, `status published|hidden|removed`, trigger-maintained counters), `post_media`,
  `post_likes`, `post_comments`, `post_saves`. `can_view_post()` drives visibility.
- `conversations`, `conversation_participants` (`last_read_at` = read receipt), `messages`
  (`unique(sender_id, client_id)` idempotency). `start_conversation()` enforces the recipient's messaging policy.
- `notifications` (`unique(user_id, dedupe_key)`), `notification_preferences` (missing row = all on; account,
  membership, verification and moderation notices are mandatory).
- `reports`, `moderation_actions`; `moderate()` hides/removes/restores content, warns, suspends or reinstates.

### Commerce and advertising
- `businesses` (`draft → pending_review → approved | rejected`; `approved → suspended`). Approved = verified.
- `listings`: `draft → pending_review → published | rejected`; `published ↔ archived`; any → `removed`
  (moderation). Material edits clear `approved_at` and send a published listing back to `pending_review`.
- `listing_media`, `listing_saves`, `listing_inquiries` (`new → responded → closed`; never a booking).
- `advertiser_accounts`, `ad_rate_cards` (platform-set CPM/CPC), `ad_campaigns`
  (`draft → pending_review → active | rejected`; `active ↔ paused`; → `completed`), `ad_events`
  (measured impressions/clicks; cost in milli-minor units).
- `serve_ads()` enforces status, schedule, daily/total budget (with a row lock per campaign), frequency cap and
  targeting, and records an impression for each item served. `record_ad_click()` allows one click per impression
  within an hour. `campaign_report()` aggregates measured events only.

## Storage policies

Upload/delete only inside `<auth.uid()>/…`. `post-media` objects are readable when the linked post is visible to the
viewer. `verification-documents` are readable by the owner and moderators only. Public buckets serve via public URL.

## Realtime authorization

`realtime_topic_allowed(topic)` allows `user:<self>` and `conversation:<id>` for participants. Clients may insert only
broadcast/presence events into conversations they belong to.

## Testing

`tests/db/rls.test.ts` applies all migrations to PGlite with stand-ins for Supabase's `auth`, `storage` and
`realtime` schemas and asserts permitted and forbidden operations (privilege escalation, entitlements, visibility,
messaging, realtime topics, listing lifecycle, ad serving/budgets, invitations, notification dedupe).
