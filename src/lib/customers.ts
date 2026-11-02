// Customer index: every customer with recency and CASL reachability computed for "now".
// Consent validity depends on time (implied consent expires 2y after the last purchase), so it is
// computed in code rather than stored. Loading the whole list is fine at single-shop scale (a few
// thousand rows); revisit with SQL-side filtering when we move to Postgres / multiple shops.
import { prisma } from "./db";
import { consentStatus, type ConsentStatus } from "./consent";
import { daysBetween } from "./format";

export type RecencyBucket = "active" | "lapsed_30_90" | "lapsed_90_180" | "lapsed_180_plus" | "never";

export function recencyBucket(days: number | null): RecencyBucket {
  if (days === null) return "never";
  if (days < 30) return "active";
  if (days < 90) return "lapsed_30_90";
  if (days < 180) return "lapsed_90_180";
  return "lapsed_180_plus";
}

export const RECENCY_LABELS: Record<RecencyBucket, string> = {
  active: "Active (<30d)",
  lapsed_30_90: "30–90 days",
  lapsed_90_180: "90–180 days",
  lapsed_180_plus: "180+ days",
  never: "No orders",
};

export type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  neighbourhood: string | null;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: Date | null;
  daysSinceLast: number | null;
  bucket: RecencyBucket;
  sms: ConsentStatus;
  email_: ConsentStatus;
};

export async function loadCustomerIndex(now: Date = new Date()): Promise<CustomerRow[]> {
  const [customers, suppressions] = await Promise.all([
    prisma.customer.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        neighbourhood: true,
        orderCount: true,
        totalSpentCents: true,
        lastOrderAt: true,
        consents: { select: { channel: true, type: true, grantedAt: true, revokedAt: true } },
      },
    }),
    prisma.suppression.findMany({ select: { channel: true, value: true } }),
  ]);
  const suppressed = new Set(suppressions.map((s) => `${s.channel}:${s.value}`));

  return customers.map((c) => {
    const daysSinceLast = c.lastOrderAt ? daysBetween(c.lastOrderAt, now) : null;
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      email: c.email,
      neighbourhood: c.neighbourhood,
      orderCount: c.orderCount,
      totalSpentCents: c.totalSpentCents,
      lastOrderAt: c.lastOrderAt,
      daysSinceLast,
      bucket: recencyBucket(daysSinceLast),
      sms: consentStatus(c, "sms", !!c.phone && suppressed.has(`sms:${c.phone}`), now),
      email_: consentStatus(c, "email", !!c.email && suppressed.has(`email:${c.email}`), now),
    };
  });
}

// ---------- list filtering ----------
export const STATUS_FILTERS = ["all", "active", "lapsed", "lapsed_30_90", "lapsed_90_180", "lapsed_180_plus"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  lapsed: "Lapsed 30d+",
  lapsed_30_90: "30–90d",
  lapsed_90_180: "90–180d",
  lapsed_180_plus: "180d+",
};

export const CONSENT_FILTERS = ["any", "sms", "email", "either", "none"] as const;
export type ConsentFilter = (typeof CONSENT_FILTERS)[number];
export const CONSENT_FILTER_LABELS: Record<ConsentFilter, string> = {
  any: "Any consent",
  sms: "SMS opted in",
  email: "Email opted in",
  either: "Reachable",
  none: "No consent",
};

export const SORTS = ["recent", "lapsed", "orders", "spend", "name"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = {
  recent: "Most recent order",
  lapsed: "Longest since order",
  orders: "Most orders",
  spend: "Top spend",
  name: "Name",
};

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function filterCustomers(
  rows: CustomerRow[],
  opts: { q?: string; status: StatusFilter; consent: ConsentFilter; sort: Sort },
): CustomerRow[] {
  const q = opts.q?.trim().toLowerCase() ?? "";
  const qDigits = q.replace(/\D/g, "");
  const out = rows.filter((r) => {
    if (opts.status === "lapsed" && !r.bucket.startsWith("lapsed")) return false;
    if (opts.status !== "all" && opts.status !== "lapsed" && r.bucket !== opts.status) return false;
    const smsOk = r.sms === "ok";
    const emailOk = r.email_ === "ok";
    if (opts.consent === "sms" && !smsOk) return false;
    if (opts.consent === "email" && !emailOk) return false;
    if (opts.consent === "either" && !smsOk && !emailOk) return false;
    if (opts.consent === "none" && (smsOk || emailOk)) return false;
    if (q) {
      const name = `${r.firstName} ${r.lastName ?? ""}`.toLowerCase();
      const hit =
        name.includes(q) ||
        (r.email ?? "").includes(q) ||
        (r.neighbourhood ?? "").toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (r.phone ?? "").includes(qDigits));
      if (!hit) return false;
    }
    return true;
  });
  const last = (r: CustomerRow) => r.lastOrderAt?.getTime() ?? 0;
  const cmp: Record<Sort, (a: CustomerRow, b: CustomerRow) => number> = {
    recent: (a, b) => last(b) - last(a),
    lapsed: (a, b) => last(a) - last(b),
    orders: (a, b) => b.orderCount - a.orderCount,
    spend: (a, b) => b.totalSpentCents - a.totalSpentCents,
    name: (a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  };
  return out.sort(cmp[opts.sort]);
}
