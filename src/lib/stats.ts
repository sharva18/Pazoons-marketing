import { prisma } from "./db";
import { loadCustomerIndex, type RecencyBucket } from "./customers";
import { DAY_MS } from "./format";

export type OverviewStats = Awaited<ReturnType<typeof getOverviewStats>>;

export async function getOverviewStats(now: Date = new Date()) {
  const rows = await loadCustomerIndex(now);
  const yearAgo = new Date(now.getTime() - 365 * DAY_MS);
  const [orders12m, ordersAll] = await Promise.all([
    prisma.order.aggregate({ where: { placedAt: { gte: yearAgo } }, _avg: { totalCents: true }, _count: true }),
    prisma.order.aggregate({ _avg: { totalCents: true } }),
  ]);

  const buckets: Record<RecencyBucket, number> = {
    active: 0,
    lapsed_30_90: 0,
    lapsed_90_180: 0,
    lapsed_180_plus: 0,
    never: 0,
  };
  // lapsed customers by bucket, split by whether we're allowed to message them
  const lapsedReachable: Record<string, number> = { lapsed_30_90: 0, lapsed_90_180: 0, lapsed_180_plus: 0 };
  let repeat = 0;
  let sms = 0;
  let email = 0;
  let either = 0;
  for (const r of rows) {
    buckets[r.bucket]++;
    if (r.orderCount > 1) repeat++;
    const s = r.sms === "ok";
    const e = r.email_ === "ok";
    if (s) sms++;
    if (e) email++;
    if (s || e) {
      either++;
      if (r.bucket in lapsedReachable) lapsedReachable[r.bucket]++;
    }
  }
  const total = rows.length;
  return {
    total,
    repeat,
    repeatRate: total ? repeat / total : 0,
    buckets,
    lapsedTotal: buckets.lapsed_30_90 + buckets.lapsed_90_180 + buckets.lapsed_180_plus,
    lapsedReachable,
    reach: { sms, email, either, neither: total - either },
    avgOrderCents: Math.round(orders12m._avg.totalCents ?? ordersAll._avg.totalCents ?? 0),
    orders12m: orders12m._count,
  };
}
