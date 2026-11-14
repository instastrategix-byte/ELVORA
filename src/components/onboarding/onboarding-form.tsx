"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { onboardingProfileSchema } from "@backend/modules/membership/schemas";

function suggestHandle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

export function OnboardingForm({ defaultName, next }: { defaultName: string; next?: string }) {
  const [displayName, setDisplayName] = useState(defaultName === "New member" ? "" : defaultName);
  const [handle, setHandle] = useState(() => suggestHandle(defaultName === "New member" ? "" : defaultName));
  const [handleTouched, setHandleTouched] = useState(false);
  const action = useAction((body: unknown) => api("/api/v1/onboarding", { method: "POST", body }));
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = onboardingProfileSchema.safeParse({
      displayName,
      handle,
      headline: String(form.get("headline") ?? "").trim() || undefined,
      location: String(form.get("location") ?? "").trim() || undefined,
    });
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    const ok = await action.run(parsed.data);
    if (ok !== undefined) {
      router.push(`/onboarding/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Field id="ob-name" label="Your name" required error={action.fieldErrors.displayName}>
        {(aria) => (
          <Input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!handleTouched) setHandle(suggestHandle(e.target.value));
            }}
            autoComplete="name"
            maxLength={80}
            {...aria}
          />
        )}
      </Field>
      <Field id="ob-handle" label="Handle" required error={action.fieldErrors.handle} hint={`Your profile address: /members/${handle || "your_handle"}`}>
        {(aria) => (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">@</span>
            <Input
              value={handle}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase());
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={30}
              className="pl-8"
              {...aria}
            />
          </div>
        )}
      </Field>
      <Field id="ob-headline" label="Headline" hint="Optional. e.g. Founder, Atelier Marchetti">
        {(aria) => <Input name="headline" maxLength={120} {...aria} />}
      </Field>
      <Field id="ob-location" label="City" hint="Optional. Helps relevant members and events find you.">
        {(aria) => <Input name="location" maxLength={120} autoComplete="address-level2" {...aria} />}
      </Field>
      <p className="text-xs text-muted">Your profile starts as members-only. You can change this anytime in Settings.</p>
      <Button type="submit" size="lg" className="w-full" disabled={action.pending}>
        {action.pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
