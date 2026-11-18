import { siteUrl } from "@/lib/env";
import { getSession } from "@backend/auth/viewer";
import { createClient } from "@backend/db/server";
import { getProfileByHandle } from "@backend/modules/profiles/service";
import { toVCard } from "@backend/modules/profiles/vcard";

/**
 * Digital business card download (vCard). Read through RLS as the current visitor, so a card is
 * only available when the visitor can already see the profile.
 */
export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return new Response("Not found", { status: 404 });
  const session = await getSession().catch(() => null);
  const db = session?.db ?? (await createClient());
  const profile = await getProfileByHandle(db, handle).catch(() => null);
  if (!profile) return new Response("Not found", { status: 404 });
  return new Response(toVCard(profile, siteUrl(`/members/${profile.handle}`)), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${profile.handle}.vcf"`,
      "cache-control": "private, no-store",
    },
  });
}
