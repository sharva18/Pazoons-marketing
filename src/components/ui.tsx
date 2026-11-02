import type { ReactNode } from "react";
import type { ConsentStatus } from "@/lib/consent";
import { CONSENT_STATUS_LABELS } from "@/lib/consent";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Consent badge: icon + label, never colour alone. */
export function ConsentBadge({ channel, status }: { channel: "SMS" | "Email"; status: ConsentStatus }) {
  const ok = status === "ok";
  const muted = status === "no_address";
  return (
    <span
      title={`${channel}: ${CONSENT_STATUS_LABELS[status]}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        ok ? "border-good/40 text-good" : muted ? "border-line text-muted" : "border-bad/40 text-bad"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : muted ? "–" : "✕"}</span>
      {channel}
      {!ok && !muted && <span className="sr-only"> {CONSENT_STATUS_LABELS[status]}</span>}
    </span>
  );
}
