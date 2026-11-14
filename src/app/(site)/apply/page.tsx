import { FileCheck2, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ApplicationForm } from "@/components/membership/application-form";
import { InvitationCheck } from "@/components/membership/invitation-check";
import { StatusBadge } from "@/components/membership/status-badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { getMembershipOverview } from "@backend/modules/membership/service";
import { getSession } from "@backend/auth/viewer";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply for ELVORA membership or accept an invitation.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ApplyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <aside className="space-y-8">
          <div className="space-y-3">
            <p className="eyebrow">Apply</p>
            <h1 className="display text-5xl sm:text-6xl">Join ELVORA.</h1>
            <p className="text-muted">Every application is read by a member of our team. Most decisions are made within a few business days.</p>
          </div>
          <ol className="space-y-5">
            {[
              { icon: UserRound, title: "Create your account", body: "Only your name and email to begin." },
              { icon: FileCheck2, title: "Tell us about yourself", body: "A short statement. We never ask for ID documents in an application." },
              {
                icon: ShieldCheck,
                title: "Optional verification",
                body: "Public figures, executives and businesses may request a badge later. You'll see exactly what's needed and why before uploading anything.",
              },
            ].map((s) => (
              <li key={s.title} className="flex gap-4">
                <s.icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
        <Suspense fallback={<Skeleton className="h-[480px] rounded-3xl" />}>
          <ApplyPanel searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function ApplyPanel({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const plan = typeof sp.plan === "string" ? sp.plan : undefined;
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;

  let session;
  try {
    session = await getSession();
  } catch (error) {
    return <ServiceNotice error={error} what="the application form" />;
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <Card className="space-y-5 p-6 sm:p-8">
          <h2 className="display text-3xl">Start with an account</h2>
          <p className="text-sm text-muted">Create a free account, complete your profile, then apply for the membership that fits.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/sign-up${plan ? `?next=${encodeURIComponent(`/apply?plan=${plan}`)}` : ""}`}>Create account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sign-in?next=${encodeURIComponent(`/apply${plan ? `?plan=${plan}` : ""}`)}`}>I have an account</Link>
            </Button>
          </div>
        </Card>
        <Card className="space-y-4 p-6 sm:p-8">
          <h2 className="display text-2xl">Have an invitation?</h2>
          <InvitationCheck signedIn={false} initialCode={invite} />
        </Card>
      </div>
    );
  }

  if (!session.viewer.onboarded) {
    return (
      <Card className="space-y-4 p-6 sm:p-8">
        <h2 className="display text-3xl">Finish your profile first</h2>
        <p className="text-sm text-muted">Applications are reviewed alongside your profile, so we need a few details before you apply.</p>
        <Button asChild>
          <Link href="/onboarding">Complete profile</Link>
        </Button>
      </Card>
    );
  }

  let overview;
  try {
    overview = await getMembershipOverview(session.db, session.viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="membership options" />;
  }

  const open = new Set(overview.applications.filter((a) => ["submitted", "under_review", "approved"].includes(a.status)).map((a) => a.planId));
  const applicable = overview.plans
    .filter((p) => p.requiresApplication && !open.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      note: p.requiredVerifications.length ? "Checkout also requires an approved verification — you can request it from your account." : p.tagline ?? undefined,
    }));

  return (
    <div className="space-y-6">
      {overview.applications.length ? (
        <Card className="p-6">
          <h2 className="display text-2xl">Your applications</h2>
          <ul className="mt-4 divide-y divide-border">
            {overview.applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  {overview.plans.find((p) => p.id === a.planId)?.name ?? a.planId}
                  <span className="block text-xs text-muted">Submitted {formatDate(a.createdAt)}</span>
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
          <Button asChild variant="link" className="mt-3">
            <Link href="/account/membership">Manage membership</Link>
          </Button>
        </Card>
      ) : null}
      <Card className="p-6 sm:p-8">
        <h2 className="display mb-6 text-3xl">Apply for membership</h2>
        {applicable.length ? (
          <ApplicationForm plans={applicable} defaultPlan={plan} />
        ) : (
          <p className="text-sm text-muted">You have applied for every membership that requires review. We&apos;ll notify you of decisions.</p>
        )}
      </Card>
      <Card className="space-y-4 p-6 sm:p-8">
        <h2 className="display text-2xl">Have an invitation?</h2>
        <InvitationCheck signedIn initialCode={invite} />
      </Card>
    </div>
  );
}
