/**
 * Profile link platforms and URL rules. Mirrors public.profile_link_url_ok in migration
 * 20261120000100 (the database enforces the same rule; this gives friendly, early feedback).
 * Safe to import on the client.
 */

export const LINK_PLATFORMS = ["website", "linkedin", "x", "instagram", "facebook", "youtube", "tiktok", "pinterest", "github", "other"] as const;
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export const LINK_VISIBILITIES = ["public", "members", "connections"] as const;
export type LinkVisibility = (typeof LINK_VISIBILITIES)[number];

export const MAX_PROFILE_LINKS = 12;

type PlatformMeta = {
  label: string;
  placeholder: string;
  /** Host test for named platforms; null = any valid host. */
  host: RegExp | null;
  /** Shown when the URL is on the wrong site. */
  example?: string;
};

export const PLATFORMS: Record<LinkPlatform, PlatformMeta> = {
  website: { label: "Website", placeholder: "https://yourcompany.com", host: null },
  linkedin: { label: "LinkedIn", placeholder: "https://www.linkedin.com/in/your-name", host: /(^|\.)linkedin\.com$/, example: "linkedin.com" },
  x: { label: "X (Twitter)", placeholder: "https://x.com/yourhandle", host: /^(www\.|mobile\.)?(x|twitter)\.com$/, example: "x.com or twitter.com" },
  instagram: { label: "Instagram", placeholder: "https://instagram.com/yourhandle", host: /^(www\.)?instagram\.com$/, example: "instagram.com" },
  facebook: { label: "Facebook", placeholder: "https://facebook.com/yourpage", host: /(^|\.)(facebook\.com|fb\.com)$/, example: "facebook.com" },
  youtube: { label: "YouTube", placeholder: "https://youtube.com/@yourchannel", host: /((^|\.)youtube\.com|^youtu\.be)$/, example: "youtube.com" },
  tiktok: { label: "TikTok", placeholder: "https://tiktok.com/@yourhandle", host: /(^|\.)tiktok\.com$/, example: "tiktok.com" },
  pinterest: { label: "Pinterest", placeholder: "https://pinterest.com/yourname", host: /((^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?|^pin\.it)$/, example: "pinterest.com" },
  github: { label: "GitHub", placeholder: "https://github.com/yourname", host: /^(www\.)?github\.com$/, example: "github.com" },
  other: { label: "Other link", placeholder: "https://…", host: null },
};

export const VISIBILITY_LABELS: Record<LinkVisibility, string> = {
  public: "Everyone",
  members: "Members",
  connections: "Connections",
};

const HOST_RE = /^https:\/\/([^/?#:@\s]+)(?::\d{1,5})?(?:[/?#]|$)/;

/** Returns a friendly error message, or null when the URL is valid for the platform. */
export function linkUrlError(platform: LinkPlatform, url: string): string | null {
  const value = url.trim();
  if (!value) return "Enter a link.";
  if (value.length > 300) return "Links can be up to 300 characters.";
  if (/\s/.test(value)) return "Links can't contain spaces.";
  if (/^http:\/\//i.test(value)) return "Use a secure link that starts with https://";
  const match = HOST_RE.exec(value);
  if (!match) return "Enter a full address starting with https://";
  const host = match[1]!.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return "That doesn't look like a valid web address.";
  const meta = PLATFORMS[platform];
  if (meta.host && !meta.host.test(host)) return `This should be a ${meta.label} link (${meta.example}).`;
  return null;
}

/** Short display text for a link: the handle or path when it's meaningful, otherwise the host. */
export function linkDisplay(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    if (!path) return host;
    const last = path.split("/").filter(Boolean).pop() ?? "";
    return last.startsWith("@") ? last : path.length <= 24 ? `${host}${path}` : host;
  } catch {
    return url;
  }
}
