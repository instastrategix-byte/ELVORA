# ELVORA — Security Threat Model

## Assets
Member identities and private profile data; private posts and messages; verification documents; billing references;
staff privileges; marketplace and advertising integrity; platform reputation.

## Trust boundaries
1. **Browser ↔ Next.js** — untrusted input; cookie session.
2. **Next.js ↔ Supabase (user JWT)** — RLS and column grants are the final authority.
3. **Next.js ↔ Supabase (service role)** — only in payment webhooks (`backend/src/db/admin.ts`, `server-only`).
4. **Payment providers → webhooks** — authenticated by signature over the raw body.
5. **Browser ↔ Supabase Storage/Realtime** — signed upload URLs; RLS on `storage.objects` and `realtime.messages`.

## Threats and mitigations

| ID | Threat | Mitigation |
|---|---|---|
| T-01 | Self-promotion to admin/verified/premium by editing requests or profile fields | Column-level grants exclude trusted columns; `staff_roles`, `subscriptions`, `verifications.status`, `businesses.status` not client-writable; roles derived server-side; tested in `tests/db/rls.test.ts` |
| T-02 | Paid features without payment | Features come from `user_features()` reading `subscriptions`, written only by verified webhooks; checkout never grants anything |
| T-03 | Payment ≠ legitimacy | Verification, business review and membership are separate tables/workflows with staff decisions |
| T-04 | Reading private profiles/posts/messages via direct API or guessed ids | RLS (`can_view_profile`, `can_view_post`, participant checks); private items 404 identically to missing ones |
| T-05 | Bypassing connection/messaging restrictions | `start_conversation()` and message insert policy enforce policy, blocks and active status |
| T-06 | Editing others' content | RLS ownership predicates on update/delete; tested |
| T-07 | CSRF on cookie-authenticated mutations | Same-origin check on all non-GET route handlers and sign-out; JSON-only bodies; Server Actions have built-in origin checks |
| T-08 | Members-only listing images exposed via public URLs | Unguessable UUID paths; documented trade-off; move to signed URLs if required |
| T-09 | Malicious uploads (executables, oversized, wrong type) | Server-side MIME/extension/size validation per purpose; bucket MIME allow-lists and size limits; server-generated object names. **Malware scanning not configured** |
| T-10 | Accessing others' files | Storage RLS on first path segment; attachments must reference the uploader's own paths |
| T-11 | Webhook forgery/replay | Signature verification (Stripe `constructEvent`, Razorpay HMAC); `webhook_events` ledger; idempotent upserts; state re-fetched from provider |
| T-12 | Open redirects | `safeNextPath()` accepts only same-origin relative paths; ad clicks resolve destinations server-side |
| T-13 | Account enumeration | Password reset and verification resend return identical responses; generic sign-in error |
| T-14 | Brute force / spam | Supabase Auth rate limits; per-user/IP rate limits on mutating routes (in-memory per instance — use a shared store in multi-instance production) |
| T-15 | Secret leakage | Only `NEXT_PUBLIC_*` reach the browser; service key `server-only`; logger redaction; `/api/health` exposes booleans only |
| T-16 | Sensitive data in logs | Redaction of passwords, tokens, cookies, emails, message/post bodies, signatures |
| T-17 | Ad fraud / metric inflation | Impressions recorded only by `serve_ads()` for signed-in members within caps; one click per impression per hour; advertisers cannot write events or prices |
| T-18 | Staff abuse | Rank checks in SQL; admins only for staff changes; moderators cannot act on staff accounts; every action audited |
| T-19 | Seed/demo credentials in production | Seed runs only on local stack, refuses non-empty databases, uses `.test` emails |
| T-20 | Realtime eavesdropping | Private channels only; topic authorization via RLS; events carry no data beyond what RLS already allows |
| T-21 | Clickjacking / MIME sniffing | `X-Frame-Options: DENY`, `nosniff`, HSTS, Referrer-Policy, Permissions-Policy |

## Residual risks / follow-ups
- Content Security Policy not yet configured (needs nonce strategy with Cache Components).
- Malware scanning and image metadata (EXIF) stripping for uploads.
- MFA for staff accounts (Supabase MFA available; not enforced yet).
- Shared rate-limit store (e.g. Redis) for horizontally scaled deployments.
- Account deletion processing job (requests are recorded; processing is manual).
- Legal review of privacy policy and terms (currently drafts).
