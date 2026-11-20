"use client";

import {
  ArrowLeft,
  BarChart3,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Megaphone,
  Radar,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The Ads Manager sections, in the order the product owner specified. */
export const ADS_SECTIONS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "campaigns", label: "Campaigns", icon: Megaphone },
  { slug: "ad-sets", label: "Ad Sets", icon: Layers },
  { slug: "ads", label: "Ads & Creatives", icon: ImageIcon },
  { slug: "audiences", label: "Audiences", icon: Target },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
  { slug: "billing", label: "Billing", icon: Wallet },
  { slug: "tracking", label: "Tracking & Pixels", icon: Radar },
  { slug: "reports", label: "Reports", icon: FileText },
  { slug: "settings", label: "Settings", icon: Settings },
];

function useSection() {
  const params = useParams<{ accountId?: string }>();
  const pathname = usePathname();
  const accountId = typeof params.accountId === "string" ? params.accountId : null;
  const base = accountId ? `/ads-manager/${accountId}` : null;
  const rest = base && pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const current = rest.split("/")[0] ?? "";
  return { base, current };
}

export function AdsSidebar() {
  const { base, current } = useSection();
  return (
    <nav aria-label="Ads Manager" className="space-y-6">
      <div className="space-y-1">
        <p className="eyebrow px-3">Ads Manager</p>
        {base ? (
          <ul className="mt-2 space-y-0.5">
            {ADS_SECTIONS.map(({ slug, label, icon: Icon }) => {
              const active = current === slug;
              return (
                <li key={slug || "overview"}>
                  <Link
                    href={slug ? `${base}/${slug}` : base}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                      "aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-fg",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active && "text-accent")} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 pt-2 text-sm text-muted">Choose an advertising account to start.</p>
        )}
      </div>
      <Link href="/home" className="flex items-center gap-2 px-3 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to ELVORA
      </Link>
    </nav>
  );
}

/** Scrollable section tabs for small screens (the sidebar is hidden below lg). */
export function AdsMobileNav() {
  const { base, current } = useSection();
  if (!base) return null;
  return (
    <nav aria-label="Ads Manager sections" className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 scrollbar-none lg:hidden">
      <ul className="flex gap-1">
        {ADS_SECTIONS.map(({ slug, label }) => (
          <li key={slug || "overview"} className="shrink-0">
            <Link
              href={slug ? `${base}/${slug}` : base}
              aria-current={current === slug ? "page" : undefined}
              className="block border-b-2 border-transparent px-3 py-3 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
