import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { Logo } from "./logo";
import { HeaderSession } from "./header-session";
import { MobileMenu } from "./mobile-menu";
import { ThemeToggle } from "./theme-toggle";

export const PUBLIC_NAV = [
  { href: "/discover", label: "Discover" },
  { href: "/luxury", label: "Luxury" },
  { href: "/membership", label: "Membership" },
  { href: "/advertise", label: "Advertise" },
  { href: "/about", label: "About" },
];

/** Static shell; the session-dependent actions stream in behind Suspense. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl backdrop-saturate-150 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/30 after:to-transparent">
      <div className="container-page flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:text-fg">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeToggle />
          <Suspense
            fallback={
              <div className="flex items-center gap-2" aria-hidden="true">
                <Skeleton className="h-9 w-20 rounded-full" />
              </div>
            }
          >
            <HeaderSession />
          </Suspense>
          <Suspense fallback={<span className="size-10 md:hidden" aria-hidden="true" />}>
            <MobileMenu items={PUBLIC_NAV} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
