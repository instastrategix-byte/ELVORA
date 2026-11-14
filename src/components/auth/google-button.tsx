"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

/** Real Supabase OAuth. Only rendered when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true. */
export function GoogleButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || "/feed")}`;
    const { error: err } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (err) {
      setError("Google sign-in is unavailable right now. Please use email instead.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button variant="outline" size="lg" className="w-full" onClick={signIn} disabled={pending}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.34ZM12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.5c-.9.6-2.05.95-3.4.95-2.6 0-4.82-1.76-5.6-4.13H3.06v2.58A10 10 0 0 0 12 22Zm-5.6-8.11a6 6 0 0 1 0-3.78V7.53H3.06a10 10 0 0 0 0 8.94L6.4 13.9ZM12 5.98c1.47 0 2.8.5 3.84 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.53L6.4 10.1C7.18 7.74 9.4 5.98 12 5.98Z" />
        </svg>
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
      <p className="text-center text-xs text-muted">or use your email</p>
    </div>
  );
}
