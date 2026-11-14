import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Thread } from "@/components/messaging/thread";
import { Card } from "@/components/ui/primitives";
import { getConversation, listConversations, listMessages } from "@backend/modules/messaging/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/messages/${id}` });
  if (!z.uuid().safeParse(id).success) notFound();

  let data;
  try {
    const conversation = await getConversation(db, viewer, id);
    if (!conversation) {
      data = null;
    } else {
      const [conversations, history] = await Promise.all([listConversations(db, viewer), listMessages(db, id, { limit: 30 })]);
      data = { conversation, conversations, history };
    }
  } catch (error) {
    return <ServiceNotice error={error} what="this conversation" />;
  }
  // Non-participants get a 404: conversations are never revealed to outsiders.
  if (!data) notFound();

  return (
    <div>
      <h1 className="display mb-6 hidden text-4xl md:block">Messages</h1>
      <Card className="grid h-[calc(100dvh-11rem)] min-h-[480px] overflow-hidden md:h-[70dvh] md:grid-cols-[340px_1fr]">
        <div className="hidden overflow-y-auto border-r border-border md:block">
          <ConversationList userId={viewer.id} initial={data.conversations} activeId={id} />
        </div>
        <Thread key={id} viewerId={viewer.id} conversation={data.conversation} initial={data.history.items} initialHasMore={data.history.hasMore} />
      </Card>
    </div>
  );
}
