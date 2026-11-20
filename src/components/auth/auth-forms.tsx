"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import {
  forgotPasswordAction,
  requestOtpAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  verifyOtpAction,
  type AuthFormState,
} from "@backend/modules/auth/actions";
import { PASSWORD_RULES } from "@backend/modules/auth/schemas";
import { GoogleButton } from "./google-button";
import { ResendButton } from "./resend-countdown";

const initial: AuthFormState = { status: "idle" };

function FormAlert({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

export function SignInForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const [method, setMethod] = useState<"password" | "code">("password");
  return (
    <div className="space-y-5">
      {googleEnabled ? <GoogleButton next={next} /> : null}
      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1 text-sm">
        {(
          [
            ["password", "Password"],
            ["code", "Email code"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            onClick={() => setMethod(value)}
            className="rounded-full px-3 py-2 text-muted transition-colors aria-selected:bg-gold aria-selected:font-medium aria-selected:text-accent-fg"
          >
            {label}
          </button>
        ))}
      </div>
      {method === "password" ? <PasswordSignIn next={next} /> : <CodeSignIn next={next} />}
    </div>
  );
}

function PasswordSignIn({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <div role="tabpanel">
      <form action={action} className="space-y-4" noValidate>
        <FormAlert state={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="email" label="Email" error={state.fieldErrors?.email}>
          {(aria) => <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} {...aria} />}
        </Field>
        <Field id="password" label="Password" error={state.fieldErrors?.password}>
          {(aria) => <Input name="password" type="password" autoComplete="current-password" required {...aria} />}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

/** Passwordless: request a one-time code by email, then enter it. */
function CodeSignIn({ next }: { next?: string }) {
  const [requested, request, requesting] = useActionState(requestOtpAction, initial);
  const [verified, verify, verifying] = useActionState(verifyOtpAction, initial);
  // Stays on the code step once a code was sent, even if a later resend is refused for waiting.
  const [sentTo, setSentTo] = useState<string | undefined>();
  const successEmail = requested.status === "success" ? requested.values?.email : undefined;
  if (successEmail && successEmail !== sentTo) setSentTo(successEmail);

  if (!sentTo) {
    return (
      <form role="tabpanel" action={request} className="space-y-4" noValidate>
        <FormAlert state={requested} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="otp-email" label="Email" error={requested.fieldErrors?.email} hint="We'll email you a one-time code — no password needed.">
          {(aria) => <Input name="email" type="email" autoComplete="email" required defaultValue={requested.values?.email} {...aria} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={requesting}>
          {requesting ? "Sending code…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <div role="tabpanel" className="space-y-4">
      <FormAlert state={requested} />
      <form action={verify} className="space-y-4" noValidate>
        <input type="hidden" name="email" value={sentTo} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="otp-token" label={`Code sent to ${sentTo}`} error={verified.fieldErrors?.token}>
          {(aria) => (
            <Input
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              autoFocus
              className="text-center font-mono text-2xl tracking-[0.5em]"
              {...aria}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={verifying}>
          {verifying ? "Verifying…" : "Sign in"}
        </Button>
      </form>
      <form action={request} className="text-center">
        <input type="hidden" name="email" value={sentTo} />
        <input type="hidden" name="next" value={next ?? ""} />
        <ResendButton
          variant="ghost"
          size="sm"
          className="w-full"
          retryAt={requested.retryAt}
          sent={requested.sent}
          pending={requesting}
          label="Send a new code"
        />
      </form>
    </div>
  );
}

export function SignUpForm({ invite, next, googleEnabled }: { invite?: string; next?: string; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(signUpAction, initial);
  const [showRules, setShowRules] = useState(false);
  return (
    <div className="space-y-5">
      {googleEnabled ? <GoogleButton next="/onboarding" /> : null}
      <form action={action} className="space-y-4" noValidate>
        <FormAlert state={state} />
        {invite ? <input type="hidden" name="invite" value={invite} /> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field id="displayName" label="Full name" error={state.fieldErrors?.displayName}>
          {(aria) => <Input name="displayName" autoComplete="name" required maxLength={80} defaultValue={state.values?.displayName} {...aria} />}
        </Field>
        <Field id="email" label="Email" error={state.fieldErrors?.email} hint="We'll send a link to verify this address.">
          {(aria) => <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} {...aria} />}
        </Field>
        <Field id="password" label="Password" error={state.fieldErrors?.password} hint={showRules ? PASSWORD_RULES : undefined}>
          {(aria) => <Input name="password" type="password" autoComplete="new-password" required onFocus={() => setShowRules(true)} {...aria} />}
        </Field>
        <div className="space-y-1">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="acceptTerms" required className="mt-0.5" aria-invalid={Boolean(state.fieldErrors?.acceptTerms)} />
            <span className="text-muted">
              I agree to the{" "}
              <Link href="/terms" className="text-accent hover:underline" target="_blank">
                terms
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-accent hover:underline" target="_blank">
                privacy policy
              </Link>{" "}
              and{" "}
              <Link href="/community-guidelines" className="text-accent hover:underline" target="_blank">
                community guidelines
              </Link>
              .
            </span>
          </label>
          {state.fieldErrors?.acceptTerms ? (
            <p className="text-xs text-danger" role="alert">
              {state.fieldErrors.acceptTerms[0]}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        {(aria) => <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} {...aria} />}
      </Field>
      <ResendButton
        size="lg"
        className="w-full"
        retryAt={state.retryAt}
        sent={state.sent}
        pending={pending}
        label={state.retryAt ? "Send another link" : "Send reset link"}
      />
    </form>
  );
}

export function ResetPasswordForm({ mode = "reset" }: { mode?: "reset" | "change" }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  if (state.status === "success" && mode === "change") {
    return <Alert tone="success">Your password has been changed. Use it the next time you sign in.</Alert>;
  }
  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/home">Continue</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormAlert state={state} />
      {mode === "reset" && state.message?.includes("expired") ? (
        <Link href="/forgot-password" className="text-sm text-accent hover:underline">
          Request a new link
        </Link>
      ) : null}
      <Field id="password" label="New password" error={state.fieldErrors?.password} hint={PASSWORD_RULES}>
        {(aria) => <Input name="password" type="password" autoComplete="new-password" required {...aria} />}
      </Field>
      <Field id="confirm" label="Confirm new password" error={state.fieldErrors?.confirm}>
        {(aria) => <Input name="confirm" type="password" autoComplete="new-password" required {...aria} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

/** `retryAt` (epoch ms) carries the wait left from the sign-up email so the countdown starts at once. */
export function ResendVerificationForm({ email, retryAt }: { email?: string; retryAt?: number }) {
  const [state, action, pending] = useActionState(resendVerificationAction, { status: "idle", retryAt } as AuthFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormAlert state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        {(aria) => <Input name="email" type="email" required defaultValue={state.values?.email ?? email} {...aria} />}
      </Field>
      <ResendButton variant="outline" className="w-full" retryAt={state.retryAt} sent={state.sent} pending={pending} label="Resend verification email" />
    </form>
  );
}
