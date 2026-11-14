"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import type { Page } from "@/lib/pagination";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { MemberCard } from "./member-card";

export function MemberGrid({ initial, query }: { initial: Page<ProfileSummary>; query: Record<string, string> }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api<Page<ProfileSummary>>(`/api/v1/members?${new URLSearchParams({ ...query, cursor })}`);
      setItems((prev) => [...prev, ...page.items.filter((m) => !prev.some((p) => p.id === m.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => (
          <li key={m.id}>
            <MemberCard member={m} />
          </li>
        ))}
      </ul>
      {error ? <Alert tone="error" action={<Button size="sm" variant="outline" onClick={loadMore}>Retry</Button>}>{error}</Alert> : null}
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
