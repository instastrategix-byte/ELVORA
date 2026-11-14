import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/auth-forms";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl">Welcome back</h1>
        <p className="text-sm text-muted">
          New to ELVORA?{" "}
          <Link href="/sign-up" className="text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <div className="space-y-4">
      {error === "link" ? <Alert tone="warning" title="That link is invalid or has expired">Sign in, or request a new link.</Alert> : null}
      {error === "provider" ? <Alert tone="error">Sign-in with your provider was cancelled or failed.</Alert> : null}
      {next ? <Alert tone="info">Please sign in to continue.</Alert> : null}
      <SignInForm next={next} googleEnabled={publicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED} />
    </div>
  );
}
