import { siteUrl } from "@/lib/env";
import { pixelScript } from "@backend/modules/advertising/tracking/pixel";

/** Serves the ELVORA pixel script (see docs/ADS_TRACKING.md). */
export function GET() {
  return new Response(pixelScript(siteUrl("/api/ads/collect")), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
}
