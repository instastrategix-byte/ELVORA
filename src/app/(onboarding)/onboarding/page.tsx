import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { safeNextPath } from "@/lib/routes";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer } = await requirePageSession({ onboarded: false, next: "/onboarding" });
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next) : undefined;
  if (viewer.onboarded) redirect(next ?? "/home");

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="eyebrow">Step 1 of 2</p>
        <h1 className="display text-5xl">Welcome to ELVORA.</h1>
        <p className="text-muted">Just the essentials to begin. You can add professional details, a photo and interests later.</p>
      </div>
      <OnboardingForm defaultName={viewer.displayName} next={next} />
    </div>
  );
}
