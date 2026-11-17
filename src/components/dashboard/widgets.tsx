import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Titled dashboard panel with an optional "view all" link. */
export function Widget({
  title,
  href,
  hrefLabel = "View all",
  children,
  className,
  id,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ?? `w-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className={cn("panel p-5 sm:p-6", className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-sm font-semibold tracking-wide">
          {title}
        </h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent">
            {hrefLabel} <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function WidgetSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("panel space-y-4 p-6", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact metric. `hint` is secondary context (e.g. "+3 this month"). */
export function Stat({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className="display mt-1 text-3xl tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-accent">{hint}</p> : <p className="mt-1 text-xs text-transparent select-none">.</p>}
    </>
  );
  return href ? (
    <Link href={href} className="panel-interactive block p-4">
      {body}
    </Link>
  ) : (
    <div className="panel p-4">{body}</div>
  );
}

export function StatsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel space-y-2 p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Thin progress bar with an accessible value. */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Inline unavailable state for a single widget, so one failing query never blanks the page. */
export function WidgetError({ what }: { what: string }) {
  return <p className="text-sm text-muted">We couldn&apos;t load {what} right now. Refresh to try again.</p>;
}
