# RepeatSlice — project brief

RepeatSlice is a customer-retention web app for independent pizza shops. It sends SMS and email
promos, runs automated reminders, and shows simple stats to turn one-time customers into regulars.

**First client:** Pazoon's Pizza, 1030 Adelaide St N, London, Ontario (519-673-4444).

## Hard rules

- **MOCK DATA ONLY.** Real customer data comes later, as an export the owner gives us after he signs on.
  - All mock phone numbers must be fake test numbers (use the reserved `+1-519-555-01xx` style / 555-01xx range).
  - All mock emails must be `@example.com`.
- **Twilio and the email provider (Postmark) run in test/sandbox mode only.** Never send to real people.
- Never commit secrets. Credentials go in `.env` (git-ignored); `.env.example` documents the keys.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma with SQLite for now (Postgres later — keep the schema portable: no SQLite-only features)
- Twilio for SMS, Postmark for email
- **Mobile-first UI** — the owner uses his phone.

## Screens

1. **Overview:** total customers, repeat rate, lapsed customers (30–90, 90–180, 180+ days), how many can be
   reached by SMS and email, and a win-back revenue estimate with sliders
   (% of lapsed customers who return × average order × extra orders per year).
2. **New promo:** pick a segment, write a message with `{name}` merge, phone-style preview, character and
   SMS-segment count, estimated cost, schedule or send. Customers without consent are excluded automatically.
3. **Automations** (daily job, each can be turned on or off):
   - win-back after 30 days without an order (max once per 60 days)
   - thank-you after a first order with $5 off the second
   - birthday-week offer
   - free cheesy breadsticks on the 5th order
   - "How was it?" message after each order (complaints go privately to the owner; happy customers get a
     Google review link)
4. **Customers:** search and filter (lapsed / opted in / no consent), plus a CSV import with column mapping
   and dedupe by phone or email.
5. **Public opt-in page** with a QR code (for the counter or pizza boxes).

## CASL compliance (Canada, required)

- Store consent separately for SMS and email: type (express or implied), date, source, revoked date.
- Implied consent from a purchase expires 2 years after the customer's last purchase.
- Every message identifies Pazoon's Pizza and includes an opt-out
  ("Reply STOP to opt out" for SMS; an unsubscribe link plus mailing address for email).
- Handle STOP and unsubscribe instantly, with a suppression list that re-imports never override.
- Quiet hours: no texts before 9am or after 9pm (shop local time, America/Toronto).

## Data model

Customer, Order (channel: phone / walk-in / doordash / ubereats / online), Consent, Campaign, Message,
Automation, Redemption (promo codes, to track what worked). Plus a Suppression list (see CASL).

## Mock data

- Seed 1,200 customers with a **fixed random seed** (deterministic).
- Neighbourhoods weighted toward northeast London (Huron Heights, Carling, Stoney Creek, East London,
  Old East Village, Argyle), plus some from Masonville, Old North, Fanshawe, Westmount, Byron and Downtown.
- Recency: 38% ordered in the last 30 days, 28% 30–90 days ago, 19% 90–180 days ago, 15% more than 180 days ago.
- Average order about $36.
- About 58% have SMS consent and 71% have email consent.

## Pazoon's real deals (use in orders and promo templates)

| Deal | Contents | Price |
|---|---|---|
| Single Deal | 1 pizza, 3 toppings, 2 drinks, 1 dip | $20.99–$26.99 |
| Double Deal | | $33.99–$43.99 |
| Family Deal | 2 pizzas, 15 wings, 6 pops, breadsticks or wedges | $46.99–$56.99 |
| Pizza & Wings (large) | | $35.99 |
| 2 Can Dine | | $29.99 |
| Wings (10) | | $12.99 |
| Panzerotti | | $15.99 |
| Cheesy breadsticks | | $7.99 |

- Open late on Friday and Saturday (good for late-night promos).
- Promo templates should push customers to order **DIRECT** (call or walk in) instead of DoorDash or
  Uber Eats, so the shop saves on app commissions.

## Build order

1. Schema + seed script  ← **done**
2. Dashboard + customer list  ← **done**
3. CSV import  ← **done**
4. Campaign composer + test-mode sending + opt-out handling  ← **done**
5. Automations engine
6. Opt-in page + QR code
7. Redemption tracking and results

## Dev notes

- `npm run db:reset` — recreate the SQLite DB and seed it.
- `npm run db:seed` — seed only.
- `npm run dev` — start the app.
- `npm test` — vitest (CASL consent rules, import planner). Run before pushing.
- Seed logic lives in `prisma/seed.ts`; shared constants (deals, neighbourhoods, shop info) in `src/lib/`.
- Reachability (CASL consent) is time-dependent, so it is computed in code (`src/lib/consent.ts`,
  `src/lib/customers.ts#loadCustomerIndex`) rather than stored. The customer list loads all customers into
  memory and filters there — fine at single-shop scale; move filtering to SQL with Postgres / multi-shop.
- UI tokens live in `src/app/globals.css` (light + dark). Consent badges always pair colour with an icon + label.
- CSV import (`/customers/import`): `src/lib/import/plan.ts` is a pure planner used for both the dry-run preview
  and the real import (the server always re-plans; it never trusts a plan from the browser). Rules: dedupe by phone
  OR email (chains merge); match existing by phone then email; phone→A + email→B = conflict, skipped; existing
  customers only get blanks filled; suppression list / past revocations are never overridden; express consent only
  from an explicit opt-in column, implied only from a purchase < 2 years old. Each import writes an `ImportBatch`.
- `MOCK_DATA_ONLY` (default true): imports reject phones outside 555-01xx and emails not @example.com.
- `public/samples/pazoons-sample-import.csv` is generated from the seed by `npx tsx scripts/make-sample-import.ts`.
  The seed is deterministic regardless of date/time of day (fixed RNG draws), so the sample keeps matching.
- Route groups: `src/app/(app)` = owner screens (header + tab bar), `src/app/(public)` = public pages
  (unsubscribe `/u/[token]`, opt-in page in step 6). No owner nav on public pages.
- Messaging (`src/lib/messaging/`): `campaigns.ts` creates/dispatches campaigns. Recipients are chosen at SEND
  time (consent re-checked); dispatch is claimed atomically and resumable (skips customers already messaged).
  SMS outside 9:00–21:00 Toronto is moved to the next 9:00; a send crossing 21:00 pauses until morning.
  `providers.ts` calls Twilio/Postmark REST; test mode blocks non-test addresses; no creds → simulated.
  `optout.ts`: STOP/ARRET/etc → suppression + revoke all active consents instantly; START → express re-opt-in.
- Endpoints: `POST /api/webhooks/twilio` (inbound SMS, signature-checked when TWILIO_AUTH_TOKEN is set),
  `POST /api/webhooks/postmark?token=` (complaints/hard bounces), `POST /api/unsubscribe/[token]` (RFC 8058
  one-click), `GET /api/cron/dispatch` (Bearer CRON_SECRET). In test mode the customer page has a
  "Simulate a text reply" box to try STOP/START/HELP without Twilio.
- SMS templates (`src/lib/templates.ts`) must fit ONE GSM-7 segment incl. the auto shop name + STOP footer
  (enforced by `templates.test.ts`). Cost estimates are rough US-cent figures in `src/lib/sms.ts`.
- Sending happens inside the request for now (fine for ~1k recipients in test mode). Before real volume,
  move dispatch to a background worker/queue and honour Twilio rate limits.
