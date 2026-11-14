import type { Metadata } from "next";
import Link from "next/link";
import { InquiryTable } from "@/components/business/inquiry-table";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { listReceivedInquiries, listSentInquiries } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Inquiries" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/business/inquiries" });
  const tab = (await searchParams).tab === "sent" ? "sent" : "received";
  const result = await attempt(() => (tab === "received" ? listReceivedInquiries(db, viewer) : listSentInquiries(db, viewer)));
  const content = result.ok ? (
    <InquiryTable key={tab} inquiries={result.data} mode={tab} />
  ) : (
    <ServiceNotice error={result.error} what="inquiries" />
  );
  return (
    <div className="max-w-3xl">
      <PageHeader title="Inquiries" description="Inquiries are requests to be contacted. They do not reserve or confirm bookings." />
      <div role="tablist" aria-label="Inquiries" className="mb-6 flex gap-2">
        {(["received", "sent"] as const).map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={tab === t}
            href={t === "received" ? "/business/inquiries" : "/business/inquiries?tab=sent"}
            className={cn("rounded-full border px-4 py-2 text-sm", tab === t ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg")}
          >
            {t === "received" ? "Received" : "Sent by me"}
          </Link>
        ))}
      </div>
      {tab === "received" ? <Alert tone="info" className="mb-5">Reply to members directly using the contact details you agree with them. Mark inquiries as responded to keep track.</Alert> : null}
      {content}
    </div>
  );
}
