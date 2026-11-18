import type { Metadata } from "next";
import { NotificationPrefsForm, PrivacyForm } from "@/components/account/settings-forms";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { getPreferences } from "@backend/modules/notifications/service";
import { getOwnProfile } from "@backend/modules/profiles/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Privacy & notifications" };

export default async function SettingsPage() {
  const { viewer, db } = await requirePageSession({ next: "/account/settings" });
  let data;
  try {
    const [profile, prefs] = await Promise.all([getOwnProfile(db, viewer), getPreferences(db, viewer)]);
    data = { profile, prefs };
  } catch (error) {
    return <ServiceNotice error={error} what="your settings" />;
  }
  return (
    <div className="space-y-6">
      <PrivacyForm
        initial={{
          profileVisibility: data.profile.profile_visibility,
          discoverable: data.profile.discoverable,
          messagingPolicy: data.profile.messaging_policy,
          showReadReceipts: data.profile.show_read_receipts,
        }}
      />
      <NotificationPrefsForm initial={data.prefs} />
    </div>
  );
}
