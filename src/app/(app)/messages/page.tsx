import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ConversationList } from "@/components/messaging/conversation-list";
import { Card } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { listConversations } from "@backend/modules/messaging/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { viewer, db } = await requirePageSession({ next: "/messages" });
  const result = await attempt(() => listConversations(db, viewer));
  return (
    <div>
      <h1 className="display mb-6 text-4xl">Messages</h1>
      <Card className="grid min-h-[60dvh] overflow-hidden md:grid-cols-[340px_1fr]">
        <div className="border-border md:border-r">
          {result.ok ? <ConversationList userId={viewer.id} initial={result.data} /> : <ServiceNotice error={result.error} what="your conversations" />}
        </div>
        <div className="hidden flex-col items-center justify-center gap-3 p-10 text-center text-muted md:flex">
          <MessageSquare className="size-8 text-accent" aria-hidden="true" />
          <p className="text-sm">Select a conversation to read and reply.</p>
        </div>
      </Card>
    </div>
  );
}
