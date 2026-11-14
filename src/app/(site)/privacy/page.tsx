import type { Metadata } from "next";
import { ContentPage, DraftNotice } from "@/components/marketing/content-page";

export const metadata: Metadata = { title: "Privacy", description: "How ELVORA collects, uses and protects personal information." };

export default function PrivacyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Privacy policy" updated="October 2026">
      <DraftNotice />
      <h2>What we collect</h2>
      <ul>
        <li>Account data: email address and authentication credentials (managed by our authentication provider; passwords are never stored by ELVORA in plain text).</li>
        <li>Profile data you choose to provide: name, handle, headline, biography, professional details, interests and images.</li>
        <li>Verification evidence you submit, stored in private storage accessible only to you and authorised reviewers.</li>
        <li>Content and activity: posts, comments, connections, messages, inquiries and saved items.</li>
        <li>Billing references from our payment providers. We never store full card numbers.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To operate the network and enforce each member&apos;s privacy settings.</li>
        <li>To review applications and verification requests.</li>
        <li>To keep the community safe through moderation and fraud prevention.</li>
        <li>To process memberships and payments through Stripe or Razorpay.</li>
      </ul>
      <h2>Your controls</h2>
      <p>
        You control profile visibility (public, members, or connections only), discoverability, and who may message you, from Settings. You may request
        deletion of your account at any time from Settings → Security.
      </p>
      <h2>Advertising</h2>
      <p>
        Sponsored placements are always labelled. Targeting uses only the location and interests on your ELVORA profile. We do not sell personal data.
      </p>
      <h2>Contact</h2>
      <p>Privacy requests can be submitted from your account settings.</p>
    </ContentPage>
  );
}
