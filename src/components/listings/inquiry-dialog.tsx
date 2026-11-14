"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { inquirySchema } from "@backend/modules/listings/schemas";

export function InquiryDialog({ listingId, listingTitle }: { listingId: string; listingTitle: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const action = useAction((body: unknown) => api(`/api/v1/listings/${listingId}/inquiries`, { method: "POST", body }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const partySize = form.get("partySize");
    const parsed = inquirySchema.safeParse({
      message: form.get("message"),
      preferredDates: form.get("preferredDates") || undefined,
      partySize: partySize ? Number(partySize) : undefined,
    });
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    const result = await action.run(parsed.data);
    if (result !== undefined) setSent(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSent(false);
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="w-full">
          <Send /> Send an inquiry
        </Button>
      </DialogTrigger>
      <DialogContent title="Send an inquiry" description={`To the provider of ${listingTitle}`}>
        {sent ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
            <p className="font-medium">Your inquiry has been sent.</p>
            <p className="text-sm text-muted">
              The provider will contact you directly. An inquiry is not a reservation — nothing is booked or confirmed until you agree terms with the
              provider.
            </p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {action.error ? <Alert tone="error">{action.error}</Alert> : null}
            <Field id="inq-message" label="Message" required error={action.fieldErrors.message} hint="Share what you're looking for. Avoid including payment details.">
              {(aria) => <Textarea name="message" required minLength={10} maxLength={2000} {...aria} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="inq-dates" label="Preferred dates" error={action.fieldErrors.preferredDates}>
                {(aria) => <Input name="preferredDates" maxLength={120} placeholder="e.g. 12–19 July" {...aria} />}
              </Field>
              <Field id="inq-party" label="Party size" error={action.fieldErrors.partySize}>
                {(aria) => <Input name="partySize" type="number" min={1} max={500} inputMode="numeric" {...aria} />}
              </Field>
            </div>
            <p className="text-xs text-muted">Submitting shares your name and profile with the provider. It does not reserve or confirm a booking.</p>
            <Button type="submit" className="w-full" disabled={action.pending}>
              {action.pending ? "Sending…" : "Send inquiry"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
