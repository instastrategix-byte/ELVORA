/**
 * Profile completeness: a pure, weighted checklist of the fields that make a member
 * discoverable and credible. Safe to use on the server or client.
 */

export type CompletenessInput = {
  handle: string;
  avatar_path: string | null;
  cover_path: string | null;
  headline: string | null;
  bio: string | null;
  job_title: string | null;
  company: string | null;
  location: string | null;
  member_type: string | null;
  skills: readonly string[];
  interests: readonly string[];
  open_to: readonly string[];
  verified_kinds: readonly string[];
  experienceCount?: number;
};

export type CompletenessItem = { key: string; label: string; href: string };
export type Completeness = { percent: number; missing: CompletenessItem[] };

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

const CHECKS: (CompletenessItem & { weight: number; done: (p: CompletenessInput) => boolean })[] = [
  { key: "handle", label: "Choose a personal handle", href: "/profile/edit", weight: 5, done: (p) => !/^member_[0-9a-f]{12}$/.test(p.handle) },
  { key: "avatar", label: "Add a profile photo", href: "/profile/edit", weight: 15, done: (p) => filled(p.avatar_path) },
  { key: "headline", label: "Write a headline", href: "/profile/edit", weight: 10, done: (p) => filled(p.headline) },
  { key: "memberType", label: "Say how you describe yourself", href: "/profile/edit", weight: 5, done: (p) => filled(p.member_type) },
  { key: "role", label: "Add your title and company", href: "/profile/edit", weight: 10, done: (p) => filled(p.job_title) && filled(p.company) },
  { key: "bio", label: "Write a short bio", href: "/profile/edit", weight: 10, done: (p) => filled(p.bio) },
  { key: "location", label: "Add your location", href: "/profile/edit", weight: 5, done: (p) => filled(p.location) },
  { key: "experience", label: "Add your experience", href: "/profile/edit#experience", weight: 10, done: (p) => (p.experienceCount ?? 0) > 0 },
  { key: "skills", label: "List at least three skills", href: "/profile/edit", weight: 5, done: (p) => p.skills.length >= 3 },
  { key: "interests", label: "Add your interests", href: "/profile/edit", weight: 5, done: (p) => p.interests.length > 0 },
  { key: "openTo", label: "Share what you're open to", href: "/profile/edit", weight: 5, done: (p) => p.open_to.length > 0 },
  { key: "cover", label: "Add a cover image", href: "/profile/edit", weight: 5, done: (p) => filled(p.cover_path) },
  { key: "verified", label: "Verify your identity", href: "/account/verification", weight: 10, done: (p) => p.verified_kinds.length > 0 },
];

const TOTAL = CHECKS.reduce((sum, c) => sum + c.weight, 0);

export function profileCompleteness(profile: CompletenessInput): Completeness {
  let earned = 0;
  const missing: CompletenessItem[] = [];
  for (const check of CHECKS) {
    if (check.done(profile)) earned += check.weight;
    else missing.push({ key: check.key, label: check.label, href: check.href });
  }
  return { percent: Math.round((earned / TOTAL) * 100), missing };
}
