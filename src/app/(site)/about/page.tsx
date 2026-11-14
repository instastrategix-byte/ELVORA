import { BadgeCheck, Eye, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/marketing/content-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description: "ELVORA's mission, trust standards and community principles.",
};

const STANDARDS = [
  { icon: ShieldCheck, title: "Reviewed membership", body: "Applications are reviewed by people, not purchased. Invitations can accelerate, but never bypass, our standards." },
  { icon: BadgeCheck, title: "Verification is separate from payment", body: "Badges for public figures, executives and businesses are granted only after independent review. A paid plan never confers a badge." },
  { icon: Eye, title: "Privacy by default", body: "Profiles default to members-only. You decide who can see your profile and who can message you." },
  { icon: Scale, title: "Accountable moderation", body: "Reports are reviewed by trained staff. Every moderation decision is recorded and auditable." },
];

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About ELVORA"
      title="A network built on trust."
      intro="ELVORA exists to make high-trust connections possible: between people who value discretion, and with the businesses that serve them at the highest level."
    >
      <h2>Our mission</h2>
      <p>
        Online networks have become loud, anonymous and transactional. ELVORA is deliberately different: a smaller, reviewed community where identity
        matters, privacy is respected and every interaction carries context.
      </p>
      <h2>Trust standards</h2>
      <div className="not-prose grid gap-4 sm:grid-cols-2">
        {STANDARDS.map((s) => (
          <div key={s.title} className="rounded-2xl border border-border bg-surface p-6">
            <s.icon className="size-5 text-accent" aria-hidden="true" />
            <h3 className="mt-3 font-medium text-fg">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </div>
        ))}
      </div>
      <h2>Community standards</h2>
      <p>
        Members agree to our <Link href="/community-guidelines">community guidelines</Link>: honesty about identity, respect for others&apos; privacy,
        no solicitation without consent, and zero tolerance for harassment or fraud.
      </p>
      <div className="flex flex-wrap gap-3 pt-6">
        <Button asChild>
          <Link href="/apply">Apply for membership</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/membership">Compare memberships</Link>
        </Button>
      </div>
    </ContentPage>
  );
}
