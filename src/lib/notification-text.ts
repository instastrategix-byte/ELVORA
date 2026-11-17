import { titleCase } from "@/lib/format";
import type { NotificationView } from "@backend/modules/notifications/service";

/** Human-readable text and destination for a notification. Shared by the inbox and the dashboard. */
export function describeNotification(n: NotificationView): { text: string; href: string | null } {
  const who = n.actor?.displayName ?? "Someone";
  const status = typeof n.payload.status === "string" ? titleCase(n.payload.status) : "";
  switch (n.type) {
    case "connection_request":
      return { text: `${who} sent you a connection request`, href: "/connections?tab=received" };
    case "connection_accepted":
      return { text: `${who} accepted your connection request`, href: n.actor?.handle ? `/members/${n.actor.handle}` : "/connections" };
    case "new_follower":
      return { text: `${who} started following you`, href: n.actor?.handle ? `/members/${n.actor.handle}` : null };
    case "post_liked":
      return { text: `${who} liked your post`, href: n.entityId ? `/posts/${n.entityId}` : null };
    case "post_commented":
      return { text: `${who} commented on your post`, href: n.entityId ? `/posts/${n.entityId}` : null };
    case "message":
      return { text: `New message from ${who}`, href: n.entityId ? `/messages/${n.entityId}` : "/messages" };
    case "membership_update":
      return { text: `Your membership status is now ${status}`, href: "/account/membership" };
    case "application_update":
      return { text: `Your membership application is ${status.toLowerCase()}`, href: "/account/membership" };
    case "verification_update":
      return { text: `Your verification request was ${status.toLowerCase()}`, href: "/account/verification" };
    case "moderation_notice":
      return { text: "A moderation action was applied to your account or content", href: "/account/settings" };
    case "listing_inquiry":
      return { text: `${who} sent an inquiry about your listing`, href: "/business/inquiries" };
    case "business_update":
      return { text: `Business review update: ${status}`, href: "/business" };
    case "campaign_update":
      return { text: `Campaign review update: ${status}`, href: n.entityId ? `/ads/campaigns/${n.entityId}` : "/ads" };
    case "event_update": {
      const title = typeof n.payload.title === "string" ? `“${n.payload.title}”` : "an event";
      const href = n.entityId ? `/events/${n.entityId}` : "/events";
      switch (n.payload.status) {
        case "going":
          return { text: `${who} is attending ${title}`, href };
        case "invited":
          return { text: `${who} invited you to ${title}`, href };
        case "promoted":
          return { text: `A place opened up — you're now attending ${title}`, href };
        case "cancelled":
          return { text: `${title} has been cancelled`, href };
        default:
          return { text: `Update on ${title}`, href };
      }
    }
    default:
      return { text: "You have a new notification", href: null };
  }
}
