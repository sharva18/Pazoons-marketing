# RepeatSlice

Customer-retention app for independent pizza shops: SMS/email promos, automations and simple stats.
First client: Pazoon's Pizza (London, ON). See `CLAUDE.md` for the full brief.

**Mock data only** — fictional 555-01xx phone numbers and `@example.com` emails. Twilio/Postmark in test mode.

## Setup

```bash
npm install
cp .env.example .env
npm run db:reset   # create the SQLite schema and seed 1,200 mock customers
npm run dev
```

`SEED_NOW=2026-11-02 npm run db:seed` pins "today" so the data is identical on any day.
