import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/auth-forms";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="display text-4xl">Create your account</h1>
        <p className="text-sm text-muted">
          Already a member?{" "}
          <Link href="/sign-in" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
      <p className="text-xs text-muted">
        We only ask for what we need to create your account. Verification documents are never requested at sign-up.
      </p>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite.slice(0, 64) : undefined;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <div className="space-y-4">
      {invite ? <Alert tone="success" title="Invitation detected">You&apos;ll be able to accept it right after creating your account.</Alert> : null}
      <SignUpForm invite={invite} next={next} googleEnabled={publicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED} />
    </div>
  );
}
