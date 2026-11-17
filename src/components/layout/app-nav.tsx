"use client";

import {
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  Compass,
  CreditCard,
  Gem,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const MAIN: NavItem[] = [
  { href: "/home", label: "Home", icon: LayoutDashboard },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/connections", label: "Network", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const EXPLORE: NavItem[] = [
  { href: "/luxury", label: "Marketplace", icon: Gem },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/saved", label: "Saved", icon: Bookmark },
];

const YOU: NavItem[] = [
  { href: "/profile", label: "My profile", icon: User },
  { href: "/account/membership", label: "Membership", icon: CreditCard },
  { href: "/account/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & support", icon: LifeBuoy },
];

/** Which role workspaces the viewer can open. Decided on the server; every page re-checks access. */
export type Workspaces = { business?: boolean; ads?: boolean; admin?: boolean };

function workspaceItems(w: Workspaces): NavItem[] {
  const items: NavItem[] = [];
  if (w.business) items.push({ href: "/business", label: "Business", icon: Building2 });
  if (w.ads) items.push({ href: "/ads", label: "Advertising", icon: Megaphone });
  if (w.admin) items.push({ href: "/admin", label: "Administration", icon: ShieldCheck });
  return items;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ workspaces = {} }: { workspaces?: Workspaces }) {
  return <NavLinks pathname={usePathname()} workspaces={workspaces} />;
}

/** Pure link list; used directly as the static (prerendered) fallback. */
export function NavLinks({ pathname, workspaces = {} }: { pathname: string; workspaces?: Workspaces }) {
  const groups: [string, NavItem[]][] = [
    ["Main", MAIN],
    ["Explore", EXPLORE],
    ["Workspaces", workspaceItems(workspaces)],
    ["You", YOU],
  ];
  return (
    <nav aria-label="App" className="space-y-5">
      <SearchBox />
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <div key={title}>
            <p className="px-3 pb-1.5 text-[11px] font-medium tracking-[0.18em] text-muted/80 uppercase">{title}</p>
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                      "aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-fg",
                      "before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent before:opacity-0 aria-[current=page]:before:opacity-100",
                    )}
                  >
                    <Icon className="size-[17px] shrink-0 transition-colors group-aria-[current=page]:text-accent" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </nav>
  );
}

/** Global search across members, posts, listings and events. Plain GET form: works without JS. */
export function SearchBox({ className }: { className?: string }) {
  return (
    <form action="/search" role="search" className={cn("relative", className)}>
      <label htmlFor="global-search" className="sr-only">
        Search ELVORA
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id="global-search"
        name="q"
        type="search"
        placeholder="Search people, posts, listings"
        maxLength={80}
        className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-muted/80 focus:border-accent focus:outline-none"
      />
    </form>
  );
}

const TABS: NavItem[] = MAIN.filter((i) => ["/home", "/discover", "/messages", "/notifications"].includes(i.href));

export function MobileTabBar({ workspaces = {} }: { workspaces?: Workspaces }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="App shortcuts" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
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
              <div
                className="max-h-[70vh] overflow-y-auto"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setOpen(false);
                }}
              >
                <NavLinks pathname={pathname} workspaces={workspaces} />
              </div>
            </DialogContent>
          </Dialog>
        </li>
      </ul>
    </nav>
  );
}
