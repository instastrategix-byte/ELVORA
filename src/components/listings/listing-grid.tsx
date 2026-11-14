"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import type { Page } from "@/lib/pagination";
import type { ListingCard as ListingCardData } from "@backend/modules/listings/types";
import { ListingCard } from "./listing-card";

/** Server-rendered first page + bounded "load more" pages from the API. */
export function ListingGrid({
  initial,
  query,
  canSave,
}: {
  initial: Page<ListingCardData>;
  query: Record<string, string>;
  canSave: boolean;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ...query, cursor });
      const page = await api<Page<ListingCardData>>(`/api/v1/listings?${params}`);
      setItems((prev) => [...prev, ...page.items.filter((i) => !prev.some((p) => p.id === i.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((l) => (
          <li key={l.id}>
            <ListingCard listing={l} canSave={canSave} />
          </li>
        ))}
      </ul>
      {error ? <Alert tone="error" title="Couldn't load more" action={<Button size="sm" variant="outline" onClick={loadMore}>Retry</Button>}>{error}</Alert> : null}
      {cursor && !error ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
