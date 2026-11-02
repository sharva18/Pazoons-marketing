import Link from "next/link";

export type BarItem = { label: string; value: number; sub?: string; href?: string };

/** Single-series horizontal bars with direct labels (one hue; identity is the row label). */
export function BarList({ items, total, unit = "customers" }: { items: BarItem[]; total: number; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = total ? item.value / total : 0;
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="tabular-nums text-ink-2">
                <span className="font-semibold text-ink">{item.value.toLocaleString("en-CA")}</span>
                <span className="text-muted"> · {(pct * 100).toFixed(0)}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full">
              <div
                className="h-full rounded-r-[4px] bg-series"
                style={{ width: `${Math.max(1, (item.value / max) * 100)}%` }}
                title={`${item.label}: ${item.value.toLocaleString("en-CA")} ${unit} (${(pct * 100).toFixed(1)}%)`}
              />
            </div>
            {item.sub && <div className="mt-1 text-xs text-muted">{item.sub}</div>}
          </>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className="-m-1 block rounded-lg p-1 hover:bg-card-2">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
