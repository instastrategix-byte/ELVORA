import { VerifiedTick } from "@/components/ui/verified-badge";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Compass,
  EyeOff,
  Lock,
  MessageSquareLock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryArt } from "@/components/marketing/category-art";
import { Button } from "@/components/ui/button";
import { SITE_MEDIA } from "@/content/media";
import { cn } from "@/lib/utils";
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
    body: "Villas, residences, yachts, supercars, private aviation and rare experiences from verified providers, in one curated marketplace.",
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

/** Commitments the platform actually enforces (see docs/SECURITY_THREAT_MODEL.md) — no vanity numbers. */
const TRUST = [
  { icon: UserCheck, label: "Every member reviewed" },
  { icon: BadgeCheck, label: "Badges earned, never bought" },
  { icon: EyeOff, label: "You control your visibility" },
  { icon: ShieldCheck, label: "Verified providers only" },
];

/** Marketplace tiles spanning two columns on desktop: 8 tiles + 4 extra cells = three full rows of 4. */
const WIDE_TILES = new Set([0, 5, 8]);

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
        <div aria-hidden="true" className="glow-gold pointer-events-none absolute inset-0" />
        <div className="container-page relative grid gap-14 pt-20 pb-16 sm:pt-28 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:pb-28">
          <div className="space-y-8">
            <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1.5 text-xs tracking-[0.2em] text-accent uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" /> Membership by review
            </p>
            <h1 className="display animate-rise text-5xl leading-[1.02] [animation-delay:80ms] sm:text-7xl xl:text-[5.25rem]">
              The private network for <span className="text-gold">distinguished</span> lives.
            </h1>
            <p className="animate-rise max-w-xl text-lg leading-8 text-muted [animation-delay:160ms]">
              ELVORA brings together founders, executives, public figures and the finest luxury businesses — with verified identities,
              private connections and a curated marketplace for the exceptional.
            </p>
            <div className="animate-rise flex flex-wrap gap-3 [animation-delay:240ms]">
              <Button asChild size="lg">
                <Link href="/apply">
                  Apply for membership <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/luxury">Explore the marketplace</Link>
              </Button>
            </div>
            <p className="animate-rise text-sm text-muted [animation-delay:320ms]">
              Already a member?{" "}
              <Link href="/sign-in" className="text-accent underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
            <div className="relative grid grid-cols-2 gap-5">
              <CategoryArt
                category="villa"
                src={SITE_MEDIA.hero.primary}
                showName={!SITE_MEDIA.hero.primary}
                className="aspect-[3/4] rounded-[2rem] shadow-lift"
              />
              <div className="mt-16 space-y-5">
                <CategoryArt
                  category="yacht"
                  src={SITE_MEDIA.hero.secondary}
                  showName={!SITE_MEDIA.hero.secondary}
                  className="aspect-square rounded-[2rem] shadow-lift"
                />
                <div className="panel animate-float p-5 backdrop-blur">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <VerifiedTick tier="distinguished" label="" /> Verified executive
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted">Badges reflect independent review — never payment.</p>
                </div>
              </div>
            </div>
            <div className="panel absolute -bottom-6 -left-8 flex items-center gap-3 px-4 py-3 shadow-lift backdrop-blur [animation-delay:1.5s] animate-float">
              <span className="flex size-9 items-center justify-center rounded-full bg-gold text-accent-fg">
                <MessageSquareLock className="size-4" />
              </span>
              <span className="text-xs leading-5">
                <span className="block font-medium text-fg">Private by design</span>
                <span className="text-muted">You decide who can message you</span>
              </span>
            </div>
          </div>
        </div>
        <div className="container-page relative pb-10">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-6 text-sm text-muted sm:grid-cols-4">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pillars */}
      <section className="container-page py-20 sm:py-28" aria-labelledby="pillars">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:items-end">
          <div className="space-y-4">
            <p className="eyebrow">Why ELVORA</p>
            <h2 id="pillars" className="display text-4xl sm:text-5xl">
              Fewer people.
              <br />
              <span className="text-gold">Better connections.</span>
            </h2>
          </div>
          <p className="max-w-xl text-muted lg:justify-self-end">
            A network is only as valuable as the trust between its members. Everything on ELVORA — from who can join to who can reach you — is
            designed around that.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <div key={p.title} className="panel-interactive group relative space-y-4 p-7">
              <span className="display absolute top-6 right-7 text-sm text-muted/60">0{i + 1}</span>
              <span className="flex size-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/5 text-accent transition-colors group-hover:bg-accent/10">
                <p.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="display text-2xl">{p.title}</h3>
              <p className="text-sm leading-6 text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="relative border-y border-border bg-surface/30 py-20 sm:py-28" aria-labelledby="discover-heading">
        <div className="container-page">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="space-y-4">
              <p className="eyebrow">The marketplace</p>
              <h2 id="discover-heading" className="display text-4xl sm:text-5xl">
                Curated, verified, <span className="text-gold">exceptional.</span>
              </h2>
              <p className="max-w-lg text-muted">Every provider is reviewed before they can publish. Inquiries go straight to them — never a booking you didn&apos;t agree to.</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/luxury">
                Browse all <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
            {LISTING_CATEGORIES.map((c, i) => (
              <li key={c} className={cn(WIDE_TILES.has(i) && "md:col-span-2", i === LISTING_CATEGORIES.length - 1 && "col-span-2")}>
                <Link
                  href={`/luxury?category=${c}`}
                  className="group relative block overflow-hidden rounded-3xl border border-border shadow-soft transition-shadow hover:shadow-lift"
                >
                  <CategoryArt
                    category={c}
                    src={SITE_MEDIA.categories[c]}
                    className={cn("aspect-square transition-transform duration-700 group-hover:scale-[1.04]", WIDE_TILES.has(i) && "md:aspect-[2/1]")}
                  />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-5 pt-10 pb-4">
                    <span className="font-display text-xl text-white">{CATEGORY_LABELS[c]}</span>
                    <span className="flex size-8 items-center justify-center rounded-full border border-white/20 text-white/80 transition-all group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-20 sm:py-28" aria-labelledby="how">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">How membership works</p>
            <h2 id="how" className="display text-4xl sm:text-5xl">
              Considered, <span className="text-gold">not crowded.</span>
            </h2>
            <p className="text-muted">
              Paying for a plan never makes anyone a verified celebrity, executive or business. Identity, business verification, membership and staff
              roles are reviewed separately.
            </p>
            <Button asChild variant="link">
              <Link href="/about">Read our trust standards</Link>
            </Button>
          </div>
          <ol className="relative space-y-5 before:absolute before:top-8 before:bottom-8 before:left-[2.6rem] before:w-px before:bg-gradient-to-b before:from-accent/50 before:to-transparent">
            {STEPS.map((s) => (
              <li key={s.n} className="panel-interactive relative flex gap-6 p-6 sm:p-7">
                <span className="display relative flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-bg text-lg text-accent">
                  {s.n}
                </span>
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
        <div className="panel relative grid gap-8 overflow-hidden rounded-[2rem] p-8 sm:p-14 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div aria-hidden="true" className="glow-gold pointer-events-none absolute inset-0 opacity-80" />
          <div className="relative space-y-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gold text-accent-fg">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <h2 id="business" className="display text-4xl">
              For luxury businesses and brands
            </h2>
            <p className="text-muted">
              Hotels, residences, yacht and automotive specialists, event houses and experience curators: verify your business, publish listings, receive
              direct inquiries and run reviewed sponsored campaigns.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3 lg:justify-end">
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
      <section className="container-page py-24 text-center sm:py-32">
        <div className="rule-gold mx-auto mb-12 max-w-md" aria-hidden="true" />
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-accent/30 text-accent">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <h2 className="display mx-auto mt-6 max-w-3xl text-4xl sm:text-6xl">
          Your circle, <span className="text-gold">by invitation</span> and review.
        </h2>
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
