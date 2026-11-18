"use client";

import { Contact, Handshake, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert, Avatar, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { ProfileSummary } from "@backend/modules/profiles/types";

/**
 * Records one profile view per page load for signed-in members (the server deduplicates per
 * day and ignores self-views). Renders nothing.
 */
export function ProfileViewBeacon({ profileId }: { profileId: string }) {
  useEffect(() => {
    const controller = new AbortController();
    api("/api/v1/profile/views", { method: "POST", body: { profileId }, signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [profileId]);
  return null;
}

/** Digital business card: download a vCard or share the profile link. */
export function BusinessCardActions({ handle, displayName }: { handle: string; displayName: string }) {
  const toast = useToast();
  async function share() {
    const url = `${window.location.origin}/members/${handle}`;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url, title: `${displayName} on ELVORA` });
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Profile link copied");
    } catch {
      toast.show("Couldn't copy the link", "error");
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary" size="sm">
        <a href={`/api/v1/cards/${handle}`} download={`${handle}.vcf`}>
          <Contact /> Save contact
        </a>
      </Button>
      <Button variant="secondary" size="sm" onClick={share}>
        <Link2 /> Share
      </Button>
    </div>
  );
}

/** Ask a mutual connection to introduce you. Paths are loaded from the server when opened. */
export function RequestIntroductionButton({ targetId, targetName }: { targetId: string; targetName: string }) {
  const [open, setOpen] = useState(false);
  const [paths, setPaths] = useState<ProfileSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [introducer, setIntroducer] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open || paths !== null) return;
    api<ProfileSummary[]>(`/api/v1/introductions/paths?target=${targetId}`)
      .then((p) => {
        setPaths(p);
        if (p.length === 1) setIntroducer(p[0]!.id);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, [open, paths, targetId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!introducer) return;
    setSending(true);
    setError(null);
    try {
      await api("/api/v1/introductions", { method: "POST", body: { introducerId: introducer, targetId, message } });
      toast.show("Introduction requested");
      setOpen(false);
      setMessage("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Handshake /> Request introduction
        </Button>
      </DialogTrigger>
      <DialogContent title={`Meet ${targetName}`} description="Ask a mutual connection to introduce you. They decide whether to pass it on.">
        {loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : paths === null ? (
          <div className="flex justify-center py-8">
            <Spinner label="Finding mutual connections" />
          </div>
        ) : paths.length === 0 ? (
          <p className="text-sm text-muted">
            You don&apos;t have a mutual connection with {targetName} yet. You can still send a connection request from their profile.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Who should introduce you?</legend>
              <ul className="space-y-2">
                {paths.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-surface-2">
                      <input type="radio" name="introducer" value={p.id} checked={introducer === p.id} onChange={() => setIntroducer(p.id)} className="accent-[var(--accent)]" />
                      <Avatar src={p.avatarUrl} name={p.displayName} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.displayName}</span>
                        {p.headline ? <span className="block truncate text-xs text-muted">{p.headline}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <Field id="intro-message" label="Why would you like to meet?" hint="Your introducer and, if they forward it, the member will read this." required>
              {(aria) => <Textarea {...aria} value={message} onChange={(e) => setMessage(e.target.value)} minLength={20} maxLength={600} required />}
            </Field>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={sending || !introducer || message.trim().length < 20}>
                {sending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
