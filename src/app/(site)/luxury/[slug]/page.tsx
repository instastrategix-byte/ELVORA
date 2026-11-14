import { ArrowLeft, Check, Lock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { InquiryDialog } from "@/components/listings/inquiry-dialog";
import { SaveListingButton } from "@/components/listings/save-listing-button";
import { CategoryArt } from "@/components/marketing/category-art";
import { ReportButton } from "@/components/social/report-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, Skeleton } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { attempt } from "@/lib/attempt";
import { formatMoney, titleCase } from "@/lib/format";
import { createClient } from "@backend/db/server";
import { hasFeature } from "@backend/modules/auth/permissions";
import { CATEGORY_LABELS } from "@backend/modules/listings/schemas";
import { getListingBySlug } from "@backend/modules/listings/service";
import type { ListingDetail } from "@backend/modules/listings/types";
import { getSession } from "@backend/auth/viewer";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await attempt(async () => {
    const session = await getSession();
    return getListingBySlug(session?.db ?? (await createClient()), session?.viewer ?? null, slug);
  });
  const listing = result.ok ? result.data : null;
  return {
    title: listing?.title ?? "Listing",
    description: listing?.summary ?? undefined,
    robots: { index: listing?.visibility === "public" && listing.status === "published" },
  };
}

export default function ListingPage({ params }: { params: Params }) {
  return (
    <div className="container-page py-10">
      <Link href="/luxury" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Marketplace
      </Link>
      <Suspense
        fallback={
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="aspect-[16/10] rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
          </div>
        }
      >
        <ListingContent params={params} />
      </Suspense>
    </div>
  );
}

async function ListingContent({ params }: { params: Params }) {
  const { slug } = await params;
  let listing: ListingDetail | null;
  let viewerState: { signedIn: boolean; member: boolean; canInquire: boolean };
  try {
    const session = await getSession();
    const viewer = session?.viewer ?? null;
    listing = await getListingBySlug(session?.db ?? (await createClient()), viewer, slug);
    viewerState = {
      signedIn: Boolean(viewer),
      member: Boolean(viewer?.onboarded && viewer.accountStatus === "active"),
      canInquire: hasFeature(viewer, "luxury.inquire"),
    };
  } catch (error) {
    return (
      <div className="mt-6">
        <ServiceNotice error={error} what="this listing" />
      </div>
    );
  }
  // RLS hides unpublished and members-only listings from those not entitled to them.
  if (!listing) notFound();

  const place = [listing.city, listing.country].filter(Boolean).join(", ");
  const gallery = listing.media.filter((m) => m.url);

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-8">
        <div className="overflow-hidden rounded-3xl border border-border">
          {listing.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider-uploaded media
            <img src={listing.coverUrl} alt={`${listing.title}`} className="aspect-[16/10] w-full object-cover" />
          ) : (
            <CategoryArt category={listing.category} className="aspect-[16/10]" label={`${CATEGORY_LABELS[listing.category]} — no photography provided`} />
          )}
        </div>
        {gallery.length ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {gallery.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- provider-uploaded media */}
                <img src={m.url!} alt={m.alt ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{CATEGORY_LABELS[listing.category]}</Badge>
            {listing.visibility === "members" ? (
              <Badge>
                <Lock className="size-3" aria-hidden="true" /> Members only
              </Badge>
            ) : null}
            {listing.status !== "published" ? <Badge tone="warning">{titleCase(listing.status)}</Badge> : null}
          </div>
          <h1 className="display text-4xl sm:text-5xl">{listing.title}</h1>
          {place ? (
            <p className="flex items-center gap-1.5 text-muted">
              <MapPin className="size-4" aria-hidden="true" /> {place}
            </p>
          ) : null}
          {listing.summary ? <p className="text-lg text-fg/90">{listing.summary}</p> : null}
          {listing.description ? <div className="prose-elvora whitespace-pre-line">{listing.description}</div> : null}
        </div>
        {listing.amenities.length ? (
          <div>
            <h2 className="display text-2xl">Highlights</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {listing.amenities.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-accent" aria-hidden="true" /> {titleCase(a)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5 p-6">
          <div>
            {listing.priceFromMinor != null && listing.currency ? (
              <p>
                <span className="text-sm text-muted">From </span>
                <span className="display text-4xl">{formatMoney(listing.priceFromMinor, listing.currency)}</span>
                {listing.priceUnit ? <span className="text-sm text-muted"> / {listing.priceUnit}</span> : null}
              </p>
            ) : (
              <p className="display text-3xl">Price on request</p>
            )}
            <p className="mt-1 text-xs text-muted">Indicative pricing provided by the business. Final terms are agreed directly.</p>
          </div>
          {listing.isOwner ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/business/listings/${listing.id}`}>Manage this listing</Link>
            </Button>
          ) : viewerState.canInquire ? (
            <InquiryDialog listingId={listing.id} listingTitle={listing.title} />
          ) : viewerState.member ? (
            <Alert tone="info" title="Inquiries are a Premium benefit">
              <Link href="/account/membership" className="text-accent underline-offset-4 hover:underline">
                Explore Premium membership
              </Link>
            </Alert>
          ) : (
            <Button asChild className="w-full" size="lg">
              <Link href={`/sign-in?next=/luxury/${listing.slug}`}>{viewerState.signedIn ? "Complete onboarding to inquire" : "Sign in to inquire"}</Link>
            </Button>
          )}
          {viewerState.member && !listing.isOwner ? (
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
              <span className="flex items-center gap-2">
                <SaveListingButton listingId={listing.id} initialSaved={listing.savedByViewer} /> Save
              </span>
              <ReportButton targetType="listing" targetId={listing.id} />
            </div>
          ) : null}
        </Card>
        <Card className="p-6">
          <p className="eyebrow">Provided by</p>
          <p className="display mt-2 text-2xl">{listing.business.name}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            {listing.business.location ?? titleCase(listing.business.category)}
            <VerifiedBadges kinds={[]} business={listing.business.verified} />
          </p>
        </Card>
      </aside>
    </div>
  );
}
