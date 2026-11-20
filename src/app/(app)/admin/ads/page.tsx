import type { Metadata } from "next";
import { AdReviewConsole } from "@/components/admin/ad-review-console";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { reviewQueue } from "@backend/modules/advertising";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Ad review" };

/** Moderator console for Ads Manager campaigns, ads and appeals. Every decision is re-checked and audited in SQL. */
export default async function AdReviewPage() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/ads" });
  let queue;
  try {
    queue = await reviewQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="the ad review queue" />;
  }
  return <AdReviewConsole queue={queue} />;
}
