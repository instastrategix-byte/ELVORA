import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { hasFeature } from "@backend/modules/auth/permissions";
import { getReel, listReelFeed } from "@backend/modules/reels/service";
import { requirePageSession } from "@backend/auth/viewer";
import { ReelsShell } from "@/components/reels/reels-shell";

export const metadata: Metadata = { title: "Reel", robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ comments?: string }> };

/** A shared or linked reel, followed by the rest of the feed. */
export default async function ReelPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { viewer, db } = await requirePageSession({ next: `/reels/${id}` });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let data;
  try {
    const [reel, feed] = await Promise.all([getReel(db, viewer, id), listReelFeed(db, viewer, [id])]);
    data = reel ? { items: [reel, ...feed.items], hasMore: feed.hasMore } : null;
  } catch (error) {
    return <ServiceNotice error={error} what="this reel" />;
  }
  if (!data) notFound();
  return (
    <ReelsShell
      canPost={hasFeature(viewer, "feed.post")}
      initial={data.items}
      hasMore={data.hasMore}
      openCommentsFor={query.comments ? id : undefined}
    />
  );
}
