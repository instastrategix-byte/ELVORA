"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Optimistic save toggle; reverts and explains on failure. */
export function SaveListingButton({ listingId, initialSaved }: { listingId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  async function toggle() {
    if (pending) return;
    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      await api(`/api/v1/listings/${listingId}/save`, { method: next ? "POST" : "DELETE" });
      toast.show(next ? "Saved to your collection" : "Removed from saved");
    } catch (error) {
      setSaved(!next);
      toast.show(errorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save listing"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full bg-bg/80 backdrop-blur transition-colors hover:text-accent",
        saved ? "text-accent" : "text-fg",
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </button>
  );
}
