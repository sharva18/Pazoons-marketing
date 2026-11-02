export const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

const money0 = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const num = new Intl.NumberFormat("en-CA");

export const formatMoney = (cents: number, decimals = true) => (decimals ? money2 : money0).format(cents / 100);
export const formatNumber = (n: number) => num.format(n);
export const formatPct = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;

export function formatDaysAgo(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.round(days / 30.4)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

export function formatDate(d: Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  return d.toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
