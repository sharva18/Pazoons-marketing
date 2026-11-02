"use client";

import { useState } from "react";

type BucketKey = "lapsed_30_90" | "lapsed_90_180" | "lapsed_180_plus";
const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "lapsed_30_90", label: "30–90d" },
  { key: "lapsed_90_180", label: "90–180d" },
  { key: "lapsed_180_plus", label: "180d+" },
];

const fmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-CA");

export function WinbackEstimator({
  lapsed,
  lapsedReachable,
  avgOrderCents,
}: {
  lapsed: Record<BucketKey, number>;
  lapsedReachable: Record<BucketKey, number>;
  avgOrderCents: number;
}) {
  const [selected, setSelected] = useState<Record<BucketKey, boolean>>({
    lapsed_30_90: true,
    lapsed_90_180: true,
    lapsed_180_plus: true,
  });
  const [reachableOnly, setReachableOnly] = useState(true);
  const [returnPct, setReturnPct] = useState(15);
  const [avgOrder, setAvgOrder] = useState(Math.round(avgOrderCents / 100) || 36);
  const [extraOrders, setExtraOrders] = useState(4);

  const source = reachableOnly ? lapsedReachable : lapsed;
  const pool = BUCKETS.reduce((s, b) => s + (selected[b.key] ? source[b.key] : 0), 0);
  const returning = Math.round((pool * returnPct) / 100);
  const revenue = returning * avgOrder * extraOrders;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm text-ink-2">Which lapsed customers?</div>
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              aria-pressed={selected[b.key]}
              onClick={() => setSelected((s) => ({ ...s, [b.key]: !s[b.key] }))}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                selected[b.key] ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2"
              }`}
            >
              {b.label} · {num.format(source[b.key])}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={reachableOnly}
            onChange={(e) => setReachableOnly(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Only customers we can legally message (SMS or email consent)
        </label>
      </div>

      <Slider
        label="Come back"
        value={returnPct}
        display={`${returnPct}%`}
        min={1}
        max={50}
        onChange={setReturnPct}
        hint={`${num.format(returning)} of ${num.format(pool)} customers`}
      />
      <Slider label="Average order" value={avgOrder} display={`$${avgOrder}`} min={15} max={70} onChange={setAvgOrder} />
      <Slider
        label="Extra orders per year"
        value={extraOrders}
        display={`${extraOrders}×`}
        min={1}
        max={12}
        onChange={setExtraOrders}
        hint="per returning customer"
      />

      <div className="rounded-xl bg-card-2 p-4">
        <div className="text-sm text-ink-2">Estimated extra revenue per year</div>
        <div className="mt-1 text-4xl font-bold tabular-nums tracking-tight" aria-live="polite">
          {fmt.format(revenue)}
        </div>
        <div className="mt-1 text-xs text-muted tabular-nums">
          {num.format(returning)} customers × ${avgOrder} × {extraOrders} orders
          {" · "}≈ {fmt.format(revenue / 12)}/month
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full"
      />
      {hint && <div className="text-xs text-muted tabular-nums">{hint}</div>}
    </label>
  );
}
