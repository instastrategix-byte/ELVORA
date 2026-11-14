import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl">Reset your password</h1>
        <p className="text-sm text-muted">Enter your account email and we&apos;ll send a secure reset link.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/sign-in" className="block text-sm text-accent hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
