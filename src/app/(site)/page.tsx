import { ArrowRight, BadgeCheck, Building2, Compass, Lock, MessageSquareLock, ShieldCheck, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryArt } from "@/components/marketing/category-art";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, LISTING_CATEGORIES } from "@backend/modules/listings/schemas";

export const metadata: Metadata = {
  title: { absolute: "ELVORA — The private network for distinguished lives" },
};

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Trusted networking",
    body: "Every member is reviewed. Verification badges are earned through independent checks — never bought.",
  },
  {
    icon: Compass,
    title: "Luxury discovery",
    body: "Villas, residences, yachts, supercars and rare experiences from verified providers, in one curated marketplace.",
  },
  {
    icon: MessageSquareLock,
    title: "Private connections",
    body: "Connect deliberately. Messaging respects each member's privacy settings, and your profile is only as visible as you choose.",
  },
  {
    icon: TrendingUp,
    title: "Premium business growth",
    body: "Verified businesses reach a qualified audience through listings, inquiries and clearly labelled sponsored placements.",
  },
];

const STEPS = [
  { n: "01", title: "Apply or accept an invitation", body: "Tell us who you are. Invitations from members can fast-track review." },
  { n: "02", title: "Review & verification", body: "Our team reviews applications. Optional verification adds a badge for public figures, executives and businesses." },
  { n: "03", title: "Choose your membership", body: "Activate the plan that fits — individual, premium, professional, business or advertiser." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_60%)]" />
        <div className="container-page relative grid gap-12 py-20 sm:py-28 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div className="animate-fade-in space-y-8">
            <p className="eyebrow">Membership by review</p>
            <h1 className="display text-5xl leading-[1.02] sm:text-7xl">
              The private network for <em className="text-accent not-italic">distinguished</em> lives.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted">
              ELVORA brings together founders, executives, public figures and the finest luxury businesses — with verified identities,
              private connections and a curated marketplace for the exceptional.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/apply">
                  Apply for membership <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/luxury">Explore luxury listings</Link>
              </Button>
            </div>
            <p className="text-sm text-muted">
              Already a member?{" "}
              <Link href="/sign-in" className="text-accent underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="grid grid-cols-2 gap-4">
              <CategoryArt category="villa" className="aspect-[3/4] rounded-3xl" />
              <div className="mt-12 space-y-4">
                <CategoryArt category="yacht" className="aspect-square rounded-3xl" />
                <div className="rounded-3xl border border-border bg-surface p-5">
                  <p className="flex items-center gap-2 text-sm">
                    <BadgeCheck className="size-4 text-accent" /> Verified executive
                  </p>
                  <p className="mt-2 text-xs text-muted">Badges reflect independent review, not payment.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="container-page py-20 sm:py-24" aria-labelledby="pillars">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">Why ELVORA</p>
          <h2 id="pillars" className="display text-4xl sm:text-5xl">
            Fewer people. Better connections.
          </h2>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="space-y-3 bg-surface p-8">
              <p.icon className="size-6 text-accent" aria-hidden="true" />
              <h3 className="display text-2xl">{p.title}</h3>
              <p className="text-sm leading-6 text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="border-y border-border bg-surface/40 py-20" aria-labelledby="discover-heading">
        <div className="container-page">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="space-y-3">
              <p className="eyebrow">The marketplace</p>
              <h2 id="discover-heading" className="display text-4xl sm:text-5xl">
                Curated, verified, exceptional.
              </h2>
            </div>
            <Button asChild variant="outline">
              <Link href="/luxury">
                Browse all <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {LISTING_CATEGORIES.map((c) => (
              <li key={c}>
                <Link href={`/luxury?category=${c}`} className="group block overflow-hidden rounded-2xl border border-border">
                  <CategoryArt category={c} className="aspect-[4/3] transition-transform duration-500 group-hover:scale-[1.03]" />
                  <span className="flex items-center justify-between bg-surface px-4 py-3 text-sm">
                    {CATEGORY_LABELS[c]}
                    <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-20 sm:py-24" aria-labelledby="how">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <p className="eyebrow">How membership works</p>
            <h2 id="how" className="display text-4xl sm:text-5xl">
              Considered, not crowded.
            </h2>
            <p className="text-muted">
              Paying for a plan never makes anyone a verified celebrity, executive or business. Identity, business verification, membership and staff
              roles are reviewed separately.
            </p>
            <Button asChild variant="link">
              <Link href="/about">Read our trust standards</Link>
            </Button>
          </div>
          <ol className="space-y-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-6 rounded-2xl border border-border bg-surface p-6">
                <span className="display text-3xl text-accent">{s.n}</span>
                <div className="space-y-1">
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Business CTA */}
      <section className="container-page" aria-labelledby="business">
        <div className="grid gap-8 overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="space-y-4">
            <Building2 className="size-7 text-accent" aria-hidden="true" />
            <h2 id="business" className="display text-4xl">
              For luxury businesses and brands
            </h2>
            <p className="text-muted">
              Hotels, residences, yacht and automotive specialists, event houses and experience curators: verify your business, publish listings, receive
              direct inquiries and run reviewed sponsored campaigns.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button asChild>
              <Link href="/membership#business">List your business</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/advertise">Advertise</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-page py-24 text-center">
        <Lock className="mx-auto size-6 text-accent" aria-hidden="true" />
        <h2 className="display mx-auto mt-4 max-w-2xl text-4xl sm:text-5xl">Your circle, by invitation and review.</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/apply">Apply now</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
