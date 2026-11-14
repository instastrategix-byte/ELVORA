import type { Metadata } from "next";
import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = { title: "Community guidelines", description: "How members are expected to behave on ELVORA." };

export default function GuidelinesPage() {
  return (
    <ContentPage
      eyebrow="Community"
      title="Community guidelines"
      intro="ELVORA works because members trust one another. These principles protect that trust."
    >
      <h2>Be who you say you are</h2>
      <p>Use your real name or your business&apos;s registered name. Impersonation and misleading claims of status or affiliation are not allowed.</p>
      <h2>Respect privacy</h2>
      <ul>
        <li>Do not share another member&apos;s private posts, messages or personal details outside ELVORA.</li>
        <li>Do not photograph, record or publicise members without consent.</li>
      </ul>
      <h2>Connect with intention</h2>
      <p>Unsolicited sales pitches, mass messaging and repeated connection requests after a decline are not permitted.</p>
      <h2>Zero tolerance</h2>
      <ul>
        <li>Harassment, threats, hate or discrimination.</li>
        <li>Fraud, scams, or misrepresenting listings, prices or availability.</li>
        <li>Content that infringes others&apos; intellectual property, including images you do not have rights to use.</li>
      </ul>
      <h2>Reporting</h2>
      <p>
        Use the report option on any post, profile or listing. Reports are confidential and reviewed by our moderation team, who may hide content,
        warn, or suspend accounts. Every decision is logged.
      </p>
    </ContentPage>
  );
}
