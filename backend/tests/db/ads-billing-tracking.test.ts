import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const OWNER = "00000000-0000-4000-8000-0000000002a1";
const VIEWER = "00000000-0000-4000-8000-0000000002a2";
const STRANGER = "00000000-0000-4000-8000-0000000002a3";
const ADMIN = "00000000-0000-4000-8000-0000000002a4";
const OTHER_ADV = "00000000-0000-4000-8000-0000000002a5";

let db: PGlite;
let account: string;
let campaign: string;
let otherCampaign: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const balance = async () => Number((await one<{ b: string }>(`select balance_minor::text as b from public.advertiser_accounts where id = $1`, [account])).b);
const ledgerSum = async () =>
  Number((await one<{ s: string }>(`select coalesce(sum(amount_minor), 0)::text as s from public.ad_transactions where account_id = $1`, [account])).s);

async function makeCampaign(owner: string, acct: string): Promise<string> {
  const c = await one<{ id: string }>(
    `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor,
       total_budget_minor, starts_on, ends_on, headline, destination_url, status, cpm_minor, cpc_minor)
     values ($1, $2, 'Charter', 'traffic', 'USD', 1000, 100000, current_date, current_date + 30, 'Charter the Riviera',
       'https://shop.example.com/charter', 'active', 1500, 100) returning id`,
    [acct, owner],
  );
  return c.id;
}

async function impression(campaignId: string, viewer: string, costMilli: number, at = "now()"): Promise<string> {
  return (
    await one<{ id: string }>(
      `insert into public.ad_events (campaign_id, event_type, viewer_id, placement, cost_milli, occurred_at)
       values ($1, 'impression', $2, 'feed', $3, ${at}) returning id`,
      [campaignId, viewer, costMilli],
    )
  ).id;
}

async function click(campaignId: string, imp: string, viewer: string, at = "now()") {
  await db.query(
    `insert into public.ad_events (campaign_id, event_type, viewer_id, impression_id, placement, cost_milli, occurred_at)
     values ($1, 'click', $2, $3, 'feed', 0, ${at})`,
    [campaignId, viewer, imp],
  );
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [OWNER, "ads_owner"],
    [VIEWER, "ads_viewer"],
    [STRANGER, "ads_stranger"],
    [ADMIN, "ads_admin"],
    [OTHER_ADV, "ads_other"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'admin')`, [ADMIN]);
  for (const id of [OWNER, OTHER_ADV]) {
    await db.query(
      `insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
       values ($1, 'advertiser', 'stripe', $2, 'active', now() + interval '30 days')`,
      [id, `sub_${id.slice(-3)}`],
    );
  }
  account = (
    await asUser(db, OWNER, (tx) =>
      tx.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name) values ($1, 'Owner Marine') returning id`, [OWNER]),
    )
  ).rows[0]!.id;
  const otherAccount = (
    await asUser(db, OTHER_ADV, (tx) =>
      tx.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name) values ($1, 'Other Co') returning id`, [OTHER_ADV]),
    )
  ).rows[0]!.id;
  campaign = await makeCampaign(OWNER, account);
  otherCampaign = await makeCampaign(OTHER_ADV, otherAccount);
  await db.query(`select public.ad_record_top_up($1, 100000, 'USD', 'cs_other', 'pi_other')`, [otherAccount]);
});

describe("ad billing ledger", () => {
  it("credits a top-up once, even when the webhook is replayed", async () => {
    expect((await one<{ r: boolean }>(`select public.ad_record_top_up($1, 10, 'USD', 'cs_1', 'pi_1') as r`, [account])).r).toBe(true);
    expect((await one<{ r: boolean }>(`select public.ad_record_top_up($1, 10, 'USD', 'cs_1', 'pi_1') as r`, [account])).r).toBe(false);
    expect(await balance()).toBe(10);
    expect(await ledgerSum()).toBe(10);
    const acct = await one<{ currency: string }>(`select currency from public.advertiser_accounts where id = $1`, [account]);
    expect(acct.currency).toBe("USD");
  });

  it("debits delivery exactly, accumulating sub-unit costs per day", async () => {
    // Each impression costs 1.5 minor units (1500 milli): 1st → 2 charged, 2nd → 3 total, 3rd → 5 total.
    await impression(campaign, VIEWER, 1500);
    expect(await balance()).toBe(8);
    await impression(campaign, VIEWER, 1500);
    expect(await balance()).toBe(7);
    await impression(campaign, VIEWER, 1500);
    expect(await balance()).toBe(5);
    const spend = await db.query<{ amount_minor: string }>(`select amount_minor::text from public.ad_transactions where account_id = $1 and kind = 'spend'`, [account]);
    expect(spend.rows.map((r) => Number(r.amount_minor))).toEqual([-5]);
    expect(await ledgerSum()).toBe(await balance());
  });

  it("refuses delivery the balance cannot cover, so it never goes negative", async () => {
    await expect(impression(campaign, VIEWER, 9000)).rejects.toThrow(/insufficient ad balance/);
    expect(await balance()).toBe(5);
    expect(await ledgerSum()).toBe(5);
  });

  it("does not charge accounts on the original subscription model", async () => {
    const hasMode = (await one<{ c: number }>(
      `select count(*)::int as c from information_schema.columns where table_name = 'advertiser_accounts' and column_name = 'billing_mode'`,
    )).c;
    if (!hasMode) return;
    const acct = (await one<{ id: string }>(`select advertiser_account_id as id from public.ad_campaigns where id = $1`, [otherCampaign])).id;
    await db.query(`update public.advertiser_accounts set billing_mode = 'subscription' where id = $1`, [acct]);
    const before = (await one<{ b: string }>(`select balance_minor::text as b from public.advertiser_accounts where id = $1`, [acct])).b;
    await impression(otherCampaign, VIEWER, 5000);
    const after = (await one<{ b: string }>(`select balance_minor::text as b from public.advertiser_accounts where id = $1`, [acct])).b;
    expect(after).toBe(before);
    await db.query(`update public.advertiser_accounts set billing_mode = 'prepaid' where id = $1`, [acct]);
  });

  it("applies provider refunds as cumulative reversals and ignores replays", async () => {
    await db.query(`select public.ad_record_refund('pi_1', 'ch_1', 3)`);
    await db.query(`select public.ad_record_refund('pi_1', 'ch_1', 3)`);
    expect(await balance()).toBe(2);
    await db.query(`select public.ad_record_refund('pi_1', 'ch_1', 4)`);
    expect(await balance()).toBe(1);
    expect(await ledgerSum()).toBe(1);
  });

  it("restores billing status after a failed payment is followed by a successful top-up", async () => {
    await db.query(`select public.ad_mark_payment_failed($1)`, [account]);
    expect((await one<{ s: string }>(`select billing_status::text as s from public.advertiser_accounts where id = $1`, [account])).s).toBe("payment_failed");
    await db.query(`select public.ad_record_top_up($1, 50, 'USD', 'cs_2', 'pi_2')`, [account]);
    expect((await one<{ s: string }>(`select billing_status::text as s from public.advertiser_accounts where id = $1`, [account])).s).toBe("ok");
    expect(await balance()).toBe(51);
  });

  it("rejects top-ups in a different currency", async () => {
    await expect(db.query(`select public.ad_record_top_up($1, 50, 'EUR', 'cs_eur', null)`, [account])).rejects.toThrow(/does not match/);
  });

  it("keeps the ledger private and unwritable", async () => {
    const own = await asUser(db, OWNER, (tx) => tx.query(`select id from public.ad_transactions where account_id = $1`, [account]));
    expect(own.rows.length).toBeGreaterThan(0);
    const stranger = await asUser(db, STRANGER, (tx) => tx.query(`select id from public.ad_transactions`));
    expect(stranger.rows).toHaveLength(0);
    await expect(
      asUser(db, OWNER, (tx) =>
        tx.query(`insert into public.ad_transactions (account_id, kind, amount_minor, currency, idempotency_key) values ($1, 'credit', 999, 'USD', 'x')`, [account]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, OWNER, (tx) => tx.query(`update public.advertiser_accounts set balance_minor = 999999 where id = $1`, [account]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(db, OWNER, (tx) => tx.query(`select public.ad_record_top_up($1, 999, 'USD', 'cs_x', null)`, [account]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query(`delete from public.ad_transactions where account_id = $1`, [account])).rejects.toThrow(/cannot be deleted/);
  });

  it("lets only admins adjust balances, with an audit record", async () => {
    await expect(asUser(db, OWNER, (tx) => tx.query(`select public.ad_adjust_balance($1, 100, 'goodwill credit')`, [account]))).rejects.toThrow(/admin only/);
    await asUser(db, ADMIN, (tx) => tx.query(`select public.ad_adjust_balance($1, 9, 'goodwill credit')`, [account]));
    expect(await balance()).toBe(60);
    const audit = await db.query(`select 1 from public.audit_log where action = 'ads.balance_adjusted' and entity_id = $1`, [account]);
    expect(audit.rows).toHaveLength(1);
  });

  it("produces an idempotent monthly statement only for completed months", async () => {
    const lastMonth = "date_trunc('month', now()) - interval '10 days'";
    await db.query(
      `insert into public.ad_transactions (account_id, kind, amount_minor, currency, idempotency_key, created_at)
       values ($1, 'credit', 20, 'USD', 'backdated-credit', ${lastMonth})`,
      [account],
    );
    const month = (await one<{ m: string }>(`select (date_trunc('month', now()) - interval '1 month')::date::text as m`)).m;
    const first = await asUser(db, OWNER, (tx) => tx.query<{ id: string }>(`select public.generate_ad_statement($1, $2::date) as id`, [account, month]));
    const again = await asUser(db, OWNER, (tx) => tx.query<{ id: string }>(`select public.generate_ad_statement($1, $2::date) as id`, [account, month]));
    expect(again.rows[0]!.id).toBe(first.rows[0]!.id);
    const st = await one<{ top_ups_minor: string; closing_balance_minor: string; number: string }>(
      `select top_ups_minor::text, closing_balance_minor::text, number from public.ad_invoices where id = $1`,
      [first.rows[0]!.id],
    );
    expect(Number(st.top_ups_minor)).toBe(20);
    expect(Number(st.closing_balance_minor)).toBe(20);
    expect(st.number).toMatch(/^ELV-ADS-\d{6}-/);
    await expect(asUser(db, OWNER, (tx) => tx.query(`select public.generate_ad_statement($1, current_date)`, [account]))).rejects.toThrow(
      /after the month ends/,
    );
    await expect(asUser(db, STRANGER, (tx) => tx.query(`select public.generate_ad_statement($1, $2::date)`, [account, month]))).rejects.toThrow(/not allowed/);
  });
});

describe("conversion tracking", () => {
  let pixelKey: string;
  let serverKey: string;

  it("only account admins create integrations; secrets stay with the service role", async () => {
    await expect(
      asUser(db, STRANGER, (tx) => tx.query(`select * from public.create_ad_tracking_integration($1, 'Shop', 'pixel', '{shop.example.com}')`, [account])),
    ).rejects.toThrow(/not allowed/);
    const hasMembers = (await one<{ t: string | null }>(`select to_regclass('public.advertiser_members')::text as t`)).t;
    if (hasMembers) {
      await db.query(`insert into public.advertiser_members (account_id, user_id, role) values ($1, $2, 'analyst')`, [account, STRANGER]);
      await expect(
        asUser(db, STRANGER, (tx) => tx.query(`select * from public.create_ad_tracking_integration($1, 'Shop', 'pixel', '{shop.example.com}')`, [account])),
      ).rejects.toThrow(/not allowed/);
    }
    await expect(
      asUser(db, OWNER, (tx) => tx.query(`select * from public.create_ad_tracking_integration($1, 'Shop', 'pixel', '{https://bad}')`, [account])),
    ).rejects.toThrow(/plain host names/);
    const pixel = await asUser(db, OWNER, (tx) =>
      tx.query<{ public_key: string; secret: string | null }>(`select * from public.create_ad_tracking_integration($1, 'Shop', 'pixel', '{Shop.Example.com}')`, [account]),
    );
    pixelKey = pixel.rows[0]!.public_key;
    expect(pixelKey).toMatch(/^elvpx_/);
    expect(pixel.rows[0]!.secret).toBeNull();
    const server = await asUser(db, OWNER, (tx) =>
      tx.query<{ public_key: string; secret: string }>(`select * from public.create_ad_tracking_integration($1, 'CRM', 'server', '{}')`, [account]),
    );
    serverKey = server.rows[0]!.public_key;
    expect(server.rows[0]!.secret).toMatch(/^elvsk_/);
    await expect(asUser(db, OWNER, (tx) => tx.query(`select * from public.ad_tracking_secrets`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, OWNER, (tx) => tx.query(`select public.ad_tracking_signing_secret($1)`, [serverKey]))).rejects.toThrow(/permission denied/);
    const signing = await one<{ s: string }>(`select public.ad_tracking_signing_secret($1) as s`, [serverKey]);
    expect(signing.s).toBe(server.rows[0]!.secret);
  });

  it("cannot be called by signed-in members or visitors", async () => {
    for (const user of [OWNER, null]) {
      await expect(
        asUser(db, user, (tx) => tx.query(`select public.ingest_ad_conversion($1, 'lead', 'e-1', true, 'shop.example.com')`, [pixelKey])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  const ingest = (args: { key?: string; event?: string; id: string; consent?: boolean; host?: string | null; click?: string | null; at?: string | null }) =>
    one<{ r: string }>(`select public.ingest_ad_conversion($1, $2, $3, $4, $5, $6, 1999, 'USD', 'https://shop.example.com/thanks', null, $7::timestamptz) as r`, [
      args.key ?? pixelKey,
      args.event ?? "lead",
      args.id,
      args.consent ?? true,
      args.host === undefined ? "www.shop.example.com" : args.host,
      args.click ?? null,
      args.at ?? null,
    ]).then((r) => r.r);

  it("rejects other domains and unconsented events, and de-duplicates by event id", async () => {
    expect(await ingest({ id: "e-dom", host: "evil.example.net" })).toBe("domain_not_allowed");
    expect(await ingest({ id: "e-nc", consent: false })).toBe("no_consent");
    expect(await ingest({ id: "e-1" })).toBe("stored");
    expect(await ingest({ id: "e-1" })).toBe("duplicate");
    const rows = await db.query(`select event_id from public.ad_conversions where account_id = $1`, [account]);
    expect(rows.rows.map((r) => (r as { event_id: string }).event_id)).toEqual(["e-1"]);
    const diag = await db.query<{ code: string }>(`select code from public.ad_tracking_diagnostics order by id`);
    expect(diag.rows.map((d) => d.code)).toEqual(["domain_not_allowed", "no_consent"]);
    const integ = await one<{ verified_at: string | null }>(`select verified_at from public.ad_tracking_integrations where public_key = $1`, [pixelKey]);
    expect(integ.verified_at).not.toBeNull();
    // Server integrations don't need an origin.
    expect(await ingest({ key: serverKey, id: "s-1", host: null })).toBe("stored");
  });

  it("attributes only to this advertiser's clicks inside the window", async () => {
    const withClick = await impression(campaign, VIEWER, 0, "now() - interval '3 days'");
    await click(campaign, withClick, VIEWER, "now() - interval '3 days'");
    const noClick = await impression(campaign, VIEWER, 0);
    const oldClick = await impression(campaign, VIEWER, 0, "now() - interval '10 days'");
    await click(campaign, oldClick, VIEWER, "now() - interval '10 days'");
    const foreign = await impression(otherCampaign, VIEWER, 0, "now() - interval '1 day'");
    await click(otherCampaign, foreign, VIEWER, "now() - interval '1 day'");

    await ingest({ id: "a-in", click: withClick });
    await ingest({ id: "a-noclick", click: noClick });
    await ingest({ id: "a-old", click: oldClick });
    await ingest({ id: "a-foreign", click: foreign });
    const rows = await db.query<{ event_id: string; attributed: boolean; campaign_id: string | null }>(
      `select event_id, attributed, campaign_id from public.ad_conversions where event_id like 'a-%' order by event_id`,
    );
    expect(rows.rows).toEqual([
      { event_id: "a-foreign", attributed: false, campaign_id: null },
      { event_id: "a-in", attributed: true, campaign_id: campaign },
      { event_id: "a-noclick", attributed: false, campaign_id: null },
      { event_id: "a-old", attributed: false, campaign_id: null },
    ]);

    // A 1-day window no longer covers the 3-day-old click.
    await db.query(`update public.ad_tracking_integrations set attribution_window_days = 1 where public_key = $1`, [pixelKey]);
    await ingest({ id: "a-short", click: withClick });
    expect((await one<{ attributed: boolean }>(`select attributed from public.ad_conversions where event_id = 'a-short'`)).attributed).toBe(false);
  });

  it("shows conversions only to the account's members", async () => {
    const own = await asUser(db, OWNER, (tx) => tx.query(`select id from public.ad_conversions`));
    expect(own.rows.length).toBeGreaterThan(0);
    const other = await asUser(db, OTHER_ADV, (tx) => tx.query(`select id from public.ad_conversions`));
    expect(other.rows).toHaveLength(0);
    await expect(
      asUser(db, OWNER, (tx) =>
        tx.query(
          `insert into public.ad_conversions (integration_id, account_id, event_name, event_id, consent, occurred_at)
           select id, account_id, 'lead', 'forged', true, now() from public.ad_tracking_integrations limit 1`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
