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
2. Dashboard + customer list
3. CSV import
4. Campaign composer + test-mode sending + opt-out handling
5. Automations engine
6. Opt-in page + QR code
7. Redemption tracking and results

## Dev notes

- `npm run db:reset` — recreate the SQLite DB and seed it.
- `npm run db:seed` — seed only.
- `npm run dev` — start the app.
- Seed logic lives in `prisma/seed.ts`; shared constants (deals, neighbourhoods, shop info) in `src/lib/`.
