"use client";

import { Copy, Plus, Radar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { TrackingIntegration } from "@backend/modules/advertising/tracking/service";
import { parseTerms } from "./model";
import { LocalTime } from "@/components/ui/local-time";

type Diagnostic = { id: number | string; level: string; code: string; message: string | null; created_at: string };
type Form = { id: string | null; name: string; kind: "pixel" | "server"; domains: string; window: 1 | 7 | 28 };

function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${what} copied`);
    } catch {
      toast.show("Couldn't copy — select the text and copy it manually", "error");
    }
  };
}

function pixelSnippet(origin: string, key: string) {
  return `<script>
  window.elvora = window.elvora || function () { (elvora.q = elvora.q || []).push(arguments); };
  elvora('init', '${key}');
</script>
<script async src="${origin}/api/ads/pixel.js"></script>
<!-- After the visitor accepts measurement: elvora('consent', true); -->
<!-- On conversion pages: elvora('track', 'purchase', { value: 249, currency: 'EUR', event_id: 'order-123' }); -->`;
}

function Diagnostics({ id }: { id: string }) {
  const [rows, setRows] = useState<Diagnostic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      setRows(await api<Diagnostic[]>(`/api/v1/ads-manager/tracking/${id}/diagnostics`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <details className="text-sm" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && rows === null && !loading && void load()}>
      <summary className="cursor-pointer text-muted hover:text-fg">Diagnostics</summary>
      <div className="mt-2 space-y-2">
        {loading ? <Spinner label="Loading diagnostics" /> : null}
        {error ? <p className="text-danger">{error}</p> : null}
        {rows && rows.length === 0 ? <p className="text-muted">No problems recorded.</p> : null}
        {rows && rows.length ? (
          <ul className="max-h-64 space-y-1 overflow-auto">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap gap-2 border-t border-border pt-1">
                <Badge tone={d.level === "error" ? "danger" : d.level === "warning" ? "warning" : "neutral"}>{d.code}</Badge>
                <span className="text-muted"><LocalTime iso={d.created_at} /></span>
                {d.message ? <span>{d.message}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

export function TrackingPanel({ accountId, integrations, canManage, origin }: { accountId: string; integrations: TrackingIntegration[]; canManage: boolean; origin: string }) {
  const router = useRouter();
  const toast = useToast();
  const copy = useCopy();
  const [form, setForm] = useState<Form | null>(null);
  const [secret, setSecret] = useState<{ name: string; key: string; secret: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setErrors({});
    const body = { name: form.name, domains: parseTerms(form.domains).map((d) => d.toLowerCase()), attributionWindowDays: form.window };
    try {
      if (form.id) {
        await api(`/api/v1/ads-manager/tracking/${form.id}`, { method: "PATCH", body });
        toast.show("Integration updated");
      } else {
        const created = await api<{ id: string; publicKey: string; secret: string | null }>("/api/v1/ads-manager/tracking", { method: "POST", body: { accountId, kind: form.kind, ...body } });
        if (created.secret) setSecret({ name: form.name, key: created.publicKey, secret: created.secret });
        toast.show("Integration created");
      }
      setForm(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.fieldErrors) setErrors(e.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  async function rotate(i: TrackingIntegration) {
    if (!window.confirm("Issue a new secret? The current secret stops working immediately, so update your server first or straight after.")) return;
    try {
      const r = await api<{ secret: string }>(`/api/v1/ads-manager/tracking/${i.id}/rotate`, { method: "POST" });
      setSecret({ name: i.name, key: i.publicKey, secret: r.secret });
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  async function remove(i: TrackingIntegration) {
    if (!window.confirm(`Delete “${i.name}”? Events sent to it will be rejected.`)) return;
    try {
      await api(`/api/v1/ads-manager/tracking/${i.id}`, { method: "DELETE" });
      toast.show("Integration deleted");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => (setError(null), setErrors({}), setForm({ id: null, name: "", kind: "pixel", domains: "", window: 7 }))}>
            <Plus /> Add integration
          </Button>
        </div>
      ) : null}

      {integrations.length === 0 ? (
        <EmptyState icon={<Radar />} title="No tracking yet" description="Add the ELVORA pixel to your website, or send conversions from your server, to measure results after an ad click." />
      ) : (
        <ul className="space-y-4">
          {integrations.map((i) => (
            <li key={i.id}>
              <Card className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {i.name} <Badge>{i.kind === "pixel" ? "Pixel" : "Server API"}</Badge>
                      {i.lastEventAt ? <Badge tone="success">Receiving events</Badge> : <Badge tone="warning">No events yet</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      ID <code className="rounded bg-surface-2 px-1">{i.publicKey}</code> · {i.attributionWindowDays}-day click attribution
                      {i.lastEventAt ? ` · last event ${formatRelative(i.lastEventAt)}` : ""}
                    </p>
                    {i.allowedDomains.length ? <p className="text-xs text-muted">Allowed domains: {i.allowedDomains.join(", ")}</p> : null}
                    {i.secretFingerprint ? <p className="text-xs text-muted">Secret ending …{i.secretFingerprint}</p> : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => (setError(null), setErrors({}), setForm({ id: i.id, name: i.name, kind: i.kind, domains: i.allowedDomains.join(", "), window: i.attributionWindowDays as Form["window"] }))}
                      >
                        Edit
                      </Button>
                      {i.kind === "server" ? (
                        <Button size="sm" variant="secondary" onClick={() => rotate(i)}>
                          New secret
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
                {i.kind === "pixel" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Install snippet</p>
                      <Button size="sm" variant="ghost" onClick={() => copy(pixelSnippet(origin, i.publicKey), "Snippet")}>
                        <Copy /> Copy
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs leading-relaxed">
                      <code>{pixelSnippet(origin, i.publicKey)}</code>
                    </pre>
                    <p className="text-xs text-muted">The pixel sets no cookies and sends nothing until your site calls elvora(&apos;consent&apos;, true).</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Send signed events to <code className="rounded bg-surface-2 px-1">{origin}/api/ads/conversions</code>. See the setup guide for the signature format.
                  </p>
                )}
                <Diagnostics id={i.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && !saving && setForm(null)}>
        {form ? (
          <DialogContent title={form.id ? "Edit integration" : "Add integration"}>
            <div className="space-y-4">
              {error ? <Alert tone="error">{error}</Alert> : null}
              <Field id="ti-name" label="Name" required error={errors.name}>
                {(a) => <Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} {...a} />}
              </Field>
              {!form.id ? (
                <Field id="ti-kind" label="Type">
                  {(a) => (
                    <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form["kind"] })} {...a}>
                      <option value="pixel">Website pixel</option>
                      <option value="server">Server API (signed)</option>
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field
                id="ti-domains"
                label="Allowed domains"
                required={form.kind === "pixel"}
                hint="Comma-separated host names, e.g. shop.example.com. Subdomains are included."
                error={errors.domains}
              >
                {(a) => <Textarea rows={2} value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} {...a} />}
              </Field>
              <Field id="ti-window" label="Attribution window" hint="How long after an ad click a conversion still counts.">
                {(a) => (
                  <Select value={form.window} onChange={(e) => setForm({ ...form, window: Number(e.target.value) as Form["window"] })} {...a}>
                    <option value={1}>1 day</option>
                    <option value={7}>7 days</option>
                    <option value={28}>28 days</option>
                  </Select>
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={secret !== null} onOpenChange={(o) => !o && setSecret(null)}>
        {secret ? (
          <DialogContent title="Copy your signing secret now" description="This is the only time it's shown. Store it in your server's secret manager — never in browser code.">
            <div className="space-y-4">
              <p className="text-sm">
                Integration <strong>{secret.name}</strong> · <code className="rounded bg-surface-2 px-1">{secret.key}</code>
              </p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">
                <code>{secret.secret}</code>
              </pre>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => copy(secret.secret, "Secret")}>
                  <Copy /> Copy secret
                </Button>
                <Button onClick={() => setSecret(null)}>I&apos;ve stored it</Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
