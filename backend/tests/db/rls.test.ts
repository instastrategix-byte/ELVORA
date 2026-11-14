import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CARA = "00000000-0000-4000-8000-00000000000c";
const MOD = "00000000-0000-4000-8000-0000000000dd";
const NEWBIE = "00000000-0000-4000-8000-0000000000ee";

let db: PGlite;
let conversationId = "";

async function features(userId: string): Promise<string[]> {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ f: string[] }>(`select public.user_features() as f`);
    return r.rows[0]!.f;
  });
}

beforeAll(async () => {
  db = await createMigratedDb();
  await createUser(db, { id: ALICE, handle: "alice" });
  await createUser(db, { id: BOB, handle: "bob" });
  await createUser(db, { id: CARA, handle: "cara" });
  await createUser(db, { id: MOD, handle: "moderator" });
  await createUser(db, { id: NEWBIE, handle: "newbie", onboarded: false });
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'moderator')`, [MOD]);
}, 60_000);

describe("privilege escalation is impossible from the client", () => {
  it("members cannot change trusted profile columns", async () => {
    for (const column of ["account_status = 'active'", "verified_kinds = '{public_figure}'", "onboarding_completed_at = now()"]) {
      await expect(
        asUser(db, ALICE, (tx) => tx.query(`update public.profiles set ${column} where id = $1`, [ALICE])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("members can edit their own allowed profile fields only for themselves", async () => {
    await asUser(db, ALICE, (tx) => tx.query(`update public.profiles set headline = 'Founder' where id = $1`, [ALICE]));
    const res = await asUser(db, ALICE, (tx) =>
      tx.query(`update public.profiles set headline = 'Hacked' where id = $1 returning id`, [BOB]),
    );
    expect(res.rows).toHaveLength(0);
  });

  it("members cannot grant themselves staff roles", async () => {
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`insert into public.staff_roles (user_id, role) values ($1, 'admin')`, [ALICE])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`select public.grant_staff_role($1, 'admin')`, [ALICE])),
    ).rejects.toThrow(/forbidden/);
  });

  it("members cannot create subscriptions or payments (paid features need a webhook record)", async () => {
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(
          `insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status)
           values ($1, 'premium', 'stripe', 'sub_fake', 'active')`,
          [ALICE],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("members cannot approve their own verification or application", async () => {
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into public.verifications (user_id, kind, statement) values ($1, 'executive', 'CEO')`, [ALICE]),
    );
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`update public.verifications set status = 'approved' where user_id = $1`, [ALICE])),
    ).rejects.toThrow(/permission denied/);
    const v = await db.query<{ id: string }>(`select id from public.verifications where user_id = $1`, [ALICE]);
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`select public.decide_verification($1, 'approved')`, [v.rows[0]!.id])),
    ).rejects.toThrow(/forbidden/);
  });

  it("verification inserts cannot pre-set status", async () => {
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(`insert into public.verifications (user_id, kind, status) values ($1, 'identity', 'approved')`, [BOB]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("staff workflows", () => {
  it("a moderator approval publishes the verification badge", async () => {
    const v = await db.query<{ id: string }>(`select id from public.verifications where user_id = $1`, [ALICE]);
    await asUser(db, MOD, (tx) => tx.query(`select public.decide_verification($1, 'approved', 'checked')`, [v.rows[0]!.id]));
    const p = await db.query<{ verified_kinds: string }>(`select verified_kinds::text from public.profiles where id = $1`, [ALICE]);
    expect(p.rows[0]!.verified_kinds).toBe("{executive}");
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'verification_update'`, [ALICE]);
    expect(n.rows).toHaveLength(1);
  });
});

describe("membership entitlements", () => {
  it("active onboarded members hold only the free plan features", async () => {
    const f = await features(ALICE);
    expect(f).toContain("feed.post");
    expect(f).not.toContain("luxury.inquire");
  });

  it("members who have not finished onboarding hold no features", async () => {
    expect(await features(NEWBIE)).toEqual([]);
  });

  it("checkout eligibility requires an approved application", async () => {
    const eligible = () =>
      asUser(db, BOB, async (tx) => (await tx.query<{ e: boolean }>(`select public.is_eligible_for_plan('premium') as e`)).rows[0]!.e);
    expect(await eligible()).toBe(false);
    await asUser(db, BOB, (tx) =>
      tx.query(`insert into public.membership_applications (user_id, plan_id, statement) values ($1, 'premium', 'hello')`, [BOB]),
    );
    const app = await db.query<{ id: string }>(`select id from public.membership_applications where user_id = $1`, [BOB]);
    await asUser(db, MOD, (tx) => tx.query(`select public.decide_application($1, 'approved')`, [app.rows[0]!.id]));
    expect(await eligible()).toBe(true);
  });

  it("a trusted subscription record unlocks plan features; expiry removes them", async () => {
    await db.query(
      `insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
       values ($1, 'premium', 'stripe', 'sub_test_1', 'active', now() + interval '30 days')`,
      [BOB],
    );
    expect(await features(BOB)).toContain("luxury.inquire");
    await db.query(`update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1`, [BOB]);
    expect(await features(BOB)).not.toContain("luxury.inquire");
  });

  it("suspended members lose all features", async () => {
    await db.query(`update public.profiles set account_status = 'suspended' where id = $1`, [CARA]);
    expect(await features(CARA)).toEqual([]);
    await db.query(`update public.profiles set account_status = 'active' where id = $1`, [CARA]);
  });
});

describe("feed visibility", () => {
  let publicPost: string;
  let membersPost: string;
  let connectionsPost: string;

  beforeAll(async () => {
    const insert = async (visibility: string) =>
      (
        await asUser(db, ALICE, (tx) =>
          tx.query<{ id: string }>(
            `insert into public.posts (author_id, body, visibility) values ($1, 'hi', $2) returning id`,
            [ALICE, visibility],
          ),
        )
      ).rows[0]!.id;
    publicPost = await insert("public");
    membersPost = await insert("members");
    connectionsPost = await insert("connections");
  });

  const visibleTo = async (userId: string | null) =>
    (
      await asUser(db, userId, (tx) =>
        tx.query<{ id: string }>(`select id from public.posts where author_id = $1`, [ALICE]),
      )
    ).rows.map((r) => r.id);

  it("guests see only public posts", async () => {
    expect(await visibleTo(null)).toEqual([publicPost]);
  });

  it("members see member posts but not connections-only posts until connected", async () => {
    const before = await visibleTo(CARA);
    expect(before).toEqual(expect.arrayContaining([publicPost, membersPost]));
    expect(before).not.toContain(connectionsPost);

    const req = await asUser(db, CARA, (tx) =>
      tx.query<{ id: string }>(`select public.request_connection($1, 'Hello') as id`, [ALICE]),
    );
    await asUser(db, ALICE, (tx) => tx.query(`select public.respond_to_connection($1, true)`, [req.rows[0]!.id]));
    expect(await visibleTo(CARA)).toContain(connectionsPost);
  });

  it("members cannot post on behalf of others or without the feature", async () => {
    await expect(
      asUser(db, BOB, (tx) => tx.query(`insert into public.posts (author_id, body) values ($1, 'x')`, [ALICE])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, NEWBIE, (tx) => tx.query(`insert into public.posts (author_id, body) values ($1, 'x')`, [NEWBIE])),
    ).rejects.toThrow(/row-level security/);
  });

  it("likes maintain counters and notify the author", async () => {
    await asUser(db, CARA, (tx) => tx.query(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [membersPost, CARA]));
    const p = await db.query<{ like_count: number }>(`select like_count from public.posts where id = $1`, [membersPost]);
    expect(p.rows[0]!.like_count).toBe(1);
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'post_liked'`, [ALICE]);
    expect(n.rows).toHaveLength(1);
  });
});

describe("messaging", () => {
  it("cannot message a non-connection under the default policy", async () => {
    await expect(
      asUser(db, BOB, (tx) => tx.query(`select public.start_conversation($1)`, [ALICE])),
    ).rejects.toThrow(/cannot message/);
  });

  it("connected members can converse; outsiders cannot read", async () => {
    const conv = await asUser(db, CARA, (tx) =>
      tx.query<{ id: string }>(`select public.start_conversation($1) as id`, [ALICE]),
    );
    const id = conv.rows[0]!.id;
    conversationId = id;
    const send = (clientId: string) =>
      asUser(db, CARA, (tx) =>
        tx.query(
          `insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'Hello Alice', $3)
           on conflict (sender_id, client_id) do nothing`,
          [id, CARA, clientId],
        ),
      );
    // A retried send with the same client id is stored once.
    await send("11111111-1111-4111-8111-111111111111");
    await send("11111111-1111-4111-8111-111111111111");
    const aliceView = await asUser(db, ALICE, (tx) => tx.query(`select body from public.messages where conversation_id = $1`, [id]));
    expect(aliceView.rows).toHaveLength(1);
    const bobView = await asUser(db, BOB, (tx) => tx.query(`select body from public.messages where conversation_id = $1`, [id]));
    expect(bobView.rows).toHaveLength(0);
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(`insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'intrude', gen_random_uuid())`, [
          id,
          BOB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    const summaries = await asUser(db, ALICE, (tx) =>
      tx.query<{ unread_count: number }>(`select * from public.conversation_summaries()`),
    );
    expect(Number(summaries.rows[0]!.unread_count)).toBe(1);
  });

  it("broadcasts persisted messages only to authorized private topics", async () => {
    const topic = `conversation:${conversationId}`;
    const broadcasts = await db.query(`select 1 from realtime.messages where topic = $1 and event = 'message.created'`, [topic]);
    expect(broadcasts.rows).toHaveLength(1);

    const canReceive = (userId: string, t: string) =>
      asUser(db, userId, async (tx) => {
        await tx.query(`select set_config('realtime.topic', $1, false)`, [t]);
        const r = await tx.query(`select 1 from realtime.messages where topic = $1`, [t]);
        await tx.query(`select set_config('realtime.topic', '', false)`);
        return r.rows.length > 0;
      });
    expect(await canReceive(ALICE, topic)).toBe(true);
    expect(await canReceive(BOB, topic)).toBe(false);
    expect(await canReceive(BOB, `user:${ALICE}`)).toBe(false);
    expect(await canReceive(ALICE, `user:${ALICE}`)).toBe(true);
  });

  it("reading a conversation records a read receipt visible to the other participant", async () => {
    await asUser(db, ALICE, (tx) =>
      tx.query(`update public.conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2`, [
        conversationId,
        ALICE,
      ]),
    );
    const receipt = await asUser(db, CARA, (tx) =>
      tx.query<{ last_read_at: string | null }>(
        `select last_read_at from public.conversation_participants where conversation_id = $1 and user_id = $2`,
        [conversationId, ALICE],
      ),
    );
    expect(receipt.rows[0]!.last_read_at).not.toBeNull();
    await expect(
      asUser(db, CARA, (tx) =>
        tx.query(`update public.conversation_participants set last_read_at = now() where user_id = $1 returning 1`, [ALICE]),
      ).then((r) => r.rows.length),
    ).resolves.toBe(0);
  });
});

describe("follows and notification dedupe", () => {
  it("re-following does not duplicate the notification", async () => {
    const follow = () => asUser(db, BOB, (tx) => tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [BOB, ALICE]));
    const unfollow = () => asUser(db, BOB, (tx) => tx.query(`delete from public.follows where follower_id = $1`, [BOB]));
    await follow();
    await unfollow();
    await follow();
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'new_follower'`, [ALICE]);
    expect(n.rows).toHaveLength(1);
  });

  it("preferences suppress optional notifications", async () => {
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into public.notification_preferences (user_id, post_activity) values ($1, false)`, [ALICE]),
    );
    const post = await db.query<{ id: string }>(`select id from public.posts where author_id = $1 and visibility = 'public'`, [ALICE]);
    await asUser(db, BOB, (tx) => tx.query(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [post.rows[0]!.id, BOB]));
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'post_liked' and actor_id = $2`, [ALICE, BOB]);
    expect(n.rows).toHaveLength(0);
  });

  it("members cannot follow on behalf of others", async () => {
    await expect(
      asUser(db, BOB, (tx) => tx.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [CARA, ALICE])),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("luxury listings", () => {
  it("listings publish only for verified businesses with the business plan", async () => {
    await db.query(
      `insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
       values ($1, 'business', 'razorpay', 'sub_rzp_1', 'active', now() + interval '30 days')`,
      [CARA],
    );
    const biz = await asUser(db, CARA, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.businesses (owner_id, name, slug, category) values ($1, 'Azure Villas', 'azure-villas', 'hospitality') returning id`,
        [CARA],
      ),
    );
    const businessId = biz.rows[0]!.id;
    const listing = await asUser(db, CARA, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.listings (business_id, title, slug, category) values ($1, 'Cliff Villa', 'cliff-villa', 'villa') returning id`,
        [businessId],
      ),
    );
    const listingId = listing.rows[0]!.id;

    await expect(
      asUser(db, CARA, (tx) => tx.query(`select public.submit_listing($1)`, [listingId])),
    ).rejects.toThrow(/verified/);
    await expect(
      asUser(db, CARA, (tx) => tx.query(`update public.businesses set status = 'approved' where id = $1`, [businessId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, CARA, (tx) => tx.query(`update public.listings set status = 'published' where id = $1`, [listingId])),
    ).rejects.toThrow(/permission denied/);

    await asUser(db, CARA, (tx) => tx.query(`select public.submit_business_for_review($1)`, [businessId]));
    await asUser(db, MOD, (tx) => tx.query(`select public.review_business($1, 'approved')`, [businessId]));
    await asUser(db, CARA, (tx) => tx.query(`select public.submit_listing($1)`, [listingId]));

    const guestBefore = await asUser(db, null, (tx) => tx.query(`select id from public.listings where id = $1`, [listingId]));
    expect(guestBefore.rows).toHaveLength(0);

    await asUser(db, MOD, (tx) => tx.query(`select public.review_listing($1, true, 'ok')`, [listingId]));
    const guest = await asUser(db, null, (tx) => tx.query(`select id from public.listings where id = $1`, [listingId]));
    expect(guest.rows).toHaveLength(1);

    // Archive and republish without re-review…
    await asUser(db, CARA, (tx) => tx.query(`select public.set_listing_status($1, 'archived')`, [listingId]));
    await asUser(db, CARA, (tx) => tx.query(`select public.set_listing_status($1, 'published')`, [listingId]));
    // …but a material edit sends it back to review.
    await asUser(db, CARA, (tx) => tx.query(`update public.listings set title = 'Cliff Villa Retreat' where id = $1`, [listingId]));
    const after = await db.query<{ status: string }>(`select status from public.listings where id = $1`, [listingId]);
    expect(after.rows[0]!.status).toBe("pending_review");
    await asUser(db, MOD, (tx) => tx.query(`select public.review_listing($1, true)`, [listingId]));

    const history = await db.query<{ to_status: string }>(
      `select to_status from public.status_history where entity_type = 'listing' and entity_id = $1 order by id`,
      [listingId],
    );
    expect(history.rows.map((r) => r.to_status)).toEqual([
      "draft", "pending_review", "published", "archived", "published", "pending_review", "published",
    ]);
  });

  it("inquiries require the inquiry feature", async () => {
    const l = await db.query<{ id: string }>(`select id from public.listings where slug = 'cliff-villa'`);
    await expect(
      asUser(db, ALICE, (tx) =>
        tx.query(`insert into public.listing_inquiries (listing_id, sender_id, message) values ($1, $2, 'Is July available?')`, [
          l.rows[0]!.id,
          ALICE,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("invitations", () => {
  it("validates and redeems hashed invitation codes once", async () => {
    await db.query(
      `insert into public.invitations (code_hash, plan_id, pre_approved, max_uses) values (public.hash_invitation_code('ELV-TEST-0001'), 'premium', true, 1)`,
    );
    const check = await asUser(db, null, (tx) =>
      tx.query<{ valid: boolean; plan_id: string }>(`select * from public.check_invitation('elv-test-0001')`),
    );
    expect(check.rows[0]).toMatchObject({ valid: true, plan_id: "premium" });

    await asUser(db, ALICE, (tx) => tx.query(`select public.redeem_invitation('ELV-TEST-0001')`));
    const app = await db.query<{ status: string }>(
      `select status from public.membership_applications where user_id = $1 and plan_id = 'premium'`,
      [ALICE],
    );
    expect(app.rows[0]!.status).toBe("approved");

    const again = await asUser(db, null, (tx) => tx.query<{ valid: boolean }>(`select * from public.check_invitation('ELV-TEST-0001')`));
    expect(again.rows[0]!.valid).toBe(false);
  });
});

describe("advertising", () => {
  const DAN = "00000000-0000-4000-8000-0000000000da";
  let campaignId = "";

  beforeAll(async () => {
    await createUser(db, { id: DAN, handle: "dan_ads" });
    await db.query(
      `insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
       values ($1, 'advertiser', 'stripe', 'sub_ads_1', 'active', now() + interval '30 days')`,
      [DAN],
    );
    await db.query(`insert into public.ad_rate_cards (currency, objective, cpm_minor, cpc_minor) values ('USD', 'traffic', 2000, 100)`);
    await db.query(`update public.profiles set location = 'Monaco', interests = '{yachting}' where id = $1`, [BOB]);
  });

  it("advertisers cannot set prices, statuses or metrics", async () => {
    const acct = await asUser(db, DAN, (tx) =>
      tx.query<{ id: string }>(`insert into public.advertiser_accounts (owner_id, display_name) values ($1, 'Dan Marine') returning id`, [DAN]),
    );
    const c = await asUser(db, DAN, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor,
           total_budget_minor, starts_on, ends_on, headline, destination_url, target_interests, frequency_cap_per_day)
         values ($1, $2, 'Summer charter', 'traffic', 'USD', 5, 10, current_date, current_date + 30, 'Charter the Riviera',
           'https://example.test/charter', '{yachting}', 2) returning id`,
        [acct.rows[0]!.id, DAN],
      ),
    );
    campaignId = c.rows[0]!.id;
    await expect(
      asUser(db, DAN, (tx) => tx.query(`update public.ad_campaigns set cpm_minor = 1 where id = $1`, [campaignId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, DAN, (tx) => tx.query(`update public.ad_campaigns set status = 'active' where id = $1`, [campaignId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, DAN, (tx) =>
        tx.query(`insert into public.ad_events (campaign_id, event_type, placement) values ($1, 'impression', 'feed')`, [campaignId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, DAN, (tx) => tx.query(`select public.transition_campaign($1, 'approve')`, [campaignId])),
    ).rejects.toThrow(/forbidden|not awaiting/);
  });

  it("only approved campaigns serve, within frequency caps and targeting, recording measured impressions", async () => {
    const serve = (userId: string) =>
      asUser(db, userId, (tx) => tx.query<{ impression_id: string }>(`select * from public.serve_ads('feed', 1)`)).then((r) => r.rows);

    expect(await serve(BOB)).toHaveLength(0); // still a draft
    await asUser(db, DAN, (tx) => tx.query(`select public.transition_campaign($1, 'submit')`, [campaignId]));
    expect(await serve(BOB)).toHaveLength(0); // pending review
    await asUser(db, MOD, (tx) => tx.query(`select public.transition_campaign($1, 'approve')`, [campaignId]));

    expect(await serve(ALICE)).toHaveLength(0); // targeting: no yachting interest
    const first = await serve(BOB);
    expect(first).toHaveLength(1);
    expect(await serve(BOB)).toHaveLength(1);
    expect(await serve(BOB)).toHaveLength(0); // frequency cap of 2/day

    const click = () => asUser(db, BOB, (tx) => tx.query(`select * from public.record_ad_click($1)`, [first[0]!.impression_id]));
    await click();
    await click(); // duplicate click is not double counted
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`select * from public.record_ad_click($1)`, [first[0]!.impression_id])),
    ).rejects.toThrow(/impression not found/);

    const report = await asUser(db, DAN, (tx) =>
      tx.query<{ impressions: string; clicks: string; spend_minor: string }>(`select * from public.campaign_report($1)`, [campaignId]),
    );
    expect(report.rows[0]).toMatchObject({ impressions: 2, clicks: 1 });
    // 2 impressions at 2000/1000 = 4 minor units + 1 click at 100 would exceed the 10-unit total budget -> click recorded at no cost.
    expect(Number(report.rows[0]!.spend_minor)).toBe(4);

    const other = await asUser(db, ALICE, (tx) => tx.query(`select * from public.campaign_report($1)`, [campaignId]));
    expect(other.rows).toHaveLength(0);
  });

  it("budgets stop delivery", async () => {
    await db.query(`update public.profiles set location = 'Monaco', interests = '{yachting}' where id = $1`, [CARA]);
    // Spend today is 4 minor units; one more impression (2) would exceed the daily budget of 5.
    const blocked = await asUser(db, CARA, (tx) => tx.query(`select * from public.serve_ads('feed', 1)`));
    expect(blocked.rows).toHaveLength(0);
    // Raising the daily budget re-enables delivery, still bounded by the total budget of 10.
    await db.query(`update public.ad_campaigns set daily_budget_minor = 10 where id = $1`, [campaignId]);
    const served = await asUser(db, CARA, (tx) => tx.query(`select * from public.serve_ads('feed', 1)`));
    expect(served.rows).toHaveLength(1);
  });
});
