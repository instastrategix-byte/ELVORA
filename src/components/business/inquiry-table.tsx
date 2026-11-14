"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/membership/status-badge";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { InquiryView } from "@backend/modules/listings/types";

export function InquiryTable({ inquiries, mode }: { inquiries: InquiryView[]; mode: "received" | "sent" }) {
  const [items, setItems] = useState(inquiries);
  const toast = useToast();

  async function setStatus(id: string, status: InquiryView["status"]) {
    const previous = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await api(`/api/v1/inquiries/${id}`, { method: "PATCH", body: { status } });
    } catch (e) {
      setItems(previous);
      toast.show(errorMessage(e), "error");
    }
  }

  if (!items.length) {
    return (
      <EmptyState
        title={mode === "received" ? "No inquiries yet" : "You haven't sent any inquiries"}
        description={mode === "received" ? "Inquiries from members appear here." : "Inquiries you send from listings appear here."}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link href={`/luxury/${i.listingSlug}`} className="font-medium hover:text-accent">
                {i.listingTitle}
              </Link>
              <p className="text-sm text-muted">
                {mode === "received" ? (
                  <>
                    From{" "}
                    {i.senderHandle ? (
                      <Link href={`/members/${i.senderHandle}`} className="text-accent hover:underline">
                        {i.senderName}
                      </Link>
                    ) : (
                      i.senderName
                    )}{" "}
                    ·{" "}
                  </>
                ) : null}
                {formatDate(i.createdAt)}
                {i.preferredDates ? ` · ${i.preferredDates}` : ""}
                {i.partySize ? ` · ${i.partySize} guests` : ""}
              </p>
            </div>
            {mode === "received" ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Status</span>
                <Select value={i.status} onChange={(e) => setStatus(i.id, e.target.value as InquiryView["status"])} className="h-9 w-36">
                  <option value="new">New</option>
                  <option value="responded">Responded</option>
                  <option value="closed">Closed</option>
                </Select>
              </label>
            ) : (
              <StatusBadge status={i.status} />
            )}
          </div>
          <p className="mt-3 text-sm whitespace-pre-line">{i.message}</p>
        </li>
      ))}
    </ul>
  );
}
