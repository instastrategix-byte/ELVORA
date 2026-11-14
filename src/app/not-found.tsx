import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <p className="eyebrow">404</p>
      <h1 className="display text-5xl">This page is private or doesn&apos;t exist.</h1>
      <p className="max-w-md text-muted">Some profiles, posts and listings are visible only to certain members. If you followed a link, you may need to sign in.</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
