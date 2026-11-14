import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, DraftNotice } from "@/components/marketing/content-page";

export const metadata: Metadata = { title: "Terms", description: "The terms that govern ELVORA membership and use." };

export default function TermsPage() {
  return (
    <ContentPage eyebrow="Legal" title="Terms of membership" updated="October 2026">
      <DraftNotice />
      <h2>Membership</h2>
      <p>
        ELVORA is a membership network. We may accept or decline applications at our discretion. Paid plans are activated only after confirmation from
        our payment provider, and renew until cancelled. Cancellation takes effect at the end of the current billing period.
      </p>
      <h2>Verification</h2>
      <p>
        Verification badges are granted after independent review and may be revoked if information proves inaccurate. Purchasing a plan does not
        entitle you to any badge.
      </p>
      <h2>Marketplace & inquiries</h2>
      <p>
        Listings are provided by independent businesses. Sending an inquiry does not create a booking or contract; any arrangement is made directly
        between you and the provider.
      </p>
      <h2>Advertising</h2>
      <p>Campaigns are reviewed before delivery. Reported metrics reflect measured impressions and clicks only.</p>
      <h2>Conduct</h2>
      <p>
        You agree to follow our <Link href="/community-guidelines">community guidelines</Link>. We may restrict accounts that violate them.
      </p>
    </ContentPage>
  );
}
