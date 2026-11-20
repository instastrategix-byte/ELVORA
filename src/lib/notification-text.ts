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
    case "post_reposted":
      return { text: `${who} reposted your post`, href: n.entityId ? `/posts/${n.entityId}` : null };
    case "mention":
      return {
        text: n.payload.source === "comment" ? `${who} mentioned you in a comment` : `${who} mentioned you in a post`,
        href: n.entityId ? `/posts/${n.entityId}` : null,
      };
    case "reel_liked":
      return { text: `${who} liked your reel`, href: n.entityId ? `/reels/${n.entityId}` : "/reels" };
    case "reel_commented":
      return { text: `${who} commented on your reel`, href: n.entityId ? `/reels/${n.entityId}?comments=1` : "/reels" };
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
      return { text: `Campaign review update: ${status}`, href: n.entityId ? `/ads/campaigns/${n.entityId}` : "/ads-manager" };
    case "community_reply": {
      const title = typeof n.payload.title === "string" ? `“${n.payload.title}”` : "your discussion";
      const slug = typeof n.payload.slug === "string" ? n.payload.slug : null;
      return { text: `${who} replied to ${title}`, href: slug && n.entityId ? `/communities/${slug}/threads/${n.entityId}` : "/communities" };
    }
    case "community_request": {
      const name = typeof n.payload.name === "string" ? n.payload.name : "your community";
      const slug = typeof n.payload.slug === "string" ? n.payload.slug : null;
      return { text: `${who} asked to join ${name}`, href: slug ? `/communities/${slug}/manage` : "/communities" };
    }
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
    case "introduction": {
      const st = typeof n.payload.status === "string" ? n.payload.status : "";
      const text =
        st === "pending"
          ? `${who} asked you for an introduction`
          : st === "forwarded"
            ? `${who} made an introduction`
            : st === "accepted"
              ? `${who} accepted an introduction — you're now connected`
              : st === "declined" || st === "unavailable"
                ? "An introduction you asked for isn't available right now"
                : "Introduction update";
      return { text, href: st === "pending" ? "/introductions" : st === "forwarded" ? "/introductions?tab=received" : "/introductions?tab=sent" };
    }
    case "deal_room_invite": {
      const name = typeof n.payload.name === "string" ? `“${n.payload.name}”` : "a deal room";
      return { text: `${who} invited you to the deal room ${name}`, href: "/deal-rooms" };
    }
    case "deal_room_document": {
      const file = typeof n.payload.file === "string" ? n.payload.file : "a document";
      const name = typeof n.payload.name === "string" ? `“${n.payload.name}”` : "a deal room";
      return { text: `${who} shared ${file} in ${name}`, href: n.entityId ? `/deal-rooms/${n.entityId}` : "/deal-rooms" };
    }
    case "vouch_received":
      return { text: `${who} vouched for you`, href: "/vouches?tab=received" };
    case "vouch_requested":
      return {
        text: n.payload.application === true ? `${who} named you as a referee on their application` : `${who} asked you to vouch for them`,
        href: "/vouches",
      };
    case "referral_joined":
      return { text: `${who} applied to ELVORA with your invitation`, href: "/account/referrals" };
    case "opportunity": {
      const title = typeof n.payload.title === "string" ? `“${n.payload.title}”` : "your opportunity";
      const href = n.entityId ? `/opportunities/${n.entityId}` : "/opportunities";
      if (n.payload.status === "shortlisted") return { text: `${who} shortlisted you for ${title}`, href };
      if (n.payload.status === "declined") return { text: `${who} passed on your interest in ${title}`, href };
      return { text: `${who} is interested in ${title}`, href };
    }
    default:
      return { text: "You have a new notification", href: null };
  }
}
