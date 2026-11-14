# ELVORA — Architecture

## Overview

A **modular monolith**: one Next.js 16 application (App Router, Cache Components, Partial Prerendering) backed by
Supabase. Business rules that must hold under concurrency or adversarial clients live in **Postgres** (RLS policies,
column grants, constraints and `SECURITY DEFINER` functions). The Next.js server validates input, orchestrates
services and talks to external providers.

```
Browser ──► Next.js (proxy.ts: session refresh, optimistic redirects)
             ├─ Server Components ──► services (backend/src/modules/*/service.ts) ──► Supabase (user JWT, RLS)
             ├─ Route handlers /api/v1/* ──► route() wrapper ──► services ──► Supabase (user JWT, RLS)
             ├─ Server Actions (auth forms) ──► Supabase Auth
             └─ /api/webhooks/{stripe,razorpay} ──► billing service ──► Supabase (service role)
Browser ◄── Supabase Realtime (private broadcast channels, RLS on realtime.messages)
Browser ──► Supabase Storage (signed upload URLs issued by /api/v1/uploads)
```

## Folder layout

- `src/` — the Next.js frontend: pages, layouts, components, shared isomorphic helpers (`src/lib`), and the
  `src/app/api/**/route.ts` files, which are thin adapters (Next.js routes by folder).
- `backend/` — all server-side code, imported via `@backend/*`: `src/modules`, `src/http`, `src/auth`, `src/db`,
  `src/core`, plus `supabase/` (migrations, seed), `scripts/` and `tests/db`. See [backend/README.md](../backend/README.md).
- ESLint forbids runtime imports of backend services, database clients, env and HTTP internals from
  `src/components` and `src/lib`; only schemas, types and server actions cross that boundary.

## Modules

Paths below are relative to `backend/src/` (modules, auth) or `src/` (app).

| Module | Location | Responsibility |
|---|---|---|
| auth | `modules/auth`, `backend/src/auth/viewer.ts`, `app/(auth)`, `app/auth/*` | Sign-in/up actions, callbacks, viewer resolution, roles/permissions |
| profiles | `modules/profiles` | Profiles, privacy, discovery, relationships |
| feed | `modules/feed` | Posts, media, likes, comments, saves, reports |
| connections | `modules/connections` | Connections, follows, blocks |
| messaging | `modules/messaging` | Conversations, messages, read state |
| notifications | `modules/notifications` | Notifications and preferences |
| membership | `modules/membership` | Plans, applications, invitations, verifications, deletion requests |
| billing | `modules/billing` | Payment provider abstraction (Stripe, Razorpay), checkout, webhooks |
| listings | `modules/listings` | Businesses, listings, media, saves, inquiries |
| ads | `modules/ads` | Advertiser accounts, campaigns, serving, clicks, reports |
| admin | `modules/admin` | Review queues, decisions, moderation, audit |
| storage | `modules/storage` | Upload tickets, signed URLs, ownership checks |
| email | `modules/email` | Transactional email provider abstraction (Resend / log) |

Each module has `schemas.ts` (Zod, shared by client forms and server routes), `types.ts` (DTOs) and `service.ts`
(server-only; every function takes the request-scoped Supabase client so RLS always applies).

## Rendering model

- `cacheComponents: true`. Public, static content prerenders into the static shell. Anything that reads cookies,
  headers, `params` or `searchParams` sits behind `<Suspense>` (explicit, or via `loading.tsx` in `(app)` and
  `(onboarding)`).
- Layouts never read the session at the top level. Session-dependent UI (header actions, staff nav entry) streams in.
- Pages load data with `attempt()` (`lib/attempt.ts`) and render `ServiceNotice` on failure; Next control-flow
  errors are rethrown via `unstable_rethrow`.
- Client components are used only for interactivity (forms, optimistic toggles, realtime, dialogs).

## Authentication and authorization

1. `proxy.ts` refreshes the Supabase session (`getClaims()`) and redirects unauthenticated users away from protected
   prefixes. It is **not** an authorization layer.
2. `getSession()` (React `cache`) verifies the JWT, loads profile, feature keys (`user_features()`), staff role and
   business status → `Viewer`.
3. Pages call `requirePageSession()`; route handlers call it through `route({ auth, staff, feature })`.
4. Postgres enforces the same rules again with RLS and column-level grants. A missed check in TypeScript cannot
   expose or mutate data.

## API layer

`backend/src/http/route.ts` wraps every handler with: same-origin enforcement for mutations (CSRF), JSON-only bodies with
size limits, Zod validation of params/query/body, auth/staff/feature checks, per-user rate limiting, and uniform
`{ data }` / `{ error: { code, message, fieldErrors } }` responses. Database errors are mapped by `db-errors.ts`;
messages raised intentionally by SQL functions (`P0001`) are shown to users, everything else is generic.

## Realtime

Private broadcast topics, authorized by RLS on `realtime.messages`:

- `user:<id>` — `notification.created`, `inbox.updated`, `connection.updated`
- `conversation:<id>` — `message.created`, `conversation.read`, client `typing` events (participants only)

Broadcasts are emitted by `AFTER` triggers, so an event exists only for a committed row. Broadcast failures are
caught and never roll back the write. The `useRealtime` hook re-syncs from the API on every (re)subscription;
clients de-duplicate by id/`client_id`. Without Realtime the UI still works, with a "live updates unavailable" note.

## Payments

`backend/src/modules/billing/provider.ts` defines `PaymentProvider`; Stripe and Razorpay implement it. Checkout resolves the
price, plan and eligibility on the server and redirects to the provider's hosted page. Membership activates **only**
when a verified webhook writes a `subscriptions` row (service role). Webhooks:
signature verified over the raw body → ledger check (`webhook_events`) → subscription state **re-fetched from the
provider** (immune to out-of-order events) → idempotent upserts → ledger insert.

## Storage and media

Uploads use `/api/v1/uploads` to obtain a signed upload URL after MIME/extension/size checks; objects live at
`<user-id>/<purpose>/<uuid>.<ext>`. Buckets: `profile-media` (public), `listing-media` (public),
`post-media` (private, signed URLs; readable when the post is visible), `verification-documents` (private; owner and
moderators). Media scanning and video transcoding are **not configured** (see IMPLEMENTATION_PLAN).

## Observability

`backend/src/core/logger.ts` writes structured JSON with automatic redaction of passwords, tokens, cookies, emails, message
and post bodies. `/api/health` reports which integrations are configured (never values).
`instrumentation.ts` refuses to start a production server with missing required configuration.

## Testing strategy

| Layer | Tool | Location |
|---|---|---|
| SQL, RLS, triggers, functions | Vitest + PGlite (real Postgres in WASM) | `backend/tests/db` |
| Units (validation, permissions, helpers) | Vitest | `tests/unit` |
| Components and interactions | Vitest + Testing Library (jsdom) | `src/**/*.test.tsx` |
| End-to-end journeys | Playwright (desktop + mobile) | `tests/e2e` |
