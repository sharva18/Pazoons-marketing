import Link from "next/link";
import { prisma } from "@/lib/db";
import { CAMPAIGN_STATUS_LABELS as STATUS_LABELS, segmentLabel } from "@/lib/segments";
import { formatShopTime } from "@/lib/time";
import { formatNumber } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { config } from "@/lib/config";
import { runDueAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promos" };

export default async function PromoListPage() {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { _count: { select: { redemptions: { where: { redeemedAt: { not: null } } } } } },
  });
  const due = campaigns.filter((c) => c.status === "scheduled" && c.scheduledAt && c.scheduledAt <= now).length;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle sub="Texts and emails to your customers.">Promos</PageTitle>
        <Link href="/promo/new" className="mt-1 shrink-0 rounded-xl bg-brand px-4 py-2.5 font-medium text-brand-ink">
          + New promo
        </Link>
      </div>

      {config.testMode && due > 0 && (
        <form action={runDueAction} className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-warn/40 p-3 text-sm">
          <span>
            {due} scheduled promo{due === 1 ? " is" : "s are"} due. (In production the scheduler sends these automatically.)
          </span>
          <button type="submit" className="shrink-0 rounded-lg border border-line bg-card px-3 py-1.5 font-medium">
            Send now
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No promos yet.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/promo/${c.id}`} className="block px-4 py-3 hover:bg-card-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className={`shrink-0 text-xs font-medium ${c.status === "scheduled" ? "text-warn" : c.status === "cancelled" ? "text-muted" : "text-good"}`}>
                    {c.status === "scheduled" ? "◷ " : c.status === "sent" ? "✓ " : ""}
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </div>
                <div className="text-sm text-muted">
                  {c.channel === "sms" ? "SMS" : "Email"} · {segmentLabel(c.segment)}
                  {c.scheduledAt && ` · ${formatShopTime(c.sentAt ?? c.scheduledAt)}`}
                </div>
                {c.status === "sent" && (
                  <div className="text-sm text-muted tabular-nums">
                    {formatNumber(c.recipientCount)} sent
                    {c.promoCode && ` · ${c._count.redemptions} redeemed ${c.promoCode}`}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
