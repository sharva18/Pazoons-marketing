import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CAMPAIGN_STATUS_LABELS, segmentLabel } from "@/lib/segments";
import { formatShopTime } from "@/lib/time";
import { formatNumber } from "@/lib/format";
import { formatPhone } from "@/lib/contact";
import { Card, CardTitle } from "@/components/ui";
import { cancelCampaignAction } from "../actions";

export const dynamic = "force-dynamic";

const MSG_STATUS: Record<string, string> = { sent: "Sent", delivered: "Delivered", failed: "Failed", blocked: "Blocked", queued: "Queued" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  const [byStatus, messages, issued, redeemed] = await Promise.all([
    prisma.message.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } }),
    prisma.message.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      take: 30,
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.redemption.count({ where: { campaignId: id } }),
    prisma.redemption.count({ where: { campaignId: id, redeemedAt: { not: null } } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const ok = (counts.sent ?? 0) + (counts.delivered ?? 0);
  const isSms = c.channel === "sms";
  const cancel = cancelCampaignAction.bind(null, c.id);

  return (
    <>
      <Link href="/promo" className="text-sm text-brand">
        ← Promos
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
        <p className="text-sm text-muted">
          {isSms ? "SMS" : "Email"} · {segmentLabel(c.segment)} · {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
          {c.testMode && " · test mode"}
        </p>
      </div>

      {c.status === "scheduled" && c.scheduledAt && (
        <Card className="mb-4 border-warn/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">◷ Goes out {formatShopTime(c.scheduledAt)}</div>
              <div className="text-sm text-muted">Who gets it is decided at send time, so new opt-outs are respected.</div>
            </div>
            <form action={cancel}>
              <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium">
                Cancel
              </button>
            </form>
          </div>
        </Card>
      )}

      {c.status !== "scheduled" && c.status !== "cancelled" && (
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <Mini label={isSms ? "Texts sent" : "Emails sent"} value={formatNumber(ok)} />
          <Mini label="Left out (no consent)" value={formatNumber(c.excludedCount)} />
          <Mini label="Est. cost" value={`US$${(c.estCostCents / 100).toFixed(2)}`} />
          {(counts.failed || counts.blocked) && (
            <Mini label="Failed / blocked" value={`${counts.failed ?? 0} / ${counts.blocked ?? 0}`} tone="bad" />
          )}
          {c.promoCode && <Mini label={`${c.promoCode} redeemed`} value={`${redeemed} / ${issued}`} />}
          {c.sentAt && <Mini label="Sent" value={formatShopTime(c.sentAt)} small />}
        </div>
      )}

      <Card>
        <CardTitle>Message</CardTitle>
        {c.subject && <div className="mb-1 font-medium">{c.subject}</div>}
        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
        {c.promoCode && <p className="mt-2 text-xs text-muted">Promo code: <span className="font-mono">{c.promoCode}</span></p>}
      </Card>

      {messages.length > 0 && (
        <Card className="mt-4">
          <CardTitle hint={ok > messages.length ? `First ${messages.length} of ${formatNumber(ok)}` : undefined}>Recipients</CardTitle>
          <ul className="divide-y divide-line text-sm">
            {messages.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={m.customer ? `/customers/${m.customer.id}` : "#"} className="min-w-0">
                  <div className="truncate font-medium">
                    {m.customer ? `${m.customer.firstName} ${m.customer.lastName ?? ""}`.trim() || "(no name)" : "—"}
                  </div>
                  <div className="truncate text-muted">{isSms ? formatPhone(m.to) : m.to}</div>
                </Link>
                <span className={`shrink-0 text-xs font-medium ${m.status === "sent" || m.status === "delivered" ? "text-good" : "text-bad"}`} title={m.error ?? undefined}>
                  {m.status === "sent" || m.status === "delivered" ? "✓" : "✕"} {MSG_STATUS[m.status] ?? m.status}
                  {m.provider === "simulated" && " (sim)"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Mini({ label, value, tone, small }: { label: string; value: string; tone?: "bad"; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${small ? "text-sm" : "text-lg"} ${tone === "bad" ? "text-bad" : ""}`}>{value}</div>
    </div>
  );
}
