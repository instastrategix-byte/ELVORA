"use client";

import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-[#0b0f1a] p-6 text-[#f5f1e8]">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-3xl">ELVORA is temporarily unavailable.</h1>
          <p className="text-sm opacity-80">Please try again in a moment.</p>
          <button type="button" onClick={reset} className="rounded-full bg-[#d4af6a] px-5 py-2 text-sm text-[#14100a]">
            Try again
          </button>
          {error.digest ? <p className="text-xs opacity-60">Reference: {error.digest}</p> : null}
        </div>
      </body>
    </html>
  );
}
