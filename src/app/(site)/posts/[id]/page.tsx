import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostCard } from "@/components/feed/post-card";
import { Skeleton } from "@/components/ui/primitives";
import { createClient } from "@backend/db/server";
import { getPost } from "@backend/modules/feed/service";
import { getSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Post", robots: { index: false } };

type Params = Promise<{ id: string }>;

export default function PostPage({ params }: { params: Params }) {
  return (
    <div className="container-page max-w-2xl py-10">
      <Link href="/feed" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Link>
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <PostContent params={params} />
      </Suspense>
    </div>
  );
}

async function PostContent({ params }: { params: Params }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let post;
  let canInteract = false;
  try {
    const session = await getSession();
    canInteract = Boolean(session?.viewer.onboarded && session.viewer.accountStatus === "active");
    post = await getPost(session?.db ?? (await createClient()), session?.viewer ?? null, id);
  } catch (error) {
    return <ServiceNotice error={error} what="this post" />;
  }
  // Posts the viewer may not see are indistinguishable from missing posts.
  if (!post) notFound();
  return <PostCard post={post} canInteract={canInteract} defaultShowComments />;
}
