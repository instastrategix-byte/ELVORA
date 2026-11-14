"use client";

import { ErrorView } from "@/components/feedback/error-view";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page">
      <ErrorView reset={reset} digest={error.digest} />
    </div>
  );
}
