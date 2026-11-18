"use client";

import { FolderPlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { CollectionItemType, CollectionSummary } from "@backend/modules/collections/service";

/**
 * Dialog for filing a saved post or listing into private collections. Each checkbox adds or
 * removes the item immediately; a new collection can be created inline.
 */
export function CollectionPicker({
  itemType,
  itemId,
  open,
  onOpenChange,
}: {
  itemType: CollectionItemType;
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let active = true;
    api<CollectionSummary[]>(`/api/v1/collections?itemType=${itemType}&itemId=${itemId}`)
      .then((c) => active && setCollections(c))
      .catch((e) => active && setLoadError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [open, itemType, itemId]);

  async function toggle(c: CollectionSummary) {
    const add = !c.containsItem;
    setBusy(c.id);
    setCollections((list) => list?.map((x) => (x.id === c.id ? { ...x, containsItem: add, itemCount: x.itemCount + (add ? 1 : -1) } : x)) ?? null);
    try {
      await api(`/api/v1/collections/${c.id}/items`, { method: add ? "POST" : "DELETE", body: { itemType, itemId } });
    } catch (e) {
      setCollections((list) => list?.map((x) => (x.id === c.id ? c : x)) ?? null);
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await api<CollectionSummary>("/api/v1/collections", { method: "POST", body: { name: name.trim() } });
      await api(`/api/v1/collections/${created.id}/items`, { method: "POST", body: { itemType, itemId } });
      setCollections((list) => [{ ...created, itemCount: 1, containsItem: true }, ...(list ?? [])]);
      setName("");
      toast.show(`Added to “${created.name}”`);
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save to collection" description="Collections are private. Only you can see them.">
        {loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : collections === null ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading collections" />
          </div>
        ) : (
          <div className="space-y-4">
            {collections.length === 0 ? (
              <p className="text-sm text-muted">You don&apos;t have any collections yet. Create your first one below.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {collections.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={Boolean(c.containsItem)}
                        disabled={busy === c.id}
                        onChange={() => toggle(c)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <span className="text-xs text-muted tabular-nums">{c.itemCount}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={create} className="flex gap-2 border-t border-border pt-4">
              <label htmlFor={`new-collection-${itemId}`} className="sr-only">
                New collection name
              </label>
              <Input
                id={`new-collection-${itemId}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="New collection, e.g. Monaco 2027"
                className="h-10"
              />
              <Button type="submit" size="sm" disabled={creating || !name.trim()} className="h-10">
                <Plus /> Create
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small "Add to collection" trigger that owns its own picker. */
export function AddToCollectionButton({
  itemType,
  itemId,
  className,
  compact = false,
}: {
  itemType: CollectionItemType;
  itemId: string;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add to collection"
        className={
          className ??
          (compact
            ? "inline-flex size-9 items-center justify-center rounded-full bg-bg/80 text-fg backdrop-blur transition-colors hover:text-accent"
            : "inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg")
        }
      >
        <FolderPlus className="size-4" aria-hidden="true" />
        {compact ? null : "Add to collection"}
      </button>
      {open ? <CollectionPicker itemType={itemType} itemId={itemId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
