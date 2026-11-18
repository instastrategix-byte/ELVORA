"use client";

import { Clock, Search, Smile } from "lucide-react";
import { Popover } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { EmojiRow } from "./emoji-data";

/** Native emoji fonts first, so emoji render consistently on Windows, macOS, iOS, Android and Linux. */
export const EMOJI_FONT_STYLE = {
  fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif',
} as const;

const RECENT_KEY = "elvora-emoji-recent";
const DEFAULT_RECENT = ["❤️", "👍", "😂", "🔥", "👏", "🙏", "🎉", "😊", "😍", "🤝", "💯", "✨"];
const RECENT_LIMIT = 24;
const SEARCH_LIMIT = 160;
const COLUMNS = 8;

// One representative emoji per category tab.
const GROUP_ICONS: Record<number, string> = { 0: "😀", 1: "🧑", 3: "🐶", 4: "🍔", 5: "✈️", 6: "⚽", 7: "💡", 8: "💯", 9: "🏁" };

type Groups = readonly { id: number; label: string }[];
type Data = { rows: readonly EmojiRow[]; groups: Groups; names: Map<string, string> };

let dataPromise: Promise<Data> | null = null;
/** Lazily loads the bundled emoji dataset once per page (code-split; no network fetch to third parties). */
function loadData(): Promise<Data> {
  dataPromise ??= import("./emoji-data").then((m) => ({
    rows: m.EMOJI,
    groups: m.EMOJI_GROUPS,
    names: new Map(m.EMOJI.map((r) => [r[0], r[1]])),
  }));
  return dataPromise;
}

type RecentEntry = { e: string; n: number };

function readRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is RecentEntry => typeof x?.e === "string" && typeof x?.n === "number").slice(0, RECENT_LIMIT);
    }
  } catch {
    // Storage unavailable (private mode, blocked): fall back to defaults.
  }
  return [];
}

/** Records a use so frequently used emoji float to the top. Exported for QuickReact. */
export function rememberEmoji(emoji: string) {
  try {
    const list = readRecent();
    const found = list.find((x) => x.e === emoji);
    if (found) found.n += 1;
    else list.push({ e: emoji, n: 1 });
    list.sort((a, b) => b.n - a.n);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    // Ignore: remembering is a convenience only.
  }
}

/** Filters emoji by name and keywords; every search word must match. Exported for tests. */
export function searchEmoji(rows: readonly EmojiRow[], query: string, limit = SEARCH_LIMIT): EmojiRow[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: EmojiRow[] = [];
  for (const r of rows) {
    const hay = `${r[1]} ${r[3]}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Emoji picker: search, categories, frequently used (remembered on this device), keyboard
 * navigation (arrow keys, Home/End, Enter). Opens from a ghost icon button.
 */
export function EmojiPicker({
  onSelect,
  className,
  label = "Add emoji",
  closeOnSelect = false,
}: {
  onSelect: (emoji: string) => void;
  className?: string;
  label?: string;
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
          className,
        )}
      >
        <Smile className="size-5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="z-[60] w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-border bg-surface p-2 shadow-[var(--shadow-lift)] outline-none data-[state=open]:animate-scale-in"
        >
          <EmojiPanel
            onSelect={(e) => {
              onSelect(e);
              if (closeOnSelect) setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The picker body (search + tabs + grid). Usable inline, e.g. inside another popover. */
export function EmojiPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  // The panel only renders client-side (inside an opened popover), so storage can be read up front.
  const [recent, setRecent] = useState<RecentEntry[]>(() => (typeof window === "undefined" ? [] : readRecent()));
  const [tab, setTab] = useState<number | "recent">("recent");
  const [focusIndex, setFocusIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const recentEmoji = useMemo(() => {
    const used = recent.map((r) => r.e);
    return [...used, ...DEFAULT_RECENT.filter((e) => !used.includes(e))].slice(0, RECENT_LIMIT);
  }, [recent]);

  const visible: { emoji: string; name: string }[] = useMemo(() => {
    if (!data) return [];
    if (query.trim()) return searchEmoji(data.rows, query).map((r) => ({ emoji: r[0], name: r[1] }));
    if (tab === "recent") return recentEmoji.map((e) => ({ emoji: e, name: data.names.get(e) ?? e }));
    return data.rows.filter((r) => r[2] === tab).map((r) => ({ emoji: r[0], name: r[1] }));
  }, [data, query, tab, recentEmoji]);

  const pick = useCallback(
    (emoji: string) => {
      rememberEmoji(emoji);
      setRecent(readRecent());
      onSelect(emoji);
    },
    [onSelect],
  );

  function selectTab(next: number | "recent") {
    setTab(next);
    setFocusIndex(0);
  }

  function moveFocus(next: number) {
    const clamped = Math.max(0, Math.min(visible.length - 1, next));
    setFocusIndex(clamped);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-index="${clamped}"]`)?.focus();
  }

  function onGridKey(e: React.KeyboardEvent) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    if (e.key in keys) {
      e.preventDefault();
      moveFocus(focusIndex + keys[e.key]!);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(visible.length - 1);
    }
  }

  const heading = query.trim() ? "Search results" : tab === "recent" ? "Frequently used" : data?.groups.find((g) => g.id === tab)?.label;

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">Search emoji</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && visible.length) {
              e.preventDefault();
              moveFocus(0);
            } else if (e.key === "Enter" && visible[0]) {
              e.preventDefault();
              pick(visible[0].emoji);
            }
          }}
          placeholder="Search emoji"
          // Autofocus only where there's a real keyboard, so phones don't pop the keyboard over the grid.
          autoFocus={typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches}
          className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm placeholder:text-muted/80 focus:border-accent focus:outline-none"
        />
      </label>

      {!query.trim() ? (
        <div role="tablist" aria-label="Emoji categories" className="scrollbar-none flex gap-0.5 overflow-x-auto">
          <TabButton active={tab === "recent"} label="Frequently used" onClick={() => selectTab("recent")}>
            <Clock className="size-4" aria-hidden="true" />
          </TabButton>
          {(data?.groups ?? []).map((g) => (
            <TabButton key={g.id} active={tab === g.id} label={g.label} onClick={() => selectTab(g.id)}>
              <span style={EMOJI_FONT_STYLE} className="text-base leading-none" aria-hidden="true">
                {GROUP_ICONS[g.id]}
              </span>
            </TabButton>
          ))}
        </div>
      ) : null}

      <p className="px-1 text-[11px] font-medium tracking-wide text-muted uppercase">{heading}</p>

      <div className="h-64 overflow-y-auto overscroll-contain pr-1">
        {failed ? (
          <p className="p-4 text-center text-sm text-muted">Emoji couldn&apos;t load. Please try again.</p>
        ) : !data ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading emoji" />
          </div>
        ) : visible.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">No emoji found for “{query}”.</p>
        ) : (
          <div ref={gridRef} role="grid" aria-label={heading} onKeyDown={onGridKey} className="grid grid-cols-8 gap-0.5" style={EMOJI_FONT_STYLE}>
            {visible.map((v, i) => (
              <button
                key={`${v.emoji}-${i}`}
                type="button"
                role="gridcell"
                data-index={i}
                tabIndex={i === focusIndex ? 0 : -1}
                aria-label={v.name}
                title={v.name}
                onClick={() => pick(v.emoji)}
                onFocus={() => setFocusIndex(i)}
                className="flex aspect-square items-center justify-center rounded-lg text-[1.35rem] leading-none transition-transform hover:scale-110 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {v.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2",
        active && "bg-surface-2 text-fg ring-1 ring-border-strong",
      )}
    >
      {children}
    </button>
  );
}
