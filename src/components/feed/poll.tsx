"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PostPoll } from "@backend/modules/feed/types";

/**
 * A post's poll. Before voting, options are a radio (or checkbox) group; after voting, or once
 * closed, results show as bars with percentages. Votes are optimistic and reconciled with the
 * server's aggregate counts. Voters are never shown — only totals.
 */
export function Poll({ postId, poll: initial, canVote }: { postId: string; poll: PostPoll; canVote: boolean }) {
  const [poll, setPoll] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const hasVoted = poll.options.some((o) => o.voted);
  const showResults = hasVoted || poll.closed || !canVote;
  const name = `poll-${postId}`;

  async function submit(optionIds: string[]) {
    if (optionIds.length === 0) return;
    const before = poll;
    // Optimistic: replace any previous choice with the new one.
    setPoll((p) => {
      const options = p.options.map((o) => {
        const was = o.voted ? 1 : 0;
        const now = optionIds.includes(o.id) ? 1 : 0;
        return { ...o, votes: o.votes - was + now, voted: now === 1 };
      });
      return { ...p, options, totalVotes: options.reduce((s, o) => s + o.votes, 0) };
    });
    setBusy(true);
    try {
      setPoll(await api<PostPoll>(`/api/v1/posts/${postId}/poll/vote`, { method: "POST", body: { optionIds } }));
      setSelected([]);
    } catch (e) {
      setPoll(before);
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    const before = poll;
    setBusy(true);
    try {
      setPoll(await api<PostPoll>(`/api/v1/posts/${postId}/poll/vote`, { method: "DELETE" }));
    } catch (e) {
      setPoll(before);
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <span>
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
      </span>
      <span aria-hidden="true">·</span>
      <span>{poll.closed ? "Final results" : `Ends ${formatRelative(poll.closesAt)}`}</span>
      {poll.allowMultiple ? (
        <>
          <span aria-hidden="true">·</span>
          <span>Multiple choice</span>
        </>
      ) : null}
      {hasVoted && !poll.closed && canVote ? (
        <button type="button" onClick={clear} disabled={busy} className="ml-auto font-medium hover:text-fg disabled:opacity-50">
          Undo vote
        </button>
      ) : null}
    </p>
  );

  if (showResults) {
    const max = Math.max(...poll.options.map((o) => o.votes));
    return (
      <div className="mt-4" aria-label={poll.question ?? "Poll results"} role="group">
        {poll.question ? <p className="mb-2 font-medium">{poll.question}</p> : null}
        <ul className="space-y-2">
          {poll.options.map((o) => {
            const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
            const leading = poll.closed && o.votes === max && max > 0;
            return (
              <li key={o.id} className="relative overflow-hidden rounded-lg border border-border">
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", o.voted || leading ? "bg-accent/25" : "bg-surface-3")}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className={cn("flex min-w-0 items-center gap-1.5", (o.voted || leading) && "font-medium")}>
                    {o.voted ? <Check className="size-4 shrink-0 text-accent" aria-label="Your choice" /> : null}
                    <span className="truncate">{o.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {pct}% <span className="sr-only">({o.votes} votes)</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {footer}
      </div>
    );
  }

  return (
    <fieldset className="mt-4" disabled={busy}>
      <legend className={poll.question ? "mb-2 font-medium" : "sr-only"}>{poll.question ?? "Poll"}</legend>
      <div className="space-y-2" role={poll.allowMultiple ? "group" : "radiogroup"}>
        {poll.options.map((o) => {
          const checked = selected.includes(o.id);
          return (
            <label
              key={o.id}
              className={cn(
                "pressable flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                checked ? "border-accent bg-surface-2" : "border-border hover:border-border-strong",
              )}
            >
              <input
                type={poll.allowMultiple ? "checkbox" : "radio"}
                name={name}
                value={o.id}
                checked={checked}
                onChange={(e) => {
                  if (poll.allowMultiple) {
                    setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)));
                  } else {
                    // Single choice votes immediately.
                    void submit([o.id]);
                  }
                }}
                className="accent-[var(--accent)]"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {poll.allowMultiple ? (
        <button
          type="button"
          onClick={() => submit(selected)}
          disabled={busy || selected.length === 0}
          className="mt-3 rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          Vote
        </button>
      ) : null}
      {footer}
    </fieldset>
  );
}
