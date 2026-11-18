import { Building2, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SponsoredSlot } from "@/components/ads/sponsored-slot";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberGrid } from "@/components/social/member-grid";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, Skeleton } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { attempt } from "@/lib/attempt";
import { titleCase } from "@/lib/format";
import { createClient } from "@backend/db/server";
import { hasFeature } from "@backend/modules/auth/permissions";
import { searchBusinesses } from "@backend/modules/listings/service";
import { memberSearchSchema } from "@backend/modules/profiles/schemas";
import { searchMembers } from "@backend/modules/profiles/service";
import { MEMBER_TYPE_LABELS, MEMBER_TYPES, OPEN_TO, OPEN_TO_LABELS } from "@backend/modules/profiles/types";
import { getSession } from "@backend/auth/viewer";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover verified members and luxury businesses on ELVORA.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-12 sm:py-16">
      <header className="space-y-3">
        <p className="eyebrow">Discover</p>
        <h1 className="display text-5xl sm:text-6xl">People and businesses worth knowing.</h1>
        <p className="max-w-2xl text-muted">
          Guests see only members who chose public profiles. Members see more, according to each person&apos;s privacy settings.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="mt-10 h-96 rounded-2xl" />}>
        <DiscoverResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function DiscoverResults({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const tab = raw.tab === "businesses" ? "businesses" : "members";
  const parsed = memberSearchSchema.safeParse({
    q: str(raw.q),
    location: str(raw.location),
    industry: str(raw.industry),
    verified: str(raw.verified),
    memberType: str(raw.memberType),
    interest: str(raw.interest),
    openTo: str(raw.openTo),
  });
  const search = parsed.success ? parsed.data : {};

  const sessionResult = await attempt(() => getSession());
  const session = sessionResult.ok ? sessionResult.data : null;
  const viewer = session?.viewer ?? null;
  const advanced = hasFeature(viewer, "discover.advanced");
  const isMember = Boolean(viewer?.onboarded);

  const effective = {
    q: search.q,
    ...(advanced
      ? {
          location: search.location,
          industry: search.industry,
          verified: search.verified,
          memberType: search.memberType,
          interest: search.interest,
          openTo: search.openTo,
        }
      : {}),
  };
  const query = Object.fromEntries(Object.entries(effective).filter(([, v]) => v)) as Record<string, string>;
  const result = await attempt(async () => {
    const db = session?.db ?? (await createClient());
    return tab === "members"
      ? { kind: "members" as const, page: await searchMembers(db, viewer, effective) }
      : { kind: "businesses" as const, businesses: await searchBusinesses(db, search.q) };
  });

  let body: React.ReactNode;
  if (!result.ok) {
    body = <ServiceNotice error={result.error} what="discovery results" />;
  } else if (result.data.kind === "members") {
    body = result.data.page.items.length ? (
      <MemberGrid key={JSON.stringify(query)} initial={result.data.page} query={query} />
    ) : (
      <EmptyState icon={<Users />} title="No members found" description="Try a different name, company or headline." />
    );
  } else {
    const businesses = result.data.businesses;
    body = businesses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <li key={b.id} className="rounded-2xl border border-border bg-surface p-5">
              <p className="flex items-center gap-2 font-medium">
                {b.name} <VerifiedBadges kinds={[]} business={b.verified} compact />
              </p>
              <p className="mt-1 text-sm text-muted">{[titleCase(b.category), b.location].filter(Boolean).join(" · ")}</p>
              <Link href={`/luxury?q=${encodeURIComponent(b.name)}`} className="mt-3 inline-block text-sm text-accent hover:underline">
                View listings
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Building2 />} title="No businesses found" description="Verified businesses appear here once approved." />
      );
  }

  return (
    <div className="mt-10 space-y-6">
      <div role="tablist" aria-label="Discover" className="flex gap-2">
        {(["members", "businesses"] as const).map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={tab === t}
            href={t === "members" ? "/discover" : "/discover?tab=businesses"}
            className="rounded-full border border-border px-4 py-2 text-sm aria-selected:border-accent aria-selected:bg-accent aria-selected:text-accent-fg"
          >
            {titleCase(t)}
          </Link>
        ))}
      </div>

      <form method="get" role="search" aria-label={`Search ${tab}`} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        {tab === "businesses" ? <input type="hidden" name="tab" value="businesses" /> : null}
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input name="q" defaultValue={search.q} placeholder={tab === "members" ? "Name, company or headline" : "Business name or location"} className="pl-10" />
        </label>
        <Button type="submit">Search</Button>
        {tab === "members" && advanced ? (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            <label>
              <span className="sr-only">Location</span>
              <Input name="location" defaultValue={search.location} placeholder="Location" />
            </label>
            <label>
              <span className="sr-only">Industry</span>
              <Input name="industry" defaultValue={search.industry} placeholder="Industry" />
            </label>
            <label>
              <span className="sr-only">Verification</span>
              <Select name="verified" defaultValue={search.verified ?? "any"}>
                <option value="any">Anyone</option>
                <option value="verified">Verified only</option>
              </Select>
            </label>
            <label>
              <span className="sr-only">Profession</span>
              <Select name="memberType" defaultValue={search.memberType ?? ""}>
                <option value="">Any profession</option>
                {MEMBER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEMBER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="sr-only">Interest</span>
              <Input name="interest" defaultValue={search.interest} placeholder="Interest, e.g. Sailing" />
            </label>
            <label>
              <span className="sr-only">Open to</span>
              <Select name="openTo" defaultValue={search.openTo ?? ""}>
                <option value="">Open to anything</option>
                {OPEN_TO.map((o) => (
                  <option key={o} value={o}>
                    Open to {OPEN_TO_LABELS[o].toLowerCase()}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        ) : null}
      </form>

      {tab === "members" && !advanced ? (
        <Alert tone="info">
          {isMember ? (
            <>
              Profession, location, industry, interest and verification filters are included with Premium.{" "}
              <Link href="/account/membership" className="text-accent hover:underline">
                Learn more
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in?next=/discover" className="text-accent hover:underline">
                Sign in
              </Link>{" "}
              to discover members who share their profile with the ELVORA community.
            </>
          )}
        </Alert>
      ) : null}

      {isMember ? <SponsoredSlot placement="discover" /> : null}
      {body}
    </div>
  );
}
