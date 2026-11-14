"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={pathname === i.href ? "page" : undefined}
          className={cn("shrink-0 border-b-2 border-transparent px-3 py-3 text-sm text-muted hover:text-fg", "aria-[current=page]:border-accent aria-[current=page]:text-fg")}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
