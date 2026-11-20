"use client";

import { Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PromotableItems } from "@backend/modules/advertising/services/library";
import {
  AD_PLACEMENTS,
  CREATIVE_FORMATS,
  CTA_LABELS,
  CTAS,
  FORMAT_LABELS,
  PLACEMENT_LABELS,
  type AdPlacement,
  type CreativeFormat,
} from "@backend/modules/advertising/constants";
import { AdPreview } from "./ad-preview";
import { uploadAdMedia } from "./media-upload";
import type { CreativeDraft, StepIssues } from "./wizard-model";

const MEDIA_RULE: Partial<Record<CreativeFormat, { kind: "image" | "video"; max: number; hint: string }>> = {
  single_image: { kind: "image", max: 1, hint: "One image, JPEG/PNG/WebP up to 10 MB, 400–8000px per side." },
  video: { kind: "video", max: 1, hint: "One MP4 or WebM video up to 100 MB and 120 seconds." },
  carousel: { kind: "image", max: 10, hint: "2–10 images, JPEG/PNG/WebP up to 10 MB each." },
  lead_form: { kind: "image", max: 1, hint: "Optional image. Lead forms collect contact details on your linked page." },
  business_card: { kind: "image", max: 1, hint: "Optional image." },
  event: { kind: "image", max: 1, hint: "Optional image." },
};

const err = (issues: StepIssues | undefined, k: string) => issues?.[k];

/**
 * Edits one creative. Uploads go to the private ad-media bucket as soon as a file is chosen;
 * the creative itself is saved by the caller.
 */
export function CreativeEditor({
  accountId,
  value,
  onChange,
  promotable,
  issues,
  placements = ["feed"],
  advertiser,
}: {
  accountId: string;
  value: CreativeDraft;
  onChange: (next: CreativeDraft) => void;
  promotable: PromotableItems;
  issues?: StepIssues;
  placements?: AdPlacement[];
  advertiser: string;
}) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewPlacement, setPreviewPlacement] = useState<AdPlacement>(placements[0] ?? "feed");
  const set = (patch: Partial<CreativeDraft>) => onChange({ ...value, ...patch });
  const rule = MEDIA_RULE[value.format];
  const canAdd = rule && value.media.length < rule.max;

  async function onFiles(files: FileList | null) {
    if (!files?.length || !rule) return;
    setUploadError(null);
    setUploading(true);
    const added: CreativeDraft["media"] = [];
    try {
      for (const file of Array.from(files).slice(0, rule.max - value.media.length)) {
        if (!file.type.startsWith(rule.kind)) throw new Error(rule.kind === "image" ? "This format needs images." : "This format needs a video.");
        added.push(await uploadAdMedia(file, accountId));
      }
    } catch (e) {
      setUploadError(e instanceof Error && !("code" in e) ? e.message : errorMessage(e));
    } finally {
      if (added.length) onChange({ ...value, media: [...value.media, ...added] });
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function changeFormat(format: CreativeFormat) {
    const nextRule = MEDIA_RULE[format];
    const media = nextRule ? value.media.filter((m) => m.kind === nextRule.kind).slice(0, nextRule.max) : [];
    onChange({
      ...value,
      format,
      media,
      postId: format === "sponsored_post" ? value.postId : null,
      eventId: format === "event" ? value.eventId : null,
      businessId: format === "business_card" ? value.businessId : null,
    });
  }

  const previewPlacements = placements.length ? placements : (["feed"] as AdPlacement[]);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-name`} label="Creative name" required hint="Only you see this." error={err(issues, "name")}>
            {(a) => <Input value={value.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} {...a} />}
          </Field>
          <Field id={`${uid}-format`} label="Format" required>
            {(a) => (
              <Select value={value.format} onChange={(e) => changeFormat(e.target.value as CreativeFormat)} {...a}>
                {CREATIVE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {value.format === "sponsored_post" ? (
          <Field id={`${uid}-post`} label="Post to promote" required error={err(issues, "postId")} hint={promotable.posts.length ? undefined : "You haven't published any posts yet."}>
            {(a) => (
              <Select value={value.postId ?? ""} onChange={(e) => set({ postId: e.target.value || null })} {...a}>
                <option value="">Choose a post</option>
                {promotable.posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {value.format === "event" ? (
          <Field id={`${uid}-event`} label="Event to promote" required error={err(issues, "eventId")} hint={promotable.events.length ? undefined : "Only events you host can be promoted."}>
            {(a) => (
              <Select value={value.eventId ?? ""} onChange={(e) => set({ eventId: e.target.value || null })} {...a}>
                <option value="">Choose an event</option>
                {promotable.events.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {value.format === "business_card" ? (
          <Field id={`${uid}-biz`} label="Business" required error={err(issues, "businessId")} hint={promotable.businesses.length ? undefined : "You need an approved business on ELVORA."}>
            {(a) => (
              <Select value={value.businessId ?? ""} onChange={(e) => set({ businessId: e.target.value || null })} {...a}>
                <option value="">Choose a business</option>
                {promotable.businesses.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {promotable.listings.length && value.format !== "sponsored_post" ? (
          <Field id={`${uid}-listing`} label="Link to a marketplace listing" hint="Optional. Clicks open the listing on ELVORA.">
            {(a) => (
              <Select value={value.listingId ?? ""} onChange={(e) => set({ listingId: e.target.value || null })} {...a}>
                <option value="">No listing</option>
                {promotable.listings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field id={`${uid}-primary`} label="Primary text" hint={`${value.primaryText.length}/500`} error={err(issues, "primaryText")}>
          {(a) => <Textarea rows={3} maxLength={500} value={value.primaryText} onChange={(e) => set({ primaryText: e.target.value })} {...a} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-headline`} label="Headline" required={value.format !== "sponsored_post"} hint={`${value.headline.length}/90`} error={err(issues, "headline")}>
            {(a) => <Input maxLength={90} value={value.headline} onChange={(e) => set({ headline: e.target.value })} {...a} />}
          </Field>
          <Field id={`${uid}-cta`} label="Call to action">
            {(a) => (
              <Select value={value.cta} onChange={(e) => set({ cta: e.target.value as CreativeDraft["cta"] })} {...a}>
                {CTAS.map((c) => (
                  <option key={c} value={c}>
                    {CTA_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field id={`${uid}-desc`} label="Description" hint={`${value.description.length}/200`} error={err(issues, "description")}>
          {(a) => <Input maxLength={200} value={value.description} onChange={(e) => set({ description: e.target.value })} {...a} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-url`} label="Destination link" hint="https:// only" error={err(issues, "destinationUrl")}>
            {(a) => <Input type="url" inputMode="url" placeholder="https://" value={value.destinationUrl} onChange={(e) => set({ destinationUrl: e.target.value.trim() })} {...a} />}
          </Field>
          <Field id={`${uid}-params`} label="URL parameters" hint="e.g. utm_source=elvora&utm_campaign=spring" error={err(issues, "urlParams")}>
            {(a) => <Input value={value.urlParams} onChange={(e) => set({ urlParams: e.target.value.trim() })} {...a} />}
          </Field>
        </div>

        {rule ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Media</legend>
            <p className="text-xs text-muted">{rule.hint}</p>
            {uploadError ? <Alert tone="error">{uploadError}</Alert> : null}
            {err(issues, "media") ? (
              <p className="text-xs text-danger" role="alert">
                {err(issues, "media")![0]}
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-3">
              {value.media.map((m, i) => (
                <li key={m.path} className="relative size-24 overflow-hidden rounded-xl border border-border bg-surface-2">
                  {m.kind === "image" && (m.previewUrl ?? null) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.previewUrl!} alt={`Media ${i + 1}`} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-muted">{m.kind === "video" ? "Video" : "Image"}</span>
                  )}
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                    aria-label={`Remove media ${i + 1}`}
                    onClick={() => set({ media: value.media.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {canAdd ? (
                <li>
                  <label
                    className={cn(
                      "flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-xs text-muted hover:border-accent hover:text-fg",
                      uploading && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploading ? <Spinner label="Uploading" /> : <Upload className="size-5" aria-hidden="true" />}
                    {uploading ? "Uploading…" : "Add"}
                    <input
                      ref={fileRef}
                      type="file"
                      className="sr-only"
                      accept={rule.kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm"}
                      multiple={rule.max > 1}
                      onChange={(e) => void onFiles(e.target.files)}
                    />
                  </label>
                </li>
              ) : null}
            </ul>
          </fieldset>
        ) : null}
      </div>

      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Preview</p>
          {previewPlacements.length > 1 ? (
            <label className="text-xs">
              <span className="sr-only">Preview placement</span>
              <select className="h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs" value={previewPlacement} onChange={(e) => setPreviewPlacement(e.target.value as AdPlacement)}>
                {AD_PLACEMENTS.filter((p) => previewPlacements.includes(p)).map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <AdPreview
          advertiser={advertiser}
          placement={previewPlacements.includes(previewPlacement) ? previewPlacement : previewPlacements[0]}
          creative={{
            format: value.format,
            primaryText: value.primaryText || null,
            headline: value.headline || null,
            description: value.description || null,
            cta: value.cta,
            destinationUrl: value.destinationUrl || null,
            media: value.media,
          }}
        />
        <p className="text-xs text-muted">Every ad is labelled “Sponsored”. Placement layouts are approximate.</p>
      </div>
    </div>
  );
}

