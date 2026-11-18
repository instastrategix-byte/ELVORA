"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { threadSchema } from "@backend/modules/communities/schemas";

/** Collapsed prompt that expands into the new-discussion form. */
export function ThreadComposer({ communityId, slug }: { communityId: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction((body: unknown) => api<{ id: string }>(`/api/v1/communities/${communityId}/threads`, { method: "POST", body }));
  const router = useRouter();
  const toast = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = threadSchema.safeParse({ title: String(f.get("title") ?? ""), body: String(f.get("body") ?? "") });
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    const r = await action.run(parsed.data);
    if (!r) return;
    toast.show("Discussion started");
    router.push(`/communities/${slug}/threads/${r.id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="panel w-full px-5 py-4 text-left text-sm text-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        Start a discussion…
      </button>
    );
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="panel space-y-4 p-5" noValidate aria-label="Start a discussion">
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <fieldset disabled={action.pending} className="space-y-4">
        <Field id="t-title" label="Title" required error={fe.title}>
          {(a) => <Input name="title" maxLength={160} autoFocus {...a} />}
        </Field>
        <Field id="t-body" label="What would you like to discuss?" required error={fe.body}>
          {(a) => <Textarea name="body" maxLength={5000} className="min-h-32" {...a} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit">{action.pending ? "Posting…" : "Post discussion"}</Button>
        </div>
      </fieldset>
    </form>
  );
}
