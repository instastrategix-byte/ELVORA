import type { Metadata } from "next";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ReelsShell } from "@/components/reels/reels-shell";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listReelFeed } from "@backend/modules/reels/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Reels" };

export default async function ReelsPage() {
  const { viewer, db } = await requirePageSession({ next: "/reels" });
  let page;
  try {
    page = await listReelFeed(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="reels" />;
  }
  return <ReelsShell canPost={hasFeature(viewer, "feed.post")} initial={page.items} hasMore={page.hasMore} />;
}
