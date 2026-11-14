# ELVORA — API Contracts

Base path `/api/v1`. Request bodies are JSON (`content-type: application/json`, max 64 KiB unless noted).
Schemas live in `backend/src/modules/*/schemas.ts` and are shared with the frontend.

## Conventions

- Success: `{ "data": T }` — `201` for POST, `200` otherwise.
- Error: `{ "error": { "code", "message", "fieldErrors"? } }`

| Code | HTTP | Meaning |
|---|---|---|
| `bad_request` | 400 | Malformed JSON / wrong content type |
| `unauthenticated` | 401 | No valid session |
| `payment_failed` | 402 | Provider could not start/cancel checkout |
| `forbidden` | 403 | Not allowed (role, feature, ownership, cross-site) |
| `not_found` | 404 | Missing **or not visible to you** |
| `conflict` | 409 | Duplicate (already liked, already applied, handle taken…) |
| `payload_too_large` | 413 | Body or file too large |
| `validation_failed` / `business_rule` | 422 | Invalid input / workflow rule (message is user-facing) |
| `rate_limited` | 429 | Includes `Retry-After` |
| `service_unavailable` | 503 | Integration not configured/unavailable |

Auth levels: **public** (session optional), **user** (signed in), **member** (signed in + onboarded — default),
plus optional **feature** (`feed.post`, …) and **staff** (`moderator`, `admin`) requirements.
Mutations must be same-origin. Pagination: `?cursor=` (opaque) → `{ items, nextCursor }`.

## Endpoints

### Profile & discovery
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/profile` | user | — | Own editable profile |
| PATCH | `/profile` | user | `profileUpdateSchema` | `{ updated }` |
| PUT | `/profile/privacy` | user | `{ profileVisibility, discoverable, messagingPolicy }` | `{ updated }` |
| POST | `/onboarding` | user | `{ handle, displayName, headline?, location? }` | `{ onboarded }` |
| GET | `/members` | public | `q, location*, industry*, verified*, cursor` (*Premium) | `Page<ProfileSummary>` |
| GET | `/members/:userId/posts` | public | `cursor` | `Page<PostView>` |

### Feed
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/feed` | member | `scope=network|all, cursor` | `Page<PostView>` |
| POST | `/posts` | `feed.post` | `{ body, visibility, attachments[≤4] }` | `PostView` |
| GET/PATCH/DELETE | `/posts/:id` | public/member | `{ body?, visibility? }` | `PostView` / `{ deleted }` |
| POST/DELETE | `/posts/:id/like` | member | — | `{ likeCount }` |
| POST/DELETE | `/posts/:id/save` | member | — | `{ saved }` |
| GET | `/saved/posts` | member | `cursor` | `Page<PostView>` |
| GET/POST | `/posts/:id/comments` | member / `feed.post` | `{ body }` | `Page<CommentView>` / `CommentView` |
| DELETE | `/comments/:id` | member | — | `{ deleted }` |
| POST | `/reports` | member | `{ targetType, targetId, reason, details? }` | `{ received }` |

### Social graph & messaging
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/connections` | member | `tab=connections|received|sent` | `ConnectionView[]` |
| POST | `/connections` | `connections.request` | `{ userId, message? }` | `{ id }` |
| PATCH | `/connections/:id` | member | `{ accept }` | `{ status }` |
| DELETE | `/connections/:id` | member | — | `{ removed }` |
| POST/DELETE | `/follows/:userId` | member | — | `{ following }` |
| POST/DELETE | `/blocks/:userId` | user | — | `{ blocked }` |
| GET | `/conversations` | member | `before?` | `ConversationSummary[]` |
| POST | `/conversations` | `messages.send` | `{ userId }` | `{ id }` (find-or-create) |
| GET | `/conversations/:id/messages` | member | `before?, limit≤50` | `{ items, hasMore }` |
| POST | `/conversations/:id/messages` | `messages.send` | `{ body, clientId(uuid) }` (16 KiB) | `MessageView` (idempotent on `clientId`) |
| POST | `/conversations/:id/read` | member | — | `{ read }` |
| GET | `/notifications` | user | `cursor` or `countOnly=1` | `Page<NotificationView>` / `{ unread }` |
| PATCH | `/notifications` | user | `{ all: true }` or `{ ids[] }` | `{ read }` |
| GET/PUT | `/notification-preferences` | user | `{ connectionActivity, postActivity, messages, marketplace, emailEnabled }` | preferences |

### Membership & billing
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/membership` | public | — | `{ plans }` or full `MembershipOverview` |
| POST | `/applications` | member | `{ planId, statement(≥40) }` | `{ id }` |
| POST | `/applications/:id/withdraw` | member | — | `{ status }` |
| POST | `/invitations/check` | public | `{ code }` | `{ valid, planId, planName, preApproved }` |
| POST | `/invitations/redeem` | user | `{ code, statement? }` | `{ applicationId }` |
| POST | `/verifications` | member | `{ kind, statement, evidencePaths[1..5] }` | `{ status: "pending" }` |
| POST | `/billing/checkout` | member | `{ priceId, provider? }` | `{ url }` (hosted checkout) |
| POST | `/billing/subscriptions/:id/cancel` | user | — | `{ pending }` (confirmed by webhook) |
| POST | `/api/webhooks/stripe` · `/api/webhooks/razorpay` | signature | raw provider payload (≤512 KiB) | `{ received, duplicate }` |

### Uploads
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/uploads` | user | `{ purpose, mimeType, size, fileName }` | `{ bucket, path, token }` for `uploadToSignedUrl` |

Purposes: `avatar`, `cover`, `post_image`, `post_video`, `listing_image`, `business_logo`, `verification_document`
(limits in `src/lib/media.ts`).

### Business & marketplace
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET/PUT | `/business` | member / `business.manage` | `businessSchema` | `BusinessDetail` |
| POST | `/business/:id/submit` | `business.manage` | — | `{ status }` |
| GET | `/listings` | public | `category, q, location, cursor` | `Page<ListingCard>` |
| POST | `/listings` | `business.manage` | `listingSchema` | `{ id, slug }` (draft) |
| GET/PATCH/DELETE | `/listings/:id` | public / owner | `listingSchema` | `ListingDetail` / `{ status }` / `{ deleted }` |
| POST | `/listings/:id/status` | owner | `{ action: submit|archive|publish|draft }` | `{ action }` |
| POST | `/listings/:id/media` · DELETE `/listing-media/:id` | owner | `{ path, alt? }` | `{ added }` / `{ removed }` |
| POST/DELETE | `/listings/:id/save` | member | — | `{ saved }` |
| POST | `/listings/:id/inquiries` | `luxury.inquire` | `{ message, preferredDates?, partySize? }` | `{ id, status: "new" }` — not a booking |
| PATCH | `/inquiries/:id` | listing owner | `{ status }` | `{ status }` |

### Advertising
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET/PUT | `/ads/account` | member / `ads.manage` | `{ displayName, billingEmail? }` | `AdvertiserAccount` |
| GET/POST | `/ads/campaigns` | member / `ads.manage` | `campaignSchema` | `CampaignView[]` / `{ id }` |
| GET/PATCH/DELETE | `/ads/campaigns/:id` | owner | `campaignSchema` | `{ campaign, report }` |
| POST | `/ads/campaigns/:id/transition` | `ads.manage` | `{ action: submit|pause|resume|withdraw|end }` | `{ status }` |
| GET | `/ads/serve` | member | `placement=feed|luxury|discover` | `SponsoredItem[]` (each a recorded impression) |
| POST | `/ads/click` | member | `{ impressionId }` | `{ url }` (server-resolved) |

### Account
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST/DELETE | `/account/deletion` | user | `{ confirm: "DELETE", reason? }` | `{ status }` |
| DELETE | `/account/sessions` | user | — | `{ signedOutOthers }` |

### Administration (staff)
| Method | Path | Staff | Body |
|---|---|---|---|
| POST | `/admin/applications/:id` | moderator | `{ status: under_review|approved|rejected, note? }` |
| POST | `/admin/verifications/:id` | moderator | `{ status: approved|rejected|revoked, note? }` |
| POST | `/admin/businesses/:id` | moderator | `{ status: approved|rejected|suspended, note? }` |
| POST | `/admin/listings/:id` | moderator | `{ approve, note? }` |
| POST | `/admin/campaigns/:id` | moderator | `{ action: approve|reject, note? }` |
| POST | `/admin/reports/:id/dismiss` | moderator | `{ note? }` |
| POST | `/admin/moderation` | moderator | `{ action, reason, targetType?, targetId?, targetUserId?, reportId? }` |
| GET | `/admin/audit` | moderator | — |
| POST/DELETE | `/admin/staff` | admin | `{ userId, role? }` |

### Other
`GET /api/health` — `{ status, integrations: { supabase, payments[], email } }`.
Auth routes (not under `/api`): `GET /auth/callback`, `GET /auth/confirm`, `POST /auth/sign-out`.

## Pages → API dependencies

| Page | Reads (server) | Calls (client) |
|---|---|---|
| `/feed` | `listFeed` | `/posts`, `/posts/:id/*`, `/comments/:id`, `/uploads`, `/feed`, `/ads/serve`, `/ads/click`, `/reports` |
| `/members/[handle]` | `getProfileByHandle`, `getRelationship`, `listAuthorPosts` | `/connections*`, `/follows`, `/blocks`, `/conversations`, `/members/:id/posts` |
| `/messages/[id]` | `getConversation`, `listMessages` | `/conversations/:id/messages`, `/read`; Realtime `conversation:<id>` |
| `/notifications` | `listNotifications` | `/notifications`; Realtime `user:<id>` |
| `/luxury*` | `browseListings`, `getListingBySlug` | `/listings`, `/listings/:id/save`, `/inquiries` |
| `/account/membership` | `getMembershipOverview` | `/billing/checkout`, `/billing/subscriptions/:id/cancel`, `/applications/:id/withdraw` |
| `/business*` | `getOwnBusiness`, `listOwnListings`, inquiries | `/business`, `/listings*`, `/uploads`, `/inquiries/:id` |
| `/ads*` | campaigns, report, rate cards | `/ads/*` |
| `/admin/*` | queue loaders | `/admin/*` |
