import type { ReactNode } from "react";

export function ContentPage({ eyebrow, title, intro, updated, children }: { eyebrow: string; title: string; intro?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <article className="container-page py-16 sm:py-20">
      <header className="max-w-3xl space-y-4 border-b border-border pb-10">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-5xl sm:text-6xl">{title}</h1>
        {intro ? <p className="text-lg leading-8 text-muted">{intro}</p> : null}
        {updated ? <p className="text-xs text-muted">Last updated {updated}</p> : null}
      </header>
      <div className="prose-elvora mt-10 max-w-3xl">{children}</div>
    </article>
  );
}

export function DraftNotice() {
  return (
    <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-fg">
      This document is a working draft prepared for product development. It must be reviewed and approved by qualified legal counsel before
      ELVORA launches publicly.
    </p>
  );
}
