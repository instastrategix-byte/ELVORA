import Link from "next/link";
import { cn } from "@/lib/utils";

/** Typographic wordmark (no third-party marks or licensed artwork). */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-baseline gap-1.5", className)} aria-label="ELVORA home">
      <span className="font-display text-2xl font-semibold tracking-[0.28em] text-fg">ELVORA</span>
      <span className="size-1.5 rounded-full bg-gold shadow-[0_0_10px_var(--glow)] transition-transform group-hover:scale-125" aria-hidden="true" />
    </Link>
  );
}
