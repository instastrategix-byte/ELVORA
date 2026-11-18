import type { ProfileDetail } from "./types";

/** Escapes a vCard 3.0 text value (RFC 2426 §5): backslash, comma, semicolon and newlines. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}

/**
 * Digital business card as a vCard 3.0. Contains only what the viewer can already see on the
 * profile page (it is built from the RLS-filtered profile) and never contact details the member
 * hasn't published — no email or phone.
 */
export function toVCard(profile: ProfileDetail, profileUrl: string): string {
  const [first, ...rest] = profile.displayName.trim().split(/\s+/);
  const last = rest.pop() ?? "";
  const middle = rest.join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(last)};${esc(first ?? "")};${esc(middle)};;`,
    `FN:${esc(profile.displayName)}`,
  ];
  if (profile.jobTitle) lines.push(`TITLE:${esc(profile.jobTitle)}`);
  if (profile.company) lines.push(`ORG:${esc(profile.company)}`);
  if (profile.headline) lines.push(`NOTE:${esc(profile.headline)}`);
  if (profile.location) lines.push(`ADR;TYPE=WORK:;;;${esc(profile.location)};;;`);
  lines.push(`URL;TYPE=ELVORA:${profileUrl}`);
  // Only links the viewer can already see (profile.links is RLS-filtered).
  for (const link of profile.links) {
    if (/^https:\/\//.test(link.url)) lines.push(`URL;TYPE=${link.platform.toUpperCase()}:${link.url}`);
  }
  lines.push("END:VCARD");
  // vCard requires CRLF line endings.
  return `${lines.join("\r\n")}\r\n`;
}
