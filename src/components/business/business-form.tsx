"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentUpload } from "@/components/forms/document-upload";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { BUSINESS_CATEGORIES, businessSchema } from "@backend/modules/listings/schemas";
import type { BusinessDetail } from "@backend/modules/listings/types";

export function BusinessForm({ business }: { business: BusinessDetail | null }) {
  const [logoPath, setLogoPath] = useState<string | null>(business?.logoPath ?? null);
  const [evidence, setEvidence] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const action = useAction((body: unknown) => api("/api/v1/business", { method: "PUT", body }));
  const router = useRouter();
  const toast = useToast();
  const locked = business?.status === "pending_review" || business?.status === "suspended";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      name: String(f.get("name") ?? ""),
      category: String(f.get("category") ?? business?.category ?? "other"),
      description: String(f.get("description") ?? ""),
      website: String(f.get("website") ?? ""),
      location: String(f.get("location") ?? ""),
      contactEmail: String(f.get("contactEmail") ?? ""),
      registrationNumber: String(f.get("registrationNumber") ?? ""),
      logoPath,
      ...(evidence ? { evidencePaths: evidence } : {}),
    };
    const parsed = businessSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    if ((await action.run(input)) !== undefined) {
      toast.show("Business profile saved");
      router.refresh();
    }
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {locked ? <Alert tone="info">Editing is paused while your business is {business?.status === "suspended" ? "suspended" : "under review"}.</Alert> : null}
      <fieldset disabled={locked} className="grid gap-5 sm:grid-cols-2">
        <Field id="b-name" label="Registered business name" required error={fe.name}>
          {(a) => <Input name="name" defaultValue={business?.name} maxLength={120} {...a} />}
        </Field>
        <Field id="b-cat" label="Category" required hint={business ? "Category is fixed once created." : undefined}>
          {(a) => (
            <Select name="category" defaultValue={business?.category ?? "hospitality"} disabled={Boolean(business)} {...a}>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="b-desc" label="Description" error={fe.description} className="sm:col-span-2">
          {(a) => <Textarea name="description" defaultValue={business?.description ?? ""} maxLength={3000} {...a} />}
        </Field>
        <Field id="b-loc" label="Location" error={fe.location}>
          {(a) => <Input name="location" defaultValue={business?.location ?? ""} maxLength={120} {...a} />}
        </Field>
        <Field id="b-web" label="Website" error={fe.website} hint="https:// only">
          {(a) => <Input name="website" type="url" defaultValue={business?.website ?? ""} {...a} />}
        </Field>
        <Field id="b-email" label="Inquiry contact email" error={fe.contactEmail} hint="Notified when members send inquiries.">
          {(a) => <Input name="contactEmail" type="email" defaultValue={business?.contactEmail ?? ""} {...a} />}
        </Field>
        <Field id="b-reg" label="Company registration number" error={fe.registrationNumber} hint="Used only for verification.">
          {(a) => <Input name="registrationNumber" defaultValue={business?.registrationNumber ?? ""} maxLength={80} {...a} />}
        </Field>
        <div className="sm:col-span-2">
          <ImageUpload purpose="business_logo" label="Logo" currentUrl={business?.logoUrl ?? null} onChange={setLogoPath} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Verification documents</p>
          <p className="text-sm text-muted">
            A certificate of incorporation or trade licence, and proof that you are authorised to represent the business. Stored privately for
            reviewers only. {business?.evidencePaths.length ? `${business.evidencePaths.length} document(s) on file — new uploads replace them.` : ""}
          </p>
          <DocumentUpload onChange={(p, busy) => (setEvidence(p.length ? p : null), setUploading(busy))} />
        </div>
      </fieldset>
      <Button type="submit" disabled={locked || action.pending || uploading}>
        {action.pending ? "Saving…" : business ? "Save changes" : "Create business profile"}
      </Button>
    </form>
  );
}

export function SubmitBusinessButton({ businessId, disabled }: { businessId: string; disabled?: boolean }) {
  const action = useAction(() => api(`/api/v1/business/${businessId}/submit`, { method: "POST" }));
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-2">
      <Button
        disabled={disabled || action.pending}
        onClick={async () => {
          if ((await action.run()) !== undefined) {
            toast.show("Submitted for verification");
            router.refresh();
          }
        }}
      >
        {action.pending ? "Submitting…" : "Submit for verification"}
      </Button>
      {action.error ? <p className="text-sm text-danger">{action.error}</p> : null}
    </div>
  );
}
