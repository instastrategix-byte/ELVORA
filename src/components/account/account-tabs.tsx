"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account/membership", label: "Membership & billing" },
  { href: "/account/verification", label: "Verification" },
  { href: "/account/referrals", label: "Invite members" },
  { href: "/account/settings", label: "Privacy & notifications" },
  { href: "/account/security", label: "Security" },
];

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={pathname === t.href ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm text-muted hover:text-fg",
            "aria-[current=page]:border-accent aria-[current=page]:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
