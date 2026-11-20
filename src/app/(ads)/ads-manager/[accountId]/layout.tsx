import { Suspense } from "react";
import { AccountBar } from "@/components/ads-manager/account-bar";
import { loadAdsPage } from "@/app/(ads)/ads-manager/_lib/load";
import { AdsMobileNav } from "@/components/ads-manager/nav";
import { Skeleton } from "@/components/ui/primitives";

export default function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ accountId: string }> }) {
  return (
    <>
      <Suspense fallback={<Skeleton className="mb-6 h-14 rounded-2xl" />}>
        <AccountHeader params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <AdsMobileNav />
      </Suspense>
      {children}
    </>
  );
}

async function AccountHeader({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { account, accounts } = await loadAdsPage(accountId);
  return <AccountBar account={account} accounts={accounts} />;
}
