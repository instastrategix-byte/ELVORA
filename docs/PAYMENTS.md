# Payments setup

ELVORA charges memberships through hosted checkout pages from payment providers. Card details never touch ELVORA's servers. A paid plan is switched on only when the provider's **signed webhook** confirms payment. Coming back from checkout never activates anything by itself.

| Provider | Who it serves | Methods |
|---|---|---|
| **Stripe** (recommended default) | Worldwide | Cards (Visa, Mastercard, Amex and more), Apple Pay, Google Pay, Link, plus the local methods you enable in the Stripe Dashboard. Stripe shows each customer the methods that suit their country and currency. |
| **Razorpay** | India | UPI, RuPay, Indian cards, netbanking |

Members only see the providers that are **configured on the server** and **set up for that price**. If neither is available, the membership page says online payment isn't enabled yet. It never shows a button that doesn't work.

## 1. Stripe

1. Create a Stripe account and complete business verification so you can take live payments.
2. **Products:** create one product per membership plan, and a recurring price for each monthly or yearly price.
   - In Supabase, copy each Stripe price id (`price_...`) into `plan_prices.stripe_price_id` for the matching row.
3. **Payment methods:** in Dashboard → Settings → Payment methods, turn on the methods you want, such as Apple Pay, Google Pay and local methods.
   - Checkout doesn't fix a method list, so newly enabled methods appear automatically.
   - Optionally turn on **Adaptive Pricing** so visitors from other countries see prices in their own currency.
4. **Webhook:** in Developers → Webhooks, add the endpoint `https://<your-domain>/api/webhooks/stripe`. Subscribe it to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
   - `invoice.paid`, `invoice.payment_failed`
5. **Vercel environment variables** (Production), then redeploy:
   - `STRIPE_SECRET_KEY` = `sk_live_...` (secret, server only)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from the webhook endpoint)
   - `PAYMENTS_DEFAULT_PROVIDER` = `stripe`
6. **Test:** use test-mode keys and the card `4242 4242 4242 4242` first.
   - Check that the subscription appears under Account → Membership after the webhook arrives.
   - Then switch to live keys.

Checkout also has promotion codes turned on (create them in Stripe → Coupons). It collects a billing address when one is needed and shows the page in the customer's language.

### Advertising balance top-ups (Stripe)

Advertisers prepay into an ELVORA advertising balance. Delivery draws it down. Top-ups use one-time Stripe Checkout payments and the same webhook endpoint.

1. Add these events to the Stripe webhook:
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `charge.refunded`
   - `payment_intent.payment_failed`

   `checkout.session.completed` is already subscribed.
2. Allow each currency by adding a row to `ad_billing_settings`, as an admin. Without a row, top-ups in that currency are unavailable:

   ```sql
   insert into public.ad_billing_settings (currency, min_top_up_minor, max_top_up_minor)
   values ('USD', 5000, 5000000);  -- $50 – $50,000 per top-up
   ```

3. How it behaves:
   - **Crediting:** the balance is credited only when Stripe reports the Checkout Session as **paid**. Card payments are confirmed at once; delayed payment methods are confirmed when they settle.
   - **Duplicates:** a replayed webhook can't credit twice, because the credit is tied to the Checkout Session id.
   - **Refunds:** a refund in Stripe becomes a "reversal" entry in the ledger. Partial and repeated refunds add up to the right total.
   - **Failures:** a failed payment sets the account's billing status to `payment_failed`, and the next successful top-up clears it.

**Statements:** the monthly "statements of account" (`ad_invoices`) summarise the ledger. They are **not tax invoices**. If you need tax invoices, use Stripe Invoicing or your accounting system.

**Razorpay:** advertising top-ups through Razorpay are not supported yet.

## 2. Razorpay (India)

1. In Razorpay, create a **Plan** for each price. Put each plan id (`plan_...`) in `plan_prices.razorpay_plan_id`.
2. **Webhook:** set it to `https://<your-domain>/api/webhooks/razorpay`, with these events:
   - `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`
   - `payment.failed`, `refund.processed`
3. **Vercel environment variables:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Then redeploy.

## 3. Adding another provider (e.g. Lazerpay)

Every provider plugs into the same interface: `backend/src/modules/billing/provider.ts` → `PaymentProvider`. To add one:

1. **Database:** add a migration with `alter type public.payment_provider add value '<id>';` and a price-reference column on `plan_prices`, for example `lazerpay_plan_id`.
2. **Code:** implement `PaymentProvider` in `backend/src/modules/billing/<id>.ts`. It needs `isConfigured`, `createCheckout`, `fetchSubscription`, `cancelAtPeriodEnd`, and `verifyWebhook`, which must check the provider's signature over the raw body.
3. **Register it:** add it to `ProviderId`, the `providers` map and the provider/price-reference choice in `billing/service.ts`, and to the provider check in `src/app/api/webhooks/[provider]/route.ts`.
4. **Configuration:** add its keys to `backend/src/core/env.ts` (server-only), `.env.example` and `assertProductionConfig`.
5. **Payment button:** add a label to `PROVIDER_COPY` in `src/components/account/billing-actions.tsx`.
6. **Tests:** cover webhook signature checking, mapping each event, and handling the same event twice safely.

**Crypto providers settle differently.** Recurring billing is often not supported, and a payment may be refunded or under-paid. Decide whether such payments buy fixed-length access, which `plan_grants` supports, rather than an auto-renewing subscription. Also confirm the provider is still operating and accepting merchants in your markets before you build on it.
