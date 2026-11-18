# ELVORA conversion tracking

Advertisers can measure what happens on their own website after someone clicks an ELVORA ad. There are two ways to send events:

| Integration | Use when | Authentication |
|---|---|---|
| **Pixel** | Events happen in the visitor's browser | The event must come from one of the integration's **allowed domains** |
| **Server API** | Events happen on your server (CRM, checkout backend) | An **HMAC-SHA256 signature** made with the integration's secret |

Create either kind in the Ads Manager (Tracking & Pixels). Only account owners and admins can create, edit or rotate integrations. Analysts can view them.

## Consent

ELVORA stores a conversion **only when the visitor has agreed** to advertising measurement on your website. Getting that agreement under the laws that apply to you (for example GDPR, ePrivacy or CCPA) is your responsibility.

- **Pixel:** it does nothing until you call `elvora('consent', true)`. Events tracked before consent are held in memory, and only up to 20. They are sent if consent is given and discarded if it is refused.
- **Server API:** every event must include `"consent": true`, which confirms you obtained consent for it.
- Events without consent are discarded and show up in the integration's diagnostics as `no_consent`.

## Pixel installation

```html
<script>
  window.elvora = window.elvora || function () { (elvora.q = elvora.q || []).push(arguments); };
  elvora('init', 'elvpx_YOUR_PIXEL_ID');
</script>
<script async src="https://YOUR-ELVORA-DOMAIN/api/ads/pixel.js"></script>
```

Then, from your consent banner and on the pages where conversions happen:

```js
elvora('consent', true);                              // after the visitor accepts measurement
elvora('track', 'purchase', { value: 249.0, currency: 'EUR', event_id: 'order-10482' });
elvora('track', 'lead');                              // lead, purchase, sign_up, page_view
elvora('track', 'custom', { custom_name: 'brochure_download' });
```

What the pixel does and doesn't do:

- **No cookies.** The ELVORA click id (`elv_cid`) from the landing URL is kept in `sessionStorage` for that browser tab only.
- **Page URLs:** only the page's origin and path are sent. Query strings and fragments, which can contain personal data, are never sent.
- **Event ids:** pass your own `event_id` (such as the order number) so that duplicates, for example a refreshed thank-you page, are counted once. Without one, each call gets a random id.
- **Allowed domains:** events are accepted only from the integration's allowed domains and their subdomains. Anything else is rejected and appears in diagnostics as `domain_not_allowed`.

## Server API

`POST https://YOUR-ELVORA-DOMAIN/api/ads/conversions`

| Header | Value |
|---|---|
| `X-Elvora-Key` | The integration id (`elvpx_…`) |
| `X-Elvora-Timestamp` | Unix time in seconds. Must be within 5 minutes of ELVORA's clock. |
| `X-Elvora-Signature` | `v1=` + hex HMAC-SHA256 of `${timestamp}.${rawBody}`, keyed with the integration secret |

```json
{ "event": "purchase", "event_id": "order-10482", "consent": true,
  "value": 249.0, "currency": "EUR", "elv_cid": "<click id from the landing URL>",
  "occurred_at": "2026-11-20T10:15:00Z", "page_url": "https://shop.example.com/checkout" }
```

Node.js example:

```js
import { createHmac } from "node:crypto";
const body = JSON.stringify(event);
const ts = Math.floor(Date.now() / 1000).toString();
const sig = "v1=" + createHmac("sha256", process.env.ELVORA_SECRET).update(`${ts}.${body}`).digest("hex");
await fetch("https://YOUR-ELVORA-DOMAIN/api/ads/conversions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Elvora-Key": KEY, "X-Elvora-Timestamp": ts, "X-Elvora-Signature": sig },
  body,
});
```

**Responses:**

| Status | Meaning |
|---|---|
| `202` | `{"status":"stored"}`, or `{"status":"duplicate"}` if this `event_id` was already received |
| `401` | Bad key or signature |
| `400` | Invalid payload |
| `422` | Rejected, for example `too_old`: events older than 28 days are discarded |

**Secrets:** the secret is shown **once**, when the integration is created or the secret is rotated. Rotating replaces it immediately. ELVORA keeps the secret in a table only the server can read, because it's needed to check signatures. Members see only a short fingerprint of it.

## Attribution

- **Model:** last click.
- **Requirements:** a conversion is attributed to an ad only if all of the following hold:
  1. It carries an `elv_cid`.
  2. That click id belongs to an impression of **your own** campaign.
  3. The impression has a **recorded click**.
  4. The conversion happened within the integration's **click-through window**: 1, 7 (default) or 28 days after the click.
- **Unattributed:** anything else is stored as an unattributed conversion. It counts towards your totals, but not towards any campaign.
- **No view-through:** impressions without a click are never credited.
- **Time limits:** events dated in the future are treated as happening now, and events older than 28 days are discarded.

## Metric definitions

| Metric | Definition |
|---|---|
| Conversions | Stored, consented events, after removing duplicate `event_id`s for the integration |
| Attributed conversions | Conversions that meet the attribution rules above |
| Conversion value | The sum of `value` per currency. Currencies are never converted or combined. |
| Conversion rate | Attributed conversions ÷ recorded clicks for the same campaign and period |
| CPA | Spend ÷ attributed conversions |
| ROAS | Attributed conversion value ÷ spend, only where they share a currency |

## Limitations

- Tracking reports only what your site sends. It can't measure conversions on pages without the pixel, or events from browsers that block scripts or beacons.
- A click id lasts for one browser tab session. A visitor who returns later in a new tab or on another device isn't attributed unless your server sends the click id, for example after storing it with an order.
- Diagnostics keep the latest 200 entries per integration.
- A pixel integration is marked **verified** after its first accepted event from an allowed domain. Before that, ELVORA does not claim the pixel works.
