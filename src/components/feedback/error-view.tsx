"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ErrorView({ reset, digest }: { reset: () => void; digest?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-4xl">We couldn&apos;t load this page.</h1>
      <p className="max-w-md text-sm text-muted">This is usually temporary. Your data is safe — please try again.</p>
      <div className="flex gap-3">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
      {digest ? <p className="text-xs text-muted">Reference: {digest}</p> : null}
    </div>
  );
}
