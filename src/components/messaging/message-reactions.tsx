"use client";

import { SmilePlus } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ReactionSummary } from "@backend/modules/messaging/types";
import { EMOJI_FONT_STYLE, EmojiPanel, rememberEmoji } from "./emoji-picker";

export const QUICK_REACTIONS = ["❤️", "👍", "😂", "🔥", "👏", "🙏"] as const;

/** Applies a local toggle to a reaction summary (used for optimistic updates). Exported for tests. */
export function toggleReaction(list: readonly ReactionSummary[], emoji: string): ReactionSummary[] {
  const existing = list.find((r) => r.emoji === emoji);
  if (!existing) return [...list, { emoji, count: 1, reactedByViewer: true }];
  if (existing.reactedByViewer) {
    return list
      .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reactedByViewer: false } : r))
      .filter((r) => r.count > 0);
  }
  return list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reactedByViewer: true } : r));
}

/**
 * Applies a realtime `reaction.changed` event to a message's reactions. The thread calls this
 * from its conversation-topic subscription; the viewer's own events are ignored there because
 * the optimistic update already applied them.
 */
export function applyReactionEvent(
  list: readonly ReactionSummary[],
  event: { user_id: string; emoji: string; op: "add" | "remove" },
  viewerId: string,
): ReactionSummary[] {
  const mine = event.user_id === viewerId;
  const existing = list.find((r) => r.emoji === event.emoji);
  if (event.op === "add") {
    if (!existing) return [...list, { emoji: event.emoji, count: 1, reactedByViewer: mine }];
    if (mine && existing.reactedByViewer) return [...list];
    return list.map((r) => (r.emoji === event.emoji ? { ...r, count: r.count + 1, reactedByViewer: r.reactedByViewer || mine } : r));
  }
  if (!existing || (mine && !existing.reactedByViewer)) return [...list];
  return list
    .map((r) => (r.emoji === event.emoji ? { ...r, count: r.count - 1, reactedByViewer: mine ? false : r.reactedByViewer } : r))
    .filter((r) => r.count > 0);
}

function describe(r: ReactionSummary): string {
  const others = r.count - (r.reactedByViewer ? 1 : 0);
  if (r.reactedByViewer) {
    return others === 0 ? `Reacted with ${r.emoji} by you` : `Reacted with ${r.emoji} by you and ${others} other${others === 1 ? "" : "s"}`;
  }
  return `Reacted with ${r.emoji} by ${r.count} ${r.count === 1 ? "person" : "people"}`;
}

/** Sends one toggle to the server and returns the authoritative summary. */
async function sendToggle(messageId: string, emoji: string, remove: boolean): Promise<ReactionSummary[]> {
  return api<ReactionSummary[]>(`/api/v1/messages/${messageId}/reactions`, { method: remove ? "DELETE" : "POST", body: { emoji } });
}

/**
 * Reaction chips under a message bubble. Clicking a chip toggles the viewer's reaction
 * optimistically and reconciles with the server (rolling back on error).
 */
export function MessageReactions({
  messageId,
  reactions,
  mine,
  onChange,
}: {
  messageId: string;
  reactions: ReactionSummary[];
  mine: boolean;
  /** Called with the latest summary so the parent can keep its message state in sync. */
  onChange?: (reactions: ReactionSummary[]) => void;
}) {
  const [local, setLocal] = useState(reactions);
  const [synced, setSynced] = useState(reactions);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Adopt newer props (realtime updates, reloads) without an effect.
  if (reactions !== synced) {
    setSynced(reactions);
    setLocal(reactions);
  }

  async function toggle(emoji: string) {
    if (busy) return;
    const before = local;
    const remove = Boolean(before.find((r) => r.emoji === emoji)?.reactedByViewer);
    const optimistic = toggleReaction(before, emoji);
    setLocal(optimistic);
    setBusy(true);
    try {
      const server = await sendToggle(messageId, emoji, remove);
      setLocal(server);
      onChange?.(server);
    } catch (e) {
      setLocal(before);
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (local.length === 0) return null;
  return (
    <ul aria-label="Reactions" className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
      {local.map((r) => (
        <li key={r.emoji}>
          <button
            type="button"
            onClick={() => toggle(r.emoji)}
            aria-pressed={r.reactedByViewer}
            aria-label={describe(r)}
            title={describe(r)}
            className={cn(
              "pressable inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors",
              r.reactedByViewer ? "border-accent/60 bg-accent/15 text-fg" : "border-border bg-surface-2 text-muted hover:border-border-strong",
            )}
          >
            <span style={EMOJI_FONT_STYLE} className="text-sm leading-none" aria-hidden="true">
              {r.emoji}
            </span>
            {r.count}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Small "add reaction" trigger for a message: quick reactions plus the full picker. Place it next
 * to the bubble inside an element with the `group` class; it appears on hover and stays visible on
 * touch screens. The parent passes `current` so toggling an existing reaction removes it.
 */
export function QuickReact({
  messageId,
  current = [],
  onReacted,
  align = "start",
}: {
  messageId: string;
  current?: readonly ReactionSummary[];
  onReacted?: (reactions: ReactionSummary[]) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const toast = useToast();

  async function react(emoji: string) {
    setOpen(false);
    setShowAll(false);
    rememberEmoji(emoji);
    const remove = Boolean(current.find((r) => r.emoji === emoji)?.reactedByViewer);
    onReacted?.(toggleReaction(current, emoji)); // optimistic; replaced by the server's summary below
    try {
      onReacted?.(await sendToggle(messageId, emoji, remove));
    } catch (e) {
      onReacted?.([...current]);
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setShowAll(false);
      }}
    >
      <Popover.Trigger
        type="button"
        aria-label="Add reaction"
        title="Add reaction"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-70"
      >
        <SmilePlus className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-[60] rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)] outline-none data-[state=open]:animate-scale-in",
            showAll && "w-[min(22rem,calc(100vw-1rem))] p-2",
          )}
        >
          {showAll ? (
            <EmojiPanel onSelect={react} />
          ) : (
            <div className="flex items-center gap-0.5" style={EMOJI_FONT_STYLE}>
              {QUICK_REACTIONS.map((e) => {
                const active = Boolean(current.find((r) => r.emoji === e)?.reactedByViewer);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => react(e)}
                    aria-label={active ? `Remove ${e} reaction` : `React with ${e}`}
                    aria-pressed={active}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-xl leading-none transition-transform hover:scale-125 hover:bg-surface-2",
                      active && "bg-accent/15",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowAll(true)}
                aria-label="More emoji"
                className="flex size-9 items-center justify-center rounded-full font-sans text-lg text-muted hover:bg-surface-2 hover:text-fg"
              >
                +
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
