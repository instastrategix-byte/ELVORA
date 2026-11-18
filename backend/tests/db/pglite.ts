/**
 * Applies the real Supabase migrations to an in-process Postgres (PGlite) with minimal
 * stand-ins for the Supabase-managed `auth` and `storage` schemas and API roles.
 * This lets CI verify SQL validity and RLS behaviour without Docker.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text not null, owner uuid,
    metadata jsonb, created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  create schema realtime;
  create table realtime.messages (
    id bigint generated always as identity primary key,
    topic text not null, extension text not null, payload jsonb, event text,
    private boolean default true, inserted_at timestamptz not null default now()
  );
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$
    select nullif(current_setting('realtime.topic', true), '')
  $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
  returns void language sql as $$
    insert into realtime.messages (topic, extension, payload, event, private)
    values (topic, 'broadcast', payload, event, private)
  $$;

  grant usage on schema public, auth, storage, realtime to anon, authenticated, service_role;
  grant execute on function realtime.topic() to anon, authenticated, service_role;
  grant select, insert on realtime.messages to authenticated;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

  -- Mirror Supabase's permissive default privileges so the migrations' explicit
  -- revokes are exercised exactly as they would be in a hosted project.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Applies every migration, or only those whose file name sorts before `until` (to test data migrations). */
export async function createMigratedDb(opts: { until?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    if (opts.until && file >= opts.until) break;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Creates an auth user (the trigger creates the profile) and optionally completes onboarding. */
export async function createUser(
  db: PGlite,
  opts: { id: string; handle: string; email?: string; onboarded?: boolean },
): Promise<void> {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    opts.id,
    opts.email ?? `${opts.handle}@example.test`,
    JSON.stringify({ display_name: opts.handle }),
  ]);
  await db.query(`update public.profiles set handle = $2 where id = $1`, [opts.id, opts.handle]);
  if (opts.onboarded !== false) {
    await db.query(`update public.profiles set onboarding_completed_at = now() where id = $1`, [opts.id]);
  }
}

/** Runs `fn` as the `authenticated` API role with the given user id as auth.uid(). */
export async function asUser<T>(db: PGlite, userId: string | null, fn: (tx: PGlite) => Promise<T>): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  // PostgREST also exposes the JWT claims; helpers use the role to tell API calls from internal ones.
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role, sub: userId ?? undefined })]);
  try {
    return await fn(db);
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
