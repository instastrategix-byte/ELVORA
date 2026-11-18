"use client";

import { FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { CollectionItemType, CollectionSummary } from "@backend/modules/collections/service";

function NameDialog({
  trigger,
  title,
  initial = "",
  submitLabel,
  onSubmit,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setName(initial);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title}>
        <form onSubmit={submit} className="space-y-4">
          <Field id="collection-name" label="Name" required>
            {(aria) => <Input {...aria} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />}
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCollectionButton() {
  const router = useRouter();
  return (
    <NameDialog
      title="New collection"
      submitLabel="Create"
      trigger={
        <Button variant="outline" size="sm">
          <FolderPlus /> New collection
        </Button>
      }
      onSubmit={async (name) => {
        const created = await api<CollectionSummary>("/api/v1/collections", { method: "POST", body: { name } });
        router.push(`/saved/${created.id}`);
      }}
    />
  );
}

export function CollectionManageButtons({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete “${name}”? The saved items themselves aren't affected.`)) return;
    setDeleting(true);
    try {
      await api(`/api/v1/collections/${id}`, { method: "DELETE" });
      toast.show("Collection deleted");
      router.push("/saved");
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setDeleting(false);
    }
  }

  return (
    <div className="flex gap-2">
      <NameDialog
        title="Rename collection"
        initial={name}
        submitLabel="Save"
        trigger={
          <Button variant="outline" size="sm">
            <Pencil /> Rename
          </Button>
        }
        onSubmit={async (next) => {
          await api(`/api/v1/collections/${id}`, { method: "PATCH", body: { name: next } });
          toast.show("Collection renamed");
          router.refresh();
        }}
      />
      <Button variant="ghost" size="sm" onClick={remove} disabled={deleting} className="text-danger">
        <Trash2 /> Delete
      </Button>
    </div>
  );
}

export function RemoveFromCollectionButton({ collectionId, itemType, itemId }: { collectionId: string; itemType: CollectionItemType; itemId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/v1/collections/${collectionId}/items`, { method: "DELETE", body: { itemType, itemId } });
          toast.show("Removed from collection");
          router.refresh();
        } catch (e) {
          toast.show(errorMessage(e), "error");
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
    >
      <X className="size-3.5" aria-hidden="true" /> Remove from collection
    </button>
  );
}
