import { getOverviewStats } from "@/lib/stats";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import { Card, CardTitle, PageTitle, Stat } from "@/components/ui";
import { BarList } from "@/components/BarList";
import { WinbackEstimator } from "@/components/WinbackEstimator";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const s = await getOverviewStats();
  const pct = (n: number) => formatPct(s.total ? n / s.total : 0);

  return (
    <>
      <PageTitle sub="How many customers come back — and how many we could win back.">Overview</PageTitle>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Customers" value={formatNumber(s.total)} sub={`${formatNumber(s.buckets.active)} ordered in last 30d`} />
        <Stat
          label="Repeat rate"
          value={formatPct(s.repeatRate)}
          sub={`${formatNumber(s.repeat)} ordered 2+ times`}
        />
        <Stat label="Lapsed 30d+" value={formatNumber(s.lapsedTotal)} sub={`${pct(s.lapsedTotal)} of customers`} />
        <Stat label="Avg order" value={formatMoney(s.avgOrderCents)} sub="last 12 months" />
      </div>

      <Card className="mt-4">
        <CardTitle hint="Days since each customer's last order. Tap a row to see who.">Last order</CardTitle>
        <BarList
          total={s.total}
          items={[
            { label: "Last 30 days", value: s.buckets.active, href: "/customers?status=active" },
            {
              label: "30–90 days",
              value: s.buckets.lapsed_30_90,
              sub: `${formatNumber(s.lapsedReachable.lapsed_30_90)} can be messaged`,
              href: "/customers?status=lapsed_30_90",
            },
            {
              label: "90–180 days",
              value: s.buckets.lapsed_90_180,
              sub: `${formatNumber(s.lapsedReachable.lapsed_90_180)} can be messaged`,
              href: "/customers?status=lapsed_90_180",
            },
            {
              label: "180+ days",
              value: s.buckets.lapsed_180_plus,
              sub: `${formatNumber(s.lapsedReachable.lapsed_180_plus)} can be messaged`,
              href: "/customers?status=lapsed_180_plus",
            },
          ]}
        />
      </Card>

      <Card className="mt-4">
        <CardTitle hint="Valid CASL consent and not opted out.">Who we can reach</CardTitle>
        <BarList
          total={s.total}
          items={[
            { label: "By SMS", value: s.reach.sms, href: "/customers?consent=sms" },
            { label: "By email", value: s.reach.email, href: "/customers?consent=email" },
            { label: "By SMS or email", value: s.reach.either, href: "/customers?consent=either" },
            { label: "Can't contact", value: s.reach.neither, href: "/customers?consent=none" },
          ]}
        />
      </Card>

      <Card className="mt-4">
        <CardTitle hint="What bringing lapsed customers back could be worth. Move the sliders.">
          Win-back estimate
        </CardTitle>
        <WinbackEstimator
          lapsed={{
            lapsed_30_90: s.buckets.lapsed_30_90,
            lapsed_90_180: s.buckets.lapsed_90_180,
            lapsed_180_plus: s.buckets.lapsed_180_plus,
          }}
          lapsedReachable={{
            lapsed_30_90: s.lapsedReachable.lapsed_30_90,
            lapsed_90_180: s.lapsedReachable.lapsed_90_180,
            lapsed_180_plus: s.lapsedReachable.lapsed_180_plus,
          }}
          avgOrderCents={s.avgOrderCents}
        />
      </Card>
    </>
  );
}
