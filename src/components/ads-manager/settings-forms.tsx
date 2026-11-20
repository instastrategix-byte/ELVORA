"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Avatar, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import type { AdRole } from "@backend/modules/advertising/constants";
import type { AdAccount, AdAccountMember } from "@backend/modules/advertising/types";
import { minorToMajor, roleAtLeast } from "./model";

const ROLE_HELP: Record<AdRole, string> = {
  owner: "Everything, including adding admins.",
  admin: "Billing, tracking, team (editors and analysts) and all campaign work.",
  editor: "Create and change campaigns, ad sets, ads, creatives and audiences.",
  analyst: "View results and settings only.",
};

/** Roles the viewer may give: owners add admins and below; admins add editors and analysts. */
export function assignableRoles(viewerRole: AdRole | null): Exclude<AdRole, "owner">[] {
  if (viewerRole === "owner") return ["admin", "editor", "analyst"];
  if (viewerRole === "admin") return ["editor", "analyst"];
  return [];
}

const TIMEZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Zurich", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo"];

export function AccountSettingsForm({ account }: { account: AdAccount }) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = roleAtLeast(account.role, "admin");
  const [v, setV] = useState({
    displayName: account.displayName,
    billingEmail: account.billingEmail ?? "",
    timezone: account.timezone,
    spendLimit: account.spendLimitMinor === null ? "" : String(minorToMajor(account.spendLimitMinor, account.currency)),
  });
  const action = useAction(() =>
    api(`/api/v1/ads-manager/accounts/${account.id}`, {
      method: "PATCH",
      body: { displayName: v.displayName, billingEmail: v.billingEmail, timezone: v.timezone, spendLimit: v.spendLimit.trim() ? Number(v.spendLimit) : null },
    }),
  );
  const zones = TIMEZONES.includes(v.timezone) ? TIMEZONES : [v.timezone, ...TIMEZONES];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await action.run()) !== undefined) {
      toast.show("Settings saved");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <fieldset disabled={!canEdit || action.pending} className="grid gap-4 sm:grid-cols-2">
        <Field id="acc-name" label="Advertiser name" required hint="Shown on every ad as “Sponsored · name”." error={action.fieldErrors.displayName}>
          {(a) => <Input value={v.displayName} maxLength={120} onChange={(e) => setV({ ...v, displayName: e.target.value })} {...a} />}
        </Field>
        <Field id="acc-email" label="Billing email" error={action.fieldErrors.billingEmail}>
          {(a) => <Input type="email" value={v.billingEmail} onChange={(e) => setV({ ...v, billingEmail: e.target.value })} {...a} />}
        </Field>
        <Field id="acc-tz" label="Time zone" hint="Used for display. Budgets and reports use UTC days." error={action.fieldErrors.timezone}>
          {(a) => (
            <Select value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} {...a}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="acc-limit" label={`Account spend limit (${account.currency})`} hint="Optional lifetime cap across all campaigns. Leave empty for no limit." error={action.fieldErrors.spendLimit}>
          {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={v.spendLimit} onChange={(e) => setV({ ...v, spendLimit: e.target.value })} {...a} />}
        </Field>
      </fieldset>
      <p className="text-xs text-muted">Currency: {account.currency} (set when the account was created).</p>
      {canEdit ? (
        <Button type="submit" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save settings"}
        </Button>
      ) : (
        <p className="text-sm text-muted">Only owners and admins can change account settings.</p>
      )}
    </form>
  );
}

export function TeamManager({ accountId, members, viewerRole, viewerId }: { accountId: string; members: AdAccountMember[]; viewerRole: AdRole | null; viewerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const roles = assignableRoles(viewerRole);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<Exclude<AdRole, "owner">>(roles.at(-1) ?? "analyst");
  const add = useAction(() => api(`/api/v1/ads-manager/accounts/${accountId}/members`, { method: "POST", body: { handle, role } }));
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) {
      toast.show("Team member added");
      setHandle("");
      router.refresh();
    }
  }

  async function change(userId: string, next: Exclude<AdRole, "owner">) {
    setBusy(userId);
    try {
      await api(`/api/v1/ads-manager/accounts/${accountId}/members/${userId}`, { method: "PATCH", body: { role: next } });
      toast.show("Role updated");
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't change the role", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: AdAccountMember) {
    if (!window.confirm(`Remove ${m.displayName} from this account?`)) return;
    setBusy(m.userId);
    try {
      await api(`/api/v1/ads-manager/accounts/${accountId}/members/${m.userId}`, { method: "DELETE" });
      toast.show("Removed from the account");
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't remove this member", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {members.map((m) => {
          const editable = m.role !== "owner" && m.userId !== viewerId && roles.includes(m.role as Exclude<AdRole, "owner">);
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar src={m.avatarUrl} name={m.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.displayName} {m.userId === viewerId ? <span className="text-xs text-muted">(you)</span> : null}
                </p>
                <p className="text-xs text-muted">@{m.handle}</p>
              </div>
              {editable ? (
                <>
                  <label>
                    <span className="sr-only">Role for {m.displayName}</span>
                    <Select value={m.role} disabled={busy === m.userId} onChange={(e) => change(m.userId, e.target.value as Exclude<AdRole, "owner">)}>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {titleCase(r)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button size="sm" variant="ghost" disabled={busy === m.userId} onClick={() => remove(m)}>
                    Remove
                  </Button>
                </>
              ) : (
                <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{titleCase(m.role)}</Badge>
              )}
            </li>
          );
        })}
      </ul>

      {roles.length ? (
        <form onSubmit={submit} className="space-y-3" noValidate>
          {add.error ? <Alert tone="error">{add.error}</Alert> : null}
          <div className="flex flex-wrap items-end gap-3">
            <Field id="tm-handle" label="Add by ELVORA handle" error={add.fieldErrors.handle} className="min-w-56 flex-1">
              {(a) => <Input value={handle} placeholder="@handle" onChange={(e) => setHandle(e.target.value)} {...a} />}
            </Field>
            <Field id="tm-role" label="Role">
              {(a) => (
                <Select value={role} onChange={(e) => setRole(e.target.value as Exclude<AdRole, "owner">)} {...a}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" disabled={add.pending || !handle.trim()}>
              {add.pending ? "Adding…" : "Add"}
            </Button>
          </div>
          <ul className="space-y-1 text-xs text-muted">
            {roles.map((r) => (
              <li key={r}>
                <strong className="text-fg">{titleCase(r)}</strong> — {ROLE_HELP[r]}
              </li>
            ))}
          </ul>
        </form>
      ) : (
        <p className="text-sm text-muted">Only owners and admins can manage the team.</p>
      )}
    </div>
  );
}
