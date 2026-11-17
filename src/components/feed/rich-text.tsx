"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

// URLs, #hashtags and @handles (handles follow the profile handle rule: a–z, 0–9, _ ; 3–30).
const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(^|[^\w&])#([\p{L}\p{N}_]{2,40})|(^|[^\w])@([a-z0-9_]{3,30})/giu;

/** Splits post text into plain text, links, hashtags and mentions. Exported for tests. */
export function tokenize(text: string): ({ t: "text"; v: string } | { t: "url" | "tag" | "mention"; v: string })[] {
  const out: ({ t: "text"; v: string } | { t: "url" | "tag" | "mention"; v: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const [whole, url, tagPrefix, tag, mentionPrefix, mention] = m;
    const prefix = tagPrefix ?? mentionPrefix ?? "";
    const start = m.index + prefix.length;
    if (start > last) out.push({ t: "text", v: text.slice(last, start) });
    if (url) out.push({ t: "url", v: url });
    else if (tag) out.push({ t: "tag", v: tag });
    else if (mention) out.push({ t: "mention", v: mention.toLowerCase() });
    last = m.index + whole.length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

const COLLAPSE_AT = 420;

/** Post body with live links, hashtags and mentions, collapsed when long. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const long = text.length > COLLAPSE_AT || text.split("\n").length > 8;
  const [expanded, setExpanded] = useState(false);
  const shown = long && !expanded ? `${text.slice(0, COLLAPSE_AT).trimEnd()}…` : text;
  return (
    <div className={className}>
      <p className="text-[15px] leading-7 whitespace-pre-line break-words">
        {tokenize(shown).map((part, i) => (
          <Fragment key={i}>
            {part.t === "text" ? (
              part.v
            ) : part.t === "url" ? (
              <a href={part.v} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent underline-offset-4 hover:underline">
                {part.v.replace(/^https?:\/\//, "").slice(0, 60)}
                {part.v.replace(/^https?:\/\//, "").length > 60 ? "…" : ""}
              </a>
            ) : part.t === "tag" ? (
              <Link href={`/search?type=posts&q=${encodeURIComponent(`#${part.v}`)}`} className="font-medium text-accent hover:underline">
                #{part.v}
              </Link>
            ) : (
              <Link href={`/members/${part.v}`} className="font-medium text-accent hover:underline">
                @{part.v}
              </Link>
            )}
          </Fragment>
        ))}
      </p>
      {long ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm font-medium text-muted hover:text-fg">
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
