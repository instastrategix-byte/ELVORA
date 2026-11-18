"use client";

import { ArrowDown, ArrowUp, Globe2, Lock, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import {
  LINK_PLATFORMS,
  LINK_VISIBILITIES,
  MAX_PROFILE_LINKS,
  PLATFORMS,
  VISIBILITY_LABELS,
  linkUrlError,
  type LinkPlatform,
  type LinkVisibility,
} from "@backend/modules/profiles/links";
import type { ProfileLink } from "@backend/modules/profiles/types";
import { PlatformIcon } from "./platform-icons";

const VIS_ICON = { public: Globe2, members: Users, connections: Lock } as const;
const REPEATABLE = new Set<LinkPlatform>(["website", "other"]);

/**
 * Manage profile links: add, edit, change who can see each one, reorder and remove. Each change
 * is saved immediately through the API (optimistic, rolled back on error). The database
 * re-validates every URL against its platform.
 */
export function LinksEditor({ initial }: { initial: ProfileLink[] }) {
  const [links, setLinks] = useState(initial);
  const [platform, setPlatform] = useState<LinkPlatform>(() => firstFree(initial));
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [visibility, setVisibility] = useState<LinkVisibility>("members");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const used = new Set(links.map((l) => l.platform));
  const available = LINK_PLATFORMS.filter((p) => REPEATABLE.has(p) || !used.has(p));
  const full = links.length >= MAX_PROFILE_LINKS;
  const urlProblem = url.trim() ? linkUrlError(platform, url) : null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const problem = linkUrlError(platform, url);
    if (problem) return setError(problem);
    if (platform === "other" && !label.trim()) return setError("Give this link a short name.");
    setBusy(true);
    setError(null);
    try {
      const created = await api<ProfileLink>("/api/v1/profile/links", {
        method: "POST",
        body: { platform, url: url.trim(), label: label.trim() || null, visibility },
      });
      const next = [...links, created];
      setLinks(next);
      setUrl("");
      setLabel("");
      setPlatform(firstFree(next));
      toast.show(`${PLATFORMS[created.platform].label} link added`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, change: Partial<Pick<ProfileLink, "url" | "label" | "visibility">>) {
    const before = links;
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)));
    try {
      const saved = await api<ProfileLink>(`/api/v1/profile/links/${id}`, { method: "PATCH", body: change });
      setLinks((ls) => ls.map((l) => (l.id === id ? saved : l)));
      return true;
    } catch (err) {
      setLinks(before);
      toast.show(errorMessage(err), "error");
      return false;
    }
  }

  async function remove(link: ProfileLink) {
    if (!window.confirm(`Remove your ${PLATFORMS[link.platform].label} link?`)) return;
    const before = links;
    setLinks((ls) => ls.filter((l) => l.id !== link.id));
    try {
      await api(`/api/v1/profile/links/${link.id}`, { method: "DELETE" });
    } catch (err) {
      setLinks(before);
      toast.show(errorMessage(err), "error");
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    const before = links;
    const next = [...links];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setLinks(next);
    try {
      setLinks(await api<ProfileLink[]>("/api/v1/profile/links/reorder", { method: "POST", body: { ids: next.map((l) => l.id) } }));
    } catch (err) {
      setLinks(before);
      toast.show(errorMessage(err), "error");
    }
  }

  return (
    <section aria-labelledby="links-h" className="space-y-4">
      <div>
        <h2 id="links-h" className="text-sm font-semibold">
          Links
        </h2>
        <p className="text-xs text-muted">
          Up to {MAX_PROFILE_LINKS} links. Choose who can see each one — links are only shown to people allowed to see your profile.
        </p>
      </div>

      {links.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              first={i === 0}
              last={i === links.length - 1}
              onMove={(d) => move(i, d)}
              onPatch={(c) => patch(link.id, c)}
              onRemove={() => remove(link)}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">No links yet. Add your website, LinkedIn or other profiles below.</p>
      )}

      {full ? (
        <Alert tone="info">You&apos;ve reached the {MAX_PROFILE_LINKS}-link limit. Remove one to add another.</Alert>
      ) : (
        <form onSubmit={add} className="space-y-3 rounded-xl bg-surface-2 p-4" aria-label="Add a link">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <label className="space-y-1">
              <span className="text-xs font-medium">Platform</span>
              <Select value={platform} onChange={(e) => (setPlatform(e.target.value as LinkPlatform), setError(null))}>
                {available.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORMS[p].label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Link</span>
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => (setUrl(e.target.value), setError(null))}
                placeholder={PLATFORMS[platform].placeholder}
                aria-invalid={Boolean(urlProblem)}
                aria-describedby={urlProblem ? "new-link-error" : undefined}
              />
            </label>
          </div>
          {urlProblem ? (
            <p id="new-link-error" className="text-xs text-danger">
              {urlProblem}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <label className="space-y-1">
              <span className="text-xs font-medium">Visible to</span>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as LinkVisibility)}>
                {LINK_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </Select>
            </label>
            {platform === "other" ? (
              <label className="space-y-1">
                <span className="text-xs font-medium">Name</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. Newsletter" />
              </label>
            ) : (
              <span className="hidden sm:block" />
            )}
            <Button type="submit" size="sm" disabled={busy || !url.trim() || Boolean(urlProblem)}>
              <Plus /> {busy ? "Adding…" : "Add link"}
            </Button>
          </div>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </form>
      )}
    </section>
  );
}

function LinkRow({
  link,
  first,
  last,
  onMove,
  onPatch,
  onRemove,
}: {
  link: ProfileLink;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onPatch: (change: Partial<Pick<ProfileLink, "url" | "label" | "visibility">>) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(link.url);
  const [labelDraft, setLabelDraft] = useState(link.label ?? "");
  const problem = draft.trim() !== link.url ? linkUrlError(link.platform, draft) : null;
  const VisIcon = VIS_ICON[link.visibility];
  const name = PLATFORMS[link.platform].label;

  async function commitUrl() {
    const value = draft.trim();
    if (value === link.url) return;
    if (problem) return;
    if (!(await onPatch({ url: value }))) setDraft(link.url);
  }

  async function commitLabel() {
    const value = labelDraft.trim();
    if (value === (link.label ?? "")) return;
    if (!(await onPatch({ label: value || null }))) setLabelDraft(link.label ?? "");
  }

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <span className="flex items-center gap-2 sm:w-40">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg">
          <PlatformIcon platform={link.platform} size={16} />
        </span>
        <span className="text-sm font-medium">{link.platform === "other" ? link.label || name : name}</span>
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {link.platform === "other" ? (
          <Input
            aria-label={`Name for ${link.label ?? "custom link"}`}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            maxLength={40}
            className="h-9 text-sm"
          />
        ) : null}
        <Input
          aria-label={`${name} link`}
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitUrl}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitUrl();
            }
          }}
          aria-invalid={Boolean(problem)}
          className="h-9 text-sm"
        />
        {problem ? <p className="text-xs text-danger">{problem}</p> : null}
      </div>
      <div className="flex items-center gap-1">
        <label className="relative flex items-center">
          <span className="sr-only">Who can see your {name} link</span>
          <VisIcon className="pointer-events-none absolute left-2.5 size-3.5 text-muted" aria-hidden="true" />
          <Select
            value={link.visibility}
            onChange={(e) => void onPatch({ visibility: e.target.value as LinkVisibility })}
            className="h-9 w-36 pl-8 text-sm"
          >
            {LINK_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="ghost" size="icon" className="size-9" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${name} up`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon" className="size-9" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${name} down`}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon" className="size-9 text-danger" onClick={onRemove} aria-label={`Remove ${name} link`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function firstFree(links: ProfileLink[]): LinkPlatform {
  const used = new Set(links.map((l) => l.platform));
  return LINK_PLATFORMS.find((p) => REPEATABLE.has(p) || !used.has(p)) ?? "website";
}
