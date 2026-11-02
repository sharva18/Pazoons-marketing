/**
 * RepeatSlice mock-data seed for Pazoon's Pizza.
 *
 * MOCK DATA ONLY: every phone number is in the reserved fictional 555-0100…555-0199 range and
 * every email is @example.com. Deterministic: a fixed RNG seed gives the same customers every run.
 * Dates are relative to "now" (or SEED_NOW=YYYY-MM-DD to pin it completely).
 *
 * Run: npm run db:reset   (or npm run db:seed on an existing schema)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  DEALS,
  NEIGHBOURHOODS,
  ORDER_CHANNELS,
  DIRECT_ORDER_CHANNELS,
  SHOP,
  type OrderChannel,
  type Deal,
} from "../src/lib/constants";
import { createRng } from "../src/lib/random";
import { canContact, impliedConsentExpiry } from "../src/lib/consent";
import { isFictionalPhone } from "../src/lib/contact";
import { buildSmsBody, buildEmailBody } from "../src/lib/compliance";
import { countSms } from "../src/lib/sms";
import { unsubscribeUrl } from "../src/lib/messaging/tokens";

const prisma = new PrismaClient();

const SEED = 6734444; // fixed random seed (shop phone digits)
const CUSTOMER_COUNT = 1200;
const DAY = 86_400_000;
const LOCAL_OFFSET_H = -5; // America/Toronto standard time; good enough for mock timestamps

const NOW = process.env.SEED_NOW
  ? new Date(process.env.SEED_NOW.includes("T") ? process.env.SEED_NOW : `${process.env.SEED_NOW}T17:00:00-05:00`)
  : new Date();
const rng = createRng(SEED);

// ---------- helpers ----------
const daysAgo = (d: Date) => Math.floor((NOW.getTime() - d.getTime()) / DAY);
const cents = (dollars: number) => Math.round(dollars * 100);

/** Midnight (shop local) of the day containing `d`, as a UTC Date. */
function localMidnight(d: Date): Date {
  const local = d.getTime() + LOCAL_OFFSET_H * 3600_000;
  return new Date(Math.floor(local / DAY) * DAY - LOCAL_OFFSET_H * 3600_000);
}
function localDow(d: Date): number {
  return new Date(d.getTime() + LOCAL_OFFSET_H * 3600_000).getUTCDay(); // 0 = Sunday
}

/** A realistic order time on the local day `daysBack` days before NOW (late nights Fri/Sat). */
function orderTime(daysBack: number): Date {
  const day = new Date(localMidnight(NOW).getTime() - daysBack * DAY);
  const dow = localDow(day);
  const late = dow === 5 || dow === 6;
  // lunch 11–14, dinner 16–21 (peak), late 21–02 on Fri/Sat
  const slot = rng.next();
  let hour: number;
  if (slot < 0.18) hour = rng.float(11, 14);
  else if (slot < (late ? 0.72 : 0.92)) hour = rng.float(16, 21);
  else hour = late ? rng.float(21, 26) : rng.float(21, 22.5);
  return new Date(day.getTime() + hour * 3600_000);
}

function bucketOf(days: number): number {
  return days < 30 ? 0 : days < 90 ? 1 : days < 180 ? 2 : 3;
}

/** Last-order time that is guaranteed to fall inside recency bucket `b` and not in the future. */
function lastOrderTimeInBucket(b: number): Date {
  const ranges: [number, number][] = [
    [0, 29],
    [30, 89],
    [90, 179],
    [180, 800], // a slice of these are > 2 years → implied consent expired
  ];
  // Uses a fixed number of RNG draws (so every later customer is identical whatever the time of day),
  // then nudges the time deterministically if it landed in the future or across a bucket edge.
  let t = orderTime(rng.int(...ranges[b]));
  if (t >= NOW) t = new Date(NOW.getTime() - 3600_000);
  for (let i = 0; i < 3 && bucketOf(daysAgo(t)) !== b; i++) {
    t = new Date(t.getTime() + (bucketOf(daysAgo(t)) < b ? -DAY : DAY));
  }
  return t;
}

function dealPrice(deal: Deal): number {
  if (deal.minPrice === deal.maxPrice) return deal.minPrice;
  // four sizes, prices ending in .99
  const k = rng.int(0, 3);
  const raw = deal.minPrice + (k * (deal.maxPrice - deal.minPrice)) / 3;
  return Math.round(raw + 0.01) - 0.01;
}

const DEAL_WEIGHTS: Record<string, number> = {
  "Single Deal": 24,
  "Double Deal": 20,
  "Family Deal": 18,
  "Pizza & Wings": 13,
  "2 Can Dine": 12,
  "Wings (10)": 5,
  Panzerotti: 8,
  "Cheesy breadsticks": 0, // only as an add-on
};
const MAIN_DEALS = DEALS.filter((d) => DEAL_WEIGHTS[d.name] > 0);
const STICKS = DEALS.find((d) => d.name === "Cheesy breadsticks")!;
const WINGS = DEALS.find((d) => d.name === "Wings (10)")!;

const CHANNEL_WEIGHTS: Record<OrderChannel, number> = {
  phone: 30,
  walk_in: 14,
  doordash: 26,
  ubereats: 18,
  online: 12,
};

// ---------- names ----------
const FIRST = [
  "Liam", "Olivia", "Noah", "Emma", "Ethan", "Ava", "Lucas", "Sophia", "Mason", "Charlotte", "Logan", "Amelia",
  "Jacob", "Chloe", "Owen", "Emily", "Benjamin", "Abigail", "William", "Hannah", "James", "Madison", "Jack",
  "Grace", "Ryan", "Avery", "Nathan", "Ella", "Tyler", "Zoe", "Dylan", "Lily", "Connor", "Brooklyn", "Matthew",
  "Isabella", "Daniel", "Mia", "Alexander", "Sarah", "Aiden", "Jessica", "Carter", "Megan", "Hunter", "Taylor",
  "Brandon", "Kayla", "Justin", "Ashley", "Kyle", "Nicole", "Josh", "Rachel", "Cole", "Paige", "Evan", "Jasmine",
  "Mohammed", "Fatima", "Ali", "Aisha", "Omar", "Zainab", "Raj", "Priya", "Arjun", "Ananya", "Wei", "Mei",
  "Jun", "Hana", "Minh", "Linh", "Diego", "Sofia", "Mateo", "Valeria", "Kwame", "Amara", "Tariq", "Leila",
  "Mike", "Dave", "Steve", "Chris", "Jen", "Lisa", "Karen", "Mark", "Paul", "Sandra", "Brian", "Michelle",
];
const LAST = [
  "Smith", "Brown", "Tremblay", "Martin", "Roy", "Wilson", "MacDonald", "Gagnon", "Johnson", "Taylor", "Campbell",
  "Anderson", "Lee", "Jones", "White", "Williams", "Miller", "Thompson", "Young", "Scott", "Stewart", "Reid",
  "Murray", "Clarke", "Ross", "Fraser", "Graham", "Wright", "Walker", "Robinson", "Mitchell", "Kelly", "Wood",
  "Patel", "Singh", "Khan", "Nguyen", "Chen", "Wang", "Li", "Kim", "Park", "Ahmed", "Hussein", "Ali", "Garcia",
  "Rodriguez", "Silva", "Santos", "Haddad", "Mensah", "Okafor", "Dimitrov", "Kowalski", "Novak", "Rossi",
  "Ferreira", "Costa", "De Vries", "Van Dyk", "Sullivan", "O'Brien", "Murphy", "Byrne", "Fischer", "Bauer",
];

// ---------- fictional phone pool: 555-0100..0199 across 12 area codes = 1,200 unique numbers ----------
const AREA_CODES = ["519", "226", "548", "289", "365", "416", "437", "647", "905", "613", "343", "705"];
const PHONE_POOL = rng.shuffle(
  AREA_CODES.flatMap((ac) => Array.from({ length: 100 }, (_, i) => `+1${ac}55501${String(i).padStart(2, "0")}`)),
);

// ---------- generate ----------
type GenOrder = Prisma.OrderCreateManyInput & { id: string; placedAt: Date; channel: OrderChannel; totalCents: number };
type GenCustomer = Prisma.CustomerCreateManyInput & { id: string; orders: GenOrder[] };

function generate() {
  // exact recency split: 38 / 28 / 19 / 15 %
  const bucketCounts = [456, 336, 228, 180];
  const buckets = rng.shuffle(bucketCounts.flatMap((n, b) => Array<number>(n).fill(b)));

  const customers: GenCustomer[] = [];
  const usedEmails = new Set<string>();
  let phoneIdx = 0;
  let orderSeq = 0;

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const id = `cus_${String(i + 1).padStart(4, "0")}`;
    const firstName = rng.pick(FIRST);
    const lastName = rng.pick(LAST);
    const hood = rng.weighted(NEIGHBOURHOODS, (n) => n.weight);
    const bucket = buckets[i];

    // order frequency tier, skewed by recency (recent customers are more often regulars)
    const tierWeights = [
      [30, 34, 25, 11], // active
      [42, 34, 18, 6],
      [55, 31, 11, 3],
      [70, 24, 5, 1], // 180+
    ][bucket];
    const tier = rng.weighted([0, 1, 2, 3], (t) => tierWeights[t]);
    let count = [1, rng.int(2, 4), rng.int(5, 12), rng.int(13, 40)][tier];
    const avgGap = [0, rng.int(25, 70), rng.int(14, 30), rng.int(6, 13)][tier];

    const prefChannel = rng.weighted(ORDER_CHANNELS, (c) => CHANNEL_WEIGHTS[c]);
    const favDeal = rng.weighted(MAIN_DEALS, (d) => DEAL_WEIGHTS[d.name]);

    // build order times backwards from the last order, max ~3 years of history
    const last = lastOrderTimeInBucket(bucket);
    const times: Date[] = [last];
    let back = daysAgo(last);
    for (let k = 1; k < count; k++) {
      back += Math.max(2, Math.round(avgGap * rng.float(0.5, 1.5)));
      if (back > 1095) break;
      times.push(orderTime(back));
    }
    count = times.length;
    times.reverse();

    const orders: GenOrder[] = times.map((placedAt) => {
      const channel: OrderChannel = rng.chance(0.72)
        ? prefChannel
        : rng.weighted(ORDER_CHANNELS, (c) => CHANNEL_WEIGHTS[c]);
      const deal = rng.chance(0.6) ? favDeal : rng.weighted(MAIN_DEALS, (d) => DEAL_WEIGHTS[d.name]);
      let total = dealPrice(deal);
      const items = [deal.name];
      if (rng.chance(0.2)) {
        total += STICKS.minPrice;
        items.push(STICKS.name);
      }
      if (deal.name !== "Wings (10)" && deal.name !== "Family Deal" && rng.chance(0.1)) {
        total += WINGS.minPrice;
        items.push(WINGS.name);
      }
      orderSeq++;
      return {
        id: `ord_${String(orderSeq).padStart(6, "0")}`,
        customerId: id,
        placedAt,
        channel,
        totalCents: cents(total),
        dealName: deal.name,
        items: items.join(" + "),
      };
    });

    // contact details — app-only customers are less likely to have given us contact info
    const appHeavy = prefChannel === "doordash" || prefChannel === "ubereats";
    const hasPhone = rng.chance(appHeavy ? 0.86 : 0.97);
    const hasEmail = rng.chance(appHeavy ? 0.78 : 0.86);
    const phone = hasPhone ? PHONE_POOL[phoneIdx++] : null;
    let email: string | null = null;
    if (hasEmail) {
      const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, "");
      let candidate = `${base}@example.com`;
      for (let n = 2; usedEmails.has(candidate); n++) candidate = `${base}${n}@example.com`;
      usedEmails.add(candidate);
      email = candidate;
    }

    const hasBirthday = rng.chance(0.42);
    const birthMonth = hasBirthday ? rng.int(1, 12) : null;
    const birthDay = hasBirthday ? rng.int(1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][birthMonth! - 1]) : null;

    customers.push({
      id,
      firstName,
      lastName,
      phone,
      email,
      neighbourhood: hood.name,
      postalFsa: hood.fsa,
      birthMonth,
      birthDay,
      source: "seed",
      createdAt: orders[0].placedAt,
      firstOrderAt: orders[0].placedAt,
      lastOrderAt: orders[orders.length - 1].placedAt,
      orderCount: orders.length,
      totalSpentCents: orders.reduce((s, o) => s + o.totalCents, 0),
      orders,
    });
  }
  return customers;
}

// ---------- consent (CASL) ----------
type GenConsent = Prisma.ConsentCreateManyInput;
type GenSuppression = Prisma.SuppressionCreateManyInput;
type GenMessage = Prisma.MessageCreateManyInput;

function generateConsents(customers: GenCustomer[]) {
  const consents: GenConsent[] = [];
  const suppressions: GenSuppression[] = [];
  const inbound: GenMessage[] = [];
  const twoYearsAgo = new Date(NOW.getTime() - 730 * DAY);

  const plan = (
    channel: "sms" | "email",
    targetValid: number,
    revokedCount: number,
    expressShare: number,
  ) => {
    const withAddress = rng.shuffle(customers.filter((c) => (channel === "sms" ? c.phone : c.email)));
    const valid = withAddress.slice(0, targetValid);
    const rest = withAddress.slice(targetValid);

    for (const c of valid) {
      const lastOrderAt = c.lastOrderAt as Date;
      // implied consent from purchase only works if the last purchase is < 2 years ago
      const express = rng.chance(expressShare) || lastOrderAt < twoYearsAgo;
      const first = c.firstOrderAt as Date;
      const grantedAt = express
        ? new Date(first.getTime() + rng.float(0, Math.max(0, lastOrderAt.getTime() - first.getTime())))
        : first;
      consents.push({
        customerId: c.id,
        channel,
        type: express ? "express" : "implied",
        grantedAt,
        source: express ? rng.weighted(["optin_page", "counter", "phone_call"] as const, (s) => ({ optin_page: 5, counter: 3, phone_call: 2 })[s]) : "purchase",
        evidence: express ? "Mock seed: express consent" : "Mock seed: implied consent from purchase",
      });
    }

    // customers who opted out (STOP / unsubscribe): revoked consent + suppression entry
    const revoked = rest.slice(0, revokedCount);
    for (const c of revoked) {
      const first = c.firstOrderAt as Date;
      const revokedAt = new Date(NOW.getTime() - rng.int(3, 200) * DAY);
      const grantedAt = new Date(Math.min(first.getTime(), revokedAt.getTime() - DAY));
      const reason = channel === "sms" ? "STOP" : "unsubscribe";
      consents.push({
        customerId: c.id,
        channel,
        type: "implied",
        grantedAt,
        source: "purchase",
        revokedAt,
        revokeReason: reason,
        evidence: "Mock seed",
      });
      const value = channel === "sms" ? c.phone! : c.email!;
      suppressions.push({ channel, value, reason, createdAt: revokedAt });
      if (channel === "sms") {
        inbound.push({
          customerId: c.id,
          direction: "inbound",
          channel: "sms",
          to: process.env.TWILIO_FROM_NUMBER || "+15005550006",
          from: value,
          body: rng.pick(["STOP", "Stop", "STOP", "unsubscribe"]),
          status: "received",
          provider: "test",
          testMode: true,
          createdAt: revokedAt,
          sentAt: revokedAt,
        });
      }
    }

    // implied consent that has EXPIRED (last purchase > 2 years ago) — shows the CASL expiry rule working
    for (const c of rest.slice(revokedCount)) {
      if ((c.lastOrderAt as Date) < twoYearsAgo) {
        consents.push({
          customerId: c.id,
          channel,
          type: "implied",
          grantedAt: c.firstOrderAt as Date,
          source: "purchase",
          evidence: `Mock seed: expired ${impliedConsentExpiry(c.lastOrderAt as Date).toISOString().slice(0, 10)}`,
        });
      }
    }
  };

  plan("sms", Math.round(CUSTOMER_COUNT * 0.58), 24, 0.45);
  plan("email", Math.round(CUSTOMER_COUNT * 0.71), 31, 0.3);
  return { consents, suppressions, inbound };
}

// ---------- automations ----------
const GOOGLE_REVIEW_URL = "https://g.page/r/EXAMPLE-PAZOONS/review"; // placeholder until the owner gives us the real link

const AUTOMATIONS: Prisma.AutomationCreateInput[] = [
  {
    key: "winback",
    name: "Win-back",
    description: "30 days without an order → a come-back offer. Max once every 60 days per customer.",
    enabled: true,
    channel: "both",
    body: "Hey {name}, we miss you! Get $5 off any Family Deal this week with code COMEBACK. Call 519-673-4444 or walk in - ordering direct gets you the best price.",
    promoCode: "COMEBACK",
    config: JSON.stringify({ daysWithoutOrder: 30, cooldownDays: 60, discountCents: 500 }),
  },
  {
    key: "first_order_thanks",
    name: "First-order thank you",
    description: "The day after a customer's first order: thanks + $5 off their second order.",
    enabled: true,
    channel: "both",
    body: "Thanks for your first order, {name}! Here's $5 off your next one with code THANKS5 - call 519-673-4444 or walk in at 1030 Adelaide St N.",
    promoCode: "THANKS5",
    config: JSON.stringify({ sendDaysAfterFirstOrder: 1, discountCents: 500 }),
  },
  {
    key: "birthday_week",
    name: "Birthday week",
    description: "At the start of a customer's birthday week: a birthday treat.",
    enabled: false,
    channel: "both",
    body: "Happy birthday week, {name}!! Free cheesy breadsticks with any deal - use code BDAY when you call 519-673-4444 or walk in.",
    promoCode: "BDAY",
    config: JSON.stringify({ daysBefore: 3, discountCents: 799 }),
  },
  {
    key: "fifth_order",
    name: "5th order reward",
    description: "When a customer places their 5th order: free cheesy breadsticks on the next one.",
    enabled: false,
    channel: "both",
    body: "{name}, that's 5 orders - you're officially a regular! Your next order comes with FREE cheesy breadsticks. Code FREESTIX, call 519-673-4444.",
    promoCode: "FREESTIX",
    config: JSON.stringify({ orderNumber: 5, discountCents: 799 }),
  },
  {
    key: "feedback",
    name: "How was it?",
    description:
      "A couple of hours after each order: ask for a 1–5 rating. 1–3 goes privately to the owner; 4–5 gets the Google review link.",
    enabled: true,
    channel: "sms",
    body: "Hi {name}, how was your order tonight? Reply 1-5 (5 = amazing).",
    config: JSON.stringify({
      sendMinutesAfterOrder: 120,
      minDaysBetween: 14,
      complaintMaxScore: 3,
      ownerAlertPhone: "+15195550100",
      googleReviewUrl: GOOGLE_REVIEW_URL,
    }),
  },
];

// ---------- past campaigns (demo history for results screens) ----------
type PastCampaign = {
  name: string;
  channel: "sms" | "email";
  segmentKey: string;
  subject?: string;
  body: string;
  promoCode: string;
  discountCents: number;
  sentDaysAgo: number;
  /** segment test, evaluated "as of" the send date from order history */
  inSegment: (daysSinceLastAtSend: number) => boolean;
  redeemRate: number;
};

const PAST_CAMPAIGNS: PastCampaign[] = [
  {
    name: "Late-night Friday — order direct",
    channel: "sms",
    segmentKey: "active",
    body: "Up late, {name}? We're open late Fri & Sat. $5 off any Double Deal after 9pm with code LATENITE - call 519-673-4444, skip the app fees.",
    promoCode: "LATENITE",
    discountCents: 500,
    sentDaysAgo: 24,
    inSegment: (d) => d < 30,
    redeemRate: 0.22,
  },
  {
    name: "We miss you — Family Deal",
    channel: "email",
    segmentKey: "lapsed_30_90",
    subject: "It's been a while, {name} — $7 off a Family Deal",
    body: "Hi {name},\n\nIt's been a while! Grab a Family Deal (2 pizzas, 15 wings, 6 pops and breadsticks or wedges) and take $7 off with code MISSYOU.\n\nOrder direct — call 519-673-4444 or walk in at 1030 Adelaide St N. Skipping DoorDash and Uber Eats means better prices for you.\n\nSee you soon,\nPazoon's Pizza",
    promoCode: "MISSYOU",
    discountCents: 700,
    sentDaysAgo: 45,
    inSegment: (d) => d >= 30 && d < 90,
    redeemRate: 0.35,
  },
];

// ---------- main ----------
async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  console.log(`Seeding RepeatSlice mock data for ${SHOP.name} (seed ${SEED}, now ${NOW.toISOString()})`);

  const customers = generate();
  const { consents, suppressions, inbound } = generateConsents(customers);

  // safety checks: mock data only
  for (const c of customers) {
    if (c.phone && !isFictionalPhone(c.phone)) throw new Error(`Non-fictional phone generated: ${c.phone}`);
    if (c.email && !c.email.endsWith("@example.com")) throw new Error(`Non-example email generated: ${c.email}`);
  }

  // wipe (children first)
  await prisma.$transaction([
    prisma.redemption.deleteMany(),
    prisma.message.deleteMany(),
    prisma.automationRun.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.automation.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.suppression.deleteMany(),
    prisma.order.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  const allOrders = customers.flatMap((c) => c.orders);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  await chunked(customers.map(({ orders: _orders, ...c }) => c), 500, (data) => prisma.customer.createMany({ data }));
  await chunked(allOrders, 1000, (data) => prisma.order.createMany({ data }));
  await chunked(consents, 1000, (data) => prisma.consent.createMany({ data }));
  await prisma.suppression.createMany({ data: suppressions });
  await prisma.message.createMany({ data: inbound });

  const automations = [];
  for (const a of AUTOMATIONS) automations.push(await prisma.automation.create({ data: a }));

  // past campaigns, sent in test mode
  const consentByCustomer = new Map<string, GenConsent[]>();
  for (const c of consents) {
    const list = consentByCustomer.get(c.customerId) ?? [];
    list.push(c);
    consentByCustomer.set(c.customerId, list);
  }
  const suppressed = new Set(suppressions.map((s) => `${s.channel}:${s.value}`));

  for (const pc of PAST_CAMPAIGNS) {
    // 5pm local on the send day — inside the 9am–9pm SMS window
    const sentAt = new Date(localMidnight(NOW).getTime() - pc.sentDaysAgo * DAY + 17 * 3600_000);
    let excluded = 0;
    const recipients: GenCustomer[] = [];
    for (const c of customers) {
      const before = c.orders.filter((o) => o.placedAt < sentAt);
      if (before.length === 0) continue;
      const lastBefore = before[before.length - 1].placedAt;
      if (!pc.inSegment(Math.floor((sentAt.getTime() - lastBefore.getTime()) / DAY))) continue;
      const address = pc.channel === "sms" ? c.phone : c.email;
      const ok = canContact(
        {
          phone: c.phone ?? null,
          email: c.email ?? null,
          lastOrderAt: lastBefore,
          consents: (consentByCustomer.get(c.id) ?? []).map((x) => ({
            channel: x.channel,
            type: x.type,
            grantedAt: new Date(x.grantedAt),
            revokedAt: x.revokedAt ? new Date(x.revokedAt) : null,
          })),
        },
        pc.channel,
        !!address && suppressed.has(`${pc.channel}:${address}`),
        sentAt,
      );
      if (ok) recipients.push(c);
      else excluded++;
    }

    const segPerMsg = pc.channel === "sms" ? countSms(buildSmsBody(pc.body, "Alexander")).segments : 1;
    const campaign = await prisma.campaign.create({
      data: {
        name: pc.name,
        channel: pc.channel,
        segment: pc.segmentKey,
        subject: pc.subject,
        body: pc.body,
        promoCode: pc.promoCode,
        status: "sent",
        scheduledAt: sentAt,
        sentAt,
        recipientCount: recipients.length,
        excludedCount: excluded,
        estCostCents: Math.round(recipients.length * (pc.channel === "sms" ? 0.83 * segPerMsg : 0.12)),
        testMode: true,
        createdAt: new Date(sentAt.getTime() - 2 * 3600_000),
      },
    });

    const messages: GenMessage[] = [];
    const redemptions: Prisma.RedemptionCreateManyInput[] = [];
    for (const c of recipients) {
      const isSms = pc.channel === "sms";
      const body = isSms
        ? buildSmsBody(pc.body, c.firstName)
        : buildEmailBody(pc.body, c.firstName, unsubscribeUrl(c.id));
      messages.push({
        customerId: c.id,
        campaignId: campaign.id,
        channel: pc.channel,
        to: isSms ? c.phone! : c.email!,
        from: isSms ? "+15005550006" : "promos@example.com",
        subject: pc.subject?.replace("{name}", c.firstName),
        body,
        segments: isSms ? countSms(body).segments : 1,
        status: "delivered",
        provider: "test",
        testMode: true,
        createdAt: sentAt,
        sentAt,
      });
      // redeemed if the customer placed a DIRECT order within 14 days of the send
      const redeemOrder = c.orders.find(
        (o) =>
          o.placedAt > sentAt &&
          o.placedAt.getTime() - sentAt.getTime() < 14 * DAY &&
          DIRECT_ORDER_CHANNELS.includes(o.channel),
      );
      const redeemed = !!redeemOrder && rng.chance(pc.redeemRate * 2.5);
      redemptions.push({
        code: pc.promoCode,
        customerId: c.id,
        campaignId: campaign.id,
        issuedAt: sentAt,
        redeemedAt: redeemed ? redeemOrder!.placedAt : null,
        orderId: redeemed ? redeemOrder!.id : null,
        discountCents: pc.discountCents,
      });
    }
    await chunked(messages, 1000, (data) => prisma.message.createMany({ data }));
    await chunked(redemptions, 1000, (data) => prisma.redemption.createMany({ data }));
  }

  await printSummary(automations.length);
}

async function printSummary(automationCount: number) {
  const customers = await prisma.customer.findMany({ include: { consents: true } });
  const supp = new Set((await prisma.suppression.findMany()).map((s) => `${s.channel}:${s.value}`));
  const orders = await prisma.order.aggregate({ _count: true, _avg: { totalCents: true } });
  const byChannel = await prisma.order.groupBy({ by: ["channel"], _count: true });
  const buckets = [0, 0, 0, 0];
  let sms = 0;
  let email = 0;
  let repeat = 0;
  const hoods = new Map<string, number>();
  for (const c of customers) {
    buckets[bucketOf(daysAgo(c.lastOrderAt!))]++;
    if (c.orderCount > 1) repeat++;
    hoods.set(c.neighbourhood!, (hoods.get(c.neighbourhood!) ?? 0) + 1);
    if (canContact(c, "sms", !!c.phone && supp.has(`sms:${c.phone}`), NOW)) sms++;
    if (canContact(c, "email", !!c.email && supp.has(`email:${c.email}`), NOW)) email++;
  }
  const pct = (n: number) => `${((100 * n) / customers.length).toFixed(1)}%`;
  const redemptions = await prisma.redemption.groupBy({ by: ["code"], _count: { _all: true, redeemedAt: true } });

  console.log(`\nCustomers:        ${customers.length}`);
  console.log(`Orders:           ${orders._count}  (avg $${((orders._avg.totalCents ?? 0) / 100).toFixed(2)})`);
  console.log(`Repeat rate:      ${pct(repeat)}`);
  console.log(
    `Recency:          <30d ${pct(buckets[0])} · 30–90d ${pct(buckets[1])} · 90–180d ${pct(buckets[2])} · 180d+ ${pct(buckets[3])}`,
  );
  console.log(`SMS reachable:    ${sms} (${pct(sms)})`);
  console.log(`Email reachable:  ${email} (${pct(email)})`);
  console.log(`Suppressed:       ${supp.size}`);
  console.log(`Order channels:   ${byChannel.map((c) => `${c.channel} ${c._count}`).join(" · ")}`);
  console.log(
    `Neighbourhoods:   ${[...hoods.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ${n}`).join(" · ")}`,
  );
  console.log(`Automations:      ${automationCount}`);
  for (const r of redemptions) console.log(`Promo ${r.code.padEnd(9)} issued ${r._count._all}, redeemed ${r._count.redeemedAt}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
