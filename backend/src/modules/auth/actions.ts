"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@backend/db/server";
import { logger } from "@backend/core/logger";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./schemas";

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

const NOT_CONFIGURED: AuthFormState = {
  status: "error",
  message: "Sign-in is unavailable: the authentication service is not configured for this environment.",
};

function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    logger.info("auth.sign_in_failed", { code: error.code });
    return {
      status: "error",
      message: error.status === 429 ? "Too many attempts. Please wait a moment and try again." : "The email or password is incorrect.",
      values: { email },
    };
  }
  redirect(safeNextPath(parsed.data.next));
}

/** User-facing reason for a failed sign-up. Never reveals whether an account already exists. */
function signUpErrorMessage(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return "We've sent too many confirmation emails recently. Please try again in an hour.";
    case "email_address_not_authorized":
      return "We can't send a confirmation email to this address yet. Please try again later or contact support.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "New sign-ups are closed right now.";
  }
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status !== undefined && status >= 500) return "We couldn't send your confirmation email. Please try again in a few minutes.";
  return "We couldn't create your account. Please check your details and try again.";
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const raw = Object.fromEntries(formData);
  const values = { email: String(raw.email ?? ""), displayName: String(raw.displayName ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const next = parsed.data.invite ? `/apply?invite=${encodeURIComponent(parsed.data.invite)}` : safeNextPath(String(raw.next ?? ""), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next === "/onboarding" ? next : `/onboarding?next=${encodeURIComponent(next)}`)}`),
    },
  });
  if (error) {
    logger.warn("auth.sign_up_failed", { code: error.code, status: error.status });
    if (error.code === "weak_password") return { status: "error", fieldErrors: { password: [error.message] }, values };
    if (error.code === "email_address_invalid") {
      return { status: "error", fieldErrors: { email: ["This email address can't be used. Please use a different one."] }, values };
    }
    return { status: "error", message: signUpErrorMessage(error.code, error.status), values };
  }
  // With email confirmation enabled there is no session until the link is followed.
  if (!data.session) redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  redirect(next === "/onboarding" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`);
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: siteUrl("/auth/callback?next=/reset-password"),
  });
  if (error?.status === 429) return { status: "error", message: "Too many requests. Please wait a few minutes and try again." };
  // Same response whether or not the address is registered (prevents account enumeration).
  return { status: "success", message: "If an account exists for that email, a reset link is on its way. It expires in one hour." };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { status: "error", message: "Your reset link has expired. Request a new one to continue." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      ...(error.code === "weak_password" || error.code === "same_password"
        ? { fieldErrors: { password: [error.message] } }
        : { message: "We couldn't update your password. Please try again." }),
    };
  }
  return { status: "success", message: "Your password has been updated." };
}

export async function resendVerificationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: siteUrl("/auth/callback?next=/onboarding") },
  });
  if (error?.status === 429) return { status: "error", message: "Please wait a minute before requesting another email." };
  return { status: "success", message: "If that address is awaiting verification, we've sent a new link." };
}
