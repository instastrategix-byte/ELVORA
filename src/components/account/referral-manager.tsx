"use client";

import { Check, Copy, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatRelative } from "@/lib/format";
import type { ReferralOverview, ReferralStatus } from "@backend/modules/referrals/service";

const STATUS: Record<ReferralStatus, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  pending: { label: "Waiting", tone: "accent" },
  joined: { label: "Applied", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Revoked", tone: "neutral" },
};

/** Create, share and revoke personal invitations. The code is shown once, right after creation. */
export function ReferralManager({ overview, siteOrigin }: { overview: ReferralOverview; siteOrigin: string }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [created, setCreated] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const link = created ? `${siteOrigin}/apply?invite=${encodeURIComponent(created.code)}` : "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setFieldError(undefined);
    try {
      const res = await api<{ code: string; expiresAt: string }>("/api/v1/referrals", { method: "POST", body: { email, note: note || undefined } });
      setCreated(res);
      setCopied(false);
      setEmail("");
      setNote("");
      router.refresh();
    } catch (err) {
      const msg = errorMessage(err);
      if (/email/i.test(msg)) setFieldError(msg);
      else setError(msg);
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.show("Invitation link copied");
    } catch {
      toast.show("Couldn't copy — select the link and copy it manually", "error");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Join me on ELVORA", text: "I'd like to invite you to ELVORA, a private network.", url: link });
    } catch {
      // Cancelled; nothing to do.
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this invitation? The link will stop working.")) return;
    setRevoking(id);
    try {
      await api(`/api/v1/referrals/${id}`, { method: "DELETE" });
      toast.show("Invitation revoked");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setRevoking(null);
    }
  }

  const { stats, invitations } = overview;

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Invitations sent", stats.sent],
          ["Applied", stats.joined],
          ["Open slots left", stats.openRemaining],
        ].map(([label, value]) => (
          <div key={label as string} className="panel flex flex-col-reverse p-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="display text-3xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {created ? (
        <div className="panel space-y-4 border-accent/50 p-5" role="status" aria-live="polite">
          <div>
            <p className="font-medium">Your invitation is ready</p>
            <p className="text-sm text-muted">
              Copy it now — for security we only show it once. It works once and expires on {formatDate(created.expiresAt)}.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" />
            <div className="flex gap-2">
              <Button onClick={copy} variant="secondary">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <Button onClick={share} variant="secondary">
                  <Send /> Share
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted">
            Code: <span className="font-mono">{created.code}</span>
          </p>
        </div>
      ) : null}

      {overview.eligible ? (
        <form onSubmit={create} className="panel space-y-4 p-5" aria-label="Create an invitation">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ref-email" label="Their email (optional)" hint="If set, only this address can use the invitation." error={fieldError}>
              {(aria) => <Input {...aria} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" />}
            </Field>
            <Field id="ref-note" label="Private note (optional)" hint="Only you can see this — e.g. how you know them.">
              {(aria) => <Input {...aria} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
            </Field>
          </div>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Up to 5 open invitations at a time; each expires after 14 days.</p>
            <Button type="submit" disabled={creating || stats.openRemaining === 0}>
              {creating ? "Creating…" : "Create invitation"}
            </Button>
          </div>
        </form>
      ) : (
        <Alert tone="info" title="Invitations aren't available on your account yet">
          Members can vouch for others once they are verified or hold an active membership.
        </Alert>
      )}

      <section aria-labelledby="ref-list-h">
        <h2 id="ref-list-h" className="mb-3 text-sm font-semibold tracking-wide">
          Your invitations
        </h2>
        {invitations.length === 0 ? (
          <EmptyState title="No invitations yet" description="People you invite appear here, with whether they've applied." />
        ) : (
          <ul className="panel divide-y divide-border">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  {i.status === "joined" && i.joined ? (
                    <MemberLink member={i.joined} size={32} subtitle={i.redeemedAt ? `Applied ${formatRelative(i.redeemedAt)}` : undefined} />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{i.email ?? "Open invitation"}</p>
                      <p className="text-xs text-muted">
                        Created {formatRelative(i.createdAt)}
                        {i.status === "pending" && i.expiresAt ? ` · expires ${formatDate(i.expiresAt)}` : ""}
                        {i.status === "joined" && i.redeemedAt ? ` · applied ${formatRelative(i.redeemedAt)}` : ""}
                      </p>
                    </>
                  )}
                  {i.note ? <p className="mt-1 truncate text-xs text-muted">“{i.note}”</p> : null}
                </div>
                <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                {i.status === "pending" ? (
                  <Button variant="ghost" size="sm" onClick={() => revoke(i.id)} disabled={revoking === i.id} aria-label={`Revoke invitation${i.email ? ` for ${i.email}` : ""}`}>
                    <X /> Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
