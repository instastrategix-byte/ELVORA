"use client";

import { Gift } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, api, errorMessage } from "@/lib/api-client";
import type { FieldErrors } from "@/lib/errors";

/** Admin form: give a member a paid plan's features for a fixed period (audited; not a payment). */
export function PlanGrantForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setErrors({});
    try {
      await api("/api/v1/admin/grants", { method: "POST", body: data });
      toast.show(`Complimentary access granted to @${String(data.handle).replace(/^@/, "")}`);
      form.reset();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.show(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field id="grant-handle" label="Member handle" required error={errors.handle} hint="As shown on their profile, e.g. @isabella">
        {(a) => <Input {...a} name="handle" placeholder="@handle" autoComplete="off" required />}
      </Field>
      <Field id="grant-plan" label="Plan" required error={errors.planId}>
        {(a) => (
          <Select {...a} name="planId" required defaultValue="">
            <option value="" disabled>
              Choose a plan…
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="grant-days" label="Duration (days)" required error={errors.days} hint="1 to 366 days. Access ends automatically.">
        {(a) => <Input {...a} name="days" type="number" min={1} max={366} defaultValue={30} required />}
      </Field>
      <Field id="grant-reason" label="Reason" required error={errors.reason} hint="Recorded in the audit log.">
        {(a) => <Textarea {...a} name="reason" maxLength={500} className="min-h-11" placeholder="e.g. Launch partner, press review, internal testing" required />}
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          <Gift /> {busy ? "Granting…" : "Grant complimentary access"}
        </Button>
      </div>
    </form>
  );
}

export function RevokeGrantButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  async function revoke() {
    if (!window.confirm("Revoke this complimentary access now? The member loses the plan's features immediately.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/grants/${id}/revoke`, { method: "POST", body: {} });
      toast.show("Grant revoked");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={revoke} disabled={busy}>
      {busy ? "Revoking…" : "Revoke"}
    </Button>
  );
}
