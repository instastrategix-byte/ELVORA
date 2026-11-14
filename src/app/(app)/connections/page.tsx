import type { Metadata } from "next";
import Link from "next/link";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ConnectionList } from "@/components/social/connection-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { countPendingRequests, listConnections, type ConnectionTab } from "@backend/modules/connections/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Connections" };

const TABS: { id: ConnectionTab; label: string }[] = [
  { id: "connections", label: "Connections" },
  { id: "received", label: "Received" },
  { id: "sent", label: "Sent" },
];

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/connections" });
  const raw = (await searchParams).tab;
  const tab: ConnectionTab = raw === "received" || raw === "sent" ? raw : "connections";

  const result = await attempt(() => Promise.all([listConnections(db, viewer, tab), countPendingRequests(db, viewer)]));
  const pending = result.ok ? result.data[1] : 0;
  const content = result.ok ? (
    <ConnectionList key={tab} tab={tab} initial={result.data[0]} />
  ) : (
    <ServiceNotice error={result.error} what="your connections" />
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Connections"
        description="Mutual, deliberate connections. Members choose who can message them."
        actions={
          <Button asChild variant="outline">
            <Link href="/discover">Find people</Link>
          </Button>
        }
      />
      <div role="tablist" aria-label="Connections" className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            href={t.id === "connections" ? "/connections" : `/connections?tab=${t.id}`}
            className={cn("rounded-full border px-4 py-2 text-sm", tab === t.id ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg")}
          >
            {t.label}
            {t.id === "received" && pending > 0 ? <span className="ml-1.5 rounded-full bg-fg/10 px-1.5 text-xs">{pending}</span> : null}
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
