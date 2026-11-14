"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { CATEGORY_LABELS, LISTING_CATEGORIES, PRICE_UNITS, listingSchema } from "@backend/modules/listings/schemas";
import type { ListingDetail } from "@backend/modules/listings/types";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "CHF", "SGD"];

export function ListingForm({ listing }: { listing?: ListingDetail }) {
  const [coverPath, setCoverPath] = useState<string | null>(listing?.coverPath ?? null);
  const action = useAction((body: unknown) =>
    listing
      ? api<{ id?: string; status?: string }>(`/api/v1/listings/${listing.id}`, { method: "PATCH", body })
      : api<{ id?: string; status?: string }>("/api/v1/listings", { method: "POST", body }),
  );
  const router = useRouter();
  const toast = useToast();
  const lockedForReview = listing?.status === "pending_review";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const price = String(f.get("priceFrom") ?? "").trim();
    const input = {
      title: String(f.get("title") ?? ""),
      category: String(f.get("category") ?? ""),
      summary: String(f.get("summary") ?? ""),
      description: String(f.get("description") ?? ""),
      city: String(f.get("city") ?? ""),
      country: String(f.get("country") ?? ""),
      priceFrom: price ? Number(price) : null,
      currency: price ? String(f.get("currency") ?? "") : null,
      priceUnit: price ? String(f.get("priceUnit") ?? "") || null : null,
      amenities: String(f.get("amenities") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      visibility: String(f.get("visibility") ?? "public"),
      coverPath,
    };
    const parsed = listingSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const result = await action.run(parsed.data);
    if (result === undefined) return;
    if (!listing) {
      toast.show("Draft created");
      router.push(`/business/listings/${result.id}`);
    } else {
      const status = result.status;
      toast.show(status === "pending_review" && listing.status === "published" ? "Saved — changes sent for review" : "Listing saved");
      router.refresh();
    }
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {lockedForReview ? <Alert tone="info">This listing is under review. Withdrawing is not possible; editing resumes after the decision.</Alert> : null}
      {listing?.status === "published" ? (
        <Alert tone="warning">Changing details of a published listing sends it back to review and hides it until approved.</Alert>
      ) : null}
      <fieldset disabled={lockedForReview} className="space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <Field id="l-title" label="Title" required error={fe.title} className="sm:col-span-2">
            {(a) => <Input name="title" defaultValue={listing?.title} maxLength={140} {...a} />}
          </Field>
          <Field id="l-cat" label="Category" required error={fe.category}>
            {(a) => (
              <Select name="category" defaultValue={listing?.category ?? "villa"} {...a}>
                {LISTING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="l-vis" label="Who can see it" hint="Members-only listings are visible to Premium members.">
            {(a) => (
              <Select name="visibility" defaultValue={listing?.visibility ?? "public"} {...a}>
                <option value="public">Everyone</option>
                <option value="members">Premium members only</option>
              </Select>
            )}
          </Field>
          <Field id="l-summary" label="Summary" error={fe.summary} hint="One line shown on cards." className="sm:col-span-2">
            {(a) => <Input name="summary" defaultValue={listing?.summary ?? ""} maxLength={240} {...a} />}
          </Field>
          <Field id="l-desc" label="Description" error={fe.description} className="sm:col-span-2">
            {(a) => <Textarea name="description" defaultValue={listing?.description ?? ""} maxLength={6000} rows={8} {...a} />}
          </Field>
          <Field id="l-city" label="City" error={fe.city}>
            {(a) => <Input name="city" defaultValue={listing?.city ?? ""} maxLength={80} {...a} />}
          </Field>
          <Field id="l-country" label="Country" error={fe.country}>
            {(a) => <Input name="country" defaultValue={listing?.country ?? ""} maxLength={80} {...a} />}
          </Field>
          <Field id="l-amen" label="Highlights" hint="Comma-separated, e.g. private chef, heli-pad, sea view" className="sm:col-span-2">
            {(a) => <Input name="amenities" defaultValue={listing?.amenities.join(", ") ?? ""} {...a} />}
          </Field>
        </Card>
        <Card className="grid gap-5 p-6 sm:grid-cols-3">
          <h2 className="display text-2xl sm:col-span-3">Indicative price</h2>
          <Field id="l-price" label="From" error={fe.priceFrom} hint="Leave empty for “Price on request”.">
            {(a) => (
              <Input
                name="priceFrom"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={listing?.priceFromMinor != null ? listing.priceFromMinor / 100 : ""}
                {...a}
              />
            )}
          </Field>
          <Field id="l-cur" label="Currency" error={fe.currency}>
            {(a) => (
              <Select name="currency" defaultValue={listing?.currency ?? "USD"} {...a}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="l-unit" label="Per">
            {(a) => (
              <Select name="priceUnit" defaultValue={listing?.priceUnit ?? "night"} {...a}>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {titleCase(u)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Card>
        <Card className="p-6">
          <ImageUpload purpose="listing_image" label="Cover image" currentUrl={listing?.coverUrl ?? null} onChange={setCoverPath} />
        </Card>
      </fieldset>
      <Button type="submit" disabled={lockedForReview || action.pending}>
        {action.pending ? "Saving…" : listing ? "Save changes" : "Create draft"}
      </Button>
    </form>
  );
}

export function ListingStatusActions({ listing }: { listing: ListingDetail }) {
  const action = useAction((a: string) => api(`/api/v1/listings/${listing.id}/status`, { method: "POST", body: { action: a } }));
  const del = useAction(() => api(`/api/v1/listings/${listing.id}`, { method: "DELETE" }));
  const router = useRouter();
  const toast = useToast();

  async function run(a: "submit" | "archive" | "publish" | "draft", message: string) {
    if ((await action.run(a)) !== undefined) {
      toast.show(message);
      router.refresh();
    }
  }

  const s = listing.status;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {s === "draft" || s === "rejected" ? <Button onClick={() => run("submit", "Submitted for review")} disabled={action.pending}>Submit for review</Button> : null}
        {s === "published" ? <Button variant="outline" onClick={() => run("archive", "Listing unpublished")} disabled={action.pending}>Unpublish</Button> : null}
        {s === "archived" && listing.approvedAt ? <Button onClick={() => run("publish", "Listing republished")} disabled={action.pending}>Republish</Button> : null}
        {s === "archived" && !listing.approvedAt ? <Button variant="outline" onClick={() => run("draft", "Moved to drafts")} disabled={action.pending}>Move to drafts</Button> : null}
        {s === "draft" || s === "rejected" || s === "archived" ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={del.pending}
            onClick={async () => {
              if (!window.confirm("Delete this listing permanently?")) return;
              if ((await del.run()) !== undefined) {
                toast.show("Listing deleted");
                router.push("/business");
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        ) : null}
      </div>
      {action.error ?? del.error ? <Alert tone="error">{action.error ?? del.error}</Alert> : null}
    </div>
  );
}

export function ListingGallery({ listing }: { listing: ListingDetail }) {
  const router = useRouter();
  const toast = useToast();
  const add = useAction((path: string) => api(`/api/v1/listings/${listing.id}/media`, { method: "POST", body: { path } }));
  const [key, setKey] = useState(0);

  async function remove(id: string) {
    try {
      await api(`/api/v1/listing-media/${id}`, { method: "DELETE" });
      toast.show("Image removed");
      router.refresh();
    } catch {
      toast.show("Couldn't remove image", "error");
    }
  }

  return (
    <div className="space-y-4">
      {listing.media.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {listing.media.map((m) => (
            <li key={m.id} className="relative overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- provider media */}
              {m.url ? <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-surface-2" />}
              <button type="button" onClick={() => remove(m.id)} className="absolute top-1.5 right-1.5 rounded-full bg-bg/80 p-1.5 hover:text-danger" aria-label="Remove image">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No gallery images yet.</p>
      )}
      {listing.media.length < 20 ? (
        <ImageUpload
          key={key}
          purpose="listing_image"
          label="Add gallery image"
          currentUrl={null}
          onChange={async (path) => {
            if (!path) return;
            if ((await add.run(path)) !== undefined) {
              toast.show("Image added");
              setKey((k) => k + 1);
              router.refresh();
            }
          }}
        />
      ) : null}
      {add.error ? <Alert tone="error">{add.error}</Alert> : null}
    </div>
  );
}
