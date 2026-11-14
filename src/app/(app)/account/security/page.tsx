import type { Metadata } from "next";
import { DeletionRequest, SignOutOthersButton } from "@/components/account/settings-forms";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card } from "@/components/ui/primitives";
import { getMembershipOverview } from "@backend/modules/membership/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const { viewer, db } = await requirePageSession({ next: "/account/security" });
  let pendingDeletion = false;
  try {
    pendingDeletion = (await getMembershipOverview(db, viewer)).pendingDeletion;
  } catch (error) {
    return <ServiceNotice error={error} what="your security settings" />;
  }
  return (
    <div className="space-y-6">
      <Card className="space-y-2 p-6">
        <h2 className="display text-2xl">Sign-in</h2>
        <p className="text-sm text-muted">Signed in as {viewer.email ?? "your account email"}.</p>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="display text-2xl">Change password</h2>
        <ResetPasswordForm mode="change" />
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="display text-2xl">Sessions</h2>
        <p className="text-sm text-muted">Signed in somewhere you don&apos;t recognise? Sign out everywhere except this device, then change your password.</p>
        <SignOutOthersButton />
      </Card>
      <Card className="space-y-4 border-danger/30 p-6">
        <h2 className="display text-2xl">Delete account</h2>
        <p className="text-sm text-muted">
          We&apos;ll remove your profile, posts and messages after a short review period. Records we must keep by law (such as payment receipts) are
          retained for the required period.
        </p>
        <DeletionRequest pending={pendingDeletion} />
      </Card>
    </div>
  );
}
