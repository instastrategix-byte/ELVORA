import { Suspense } from "react";
import { AppSidebar, MobileTabBar, NavLinks } from "@/components/layout/app-nav";
import { SiteHeader } from "@/components/layout/site-header";
import { isStaff } from "@backend/modules/auth/permissions";
import { getViewer } from "@backend/auth/viewer";

/**
 * Authenticated shell. Navigation prerenders as static links; the active state and the staff
 * entry stream in. Every page re-checks the session itself — the layout is not an
 * authorization boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="container-page flex gap-8 py-6 lg:py-8">
        <aside className="sticky top-24 hidden w-56 shrink-0 self-start lg:block">
          <Suspense fallback={<NavLinks pathname="" />}>
            <StaffAwareSidebar />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
    </>
  );
}

async function StaffAwareSidebar() {
  const viewer = await getViewer().catch(() => null);
  return <AppSidebar showAdmin={isStaff(viewer)} />;
}
