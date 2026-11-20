import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CampaignWizard } from "@/components/ads-manager/campaign-wizard";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { roleAtLeast } from "@/components/ads-manager/model";
import { draftFromCampaign, newDraft } from "@/components/ads-manager/wizard-model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { getCampaignDetail, listAudiences, listCreatives, listPromotableItems } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Create campaign" };

export default async function NewCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const { db, viewer, account } = await loadAdsPage(accountId, "campaigns/new");
  const base = `/ads-manager/${accountId}`;
  if (!roleAtLeast(account.role, "editor")) {
    return (
      <Alert tone="warning" title="View-only access">
        Analysts can see results but can&apos;t create campaigns. Ask an account admin for editor access.
      </Alert>
    );
  }
  const resumeId = typeof sp.campaign === "string" && z.uuid().safeParse(sp.campaign).success ? sp.campaign : null;

  let data;
  try {
    const [campaign, audiences, creatives, promotable] = await Promise.all([
      resumeId ? getCampaignDetail(db, resumeId) : Promise.resolve(null),
      listAudiences(db, accountId),
      listCreatives(db, accountId),
      listPromotableItems(db, viewer),
    ]);
    data = { campaign, audiences, creatives, promotable };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="campaign setup" />;
  }
  const c = data.campaign;
  if (resumeId && (!c || c.accountId !== accountId)) {
    return <Alert tone="error" title="Campaign not found">It may have been deleted. <Link className="text-accent hover:underline" href={`${base}/campaigns`}>Back to campaigns</Link></Alert>;
  }
  if (c && (c.structure !== "managed" || c.archivedAt || !(c.status === "draft" || c.status === "rejected"))) {
    return (
      <Alert tone="info" title="This campaign can't be edited here">
        Only draft or not-approved campaigns can be changed. Pause it or duplicate it instead.{" "}
        <Link className="text-accent hover:underline" href={`${base}/campaigns/${c.id}`}>
          Open the campaign
        </Link>
      </Alert>
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Campaigns"
        title={c ? `Edit: ${c.name}` : "Create campaign"}
        description="Each step is saved as a draft, so you can leave and come back. Nothing is served until our team approves it."
      />
      {c?.status === "rejected" && c.reviewNote ? (
        <Alert tone="warning" title="Reviewer note" className="mb-6">
          {c.reviewNote}
        </Alert>
      ) : null}
      <CampaignWizard
        account={{ id: account.id, displayName: account.displayName, currency: account.currency }}
        initial={c ? draftFromCampaign(c) : newDraft()}
        audiences={data.audiences}
        creatives={data.creatives}
        promotable={data.promotable}
      />
    </div>
  );
}
