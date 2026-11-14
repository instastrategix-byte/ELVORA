"use client";

import {
  Bell,
  Bookmark,
  Building2,
  Compass,
  CreditCard,
  Gem,
  Home,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const APP_NAV = [
  { href: "/feed", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/connections", label: "Connections", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/luxury", label: "Luxury", icon: Gem },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/business", label: "Business", icon: Building2 },
  { href: "/ads", label: "Advertising", icon: Megaphone },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/account/membership", label: "Membership", icon: CreditCard },
  { href: "/account/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ showAdmin }: { showAdmin?: boolean }) {
  return <NavLinks pathname={usePathname()} showAdmin={showAdmin} />;
}

/** Pure link list; used directly as the static (prerendered) fallback. */
export function NavLinks({ pathname, showAdmin }: { pathname: string; showAdmin?: boolean }) {
  const items = showAdmin ? [...APP_NAV, { href: "/admin", label: "Administration", icon: ShieldCheck }] : APP_NAV;
  return (
    <nav aria-label="App" className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg",
            "aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg",
          )}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

const TABS = [APP_NAV[0], APP_NAV[1], APP_NAV[3], APP_NAV[4]];

export function MobileTabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted aria-[current=page]:text-accent"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
        <li>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] text-muted">
              <MoreHorizontal className="size-5" aria-hidden="true" /> More
            </DialogTrigger>
            <DialogContent title="Menu">
              <div onClick={() => setOpen(false)}>
                <AppSidebar />
              </div>
            </DialogContent>
          </Dialog>
        </li>
      </ul>
    </nav>
  );
}
