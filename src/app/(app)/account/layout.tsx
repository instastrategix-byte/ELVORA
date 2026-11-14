import { AccountTabs } from "@/components/account/account-tabs";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl">
      <h1 className="display mb-6 text-4xl sm:text-5xl">Account</h1>
      <AccountTabs />
      <div className="mt-8">{children}</div>
    </div>
  );
}
