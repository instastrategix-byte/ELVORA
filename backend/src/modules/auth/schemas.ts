import { z } from "zod";

export const PASSWORD_RULES = "At least 10 characters with upper- and lower-case letters and a number.";

export const passwordSchema = z
  .string()
  .min(10, { error: PASSWORD_RULES })
  .max(72, { error: "Passwords are limited to 72 characters" })
  .regex(/[a-z]/, { error: PASSWORD_RULES })
  .regex(/[A-Z]/, { error: PASSWORD_RULES })
  .regex(/[0-9]/, { error: PASSWORD_RULES });

export const emailSchema = z.email({ error: "Enter a valid email address" }).trim().toLowerCase().max(254);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password" }).max(72),
  next: z.string().max(500).optional(),
});

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, { error: "Enter your name" }).max(80),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal("on", { error: "You must accept the terms to continue" }),
  invite: z.string().trim().max(64).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

/** Passwordless sign-in: step 1 emails a one-time code, step 2 verifies it. */
export const otpRequestSchema = z.object({ email: emailSchema, next: z.string().max(500).optional() });
export const otpVerifySchema = z.object({
  email: emailSchema,
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, { error: "Enter the code from your email" }),
  next: z.string().max(500).optional(),
});

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match", path: ["confirm"] });
