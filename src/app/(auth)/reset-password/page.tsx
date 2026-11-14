import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl">Choose a new password</h1>
        <p className="text-sm text-muted">You arrived here from a reset link. Choose a password you don&apos;t use elsewhere.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
