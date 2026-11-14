import { Lock, MapPin } from "lucide-react";
import Link from "next/link";
import { CategoryArt } from "@/components/marketing/category-art";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS } from "@backend/modules/listings/schemas";
import type { ListingCard as ListingCardData } from "@backend/modules/listings/types";
import { SaveListingButton } from "./save-listing-button";

export function ListingCard({ listing, canSave }: { listing: ListingCardData; canSave: boolean }) {
  const place = [listing.city, listing.country].filter(Boolean).join(", ");
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent/50">
      <div className="relative aspect-[4/3] overflow-hidden">
        {listing.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- provider-uploaded media from Storage
          <img src={listing.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <CategoryArt category={listing.category} className="size-full" />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-bg/80 px-2.5 py-1 text-xs backdrop-blur">{CATEGORY_LABELS[listing.category]}</span>
        {listing.visibility === "members" ? (
          <span className="absolute top-3 right-14 inline-flex items-center gap-1 rounded-full bg-bg/80 px-2.5 py-1 text-xs backdrop-blur">
            <Lock className="size-3" aria-hidden="true" /> Members
          </span>
        ) : null}
        {canSave ? (
          <div className="absolute top-2 right-2 z-10">
            <SaveListingButton listingId={listing.id} initialSaved={listing.savedByViewer} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="display text-2xl leading-tight">
          <Link href={`/luxury/${listing.slug}`} className="after:absolute after:inset-0">
            {listing.title}
          </Link>
        </h3>
        {place ? (
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden="true" /> {place}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
            {listing.business.name}
            <VerifiedBadges kinds={[]} business={listing.business.verified} compact />
          </p>
          {listing.priceFromMinor != null && listing.currency ? (
            <p className="shrink-0 text-sm">
              <span className="text-muted">from </span>
              {formatMoney(listing.priceFromMinor, listing.currency)}
              {listing.priceUnit ? <span className="text-muted"> / {listing.priceUnit}</span> : null}
            </p>
          ) : (
            <p className="shrink-0 text-sm text-muted">Price on request</p>
          )}
        </div>
      </div>
    </article>
  );
}
