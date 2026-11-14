"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { profileUpdateSchema } from "@backend/modules/profiles/schemas";

export type ProfileFormValues = {
  handle: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  jobTitle: string | null;
  company: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  interests: string[];
  avatarUrl: string | null;
  coverUrl: string | null;
};

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const [avatarPath, setAvatarPath] = useState<string | null | undefined>(undefined);
  const [coverPath, setCoverPath] = useState<string | null | undefined>(undefined);
  const action = useAction((body: unknown) => api("/api/v1/profile", { method: "PATCH", body }));
  const router = useRouter();
  const toast = useToast();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    const input = {
      handle: text("handle"),
      displayName: text("displayName"),
      headline: text("headline"),
      bio: text("bio"),
      jobTitle: text("jobTitle"),
      company: text("company"),
      industry: text("industry"),
      location: text("location"),
      website: text("website"),
      interests: text("interests")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20),
      ...(avatarPath !== undefined ? { avatarPath } : {}),
      ...(coverPath !== undefined ? { coverPath } : {}),
    };
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const ok = await action.run(input);
    if (ok !== undefined) {
      toast.show("Profile saved");
      router.push(`/members/${parsed.data.handle ?? initial.handle}`);
      router.refresh();
    }
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Card className="space-y-6 p-6">
        <h2 className="display text-2xl">Photos</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload purpose="avatar" label="Profile photo" currentUrl={initial.avatarUrl} onChange={setAvatarPath} shape="circle" />
          <ImageUpload purpose="cover" label="Cover image" currentUrl={initial.coverUrl} onChange={setCoverPath} />
        </div>
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <h2 className="display text-2xl sm:col-span-2">Identity</h2>
        <Field id="displayName" label="Name" required error={fe.displayName}>
          {(a) => <Input name="displayName" defaultValue={initial.displayName} maxLength={80} {...a} />}
        </Field>
        <Field id="handle" label="Handle" required error={fe.handle} hint="Changing your handle changes your profile address.">
          {(a) => <Input name="handle" defaultValue={initial.handle} maxLength={30} autoCapitalize="none" {...a} />}
        </Field>
        <Field id="headline" label="Headline" error={fe.headline} className="sm:col-span-2">
          {(a) => <Input name="headline" defaultValue={initial.headline ?? ""} maxLength={120} {...a} />}
        </Field>
        <Field id="bio" label="Biography" error={fe.bio} className="sm:col-span-2">
          {(a) => <Textarea name="bio" defaultValue={initial.bio ?? ""} maxLength={1000} rows={5} {...a} />}
        </Field>
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <h2 className="display text-2xl sm:col-span-2">Professional</h2>
        <Field id="jobTitle" label="Title" error={fe.jobTitle}>
          {(a) => <Input name="jobTitle" defaultValue={initial.jobTitle ?? ""} maxLength={80} {...a} />}
        </Field>
        <Field id="company" label="Company" error={fe.company}>
          {(a) => <Input name="company" defaultValue={initial.company ?? ""} maxLength={80} {...a} />}
        </Field>
        <Field id="industry" label="Industry" error={fe.industry}>
          {(a) => <Input name="industry" defaultValue={initial.industry ?? ""} maxLength={60} {...a} />}
        </Field>
        <Field id="location" label="Location" error={fe.location}>
          {(a) => <Input name="location" defaultValue={initial.location ?? ""} maxLength={120} {...a} />}
        </Field>
        <Field id="website" label="Website" error={fe.website} hint="Must start with https://" className="sm:col-span-2">
          {(a) => <Input name="website" type="url" defaultValue={initial.website ?? ""} placeholder="https://" {...a} />}
        </Field>
        <Field id="interests" label="Interests" error={fe.interests} hint="Comma-separated, up to 20. Used for discovery and relevant sponsored content." className="sm:col-span-2">
          {(a) => <Input name="interests" defaultValue={initial.interests.join(", ")} {...a} />}
        </Field>
      </Card>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
