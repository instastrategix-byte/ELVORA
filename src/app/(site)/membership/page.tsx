import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PlanCard } from "@/components/membership/plan-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { createClient } from "@backend/db/server";
import { listPlans } from "@backend/modules/membership/service";
import type { Plan } from "@backend/modules/membership/types";

export const metadata: Metadata = {
  title: "Membership",
  description: "ELVORA membership plans for individuals, verified professionals, luxury businesses and advertisers.",
};

export default function MembershipPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <header className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="eyebrow">Membership</p>
        <h1 className="display text-5xl sm:text-6xl">Choose how you belong.</h1>
        <p className="text-lg text-muted">
          Start as a member at no cost. Premium, professional, business and advertiser memberships are granted by application and activated on
          payment.
        </p>
      </header>

      <section aria-label="Plans" className="mt-14">
        <Suspense
          fallback={
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-96 rounded-2xl" />
              ))}
            </div>
          }
        >
          <Plans />
        </Suspense>
      </section>

      <section className="mx-auto mt-20 max-w-3xl space-y-6" aria-labelledby="terms">
        <h2 id="terms" className="display text-3xl">
          Membership terms, plainly
        </h2>
        <dl className="divide-y divide-border rounded-2xl border border-border">
          {[
            ["Is payment the same as verification?", "No. Badges are granted only after independent identity or business review. Paying never grants a badge."],
            ["When does a paid plan start?", "Only after our payment provider confirms your subscription. Until then your features do not change."],
            ["Can I cancel?", "Yes, any time from Membership & billing. Your plan remains active until the end of the paid period."],
            ["What if I'm declined?", "You remain a Member with standard features and may reapply later with more information."],
          ].map(([q, a]) => (
            <div key={q} className="p-5">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 text-sm text-muted">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Full details in our <Link href="/terms" className="text-accent underline-offset-4 hover:underline">terms</Link>.
        </p>
      </section>
    </div>
  );
}

async function Plans() {
  let plans: Plan[];
  try {
    plans = await listPlans(await createClient());
  } catch (error) {
    return <ServiceNotice error={error} what="membership plans" />;
  }
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          highlight={plan.id === "premium"}
          footer={
            <Button asChild className="w-full" variant={plan.id === "premium" ? "primary" : "outline"}>
              <Link href={plan.isFree ? "/sign-up" : `/apply?plan=${plan.id}`}>{plan.isFree ? "Create account" : "Apply"}</Link>
            </Button>
          }
        />
      ))}
    </div>
  );
}
