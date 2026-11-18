# ELVORA — Backend

All server-side code for ELVORA: domain services, the HTTP layer, authentication, database access, and the
Supabase project (migrations, seed, local config). The frontend in `src/` consumes it through the `@backend/*`
import alias; nothing in this folder renders UI.

```
backend/
├─ src/
│  ├─ modules/<domain>/   Business logic per domain
│  │    schemas.ts        Zod input schemas (shared with frontend forms)
│  │    types.ts          DTOs returned to the frontend
│  │    service.ts        Server-only service functions (take the request-scoped DB client → RLS applies)
│  ├─ http/               route() wrapper: CSRF, JSON limits, Zod validation, auth/staff/feature checks,
│  │                      rate limiting, error mapping (db-errors.ts), param parsing
│  ├─ auth/viewer.ts      Session → Viewer (profile, features, staff role); requirePageSession/requireApiSession
│  ├─ db/                 Supabase clients: server (user JWT), admin (service role, webhooks only), proxy
│  │                      (session refresh), database.types.ts (generated — do not edit)
│  └─ core/               env.ts (server env + production config guard), logger.ts (structured, redacted)
├─ supabase/
│  ├─ migrations/         Source of truth for schema, RLS, grants, functions, storage, realtime
│  ├─ seed.sql            Fictional local-only data (refuses to run on non-seed databases)
│  ├─ seeds/              Demo dataset loaded after seed.sql (demo.sql, demo_communities.sql)
│  └─ config.toml         Local stack config (Auth redirects, password policy, providers)
├─ scripts/gen-db-types.mts  Generates src/db/database.types.ts from the migrations (PGlite, no Docker)
└─ tests/db/              RLS / workflow tests against the real migrations on PGlite
```

Domains: `auth`, `profiles`, `feed`, `connections`, `messaging`, `notifications`, `membership`, `billing`
(Stripe, Razorpay), `listings`, `ads`, `admin`, `storage`, `email`.

## Where the HTTP endpoints live

Next.js routes by folder, so endpoint files stay in `src/app/api/**/route.ts`. Each one is a thin adapter:

```ts
// src/app/api/v1/posts/route.ts
export const POST = route(
  { name: "posts.create", feature: "feed.post", body: createPostSchema, rateLimitPerMinute: 10 },
  async ({ session, body }) => createPost(session.db, session.viewer, body),
);
```

All logic, validation schemas and authorization live here in `backend/`. Contracts: [docs/API_CONTRACTS.md](../docs/API_CONTRACTS.md).

## Rules

- **The database is the final authority.** Every table has RLS; trusted columns are not client-writable; workflow
  transitions go through `SECURITY DEFINER` functions that re-check the caller and write the audit log.
- **Services receive the caller's client** (`session.db`), never the admin client. `db/admin.ts` (service role)
  is used only by payment webhooks.
- **Server-only.** `db/server.ts`, `db/admin.ts` import `server-only`. ESLint blocks runtime imports of services, db,
  core, http and auth from `src/components` and `src/lib` (type imports are allowed).
- **Schema changes = new migration.** Never edit an applied migration. After adding one, run `npm run db:types`
  and commit the regenerated types (CI fails on drift).

## Commands (run from the repository root)

| Command | Purpose |
|---|---|
| `npm run test:db` | RLS/workflow tests on PGlite (no Docker) |
| `npm run db:types` | Regenerate `src/db/database.types.ts` from migrations |
| `npm run db:start` / `db:stop` | Local Supabase stack (Docker) with migrations + seed |
| `npm run db:reset` | Re-apply migrations + seed locally |
| `npm run db:push` | Apply migrations to the linked hosted project (`npx supabase link --workdir backend` first) |
| `npm run db:types:local` | Types via the official Supabase generator (needs `db:start`) |

## Demo data (local development only)

`npm run db:reset` (Docker) applies the migrations, then `supabase/seed.sql`, then `supabase/seeds/*.sql`
(see `[db.seed]` in `config.toml`). Together they create a fictional community to develop and test against:

| Data | Amount |
|---|---|
| Professional profiles (founders, investors, executives, creatives, businesses) with experience | 30 |
| Feed posts with likes, comments, #hashtags and @mentions | 50 |
| Active stories (expire 24 hours after `db:reset`) | 15 |
| Upcoming published events with RSVPs | 10 |
| Marketplace listings from 4 approved businesses (hotels, resorts, villas, yachts, supercars, aviation, experiences) | 15 |
| Communities with members, threads and replies | 10 |

Everything is labelled as demo content: profile bios start with "Demo profile —", business and community
names end with "(Demo)", and listing summaries start with "Demo listing —". No external images are used.
Avatars, covers and post or listing media are empty, so the UI shows its fallbacks. Stories point at paths in each
author's folder, but the files are not shipped, so the story viewer shows "media unavailable".

**Logins.** Every seed account uses the password `ElvoraLocal2026`. The base accounts are
`admin@`, `isabella@`, `rohan@`, `azure@` and `member@seed.elvora.test`. Demo members use their handle with
dots, for example `amara.okafor@seed.elvora.test`, `noah.fischer@seed.elvora.test` (business owner, aviation)
and `aria.shah@seed.elvora.test` (business owner, supercars).

> **Never load this data into production.** `supabase db push` / `npm run db:push` never run seed files.
> Never execute `seed.sql` or `seeds/*.sql` against the linked project (for example with
> `supabase db query --linked -f ...`). Every seed file aborts if the database contains any user outside
> `@seed.elvora.test`, but do not rely on that guard alone.

`backend/tests/db/demo-seed.test.ts` loads the seeds on PGlite after all migrations and checks these counts
and labels.

See [docs/DATABASE_DESIGN.md](../docs/DATABASE_DESIGN.md), [docs/SECURITY_THREAT_MODEL.md](../docs/SECURITY_THREAT_MODEL.md)
and [docs/DEPLOYMENT_RUNBOOK.md](../docs/DEPLOYMENT_RUNBOOK.md).
