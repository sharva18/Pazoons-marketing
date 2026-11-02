import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { consentStatus, impliedConsentExpiry, CONSENT_STATUS_LABELS } from "@/lib/consent";
import { formatPhone } from "@/lib/contact";
import { formatDate, formatDaysAgo, formatMoney, daysBetween } from "@/lib/format";
import { ORDER_CHANNEL_LABELS, DIRECT_ORDER_CHANNELS, type OrderChannel } from "@/lib/constants";
import { Card, CardTitle, ConsentBadge } from "@/components/ui";
import { RECENCY_LABELS, recencyBucket } from "@/lib/customers";
import { config } from "@/lib/config";
import { simulateSmsReplyAction } from "../../promo/actions";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { placedAt: "desc" }, include: { redemption: true } },
      consents: { orderBy: { grantedAt: "desc" } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!c) notFound();

  const supp = await prisma.suppression.findMany({
    where: {
      OR: [
        ...(c.phone ? [{ channel: "sms", value: c.phone }] : []),
        ...(c.email ? [{ channel: "email", value: c.email }] : []),
      ],
    },
  });
  const now = new Date();
  const smsSupp = supp.some((s) => s.channel === "sms");
  const emailSupp = supp.some((s) => s.channel === "email");
  const sms = consentStatus(c, "sms", smsSupp, now);
  const email = consentStatus(c, "email", emailSupp, now);
  const days = c.lastOrderAt ? daysBetween(c.lastOrderAt, now) : null;
  const direct = c.orders.filter((o) => DIRECT_ORDER_CHANNELS.includes(o.channel as OrderChannel)).length;

  return (
    <>
      <Link href="/customers" className="text-sm text-brand">
        ← Customers
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {`${c.firstName} ${c.lastName ?? ""}`.trim() || "(no name)"}
        </h1>
        <p className="text-sm text-muted">
          {[c.neighbourhood, c.postalFsa].filter(Boolean).join(" · ")}
          {c.birthMonth && c.birthDay
            ? ` · Birthday ${new Date(2000, c.birthMonth - 1, c.birthDay).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`
            : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ConsentBadge channel="SMS" status={sms} />
          <ConsentBadge channel="Email" status={email} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Last order" value={formatDaysAgo(days)} sub={RECENCY_LABELS[recencyBucket(days)]} />
        <MiniStat label="Orders" value={String(c.orderCount)} sub={`${direct} direct`} />
        <MiniStat label="Spent" value={formatMoney(c.totalSpentCents, false)} sub={`avg ${formatMoney(c.orderCount ? c.totalSpentCents / c.orderCount : 0)}`} />
      </div>

      <Card className="mt-4">
        <CardTitle>Contact</CardTitle>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Phone</dt>
          <dd>{c.phone ? formatPhone(c.phone) : "—"}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{c.email ?? "—"}</dd>
          <dt className="text-muted">SMS</dt>
          <dd>{CONSENT_STATUS_LABELS[sms]}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{CONSENT_STATUS_LABELS[email]}</dd>
        </dl>
      </Card>

      <Card className="mt-4">
        <CardTitle hint="CASL record. Implied consent from a purchase expires 2 years after the last purchase.">
          Consent history
        </CardTitle>
        {c.consents.length === 0 && supp.length === 0 ? (
          <p className="text-sm text-muted">No consent on file.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {c.consents.map((k) => (
              <li key={k.id} className="rounded-xl bg-card-2 p-3">
                <div className="font-medium">
                  {k.channel === "sms" ? "SMS" : "Email"} · {k.type} · {k.source.replace("_", " ")}
                </div>
                <div className="text-muted">
                  Granted {formatDate(k.grantedAt)}
                  {k.revokedAt && ` · Revoked ${formatDate(k.revokedAt)} (${k.revokeReason ?? "opt-out"})`}
                  {!k.revokedAt && k.type === "implied" && c.lastOrderAt &&
                    ` · Expires ${formatDate(impliedConsentExpiry(c.lastOrderAt))}`}
                </div>
              </li>
            ))}
            {supp.map((s) => (
              <li key={s.id} className="rounded-xl border border-bad/40 p-3 text-bad">
                On {s.channel === "sms" ? "SMS" : "email"} suppression list since {formatDate(s.createdAt)} ({s.reason}).
                Never messaged again, even after re-import.
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Orders</CardTitle>
        <ul className="divide-y divide-line text-sm">
          {c.orders.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate">{o.items}</div>
                <div className="text-muted">
                  {formatDate(o.placedAt, true)} · {ORDER_CHANNEL_LABELS[o.channel as OrderChannel] ?? o.channel}
                  {o.redemption && ` · code ${o.redemption.code}`}
                </div>
              </div>
              <div className="shrink-0 tabular-nums">{formatMoney(o.totalCents)}</div>
            </li>
          ))}
        </ul>
      </Card>

      {config.testMode && c.phone && (
        <Card className="mt-4 border-warn/40">
          <CardTitle hint="Test mode: pretend this customer texted the shop. Try STOP, START, HELP or ARRET.">Simulate a text reply</CardTitle>
          <form action={simulateSmsReplyAction.bind(null, c.id)} className="flex gap-2">
            <input
              name="body"
              required
              defaultValue="STOP"
              aria-label="Reply text"
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-base"
            />
            <button type="submit" className="rounded-xl border border-line bg-card-2 px-4 font-medium">
              Receive
            </button>
          </form>
        </Card>
      )}

      {c.messages.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Messages</CardTitle>
          <ul className="space-y-3 text-sm">
            {c.messages.map((m) => (
              <li key={m.id} className={m.direction === "inbound" ? "pl-6" : "pr-6"}>
                <div className={`rounded-xl p-3 whitespace-pre-line ${m.direction === "inbound" ? "bg-series-soft" : "bg-card-2"}`}>
                  {m.subject && <div className="mb-1 font-medium">{m.subject}</div>}
                  {m.channel === "email" ? m.body.split("\n--\n")[0] : m.body}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {m.direction === "inbound" ? "Received" : "Sent"} {m.channel.toUpperCase()} · {formatDate(m.createdAt, true)} ·{" "}
                  {m.status}
                  {m.testMode && " · test"}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
