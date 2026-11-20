import type { Metadata } from "next";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { AccountSettingsForm, TeamManager } from "@/components/ads-manager/settings-forms";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, PageHeader } from "@/components/ui/primitives";
import { listAdAccountMembers } from "@backend/modules/advertising";

export const metadata: Metadata = { title: "Ads Manager · Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { db, viewer, account } = await loadAdsPage(accountId, "settings");
  let members;
  try {
    members = await listAdAccountMembers(db, accountId);
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="account settings" />;
  }
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Settings" description="Account details, spending limits and who can work on this account." />
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-medium">Account</h2>
        <AccountSettingsForm account={account} />
      </Card>
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-medium">Team</h2>
        <TeamManager accountId={accountId} members={members} viewerRole={account.role} viewerId={viewer.id} />
      </Card>
      <Card className="space-y-2 p-5 sm:p-6">
        <h2 className="font-medium">Member privacy</h2>
        <p className="text-sm text-muted">
          ELVORA never lets advertisers target sensitive characteristics, never shares who saw or clicked an ad, and never reports audiences smaller than 100 members. Members
          who have opted out of ad personalisation only see untargeted ads, and are left out of audience estimates.
        </p>
      </Card>
    </div>
  );
}
