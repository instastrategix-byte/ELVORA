"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { COMMUNITY_CATEGORIES, communitySchema, communityUpdateSchema } from "@backend/modules/communities/schemas";
import type { CommunityDetail } from "@backend/modules/communities/types";

export function CommunityForm({ community }: { community?: CommunityDetail }) {
  const [coverPath, setCoverPath] = useState<string | null>(community?.coverPath ?? null);
  const action = useAction((body: unknown) =>
    community
      ? api(`/api/v1/communities/${community.id}`, { method: "PATCH", body }).then(() => ({ slug: community.slug }))
      : api<{ id: string; slug: string }>("/api/v1/communities", { method: "POST", body }),
  );
  const router = useRouter();
  const toast = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      name: String(f.get("name") ?? ""),
      ...(community ? {} : { slug: String(f.get("slug") ?? "") }),
      description: String(f.get("description") ?? ""),
      category: String(f.get("category") ?? "") || null,
      visibility: String(f.get("visibility") ?? "open"),
      coverPath,
    };
    const parsed = (community ? communityUpdateSchema : communitySchema).safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const result = await action.run(parsed.data);
    if (!result) return;
    toast.show(community ? "Community saved" : "Community created");
    router.push(`/communities/${result.slug}`);
    router.refresh();
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <fieldset disabled={action.pending} className="space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <Field id="c-name" label="Name" required error={fe.name} className="sm:col-span-2">
            {(a) => <Input name="name" defaultValue={community?.name} maxLength={80} {...a} />}
          </Field>
          {!community ? (
            <Field id="c-slug" label="Address" error={fe.slug} hint="Optional. Leave blank to create one from the name." className="sm:col-span-2">
              {(a) => <Input name="slug" placeholder="founders-in-dubai" maxLength={60} {...a} />}
            </Field>
          ) : null}
          <Field id="c-description" label="About" error={fe.description} hint="Who it is for and what members discuss." className="sm:col-span-2">
            {(a) => <Textarea name="description" defaultValue={community?.description ?? ""} maxLength={2000} {...a} />}
          </Field>
          <Field id="c-category" label="Category" error={fe.category}>
            {(a) => (
              <Select name="category" defaultValue={community?.category ?? ""} {...a}>
                <option value="">No category</option>
                {COMMUNITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="c-visibility" label="Who can read" error={fe.visibility}>
            {(a) => (
              <Select name="visibility" defaultValue={community?.visibility ?? "open"} {...a}>
                <option value="open">Open: any member can read and join</option>
                <option value="private">Private: moderators approve members</option>
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <ImageUpload purpose="cover" label="Cover image" currentUrl={community?.coverUrl ?? null} onChange={setCoverPath} />
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit">{action.pending ? "Saving…" : community ? "Save changes" : "Create community"}</Button>
        </div>
      </fieldset>
    </form>
  );
}
