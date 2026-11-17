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
import { profileUpdateSchema } from "@backend/modules/profiles/schemas";
import { MEMBER_TYPES, MEMBER_TYPE_LABELS, OPEN_TO, OPEN_TO_LABELS, type MemberType } from "@backend/modules/profiles/types";

/** Splits a comma- or newline-separated list into trimmed, non-empty entries. */
function splitList(value: string, max: number): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

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
  memberType: MemberType | null;
  skills: string[];
  openTo: string[];
  achievements: string[];
  linkedinUrl: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
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
      interests: splitList(text("interests"), 20),
      memberType: text("memberType"),
      skills: splitList(text("skills"), 30),
      achievements: text("achievements")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
      openTo: f.getAll("openTo").map(String),
      linkedinUrl: text("linkedinUrl"),
      xUrl: text("xUrl"),
      instagramUrl: text("instagramUrl"),
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
        <Field id="memberType" label="I am a…" error={fe.memberType} hint="Shown on your profile and used to suggest relevant members.">
          {(a) => (
            <Select name="memberType" defaultValue={initial.memberType ?? ""} {...a}>
              <option value="">Prefer not to say</option>
              {MEMBER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEMBER_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
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
        <Field id="skills" label="Skills and expertise" error={fe.skills} hint="Comma-separated, up to 30." className="sm:col-span-2">
          {(a) => <Input name="skills" defaultValue={initial.skills.join(", ")} placeholder="Private equity, Brand strategy, Hospitality" {...a} />}
        </Field>
        <Field id="achievements" label="Achievements" error={fe.achievements} hint="One per line, up to 10." className="sm:col-span-2">
          {(a) => <Textarea name="achievements" defaultValue={initial.achievements.join("\n")} rows={4} {...a} />}
        </Field>
        <Field id="interests" label="Interests" error={fe.interests} hint="Comma-separated, up to 20. Used for discovery and relevant sponsored content." className="sm:col-span-2">
          {(a) => <Input name="interests" defaultValue={initial.interests.join(", ")} {...a} />}
        </Field>
      </Card>
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="display text-2xl">Open to</h2>
          <p className="mt-1 text-sm text-muted">Let members know which conversations you welcome. Shown on your profile.</p>
        </div>
        <fieldset>
          <legend className="sr-only">Open to</legend>
          <div className="flex flex-wrap gap-2">
            {OPEN_TO.map((value) => (
              <label key={value} className="cursor-pointer">
                <input type="checkbox" name="openTo" value={value} defaultChecked={initial.openTo.includes(value)} className="peer sr-only" />
                <span className="inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-sm text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-ring hover:border-border-strong">
                  {OPEN_TO_LABELS[value]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {fe.openTo ? <p className="text-xs text-danger" role="alert">{fe.openTo[0]}</p> : null}
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-3">
        <h2 className="display text-2xl sm:col-span-3">Social links</h2>
        <Field id="linkedinUrl" label="LinkedIn" error={fe.linkedinUrl}>
          {(a) => <Input name="linkedinUrl" type="url" defaultValue={initial.linkedinUrl ?? ""} placeholder="https://linkedin.com/in/…" {...a} />}
        </Field>
        <Field id="xUrl" label="X" error={fe.xUrl}>
          {(a) => <Input name="xUrl" type="url" defaultValue={initial.xUrl ?? ""} placeholder="https://x.com/…" {...a} />}
        </Field>
        <Field id="instagramUrl" label="Instagram" error={fe.instagramUrl}>
          {(a) => <Input name="instagramUrl" type="url" defaultValue={initial.instagramUrl ?? ""} placeholder="https://instagram.com/…" {...a} />}
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
