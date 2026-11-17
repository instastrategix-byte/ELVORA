import { Suspense } from "react";
import { AppSidebar, MobileTabBar, NavLinks, type Workspaces } from "@/components/layout/app-nav";
import { SiteHeader } from "@/components/layout/site-header";
import { hasFeature, isStaff, type Viewer } from "@backend/modules/auth/permissions";
import { getViewer } from "@backend/auth/viewer";

/**
 * Authenticated shell. Navigation prerenders as static links; the active state and the role
 * workspaces stream in. Every page re-checks the session itself — the layout is not an
 * authorization boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="container-page flex gap-8 py-6 lg:py-8">
        <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-56 shrink-0 self-start overflow-y-auto pb-6 lg:block">
          <Suspense fallback={<NavLinks pathname="" />}>
            <RoleAwareSidebar />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <RoleAwareTabBar />
      </Suspense>
    </>
  );
}

function workspacesFor(viewer: Viewer | null): Workspaces {
  return {
    business: Boolean(viewer && (viewer.hasApprovedBusiness || hasFeature(viewer, "business.manage"))),
    ads: hasFeature(viewer, "ads.manage"),
    admin: isStaff(viewer),
  };
}

async function RoleAwareSidebar() {
  const viewer = await getViewer().catch(() => null);
  return <AppSidebar workspaces={workspacesFor(viewer)} />;
}

async function RoleAwareTabBar() {
  const viewer = await getViewer().catch(() => null);
  return <MobileTabBar workspaces={workspacesFor(viewer)} />;
}
