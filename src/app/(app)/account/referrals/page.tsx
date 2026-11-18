import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ReferralManager } from "@/components/account/referral-manager";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { attempt } from "@/lib/attempt";
import { siteUrl } from "@/lib/env";
import { referralOverview } from "@backend/modules/referrals/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Invite members", robots: { index: false } };

export default async function ReferralsPage() {
  const { viewer, db } = await requirePageSession({ next: "/account/referrals" });
  const result = await attempt(() => referralOverview(db, viewer));
  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">You&apos;re vouching for the people you invite</p>
          <p className="text-muted">
            Invite people you know personally. They apply with your invitation and still go through our review — an invitation is a recommendation, not
            automatic membership. You&apos;ll be notified when someone applies with yours.
          </p>
        </div>
      </div>
      {result.ok ? <ReferralManager overview={result.data} siteOrigin={new URL(siteUrl("/")).origin} /> : <ServiceNotice error={result.error} what="your invitations" />}
    </div>
  );
}
