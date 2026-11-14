# ELVORA — Deployment Runbook

## Environments

| Env | Database | Payments | Email |
|---|---|---|---|
| Local | `supabase start` (Docker) + seed | Test keys (optional) | `EMAIL_PROVIDER=log` / Mailpit for Auth |
| Staging | Supabase project (staging) | Stripe/Razorpay **test** mode | Resend (verified test domain) |
| Production | Supabase project (prod) | Live keys | Resend (verified domain) |

## Environment variables

See `.env.example`. Required in production (start-up fails otherwise, see `backend/src/core/env.ts`):
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`;
plus provider secrets for any enabled integration. Never set `ELVORA_ALLOW_UNCONFIGURED` outside local E2E runs.

## Supabase setup

```bash
npx supabase login
npx supabase link --project-ref <ref> --workdir backend
npm run db:push                 # applies backend/supabase/migrations (seed is NOT applied)
```

Auth settings (dashboard → Authentication):
- Site URL = `NEXT_PUBLIC_SITE_URL`; redirect URLs: `<site>/auth/callback`, `<site>/auth/confirm`.
- Email confirmations ON; minimum password length 10 with letters + digits.
- Custom SMTP (e.g. Resend SMTP) for production email deliverability.
- Optional Google provider: create OAuth client (redirect `https://<ref>.supabase.co/auth/v1/callback`), add client
  id/secret in Supabase, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.

Realtime: private channels are authorized by RLS on `realtime.messages` (created by migration 0500). Ensure
"Realtime → Settings → Allow public access" is **off**.

### Prices and rate cards (production)

Prices are commercial data, inserted with SQL (or a future admin UI), never in code:

```sql
insert into public.plan_prices (plan_id, currency, billing_interval, amount_minor, stripe_price_id, razorpay_plan_id)
values ('premium', 'USD', 'month', 49000, 'price_XXX', null);

insert into public.ad_rate_cards (currency, objective, cpm_minor, cpc_minor) values ('USD', 'traffic', 1500, 120);
```

### First administrator

Admins are provisioned explicitly and audited — never via sign-up. After the person has signed up and onboarded:

```sql
insert into public.staff_roles (user_id, role) values ('<auth user id>', 'admin');
insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
values (null, 'staff_role.bootstrap', 'profile', '<auth user id>', '{"via":"sql"}');
```

Further staff are granted by admins through `POST /api/v1/admin/staff` (audited).

## Payments

**Stripe:** create a Product + recurring Price per plan/currency/interval; store the `price_…` id in `plan_prices`.
Webhook endpoint `https://<site>/api/webhooks/stripe` with events: `checkout.session.completed`,
`customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`, `invoice.payment_failed`.
Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Razorpay:** create Plans; store `plan_…` ids in `plan_prices.razorpay_plan_id`. Webhook
`https://<site>/api/webhooks/razorpay` with events `subscription.*`, `payment.failed`, `refund.processed`.
Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

`PAYMENTS_DEFAULT_PROVIDER` chooses which provider is used when a price has both ids.
Stripe refunds are recorded on the payment provider side; automatic reconciliation of Stripe refunds into
`payments` is not yet implemented (Razorpay `refund.processed` is).

## Email

`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` with a verified domain. Used for inquiry and payment-failure
notices. Auth emails (verification, reset) are sent by Supabase Auth via its SMTP settings.

## Deploy (Vercel or any Node host)

1. Set environment variables for the environment.
2. `npx supabase db push` (migrations first, always backwards-compatible).
3. `npm ci && npm run build && npm start` (or platform build). Node 24, Node.js runtime (Cache Components).
4. Smoke test: `GET /api/health` → integrations as expected; sign up; post; message; checkout in test mode.

## Testing against Supabase

```bash
npm run db:start && npm run db:reset    # local stack + fictional seed
npm run build
E2E_SUPABASE=1 E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # with `npm start` running and .env.local set
```

Never run tests against production data.

## Rate limiting

The built-in limiter is in-memory per instance. For multi-instance deployments add a shared store (e.g. Upstash
Redis) behind `backend/src/http/rate-limit.ts`.

## Rollback

Application: redeploy the previous build. Database: write a new forward migration that reverses the change;
never edit or delete applied migrations.
