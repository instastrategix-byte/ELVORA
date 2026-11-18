import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser, migrationFiles } from "./pglite";

const OWNER = "00000000-0000-4000-8000-0000000002a1";
const FRIEND = "00000000-0000-4000-8000-0000000002a2"; // connected to OWNER
const STRANGER = "00000000-0000-4000-8000-0000000002a3";
const FILLER = "00000000-0000-4000-8000-0000000002a4";

let db: PGlite;

const addLink = (user: string, profile: string, platform: string, url: string, visibility = "members", label: string | null = null) =>
  asUser(db, user, (tx) =>
    tx.query<{ id: string }>(
      `insert into public.profile_links (profile_id, platform, url, label, visibility) values ($1, $2, $3, $4, $5) returning id`,
      [profile, platform, url, label, visibility],
    ),
  );

const visibleUrls = (user: string | null, profile: string) =>
  asUser(db, user, async (tx) =>
    (await tx.query<{ url: string }>(`select url from public.profile_links where profile_id = $1 order by position`, [profile])).rows.map((r) => r.url),
  );

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [OWNER, "link_owner"],
    [FRIEND, "link_friend"],
    [STRANGER, "link_stranger"],
    [FILLER, "link_filler"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`update public.profiles set profile_visibility = 'public' where id = $1`, [OWNER]);
  await db.query(`insert into public.connections (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [OWNER, FRIEND]);
}, 120_000);

describe("profile links", () => {
  it("accepts valid platform URLs and rejects wrong hosts or plain http", async () => {
    await addLink(OWNER, OWNER, "instagram", "https://www.instagram.com/owner", "public");
    await addLink(OWNER, OWNER, "x", "https://x.com/owner", "members");
    await addLink(OWNER, OWNER, "github", "https://github.com/owner", "connections");
    await expect(addLink(OWNER, OWNER, "linkedin", "https://evil.example/in/owner")).rejects.toThrow(/profile_links_url_valid/);
    await expect(addLink(OWNER, OWNER, "youtube", "http://youtube.com/@owner")).rejects.toThrow(/profile_links_url_valid/);
    await expect(addLink(OWNER, OWNER, "website", "https://not a url")).rejects.toThrow(/profile_links_url_valid/);
    await expect(addLink(OWNER, OWNER, "other", "https://substack.com/@owner")).rejects.toThrow(/other_needs_label/);
    await addLink(OWNER, OWNER, "other", "https://owner.substack.com", "public", "Newsletter");
  });

  it("allows one link per named platform", async () => {
    await expect(addLink(OWNER, OWNER, "instagram", "https://instagram.com/second")).rejects.toThrow(/one_per_platform|duplicate/);
  });

  it("shows each link only to the audience its owner chose", async () => {
    const anon = await visibleUrls(null, OWNER);
    expect(anon).toEqual(["https://www.instagram.com/owner", "https://owner.substack.com"]);
    const stranger = await visibleUrls(STRANGER, OWNER);
    expect(stranger).toContain("https://x.com/owner");
    expect(stranger).not.toContain("https://github.com/owner");
    expect(await visibleUrls(FRIEND, OWNER)).toContain("https://github.com/owner");
    expect(await visibleUrls(OWNER, OWNER)).toHaveLength(4);
  });

  it("members can't add, edit or remove someone else's links", async () => {
    await expect(addLink(STRANGER, OWNER, "facebook", "https://facebook.com/x")).rejects.toThrow(/row-level security/);
    const edited = await asUser(db, STRANGER, (tx) => tx.query(`update public.profile_links set url = 'https://x.com/hacked' where profile_id = $1 returning id`, [OWNER]));
    expect(edited.rows).toHaveLength(0);
    const removed = await asUser(db, STRANGER, (tx) => tx.query(`delete from public.profile_links where profile_id = $1 returning id`, [OWNER]));
    expect(removed.rows).toHaveLength(0);
  });

  it("caps each profile at 12 links", async () => {
    for (let i = 0; i < 12; i++) await addLink(FILLER, FILLER, "website", `https://site${i}.example.com`);
    await expect(addLink(FILLER, FILLER, "website", "https://one-too-many.example.com")).rejects.toThrow(/up to 12 links/);
  });
});

describe("migrating existing link columns", () => {
  it("copies old website / LinkedIn / X / Instagram values into profile links", async () => {
    // Fresh database: apply migrations up to (not including) profile links, seed old columns, then apply it.
    const fresh = await createMigratedDb({ until: "20261120000100" });
    const ID = "00000000-0000-4000-8000-0000000002b1";
    await createUser(fresh, { id: ID, handle: "legacy" });
    await fresh.query(
      `update public.profiles set website = 'https://legacy.example.com', linkedin_url = 'https://www.linkedin.com/in/legacy',
              x_url = 'https://twitter.com/legacy', instagram_url = 'https://notinstagram.example/legacy' where id = $1`,
      [ID],
    );
    const file = migrationFiles().find((f) => f.includes("20261120000100"))!;
    const fs = await import("node:fs");
    const path = await import("node:path");
    await fresh.exec(fs.readFileSync(path.join(process.cwd(), "backend/supabase/migrations", file), "utf8"));
    const rows = await fresh.query<{ platform: string; url: string; label: string | null }>(
      `select platform, url, label from public.profile_links where profile_id = $1 order by platform`,
      [ID],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        { platform: "website", url: "https://legacy.example.com", label: null },
        { platform: "linkedin", url: "https://www.linkedin.com/in/legacy", label: null },
        { platform: "x", url: "https://twitter.com/legacy", label: null },
        // Wrong host for Instagram: kept as a labelled custom link instead of being lost.
        { platform: "other", url: "https://notinstagram.example/legacy", label: "Instagram" },
      ]),
    );
  }, 120_000);
});
