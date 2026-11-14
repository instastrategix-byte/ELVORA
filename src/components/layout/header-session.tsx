import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isStaff } from "@backend/modules/auth/permissions";
import { publicMediaUrl } from "@/lib/media";
import { unreadConversationCount } from "@backend/modules/messaging/service";
import { unreadNotificationCount } from "@backend/modules/notifications/service";
import { getSession } from "@backend/auth/viewer";
import { LiveBadges } from "./live-badges";
import { UserMenu } from "./user-menu";

function SignedOutActions() {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <Button asChild variant="ghost" size="sm">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/apply">Apply</Link>
      </Button>
    </div>
  );
}

export async function HeaderSession() {
  const session = await getSession().catch(() => null);
  if (!session) return <SignedOutActions />;
  const { viewer, db } = session;
  const active = viewer.accountStatus === "active" && viewer.onboarded;
  const [notifications, messages] = active
    ? await Promise.all([
        unreadNotificationCount(db, viewer).catch(() => 0),
        unreadConversationCount(db).catch(() => 0),
      ])
    : [0, 0];
  return (
    <div className="flex items-center gap-1">
      {active ? <LiveBadges userId={viewer.id} initialNotifications={notifications} initialMessages={messages} /> : null}
      <UserMenu
        name={viewer.displayName}
        handle={viewer.handle}
        avatarUrl={publicMediaUrl("profile-media", viewer.avatarPath)}
        onboarded={viewer.onboarded}
        isStaff={isStaff(viewer)}
      />
    </div>
  );
}
