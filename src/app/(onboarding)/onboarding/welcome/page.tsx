import { ArrowRight, BadgeCheck, CreditCard, Home, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/routes";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "You're in" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageSession({ next: "/onboarding/welcome" });
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next) : null;

  const steps = [
    { icon: UserRound, title: "Complete your profile", body: "Add a photo, biography and professional details.", href: "/profile/edit", cta: "Edit profile" },
    {
      icon: CreditCard,
      title: "Choose a membership",
      body: "Premium, professional, business and advertiser plans are granted by application.",
      href: "/apply",
      cta: "Apply",
    },
    {
      icon: BadgeCheck,
      title: "Request verification",
      body: "Optional. For public figures and executives — see requirements before sharing anything.",
      href: "/account/verification",
      cta: "Learn more",
    },
  ];

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="display text-5xl">You&apos;re in.</h1>
        <p className="text-muted">
          Your Member account is active. Paid memberships and verification badges are reviewed separately — nothing changes until a decision is made.
        </p>
      </div>
      <ul className="space-y-3">
        {steps.map((s) => (
          <li key={s.title} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
            <s.icon className="size-6 shrink-0 text-accent" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted">{s.body}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={s.href}>{s.cta}</Link>
            </Button>
          </li>
        ))}
      </ul>
      <Button asChild size="lg">
        <Link href={next ?? "/home"}>
          {next ? "Continue" : <><Home /> Go to my feed</>} <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
