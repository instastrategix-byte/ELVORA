import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePageSession } from "@backend/auth/viewer";

/** Old campaign links open the same campaign in the Ads Manager (RLS decides whether it's visible). */
export default async function LegacyCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requirePageSession({ next: `/ads/campaigns/${id}` });
  if (!z.uuid().safeParse(id).success) redirect("/ads-manager");
  const { data } = await db.from("ad_campaigns").select("advertiser_account_id").eq("id", id).maybeSingle();
  redirect(data ? `/ads-manager/${data.advertiser_account_id}/campaigns/${id}` : "/ads-manager");
}
