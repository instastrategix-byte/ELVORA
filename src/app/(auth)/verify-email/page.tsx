import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResendVerificationForm } from "@/components/auth/auth-forms";
import { Skeleton } from "@/components/ui/primitives";
import { resendRetryAt } from "@backend/modules/auth/resend-limit";

export const metadata: Metadata = { title: "Verify your email" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <MailCheck className="size-8 text-accent" aria-hidden="true" />
        <h1 className="display text-4xl">Check your inbox</h1>
        <p className="text-sm text-muted">
          We&apos;ve sent a verification link. Open it on this device to activate your account. The link expires in one hour.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Resend searchParams={searchParams} />
      </Suspense>
      <Link href="/sign-in" className="block text-sm text-accent hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

async function Resend({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  // Wait left from the sign-up email (or earlier resends) in this browser, so the countdown starts at once.
  const retryAt = email ? await resendRetryAt("verify", email) : undefined;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-4 text-sm text-muted">Didn&apos;t receive it? Check spam, or request another link.</p>
      <ResendVerificationForm email={email} retryAt={retryAt} />
    </div>
  );
}
