"use client";

import { CheckCircle2, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { invitationCodeSchema } from "@backend/modules/membership/schemas";

type Check = { valid: boolean; planName: string | null; preApproved: boolean };

/**
 * Validates an invitation code. Signed-in members can redeem it immediately; guests are
 * sent to sign-up with the code carried along.
 */
export function InvitationCheck({ signedIn, initialCode }: { signedIn: boolean; initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [result, setResult] = useState<Check | null>(null);
  const check = useAction((c: string) => api<Check>("/api/v1/invitations/check", { method: "POST", body: { code: c } }));
  const redeem = useAction((c: string) => api("/api/v1/invitations/redeem", { method: "POST", body: { code: c } }));
  const router = useRouter();
  const toast = useToast();

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const parsed = invitationCodeSchema.safeParse({ code });
    if (!parsed.success) return check.setErrors(zodFieldErrors(parsed.error.issues));
    const r = await check.run(parsed.data.code);
    if (r) setResult(r);
  }

  async function onRedeem() {
    const ok = await redeem.run(code.trim());
    if (ok !== undefined) {
      toast.show("Invitation accepted");
      router.push("/account/membership");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onCheck} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
        <Field id="invite-code" label="Invitation code" error={check.fieldErrors.code} className="flex-1">
          {(aria) => <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="e.g. ELVORA-XXXX-XXXX" {...aria} />}
        </Field>
        <Button type="submit" variant="outline" className="sm:mt-7" disabled={check.pending}>
          <Ticket /> {check.pending ? "Checking…" : "Check code"}
        </Button>
      </form>
      {check.error ? <Alert tone="error">{check.error}</Alert> : null}
      {result && !result.valid ? <Alert tone="warning" title="This code isn't valid">It may have expired or already been used.</Alert> : null}
      {result?.valid ? (
        <Alert
          tone="success"
          title={`Valid invitation for ${result.planName}`}
          action={
            signedIn ? (
              <Button size="sm" onClick={onRedeem} disabled={redeem.pending}>
                <CheckCircle2 /> {redeem.pending ? "Accepting…" : "Accept invitation"}
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={`/sign-up?invite=${encodeURIComponent(code.trim())}`}>Create your account</Link>
              </Button>
            )
          }
        >
          {result.preApproved ? "This invitation is pre-approved — no review needed." : "Your application will be reviewed by our team."}
        </Alert>
      ) : null}
      {redeem.error ? <Alert tone="error">{redeem.error}</Alert> : null}
    </div>
  );
}
