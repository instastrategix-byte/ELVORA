import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Network",
    links: [
      { href: "/discover", label: "Discover" },
      { href: "/luxury", label: "Luxury marketplace" },
      { href: "/membership", label: "Membership" },
      { href: "/apply", label: "Apply" },
    ],
  },
  {
    title: "Business",
    links: [
      { href: "/advertise", label: "Advertise" },
      { href: "/membership#business", label: "List your business" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/about", label: "About ELVORA" },
      { href: "/community-guidelines", label: "Community guidelines" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">A verified network for distinguished people and the businesses that serve them.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="eyebrow mb-4">{col.title}</h2>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-page flex flex-col gap-2 border-t border-border py-6 text-xs text-muted sm:flex-row sm:justify-between">
        <p>© ELVORA. All rights reserved.</p>
        <p>Membership does not imply verification. Badges reflect independent review.</p>
      </div>
    </footer>
  );
}
