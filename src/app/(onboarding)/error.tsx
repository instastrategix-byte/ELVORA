"use client";

import { ErrorView } from "@/components/feedback/error-view";

/** Keeps this section's layout (header and navigation) when a page fails, instead of the full-page fallback. */
export default function SectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView reset={reset} digest={error.digest} />;
}
