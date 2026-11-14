import { after } from "next/server";
import { siteUrl } from "@/lib/env";
import { sendEmail } from "@backend/modules/email/service";
import { inquirySchema } from "@backend/modules/listings/schemas";
import { businessContactForListing, createInquiry } from "@backend/modules/listings/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/**
 * Sends an inquiry to the listing's provider. This is a contact request only — it does not
 * reserve or confirm anything, and the UI says so.
 */
export const POST = route(
  { name: "inquiries.create", feature: "luxury.inquire", params: idParams, body: inquirySchema, rateLimitPerMinute: 5 },
  async ({ session, params, body }) => {
    const inquiry = await createInquiry(session.db, session.viewer, params.id, body);
    const contact = await businessContactForListing(session.db, params.id);
    if (contact?.email) {
      const to = contact.email;
      after(() =>
        sendEmail({
          to,
          subject: `New ELVORA inquiry: ${contact.title}`,
          text: `You have a new inquiry about "${contact.title}". Review it in your business inbox: ${siteUrl("/business/inquiries")}`,
        }),
      );
    }
    return { id: inquiry.id, status: "new" };
  },
);
