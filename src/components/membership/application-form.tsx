"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { applicationSchema } from "@backend/modules/membership/schemas";

export function ApplicationForm({ plans, defaultPlan }: { plans: { id: string; name: string; note?: string }[]; defaultPlan?: string }) {
  const [planId, setPlanId] = useState(defaultPlan && plans.some((p) => p.id === defaultPlan) ? defaultPlan : (plans[0]?.id ?? ""));
  const [statement, setStatement] = useState("");
  const action = useAction((body: unknown) => api("/api/v1/applications", { method: "POST", body }));
  const router = useRouter();
  const toast = useToast();
  const selected = plans.find((p) => p.id === planId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = applicationSchema.safeParse({ planId, statement });
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    const ok = await action.run(parsed.data);
    if (ok !== undefined) {
      toast.show("Application submitted");
      router.push("/account/membership?applied=1");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Field id="app-plan" label="Membership" required error={action.fieldErrors.planId} hint={selected?.note}>
        {(aria) => (
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)} {...aria}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        id="app-statement"
        label="Why ELVORA?"
        required
        error={action.fieldErrors.statement}
        hint={`${statement.trim().length}/2000 · Tell us about your work and what you hope to find. Do not include ID numbers or financial details here.`}
      >
        {(aria) => <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={2000} rows={6} {...aria} />}
      </Field>
      <Button type="submit" size="lg" disabled={action.pending}>
        {action.pending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
