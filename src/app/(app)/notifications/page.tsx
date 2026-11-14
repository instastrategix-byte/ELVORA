import type { Metadata } from "next";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { listNotifications } from "@backend/modules/notifications/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { viewer, db } = await requirePageSession({ next: "/notifications" });
  const result = await attempt(() => listNotifications(db, viewer));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" />
      {result.ok ? <NotificationList userId={viewer.id} initial={result.data} /> : <ServiceNotice error={result.error} what="notifications" />}
    </div>
  );
}
