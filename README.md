# ELVORA

A membership-based, verified social network and luxury marketplace: trusted networking, private messaging,
luxury discovery, verified businesses, reviewed advertising and paid memberships.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix UI ·
Supabase (Postgres, Auth, Storage, Realtime) · Zod · Stripe & Razorpay · Resend · Vitest · Playwright · PGlite.

| Document | Contents |
|---|---|
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Vision, roles, plans, user flows, route map |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, rendering model, data access, realtime, payments |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Tables, lifecycles, RLS strategy, functions |
| [docs/SECURITY_THREAT_MODEL.md](docs/SECURITY_THREAT_MODEL.md) | Trust boundaries, threats and mitigations |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | Every `/api/v1` endpoint, request/response and errors |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Status, what's done, what's next |
| [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md) | Environments, credentials, deploy, first admin, testing |

## Local setup

Requirements: Node 24+, npm. Docker is required only for the local Supabase stack.

```bash
npm install
cp .env.example .env.local          # then fill in values (see below)
npm run dev                         # http://localhost:3000
```

Without Supabase credentials the app still runs: public pages render, protected pages redirect to sign-in, and
data sections show a clear "data service not configured" notice. No fake data is ever shown.

### With a local Supabase stack (recommended)

```bash
npm run db:start      # starts Postgres/Auth/Storage/Realtime in Docker, applies migrations + seed
```

Copy the printed **API URL**, **Publishable key** and **Secret key** into `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), then `npm run dev`.
Emails sent by local Auth are captured at the Mailpit URL printed by `supabase start`.

### Local data

`backend/supabase/seed.sql` creates **fictional** accounts for local development only (password `ElvoraLocal2026`):

| Email | Role |
|---|---|
| `admin@seed.elvora.test` | Administrator |
| `isabella@seed.elvora.test` | Premium member, verified executive |
| `rohan@seed.elvora.test` | Member with an application under review |
| `azure@seed.elvora.test` | Verified luxury business with listings |
| `member@seed.elvora.test` | Standard member |

Invitation code `ELVORA-LOCAL-INVITE` (pre-approved Premium). The seed refuses to run on a database that has any
non-seed users, and `supabase db push` never runs it against hosted projects.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit, component and database (RLS) tests — no Docker needed |
| `npm run test:e2e` | Playwright against a production build (run `npm run build` first) |
| `npm run db:types` | Regenerate `backend/src/db/database.types.ts` from migrations (PGlite) |
| `npm run db:types:local` | Same, using the official Supabase generator (needs `db:start`) |
| `npm run db:reset` | Re-apply migrations + seed to the local stack |
| `npm run check` | Lint + typecheck + tests |

## Project layout

```
src/app/(site)        Public pages: home, about, membership, discover, luxury, apply, legal, profiles, posts
src/app/(auth)        Sign in / sign up / password recovery / email verification
src/app/(onboarding)  Onboarding and restricted-account pages
src/app/(app)         Authenticated app: feed, connections, messages, notifications, saved, business, ads,
                      account, profile editing, admin
src/app/api           Thin route adapters (/api/v1/*, /api/webhooks/*, /api/health) → backend
src/components        UI kit (components/ui) and feature components
src/lib               Shared isomorphic utilities, browser Supabase client, API client, realtime hook
tests/                Unit, component helpers, e2e (Playwright)

backend/              Everything server-side — see backend/README.md
  backend/src/modules/<domain>  Zod schemas, types and server services per domain
  src/http · src/auth   Route wrapper (CSRF, validation, auth, rate limits) · session/viewer
  src/db · src/core     Supabase server/admin/proxy clients + generated types · env, logger
  supabase/             Migrations (source of truth), seed, local config
  scripts/ · tests/db/  DB type generator · RLS tests (PGlite)
```

Import aliases: `@/*` → `src/*`, `@backend/*` → `backend/src/*`.

## Status

The full frontend and backend are implemented and verified locally (lint, typecheck, 57 unit/component/RLS tests,
55 Playwright tests, production build). Integrations that need credentials — Supabase, Stripe, Razorpay, Resend,
Google sign-in — are implemented but **not yet tested against live services**. See
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
