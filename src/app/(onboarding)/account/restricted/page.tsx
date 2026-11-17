import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Account restricted" };

export default async function RestrictedPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect("/sign-in");
  if (session.viewer.accountStatus === "active") redirect("/home");
  return (
    <div className="space-y-6 text-center">
      <ShieldAlert className="mx-auto size-10 text-warning" aria-hidden="true" />
      <h1 className="display text-4xl">Your account is restricted</h1>
      <p className="text-muted">
        Access has been limited following a review under our{" "}
        <Link href="/community-guidelines" className="text-accent hover:underline">
          community guidelines
        </Link>
        . You can still sign out. If you believe this is a mistake, contact support from the email address on your account.
      </p>
    </div>
  );
}
