import { Suspense } from "react";
import { AdsSidebar } from "@/components/ads-manager/nav";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Ads Manager shell — a separate workspace with its own navigation. Static chrome only: every
 * page loads the account through RLS and enforces the member's role itself.
 */
export default function AdsManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader variant="app" />
      <div className="container-page flex gap-8 py-6 lg:py-8">
        <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 self-start overflow-y-auto pb-6 lg:block">
          <Suspense fallback={null}>
            <AdsSidebar />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-16">
          {children}
        </main>
      </div>
    </>
  );
}
