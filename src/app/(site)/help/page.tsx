import { ChevronDown, LifeBuoy, Mail, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Help & support",
  description: "Answers to common questions about your ELVORA account, membership, verification, privacy and business tools.",
};

type Faq = { q: string; a: React.ReactNode };

const SECTIONS: { title: string; items: Faq[] }[] = [
  {
    title: "Signing in",
    items: [
      {
        q: "How can I sign in without a password?",
        a: (
          <>
            On the <Link href="/sign-in">sign-in page</Link> choose <strong>Email code</strong>. We email a one-time code that works for one hour and only
            once. Codes are only sent to existing accounts.
          </>
        ),
      },
      {
        q: "I didn't receive my email.",
        a: "Check your spam or promotions folder and wait a minute before requesting another. For security, we limit how many emails can be sent in a short period.",
      },
      {
        q: "I forgot my password.",
        a: (
          <>
            Use <Link href="/forgot-password">reset your password</Link>. The link in the email expires after one hour.
          </>
        ),
      },
    ],
  },
  {
    title: "Membership & billing",
    items: [
      {
        q: "What does each membership include?",
        a: (
          <>
            Compare plans on the <Link href="/membership">membership page</Link>. Your current plan, renewal date and receipts are in{" "}
            <Link href="/account/membership">Account → Membership</Link>.
          </>
        ),
      },
      {
        q: "Does paying make me verified?",
        a: "No. Membership and verification are separate. Verification is granted only after our team reviews your documents, so a verified badge always means the same thing.",
      },
      {
        q: "How do I cancel?",
        a: (
          <>
            Open <Link href="/account/membership">Account → Membership</Link>. You keep access until the end of the period you&apos;ve paid for.
          </>
        ),
      },
    ],
  },
  {
    title: "Verification & trust",
    items: [
      {
        q: "How do I get verified?",
        a: (
          <>
            Submit a request from <Link href="/account/verification">Account → Verification</Link>. Documents are stored privately, only reviewers can open them,
            and you&apos;re notified of the decision.
          </>
        ),
      },
      {
        q: "What's the difference between verified and sponsored?",
        a: "Verified means our team checked the member or business. Sponsored means someone paid for the placement. Sponsored content is always labelled and never implies verification.",
      },
    ],
  },
  {
    title: "Privacy & safety",
    items: [
      {
        q: "Who can see my profile?",
        a: (
          <>
            You choose: everyone, members only, or your connections only. You can also hide yourself from discovery and limit who can message you, all in{" "}
            <Link href="/account/settings">Account → Settings</Link>.
          </>
        ),
      },
      {
        q: "How do I report or block someone?",
        a: "Use the report option on any profile, post or listing. To block someone, open their profile. Blocking takes effect immediately and hides you from each other. Reports go to our moderation team, and the person isn't told who reported them.",
      },
      {
        q: "Can I delete my account?",
        a: (
          <>
            Yes. Request deletion in <Link href="/account/settings">Account → Settings</Link>. Read how we handle your data in our{" "}
            <Link href="/privacy">privacy policy</Link>.
          </>
        ),
      },
    ],
  },
  {
    title: "Business & advertising",
    items: [
      {
        q: "How do I list my business?",
        a: (
          <>
            A business membership unlocks the business workspace. Submit your business for verification, then publish listings, which our team reviews before
            they go live. See <Link href="/membership#business">business plans</Link>.
          </>
        ),
      },
      {
        q: "How do I advertise?",
        a: (
          <>
            Read <Link href="/advertise">advertising on ELVORA</Link>. Every campaign is reviewed before it runs, and reports show real impressions and clicks.
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  const supportEmail = publicEnv().NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <div className="container-page py-14 sm:py-20">
      <header className="max-w-3xl space-y-4">
        <p className="eyebrow">Help & support</p>
        <h1 className="display text-5xl sm:text-6xl">How can we help?</h1>
        <p className="text-lg leading-8 text-muted">Quick answers about your account, membership, verification and privacy.</p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title} aria-labelledby={`h-${section.title}`}>
              <h2 id={`h-${section.title}`} className="display mb-4 text-2xl">
                {section.title}
              </h2>
              <div className="panel divide-y divide-border">
                {section.items.map((item) => (
                  <details key={item.q} className="group px-5 py-4 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="mt-3 text-sm leading-6 text-muted">{item.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-6">
            <LifeBuoy className="mb-3 size-5 text-accent" aria-hidden="true" />
            <h2 className="font-semibold">Still need help?</h2>
            {supportEmail ? (
              <p className="mt-2 text-sm text-muted">
                Write to us and include the email address on your account.
                <a href={`mailto:${supportEmail}`} className="mt-3 flex items-center gap-2 text-accent hover:underline">
                  <Mail className="size-4" aria-hidden="true" /> {supportEmail}
                </a>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Signed-in members can reach our team by reporting a problem from any profile, post or listing.
              </p>
            )}
          </div>
          <div className="panel p-6">
            <ShieldAlert className="mb-3 size-5 text-accent" aria-hidden="true" />
            <h2 className="font-semibold">Something unsafe?</h2>
            <p className="mt-2 text-sm text-muted">
              Report it from the profile, post or listing, and block the person from their profile if you need to. Read our{" "}
              <Link href="/community-guidelines" className="text-accent underline underline-offset-4">
                community guidelines
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
