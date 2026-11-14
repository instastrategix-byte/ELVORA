import { BadgeCheck, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { VerificationForm } from "@/components/account/verification-form";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { Card } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { VERIFICATION_LABELS, type VerificationKind } from "@backend/modules/auth/permissions";
import { getMembershipOverview } from "@backend/modules/membership/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Verification" };

const REQUIREMENTS: Record<VerificationKind, { who: string; provide: string[] }> = {
  identity: {
    who: "Any member who wants to confirm they are who they say they are.",
    provide: ["A government-issued photo ID (you may redact the document number)", "Nothing else is required"],
  },
  public_figure: {
    who: "People with a recognised public profile — artists, athletes, media figures, officials.",
    provide: ["Links to official profiles or press coverage in your statement", "Optionally, a letter from your agency or management"],
  },
  executive: {
    who: "Founders, C-suite and senior leaders.",
    provide: ["Proof of role: company filing, official website listing or a signed letter on company letterhead"],
  },
};

export default async function VerificationPage() {
  const { viewer, db } = await requirePageSession({ next: "/account/verification" });
  let overview;
  try {
    overview = await getMembershipOverview(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="your verification status" />;
  }
  const blocked = new Set(overview.verifications.filter((v) => v.status === "pending" || v.status === "approved").map((v) => v.kind));
  const available = (Object.keys(REQUIREMENTS) as VerificationKind[]).filter((k) => !blocked.has(k)).map((k) => ({ kind: k, label: VERIFICATION_LABELS[k] }));

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="display text-3xl">Before you begin</h2>
        <p className="text-sm text-muted">
          Verification is optional and separate from membership: paying for a plan never grants a badge, and a badge never grants paid features.
          Business verification happens from your{" "}
          <Link href="/business" className="text-accent hover:underline">
            business profile
          </Link>
          .
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(REQUIREMENTS) as VerificationKind[]).map((k) => (
            <Card key={k} className="space-y-3 p-5">
              <p className="flex items-center gap-2 font-medium">
                <BadgeCheck className="size-4 text-accent" aria-hidden="true" /> {VERIFICATION_LABELS[k]}
              </p>
              <p className="text-sm text-muted">{REQUIREMENTS[k].who}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {REQUIREMENTS[k].provide.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="flex items-start gap-2 text-sm text-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Documents are stored in private storage, visible only to you and authorised reviewers, and used only to make a verification decision.
        </p>
      </section>

      {overview.verifications.length ? (
        <section>
          <h2 className="display mb-4 text-3xl">Your requests</h2>
          <Card className="divide-y divide-border">
            {overview.verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-medium">{VERIFICATION_LABELS[v.kind]}</p>
                  <p className="text-sm text-muted">
                    Requested {formatDate(v.createdAt)}
                    {v.reviewedAt ? ` · Reviewed ${formatDate(v.reviewedAt)}` : " · Typically reviewed within 5 business days"}
                  </p>
                  {v.reviewerNotes ? <p className="mt-1 text-sm text-muted">Reviewer note: {v.reviewerNotes}</p> : null}
                </div>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="display mb-4 text-3xl">Request verification</h2>
        <Card className="p-6">
          <VerificationForm available={available} />
        </Card>
      </section>
    </div>
  );
}
