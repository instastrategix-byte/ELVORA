import { z } from "zod";
import { getBillingOverview, listStatements, listTransactions } from "@backend/modules/advertising/billing/service";
import { route } from "@backend/http/route";

/** Balance, spend and ledger for an advertiser account (analyst+ — enforced in SQL/RLS). */
export const GET = route(
  { name: "ads.billing.get", query: z.object({ account: z.uuid(), cursor: z.string().max(200).optional() }) },
  async ({ session, query }) => {
    const [overview, transactions, statements] = await Promise.all([
      getBillingOverview(session.db, query.account),
      listTransactions(session.db, query.account, query.cursor),
      listStatements(session.db, query.account),
    ]);
    return { overview, transactions, statements };
  },
);
