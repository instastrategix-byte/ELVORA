import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { getOpportunity } from "@backend/modules/opportunities/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Edit opportunity", robots: { index: false } };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/opportunities/${id}/edit` });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await attempt(() => getOpportunity(db, viewer, id));
  if (!result.ok) return <ServiceNotice error={result.error} what="this opportunity" />;
  if (!result.data || !result.data.isAuthor) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Opportunities" title="Edit opportunity" />
      <OpportunityForm opportunity={result.data} />
    </div>
  );
}
