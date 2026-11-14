"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentUpload } from "@/components/forms/document-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { verificationRequestSchema } from "@backend/modules/membership/schemas";

export function VerificationForm({ available }: { available: { kind: "identity" | "public_figure" | "executive"; label: string }[] }) {
  const [kind, setKind] = useState(available[0]?.kind ?? "identity");
  const [statement, setStatement] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const action = useAction((body: unknown) => api("/api/v1/verifications", { method: "POST", body }));
  const router = useRouter();
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = verificationRequestSchema.safeParse({ kind, statement, evidencePaths: paths });
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    const ok = await action.run(parsed.data);
    if (ok !== undefined) {
      toast.show("Verification request submitted");
      router.refresh();
    }
  }

  if (!available.length) return <p className="text-sm text-muted">You have a pending or approved request for every verification type.</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Field id="v-kind" label="Verification type" required>
        {(a) => (
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} {...a}>
            {available.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="v-statement" label="What should we verify?" required error={action.fieldErrors.statement} hint="e.g. your role and organisation, or public profile links.">
        {(a) => <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={2000} {...a} />}
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Supporting documents</p>
        <DocumentUpload onChange={(p, busy) => (setPaths(p), setUploading(busy))} />
        {action.fieldErrors.evidencePaths ? (
          <p className="text-xs text-danger" role="alert">
            {action.fieldErrors.evidencePaths[0]}
          </p>
        ) : null}
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span className="text-muted">I understand these documents are stored privately and reviewed only by authorised ELVORA staff for verification.</span>
      </label>
      <Button type="submit" disabled={action.pending || uploading || !consent}>
        {action.pending ? "Submitting…" : uploading ? "Waiting for uploads…" : "Submit for review"}
      </Button>
    </form>
  );
}
