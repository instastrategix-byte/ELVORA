"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { REPORT_REASONS, type REPORT_TARGETS } from "@backend/modules/feed/schemas";

type Target = (typeof REPORT_TARGETS)[number];

export function ReportButton({ targetType, targetId, variant = "link" }: { targetType: Target; targetId: string; variant?: "link" | "menu" }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const action = useAction((body: unknown) => api("/api/v1/reports", { method: "POST", body }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ok = await action.run({
      targetType,
      targetId,
      reason: form.get("reason"),
      details: String(form.get("details") ?? "").trim() || undefined,
    });
    if (ok !== undefined) {
      setOpen(false);
      toast.show("Thank you. Our moderation team will review this report.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={
          variant === "menu"
            ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
            : "inline-flex items-center gap-1.5 text-sm text-muted hover:text-danger"
        }
      >
        <Flag className="size-4" aria-hidden="true" /> Report
      </DialogTrigger>
      <DialogContent title={`Report this ${targetType}`} description="Reports are confidential. Misuse of reporting may lead to restrictions.">
        <form onSubmit={onSubmit} className="space-y-4">
          {action.error ? <Alert tone="error">{action.error}</Alert> : null}
          <Field id="report-reason" label="Reason" required>
            {(aria) => (
              <Select name="reason" required defaultValue="" {...aria}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="report-details" label="Details" hint="Optional. Add context that helps our team review quickly.">
            {(aria) => <Textarea name="details" maxLength={2000} {...aria} />}
          </Field>
          <Button type="submit" variant="danger" disabled={action.pending} className="w-full">
            {action.pending ? "Submitting…" : "Submit report"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
