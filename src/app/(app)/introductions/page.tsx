import { Handshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { IntroductionCard } from "@/components/introductions/introduction-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { listIntroductions } from "@backend/modules/introductions/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Introductions", robots: { index: false } };

const TABS = [
  { key: "review", label: "To introduce" },
  { key: "received", label: "For you" },
  { key: "sent", label: "Sent" },
] as const;

export default async function IntroductionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/introductions" });
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]["key"]) : "review";
  const result = await attempt(() => listIntroductions(db, viewer));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Network"
        title="Introductions"
        description="Warm introductions through people you both trust. Ask from any member's profile; your mutual connection decides whether to pass it on."
      />
      {!result.ok ? (
        <ServiceNotice error={result.error} what="introductions" />
      ) : (
        <>
          <nav aria-label="Introduction lists" className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => {
              const count =
                t.key === "review"
                  ? result.data.toReview.filter((i) => i.status === "pending").length
                  : t.key === "received"
                    ? result.data.received.filter((i) => i.status === "forwarded").length
                    : 0;
              return (
                <Link
                  key={t.key}
                  href={t.key === "review" ? "/introductions" : `/introductions?tab=${t.key}`}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
                    tab === t.key ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  {count > 0 ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">{count}</span> : null}
                </Link>
              );
            })}
          </nav>
          {(() => {
            const items = tab === "review" ? result.data.toReview : tab === "received" ? result.data.received : result.data.sent;
            if (items.length === 0) {
              return (
                <EmptyState
                  icon={<Handshake />}
                  title={tab === "review" ? "No one is waiting on you" : tab === "received" ? "No introductions yet" : "You haven't asked for any introductions"}
                  description={
                    tab === "sent"
                      ? "Open the profile of someone you'd like to meet and choose “Request introduction” to ask a mutual connection."
                      : "When connections ask you to introduce them, or introduce someone to you, it will appear here."
                  }
                  action={
                    tab === "sent" ? (
                      <Button asChild variant="outline">
                        <Link href="/discover">Find members</Link>
                      </Button>
                    ) : undefined
                  }
                />
              );
            }
            return (
              <ul className="space-y-4">
                {items.map((i) => (
                  <li key={i.id}>
                    <IntroductionCard intro={i} />
                  </li>
                ))}
              </ul>
            );
          })()}
        </>
      )}
    </div>
  );
}
