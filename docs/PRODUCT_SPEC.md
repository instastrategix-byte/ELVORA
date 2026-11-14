# ELVORA — Product Specification

## Vision

ELVORA is a trusted, membership-based network for founders, executives, public figures, affluent individuals and
premium businesses. It combines:

- **Premium social networking** — posts with images/video, profiles, connections, follows, private messaging.
- **Luxury discovery** — villas, residences, hotels, resorts, supercars, yachts, events and experiences from
  verified providers.
- **Verified businesses** — business profiles reviewed by staff before listings can be published.
- **Commercial model** — paid memberships, business subscriptions and reviewed sponsored campaigns.
- **Trust & safety** — identity verification, privacy controls, reporting, moderation and audited administration.

Guiding principles: fewer, better connections; privacy by default; **payment never implies verification**;
no fabricated data, metrics or confirmations.

## Roles

Roles are derived on the server from independent sources (see `backend/src/modules/auth/permissions.ts`):

| Role | Source of truth | Grants |
|---|---|---|
| Guest | No session | Public pages, public profiles/posts/listings |
| Standard member | Account active + onboarding complete | Free-plan features (post, connect, message, discover) |
| Premium member | Live subscription to `premium` plan | Advanced discovery, members-only listings, inquiries |
| Verified public figure / executive | Approved `verifications` row | Badge only — no features |
| Verified business | `businesses.status = approved` | Listings can be submitted and published |
| Advertiser | Live subscription to `advertiser` plan | Campaigns |
| Support / Moderator / Admin | `staff_roles` row | Review queues, moderation, audit (rank-ordered) |

Separation guarantees: membership (subscriptions), identity verification, business verification and staff privileges
are separate tables written by separate trusted paths. A user can never write any of them from the client.

## Membership plans

Plans live in `membership_plans` (structure, features, eligibility) and `plan_prices` (amounts per currency/interval).
Prices are **not** in source code.

| Plan | Audience | Application | Verification required | Key features |
|---|---|---|---|---|
| Member (`standard`) | Individuals | No (free) | — | `feed.post`, `connections.request`, `messages.send`, `discover.members` |
| Premium | Individuals | Yes | — | + `discover.advanced`, `luxury.view_members`, `luxury.inquire` |
| Verified Professional | Public figures, executives | Yes | `public_figure` or `executive` | Premium features |
| Luxury Business | Businesses | Yes | Business review for publishing | `business.manage`, `listings.publish` |
| Advertiser | Brands | Yes | — | `ads.manage` |

Lifecycle: **apply or redeem invitation → staff approval → eligible → hosted checkout → provider webhook creates
subscription → features active**. Renewal, cancellation (end of period), failure (past_due) and expiry are driven
by webhooks. Trials are configurable per plan (`trial_days`).

## Core user flows

1. **Join:** sign up (name, email, password) → verify email → onboarding (handle, name, optional headline/city) →
   welcome (next steps: profile, apply, verification).
2. **Apply:** `/apply` → choose plan → statement → staff decides → notification → checkout from
   `/account/membership`.
3. **Invitation:** check code publicly at `/apply` → sign up with code → redeem (pre-approved or reviewed).
4. **Verification:** `/account/verification` explains requirements *before* any upload → private documents →
   staff decision → badge.
5. **Social:** compose post (text/images/video, audience) → feed (network / everyone) → like, comment, save,
   copy link → report.
6. **Connections & messaging:** connect with note → accept/decline → message (subject to recipient's policy) →
   realtime delivery, read receipts, typing.
7. **Luxury:** browse/filter → listing detail → save → inquiry (Premium) — clearly *not* a booking.
8. **Business:** create profile + documents → submit → verified → create listing (draft) → submit → staff review →
   published → archive/republish; material edits return it to review; inquiry inbox.
9. **Advertising:** advertiser account → campaign draft (creative, budget, schedule, targeting, frequency cap) →
   submit → staff approval → served with "Sponsored" label → measured report.
10. **Account:** privacy (profile visibility, discoverability, who can message), notification preferences,
    password change, sign out other sessions, deletion request.
11. **Administration:** queues for applications, verifications, businesses, listings, campaigns, reports; moderation
    actions; audit log.

## Route map

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Marketing homepage |
| `/about`, `/privacy`, `/terms`, `/community-guidelines` | Public | Trust and legal (drafts pending legal review) |
| `/membership` | Public | Plans from the database |
| `/discover` | Public (filtered by privacy) | Members and businesses |
| `/luxury`, `/luxury/[slug]` | Public (members-only listings need Premium) | Marketplace |
| `/advertise` | Public | Advertising overview |
| `/apply` | Public / member | Application and invitations |
| `/members/[handle]`, `/posts/[id]` | Per privacy settings | Profiles and posts |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | Public | Authentication |
| `/onboarding`, `/onboarding/welcome` | Signed in | Onboarding |
| `/feed`, `/connections`, `/messages`, `/messages/[id]`, `/notifications`, `/saved` | Member | Social |
| `/profile`, `/profile/edit` | Member | Own profile |
| `/business`, `/business/listings/new`, `/business/listings/[id]`, `/business/inquiries` | Member (+ Business plan to create) | Business |
| `/ads`, `/ads/campaigns/new`, `/ads/campaigns/[id]` | Member (+ Advertiser plan to create) | Advertising |
| `/account/membership`, `/account/verification`, `/account/settings`, `/account/security` | Member | Account |
| `/account/restricted` | Suspended accounts | Restriction notice |
| `/admin/*` | Moderator+ | Administration |

## Non-goals (current milestone)

Bookings/payments between members and providers, ad-spend invoicing, group conversations, native apps,
media transcoding/scanning (see IMPLEMENTATION_PLAN).
