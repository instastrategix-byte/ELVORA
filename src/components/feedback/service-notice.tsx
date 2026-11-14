import { CloudOff } from "lucide-react";
import { Alert } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/env";
import { isAppError } from "@/lib/errors";

/**
 * Shown in place of data when the backing service is not configured or unavailable.
 * Never substitutes fake data.
 */
export function ServiceNotice({ error, what = "this content" }: { error?: unknown; what?: string }) {
  if (!isSupabaseConfigured()) {
    return (
      <Alert tone="warning" title="Data service not configured">
        {process.env.NODE_ENV === "production" ? (
          <>We can&apos;t load {what} right now. Please try again later.</>
        ) : (
          <>
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code> (see
            README → Local setup) to load {what}.
          </>
        )}
      </Alert>
    );
  }
  const message = isAppError(error) && error.status < 500 ? error.message : `We couldn't load ${what}. Please refresh to try again.`;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <CloudOff className="size-6 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
