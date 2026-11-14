# ELVORA — Implementation Plan & Status

_Last updated: November 2026._

## Verified status

| Check | Result |
|---|---|
| `npm run lint` | Clean |
| `npm run typecheck` | Clean (strict, `noUncheckedIndexedAccess`) |
| `npm test` | 57 passing — 29 database/RLS (PGlite), 15 unit, 13 component |
| `npm run build` | Succeeds; public pages prerendered, session content streamed |
| `npm run test:e2e` | 55 passing, 5 skipped (need Supabase: signed-in journeys) — desktop + mobile |

**Not yet verified against live services:** Supabase Auth/Storage/Realtime, Stripe, Razorpay, Resend, Google OAuth.
The database layer is verified on PGlite (real Postgres) with stand-ins for Supabase-managed schemas; run the
`@supabase` E2E journeys and a manual pass on a real Supabase project before launch.

## Milestones

### ✅ M1 — Foundation
Next.js 16 + TypeScript strict + Tailwind 4, env validation, logger, error model, Supabase clients and proxy,
migrations, generated types, CI, docs.

### ✅ M2 — Frontend
Design system (dark/light, reduced motion, accessible components), public pages, auth & onboarding, app shell,
feed, profiles, discovery, connections, messaging, notifications, marketplace, saved items, business area,
advertising dashboard, account & billing, administration, error/loading states, component + E2E tests.

### ✅ M3 — Backend
RLS and column grants on every table, workflow functions with audit, status history, entitlements, invitations,
verification, listing lifecycle with re-review, ad serving with budgets/frequency/targeting and measured events,
idempotent messaging and notifications, private realtime channels, signed uploads, payment provider abstraction and
webhooks, rate limiting, CSRF protection.

### ⏭ M4 — Integration hardening (next)
1. Provision Supabase (staging), configure Auth redirect URLs and email templates, run migrations.
2. Run `E2E_SUPABASE=1 npm run test:e2e`; extend signed-in journeys (messaging between two browsers, uploads,
   checkout redirect, admin approval).
3. Stripe & Razorpay test mode: create products/prices, set provider ids in `plan_prices`, test webhooks with the
   Stripe CLI / Razorpay dashboard.
4. Resend domain verification; email templates for application decisions and inquiries.

### ⏭ M5 — Production readiness
CSP with nonces; media malware scanning + EXIF stripping; video transcoding/poster frames; shared rate-limit store;
staff MFA; account deletion processing job; ad-spend billing; observability (error tracking, uptime);
legal review of policies; accessibility audit with assistive technology.

## Known limitations
- Members-only listing images use public (unguessable) URLs.
- Sponsored impressions are recorded at serve time (not viewport visibility).
- Rate limiting is per instance.
- Group conversations, bookings and ad-spend invoicing are out of scope.
- Feed "network" scope loads up to 1,000 connections/follows per request.
