import { HeartHandshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { GivenVouchRow, IncomingRequestCard, ReceivedVouchRow, SentRequestRow } from "@/components/vouches/vouch-ui";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { getVouchInbox } from "@backend/modules/vouches/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Vouches", robots: { index: false } };

const TABS = [
  { key: "requests", label: "Requests" },
  { key: "received", label: "For you" },
  { key: "given", label: "Given" },
  { key: "sent", label: "Asked" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function VouchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/vouches" });
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "requests";
  const result = await attempt(() => getVouchInbox(db, viewer));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Network"
        title="Vouches"
        description="Members stand behind people they know. Vouches appear on profiles with the voucher's name, and help applicants and introductions."
      />
      {!result.ok ? (
        <ServiceNotice error={result.error} what="your vouches" />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            You&apos;ve used {result.data.allowance.used} of {result.data.allowance.cap} vouches this month.
          </p>
          <nav aria-label="Vouch lists" className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => {
              const count = t.key === "requests" ? result.data.incoming.length : 0;
              return (
                <Link
                  key={t.key}
                  href={t.key === "requests" ? "/vouches" : `/vouches?tab=${t.key}`}
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

          {tab === "requests" ? (
            result.data.incoming.length ? (
              <ul className="space-y-4">
                {result.data.incoming.map((r) => (
                  <li key={r.id}>
                    <IncomingRequestCard request={r} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<HeartHandshake />} title="No one is waiting on you" description="When a connection or an applicant asks you to vouch for them, it appears here." />
            )
          ) : null}

          {tab === "received" ? (
            result.data.received.length ? (
              <Card>
                <p className="border-b border-border p-4 text-xs text-muted">Hidden vouches stay off your profile. The member who vouched isn&apos;t told.</p>
                <ul className="divide-y divide-border">
                  {result.data.received.map((v) => (
                    <ReceivedVouchRow key={v.id} vouch={v} />
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState
                icon={<HeartHandshake />}
                title="No vouches yet"
                description="Ask connections who know your work. Open their profile and choose “Ask for a vouch”."
              />
            )
          ) : null}

          {tab === "given" ? (
            result.data.given.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {result.data.given.map((v) => (
                    <GivenVouchRow key={v.id} vouch={v} />
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState icon={<HeartHandshake />} title="You haven't vouched for anyone" description="Open a connection's profile and choose “Vouch”." />
            )
          ) : null}

          {tab === "sent" ? (
            result.data.sent.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {result.data.sent.map((r) => (
                    <SentRequestRow key={r.id} request={r} />
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState icon={<HeartHandshake />} title="No requests sent" description="Requests you send, including referees on your application, appear here." />
            )
          ) : null}
        </>
      )}
    </div>
  );
}
