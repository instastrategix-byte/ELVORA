import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser, migrationFiles } from "./pglite";

const OWNER = "00000000-0000-4000-8000-00000000a001";
const EDITOR = "00000000-0000-4000-8000-00000000a002";
const ANALYST = "00000000-0000-4000-8000-00000000a003";
const ADMIN = "00000000-0000-4000-8000-00000000a004";
const RIVAL = "00000000-0000-4000-8000-00000000a005"; // owns a different ad account
const VIEWER = "00000000-0000-4000-8000-00000000a006";
const VIEWER2 = "00000000-0000-4000-8000-00000000a007";
const MOD = "00000000-0000-4000-8000-00000000a008";
const OUTSIDER = "00000000-0000-4000-8000-00000000a009";

let db: PGlite;
let account = "";
let rivalAccount = "";

const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

/** Creates a managed campaign with one ad set, creative and ad, as the editor. */
async function buildCampaign(opts: {
  name?: string;
  objective?: string;
  placements?: string[];
  targeting?: object;
  bid?: { strategy: string; minor: number | null };
  setDaily?: number | null;
  daily?: number;
  total?: number;
  budgetType?: string;
  spendCap?: number | null;
  setStartsAt?: string | null;
  cap?: number;
}) {
  const [c] = await as<{ id: string }>(
    EDITOR,
    `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor,
       total_budget_minor, starts_on, ends_on, structure, budget_type, spend_cap_minor)
     values ($1, $2, $3, $4, 'USD', $5, $6, current_date, current_date + 30, 'managed', $7, $8) returning id`,
    [account, EDITOR, opts.name ?? "Riviera launch", opts.objective ?? "awareness", opts.daily ?? 1000, opts.total ?? 10000,
      opts.budgetType ?? "daily", opts.spendCap ?? null],
  );
  const [s] = await as<{ id: string }>(
    EDITOR,
    `insert into public.ad_sets (campaign_id, name, placements, targeting, bid_strategy, bid_minor, daily_budget_minor,
       frequency_cap_per_day, starts_at)
     values ($1, 'Founders in Monaco', $2, $3, $4, $5, $6, $7, $8) returning id`,
    [c!.id, opts.placements ?? ["feed"], JSON.stringify(opts.targeting ?? {}), opts.bid?.strategy ?? "lowest_cost",
      opts.bid?.minor ?? null, opts.setDaily ?? null, opts.cap ?? 3, opts.setStartsAt ?? null],
  );
  const [cr] = await as<{ id: string }>(
    EDITOR,
    `insert into public.ad_creatives (account_id, name, format, primary_text, headline, cta, destination_url, url_params)
     values ($1, 'Hero', 'single_image', 'Charter the Riviera', 'Summer on the water', 'book_now',
       'https://example.test/charter', 'utm_source=elvora&utm_medium=feed') returning id`,
    [account],
  );
  const [ad] = await as<{ id: string }>(
    EDITOR,
    `insert into public.advertisements (ad_set_id, creative_id, name) values ($1, $2, 'Hero ad') returning id`,
    [s!.id, cr!.id],
  );
  return { campaign: c!.id, adSet: s!.id, creative: cr!.id, ad: ad!.id };
}

async function approve(campaign: string) {
  await as(EDITOR, `select public.submit_campaign_for_review($1)`, [campaign]);
  await as(MOD, `select public.review_ad_campaign($1, 'approved')`, [campaign]);
}

const serve = (user: string, placement = "feed") =>
  as<{ impression_id: string; ad_id: string; destination_url: string; headline: string }>(
    user,
    `select * from public.serve_ads_v2($1, 1)`,
    [placement],
  );

/** Pauses every live campaign so each test controls exactly what is eligible. */
async function pauseAll() {
  await db.query(`update public.ad_campaigns set status = 'paused' where status = 'active'`);
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [OWNER, "ads_owner"],
    [EDITOR, "ads_editor"],
    [ANALYST, "ads_analyst"],
    [ADMIN, "ads_admin"],
    [RIVAL, "ads_rival"],
    [VIEWER, "ads_viewer"],
    [VIEWER2, "ads_viewer_two"],
    [MOD, "ads_mod"],
    [OUTSIDER, "ads_outsider"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'moderator')`, [MOD]);
  await db.query(`insert into public.ad_rate_cards (currency, objective, cpm_minor, cpc_minor) values
    ('USD', 'awareness', 2000, 50), ('USD', 'traffic', 2000, 50)`);
  const [a] = (
    await db.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name, currency) values ($1, 'Riviera Yachts', 'USD') returning id`, [OWNER])
  ).rows;
  account = a!.id;
  const [r] = (
    await db.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name) values ($1, 'Rival Co') returning id`, [RIVAL])
  ).rows;
  rivalAccount = r!.id;
  // Prepaid balance (normally credited by the billing ledger).
  await db.query(`update public.advertiser_accounts set balance_minor = 100000 where id = $1`, [account]);
  await as(OWNER, `select public.add_ad_account_member($1, $2, 'admin')`, [account, ADMIN]);
  await as(ADMIN, `select public.add_ad_account_member($1, $2, 'editor')`, [account, EDITOR]);
  await as(ADMIN, `select public.add_ad_account_member($1, $2, 'analyst')`, [account, ANALYST]);
  await db.query(`update public.profiles set location = 'Monaco', industry = 'Finance', interests = '{yachting}' where id = $1`, [VIEWER]);
  await db.query(`update public.profiles set location = 'London', industry = 'Technology' where id = $1`, [VIEWER2]);
}, 120_000);

describe("advertiser accounts and permissions", () => {
  it("isolates accounts: rivals and outsiders see nothing", async () => {
    const ids = await buildCampaign({ name: "Isolation check" });
    for (const user of [RIVAL, OUTSIDER]) {
      expect(await as(user, `select id from public.ad_campaigns where id = $1`, [ids.campaign])).toHaveLength(0);
      expect(await as(user, `select id from public.ad_sets where id = $1`, [ids.adSet])).toHaveLength(0);
      expect(await as(user, `select id from public.ad_creatives where id = $1`, [ids.creative])).toHaveLength(0);
      expect(await as(user, `select id from public.advertisements where id = $1`, [ids.ad])).toHaveLength(0);
      expect(await as(user, `select user_id from public.advertiser_members where account_id = $1`, [account])).toHaveLength(0);
    }
    expect(await as(null, `select id from public.ad_campaigns`).catch(() => [])).toHaveLength(0);
    // The rival can't attach an ad set to someone else's campaign.
    await expect(
      as(RIVAL, `insert into public.ad_sets (campaign_id, name, placements) values ($1, 'Hijack', '{feed}')`, [ids.campaign]),
    ).rejects.toThrow(/row-level security/);
    await expect(as(RIVAL, `select * from public.ad_metrics($1, current_date - 7, current_date, 'day')`, [account])).rejects.toThrow(
      /Not authorised/,
    );
  });

  it("analysts are read-only; editors can't manage the team", async () => {
    const ids = await buildCampaign({ name: "Analyst check" });
    expect(await as(ANALYST, `select id from public.ad_campaigns where id = $1`, [ids.campaign])).toHaveLength(1);
    await expect(
      as(ANALYST, `insert into public.ad_sets (campaign_id, name, placements) values ($1, 'Nope set', '{feed}')`, [ids.campaign]),
    ).rejects.toThrow(/row-level security/);
    const updated = await as(ANALYST, `update public.ad_campaigns set name = 'Renamed' where id = $1 returning id`, [ids.campaign]);
    expect(updated).toHaveLength(0);
    await expect(as(EDITOR, `select public.add_ad_account_member($1, $2, 'analyst')`, [account, OUTSIDER])).rejects.toThrow(
      /owners and admins/,
    );
    await expect(as(ADMIN, `select public.add_ad_account_member($1, $2, 'admin')`, [account, OUTSIDER])).rejects.toThrow(/owner can add admins/);
    await expect(as(ADMIN, `select public.remove_ad_account_member($1, $2)`, [account, OWNER])).rejects.toThrow(/owner cannot be removed/);
    // Trusted money fields aren't writable by anyone on the account.
    await expect(as(OWNER, `update public.advertiser_accounts set balance_minor = 999999 where id = $1`, [account])).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(EDITOR, `update public.advertisements set review_status = 'approved' where id = $1`, [ids.ad])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("rejects sensitive or unsupported targeting", async () => {
    const ids = await buildCampaign({ name: "Targeting check" });
    for (const bad of [{ age: ["18-24"] }, { gender: ["f"] }, { religion: ["x"] }, { health: ["x"] }, { languages: ["en"] }]) {
      await expect(
        as(EDITOR, `update public.ad_sets set targeting = $2 where id = $1`, [ids.adSet, JSON.stringify(bad)]),
      ).rejects.toThrow(/check constraint/);
    }
    await as(EDITOR, `update public.ad_sets set targeting = $2 where id = $1`, [ids.adSet, JSON.stringify({ cities: ["Monaco"], industries: ["Finance"] })]);
    // Audiences from another account can't be referenced.
    const [rivalAudience] = (
      await db.query<{ id: string }>(`insert into public.ad_audiences (account_id, name, kind, definition) values ($1, 'Theirs', 'saved', '{}') returning id`, [
        rivalAccount,
      ])
    ).rows;
    await expect(
      as(EDITOR, `update public.ad_sets set targeting = $2 where id = $1`, [ids.adSet, JSON.stringify({ include_audience_ids: [rivalAudience!.id] })]),
    ).rejects.toThrow(/not on this account/);
  });

  it("estimates audiences only above 100 members, rounded", async () => {
    expect((await as<{ n: string | null }>(EDITOR, `select public.estimate_audience($1, $2) as n`, [JSON.stringify({ cities: ["Monaco"] }), account]))[0]!.n).toBeNull();
    await expect(as(OUTSIDER, `select public.estimate_audience('{}')`)).rejects.toThrow(/advertiser account is required/);
    await db.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      select gen_random_uuid(), 'bulk' || g || '@example.test', '{"display_name":"Bulk"}'::jsonb from generate_series(1, 153) g`);
    await db.query(`update public.profiles set onboarding_completed_at = now(), location = 'Dubai, UAE' where onboarding_completed_at is null and display_name = 'Bulk'`);
    const [r] = await as<{ n: string }>(EDITOR, `select public.estimate_audience($1, $2) as n`, [JSON.stringify({ countries: ["UAE"] }), account]);
    expect(Number(r!.n)).toBe(150);
    // Opted-out members never count toward targeted audiences.
    await db.query(`update public.profiles set ads_personalization = false where display_name = 'Bulk'`);
    expect((await as<{ n: string | null }>(EDITOR, `select public.estimate_audience($1, $2) as n`, [JSON.stringify({ countries: ["UAE"] }), account]))[0]!.n).toBeNull();
    await db.query(`update public.profiles set account_status = 'deactivated' where display_name = 'Bulk'`);
  });
});

describe("review workflow", () => {
  it("non-staff can't review; editors submit, moderators decide, advertisers can appeal rejections", async () => {
    const ids = await buildCampaign({ name: "Review check" });
    await as(EDITOR, `select public.submit_campaign_for_review($1)`, [ids.campaign]);
    expect((await as<{ review_status: string }>(EDITOR, `select review_status from public.advertisements where id = $1`, [ids.ad]))[0]!.review_status).toBe(
      "pending",
    );
    await expect(as(OWNER, `select public.review_ad_campaign($1, 'approved')`, [ids.campaign])).rejects.toThrow(/forbidden/);
    await expect(as(MOD, `select public.review_ad_campaign($1, 'rejected')`, [ids.campaign])).rejects.toThrow(/reason/);
    await as(MOD, `select public.review_ad_campaign($1, 'rejected', '{misleading_claims}', 'Remove the price guarantee')`, [ids.campaign]);
    const [review] = await as<{ id: string; decision: string }>(EDITOR, `select id, decision from public.ad_reviews where entity_id = $1`, [ids.campaign]);
    expect(review!.decision).toBe("rejected");
    await expect(as(RIVAL, `select public.appeal_ad_review($1, 'Please look again at this decision')`, [review!.id])).rejects.toThrow(/not found/);
    await expect(as(ANALYST, `select public.appeal_ad_review($1, 'Please look again at this decision')`, [review!.id])).rejects.toThrow(/not found/);
    const [{ id: appeal }] = (await as<{ id: string }>(EDITOR, `select public.appeal_ad_review($1, 'The guarantee is in our terms') as id`, [review!.id])) as [
      { id: string },
    ];
    await expect(as(EDITOR, `select public.resolve_ad_appeal($1, true)`, [appeal])).rejects.toThrow(/forbidden/);
    await as(MOD, `select public.resolve_ad_appeal($1, true, 'Terms are clear')`, [appeal]);
    // Overturning re-opens review rather than approving anything unseen.
    expect((await as<{ status: string }>(EDITOR, `select status from public.ad_campaigns where id = $1`, [ids.campaign]))[0]!.status).toBe("pending_review");
    expect((await as<{ review_status: string }>(EDITOR, `select review_status from public.advertisements where id = $1`, [ids.ad]))[0]!.review_status).toBe(
      "pending",
    );
    await expect(as(EDITOR, `select public.appeal_ad_review($1, 'Appealing an approval')`, [review!.id])).rejects.toThrow(/already been appealed/);
  });

  it("editing an approved creative sends it back to review", async () => {
    const ids = await buildCampaign({ name: "Rereview check" });
    await approve(ids.campaign);
    expect((await as<{ review_status: string }>(EDITOR, `select review_status from public.ad_creatives where id = $1`, [ids.creative]))[0]!.review_status).toBe(
      "approved",
    );
    await as(EDITOR, `update public.ad_creatives set headline = 'Guaranteed returns!' where id = $1`, [ids.creative]);
    expect((await as<{ review_status: string }>(EDITOR, `select review_status from public.ad_creatives where id = $1`, [ids.creative]))[0]!.review_status).toBe(
      "pending",
    );
    expect((await as<{ review_status: string }>(EDITOR, `select review_status from public.advertisements where id = $1`, [ids.ad]))[0]!.review_status).toBe(
      "pending",
    );
    await pauseAll();
  });
});

describe("delivery engine", () => {
  it("never serves unapproved, paused, archived, out-of-schedule or wrong-placement ads", async () => {
    await pauseAll();
    const ids = await buildCampaign({ name: "Delivery basics" });
    expect(await serve(VIEWER)).toHaveLength(0); // draft
    await as(EDITOR, `select public.submit_campaign_for_review($1)`, [ids.campaign]);
    expect(await serve(VIEWER)).toHaveLength(0); // pending review
    await as(MOD, `select public.review_ad_campaign($1, 'approved')`, [ids.campaign]);
    const served = await serve(VIEWER);
    expect(served).toHaveLength(1);
    expect(served[0]!.destination_url).toBe(`https://example.test/charter?utm_source=elvora&utm_medium=feed&elv_cid=${served[0]!.impression_id}`);
    expect(await serve(VIEWER, "stories")).toHaveLength(0); // not a chosen placement
    expect(await serve(EDITOR)).toHaveLength(0); // never your own ads

    await as(EDITOR, `select public.set_ad_campaign_state($1, 'pause')`, [ids.campaign]);
    expect(await serve(VIEWER2)).toHaveLength(0);
    await as(EDITOR, `select public.set_ad_campaign_state($1, 'resume')`, [ids.campaign]);
    expect(await serve(VIEWER2)).toHaveLength(1);
    await as(EDITOR, `select public.set_ad_campaign_state($1, 'archive')`, [ids.campaign]);
    expect(await serve(VIEWER2)).toHaveLength(0);
    await as(EDITOR, `select public.set_ad_campaign_state($1, 'unarchive')`, [ids.campaign]);

    await as(MOD, `select public.set_ad_campaign_suspension($1, true, '{policy}')`, [ids.campaign]);
    await as(EDITOR, `select public.set_ad_campaign_state($1, 'resume')`, [ids.campaign]).catch(() => undefined);
    expect(await serve(VIEWER2)).toHaveLength(0);
    await as(MOD, `select public.set_ad_campaign_suspension($1, false)`, [ids.campaign]);
    await pauseAll();

    const future = await buildCampaign({ name: "Starts tomorrow", setStartsAt: new Date(Date.now() + 86_400_000).toISOString() });
    await approve(future.campaign);
    expect(await serve(VIEWER2)).toHaveLength(0);
    await pauseAll();
  });

  it("respects targeting, opt-outs and per-ad-set frequency caps", async () => {
    const ids = await buildCampaign({ name: "Targeted", targeting: { cities: ["Monaco"], interests: ["Yachting"] }, cap: 2 });
    await approve(ids.campaign);
    expect(await serve(VIEWER2)).toHaveLength(0); // London, no yachting
    expect(await serve(VIEWER)).toHaveLength(1);
    expect(await serve(VIEWER)).toHaveLength(1);
    expect(await serve(VIEWER)).toHaveLength(0); // cap of 2 per day
    await db.query(`update public.ad_events set occurred_at = occurred_at - interval '2 days' where ad_set_id = $1`, [ids.adSet]);
    await db.query(`update public.profiles set ads_personalization = false where id = $1`, [VIEWER]);
    expect(await serve(VIEWER)).toHaveLength(0); // opted out of targeted ads
    await db.query(`update public.profiles set ads_personalization = true where id = $1`, [VIEWER]);
    await pauseAll();
  });

  it("stops at ad set daily budgets, campaign lifetime budgets, account spend limits and zero balance", async () => {
    // 2 minor units per impression (CPM 2000 milli).
    const setBudget = await buildCampaign({ name: "Ad set budget", setDaily: 3 });
    await approve(setBudget.campaign);
    expect(await serve(VIEWER)).toHaveLength(1);
    expect(await serve(VIEWER2)).toHaveLength(0); // 2 + 2 > 3
    await pauseAll();

    const lifetime = await buildCampaign({ name: "Lifetime budget", budgetType: "lifetime", daily: 4, total: 4 });
    await approve(lifetime.campaign);
    expect(await serve(VIEWER)).toHaveLength(1);
    expect(await serve(VIEWER2)).toHaveLength(1);
    expect(await serve(OUTSIDER)).toHaveLength(0); // 4 spent of 4
    await pauseAll();

    const limited = await buildCampaign({ name: "Account limit" });
    await approve(limited.campaign);
    const [{ spent }] = (await db.query<{ spent: string }>(`select public.ad_spend_milli('account', $1) / 1000 as spent`, [account])).rows as [
      { spent: string },
    ];
    await db.query(`update public.advertiser_accounts set spend_limit_minor = $2 where id = $1`, [account, Number(spent) + 1]);
    expect(await serve(VIEWER)).toHaveLength(0);
    await db.query(`update public.advertiser_accounts set spend_limit_minor = null where id = $1`, [account]);
    expect(await serve(VIEWER)).toHaveLength(1);

    await db.query(`update public.advertiser_accounts set balance_minor = 0 where id = $1`, [account]);
    expect(await serve(VIEWER2)).toHaveLength(0); // prepaid account without funds
    await db.query(`update public.advertiser_accounts set balance_minor = 100000 where id = $1`, [account]);
    await db.query(`update public.advertiser_accounts set billing_status = 'payment_failed' where id = $1`, [account]);
    expect(await serve(VIEWER2)).toHaveLength(0);
    await db.query(`update public.advertiser_accounts set billing_status = 'ok' where id = $1`, [account]);
    await pauseAll();
  });

  it("records one click per impression, charging CPC only for CPC ad sets", async () => {
    const ids = await buildCampaign({ name: "Click pricing", objective: "traffic", bid: { strategy: "cpc_cap", minor: 80 } });
    await approve(ids.campaign);
    const [imp] = await serve(VIEWER2);
    expect(imp).toBeDefined();
    const click = () => as<{ destination_url: string }>(VIEWER2, `select * from public.record_ad_click_v2($1)`, [imp!.impression_id]);
    const [res] = await click();
    expect(res!.destination_url).toContain(`elv_cid=${imp!.impression_id}`);
    await click();
    await expect(as(VIEWER, `select * from public.record_ad_click_v2($1)`, [imp!.impression_id])).rejects.toThrow(/impression not found/);
    const events = (
      await db.query<{ event_type: string; cost_milli: string }>(`select event_type, cost_milli from public.ad_events where ad_set_id = $1 order by occurred_at`, [ids.adSet])
    ).rows;
    expect(events.map((e) => e.event_type)).toEqual(["impression", "click"]);
    expect(events.map((e) => Number(e.cost_milli))).toEqual([0, 50_000]); // impression free, click at the 50-unit floor
    await pauseAll();
  });

  it("reports metrics that match recorded events, only to authorised callers", async () => {
    const ids = await buildCampaign({ name: "Metrics" });
    await approve(ids.campaign);
    const [imp] = await serve(VIEWER);
    await serve(VIEWER2);
    await as(VIEWER, `select * from public.record_ad_click_v2($1)`, [imp!.impression_id]);
    const rows = await as<{ key: string; label: string; impressions: number; reach: number; clicks: number; spend_minor: number }>(
      ANALYST,
      `select * from public.ad_metrics($1, current_date, current_date, 'campaign', $2)`,
      [account, ids.campaign],
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: ids.campaign, label: "Metrics", impressions: 2, reach: 2, clicks: 1, spend_minor: 4 }),
    ]);
    const staff = await as(MOD, `select * from public.ad_metrics($1, current_date, current_date, 'placement', $2)`, [account, ids.campaign]);
    expect(staff).toHaveLength(1);
    await expect(as(OUTSIDER, `select * from public.ad_metrics($1, current_date, current_date, 'day')`, [account])).rejects.toThrow(/Not authorised/);
    // Clients can never write delivery events directly.
    await expect(
      as(OWNER, `insert into public.ad_events (campaign_id, event_type, placement) values ($1, 'impression', 'feed')`, [ids.campaign]),
    ).rejects.toThrow(/permission denied/);
    await pauseAll();
  });

  it("duplicates a campaign as a fresh draft that needs its own review", async () => {
    const ids = await buildCampaign({ name: "Original" });
    await approve(ids.campaign);
    const [{ id: copy }] = (await as<{ id: string }>(EDITOR, `select public.duplicate_ad_campaign($1) as id`, [ids.campaign])) as [{ id: string }];
    const [c] = await as<{ status: string; name: string }>(EDITOR, `select status, name from public.ad_campaigns where id = $1`, [copy]);
    expect(c).toEqual({ status: "draft", name: "Original (copy)" });
    const ads = await as<{ review_status: string }>(EDITOR, `select review_status from public.advertisements where campaign_id = $1`, [copy]);
    expect(ads).toEqual([{ review_status: "draft" }]);
    await pauseAll();
  });
});

describe("legacy campaigns", () => {
  it("on unfunded prepaid accounts are skipped (not errors) until funded", async () => {
    await pauseAll();
    const [{ id: camp }] = (
      await as<{ id: string }>(
        RIVAL,
        `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor,
           total_budget_minor, starts_on, ends_on, headline, destination_url)
         values ($1, $2, 'Rival legacy', 'awareness', 'USD', 100, 1000, current_date, current_date + 5, 'Rival headline',
           'https://example.test/rival') returning id`,
        [rivalAccount, RIVAL],
      ).catch(async () =>
        // The legacy insert policy needs the Advertiser plan; create it directly for this check.
        (
          await db.query<{ id: string }>(
            `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor,
               total_budget_minor, starts_on, ends_on, headline, destination_url)
             values ($1, $2, 'Rival legacy', 'awareness', 'USD', 100, 1000, current_date, current_date + 5, 'Rival headline',
               'https://example.test/rival') returning id`,
            [rivalAccount, RIVAL],
          )
        ).rows,
      )
    ) as [{ id: string }];
    await db.query(`update public.ad_campaigns set status = 'active', cpm_minor = 2000, cpc_minor = 50 where id = $1`, [camp]);
    expect(await as(VIEWER, `select * from public.serve_ads('feed', 1)`)).toHaveLength(0);
    await db.query(`update public.advertiser_accounts set balance_minor = 50 where id = $1`, [rivalAccount]);
    expect(await as(VIEWER, `select * from public.serve_ads('feed', 1)`)).toHaveLength(1);
    await db.query(`update public.ad_campaigns set status = 'paused' where id = $1`, [camp]);
  });

  it("are migrated into the hierarchy and keep serving", async () => {
    const MIGRATION = "20261122000100_ads_core.sql";
    const legacyDb = await createMigratedDb({ until: MIGRATION });
    const LEGACY_OWNER = "00000000-0000-4000-8000-00000000b001";
    const LEGACY_VIEWER = "00000000-0000-4000-8000-00000000b002";
    const prev = db;
    db = legacyDb;
    try {
      await createUser(db, { id: LEGACY_OWNER, handle: "legacy_owner" });
      await createUser(db, { id: LEGACY_VIEWER, handle: "legacy_viewer" });
      await db.query(`insert into public.ad_rate_cards (currency, objective, cpm_minor, cpc_minor) values ('EUR', 'traffic', 1000, 10)`);
      const [acct] = (
        await db.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name) values ($1, 'Old Co') returning id`, [LEGACY_OWNER])
      ).rows;
      const [camp] = (
        await db.query<{ id: string }>(
          `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, status, currency, daily_budget_minor,
             total_budget_minor, starts_on, ends_on, headline, destination_url, cpm_minor, cpc_minor)
           values ($1, $2, 'Old campaign', 'traffic', 'active', 'EUR', 100, 1000, current_date, current_date + 10,
             'Old headline', 'https://example.test/old', 1000, 10) returning id`,
          [acct!.id, LEGACY_OWNER],
        )
      ).rows;
      for (const file of migrationFiles().filter((f) => f >= MIGRATION)) {
        await db.exec(readFileSync(path.join(process.cwd(), "backend/supabase/migrations", file), "utf8"));
      }
      const [row] = (
        await db.query<{ structure: string; sets: number; ads: number; review: string; billing_mode: string; currency: string }>(
          `select c.structure, a.billing_mode, a.currency,
             (select count(*)::int from public.ad_sets s where s.campaign_id = c.id) as sets,
             (select count(*)::int from public.advertisements ad where ad.campaign_id = c.id) as ads,
             (select ad.review_status::text from public.advertisements ad where ad.campaign_id = c.id) as review
           from public.ad_campaigns c join public.advertiser_accounts a on a.id = c.advertiser_account_id where c.id = $1`,
          [camp!.id],
        )
      ).rows;
      expect(row).toEqual({ structure: "managed", sets: 1, ads: 1, review: "approved", billing_mode: "subscription", currency: "EUR" });
      const served = await as<{ headline: string; campaign_id: string }>(LEGACY_VIEWER, `select * from public.serve_ads('feed', 1)`);
      expect(served).toEqual([expect.objectContaining({ headline: "Old headline", campaign_id: camp!.id })]);
      // The original click path still resolves the destination.
      const imp = (await db.query<{ id: string }>(`select id from public.ad_events where campaign_id = $1`, [camp!.id])).rows[0]!.id;
      const [click] = await as<{ destination_url: string }>(LEGACY_VIEWER, `select * from public.record_ad_click($1)`, [imp]);
      expect(click!.destination_url).toBe(`https://example.test/old?elv_cid=${imp}`);
    } finally {
      db = prev;
    }
  }, 180_000);
});
