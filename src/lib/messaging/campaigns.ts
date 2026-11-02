// Campaign creation and dispatch.
//
// - Recipients are decided at SEND time (consent is re-checked then), not when the campaign is written.
// - SMS respects quiet hours: a send outside 9:00–21:00 shop time is moved to the next 9:00, and a long
//   send that crosses 21:00 pauses and resumes the next morning.
// - Dispatch is resumable and idempotent: customers who already have a message in the campaign are skipped.
import { prisma } from "../db";
import { config } from "../config";
import { loadCustomerIndex, type CustomerRow } from "../customers";
import { buildAudience, type SegmentKey } from "../segments";
import { buildEmailBody, buildSmsBody, mergeName } from "../compliance";
import { countSms, estimateCostCents } from "../sms";
import { isWithinSmsWindow, nextSmsWindowStart } from "../time";
import { sendEmail, sendSms, type SendResult } from "./providers";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./tokens";
import { SHOP } from "../constants";

export type NewCampaign = {
  name: string;
  channel: "sms" | "email";
  segment: SegmentKey;
  subject?: string;
  body: string;
  promoCode?: string;
  /** null = send now */
  sendAt: Date | null;
};

export async function createCampaign(input: NewCampaign, now = new Date()) {
  let scheduledAt = input.sendAt ?? now;
  let movedForQuietHours = false;
  if (input.channel === "sms" && !isWithinSmsWindow(scheduledAt)) {
    scheduledAt = nextSmsWindowStart(scheduledAt);
    movedForQuietHours = true;
  }
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      channel: input.channel,
      segment: input.segment,
      subject: input.channel === "email" ? input.subject : null,
      body: input.body,
      promoCode: input.promoCode || null,
      status: "scheduled",
      scheduledAt,
      testMode: config.testMode,
    },
  });
  let result: DispatchResult | null = null;
  if (scheduledAt <= now) result = await dispatchCampaign(campaign.id, now);
  return { campaign, scheduledAt, movedForQuietHours, result };
}

export type DispatchResult = { sent: number; failed: number; blocked: number; paused: boolean };

const BATCH = 10;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailHtml(bodyText: string, unsubUrl: string) {
  const paras = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:system-ui,sans-serif;color:#0b0b0b"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">${paras}<hr style="border:none;border-top:1px solid #e2e0da;margin:24px 0"><p style="font-size:12px;color:#77756f;margin:0">${escapeHtml(SHOP.name)} · ${escapeHtml(SHOP.address)} · ${SHOP.phoneDisplay}<br>You're getting this because you ordered from us or signed up for deals.<br><a href="${unsubUrl}" style="color:#77756f">Unsubscribe</a></p></div></body></html>`;
}

async function sendOne(
  campaign: { id: string; channel: string; subject: string | null; body: string; promoCode: string | null },
  r: CustomerRow,
  issuedAt: Date,
): Promise<SendResult["status"]> {
  const isSms = campaign.channel === "sms";
  const to = isSms ? r.phone! : r.email!;
  let body: string;
  let subject: string | null = null;
  let result: SendResult;
  if (isSms) {
    body = buildSmsBody(campaign.body, r.firstName);
    result = await sendSms(to, body);
  } else {
    const unsub = unsubscribeUrl(r.id);
    subject = mergeName(campaign.subject ?? `News from ${SHOP.name}`, r.firstName);
    const main = mergeName(campaign.body, r.firstName).trim();
    body = buildEmailBody(campaign.body, r.firstName, unsub);
    result = await sendEmail({
      to,
      subject,
      text: body,
      html: emailHtml(main, unsub),
      unsubscribeUrl: unsub,
      oneClickUnsubscribeUrl: oneClickUnsubscribeUrl(r.id),
    });
  }
  await prisma.message.create({
    data: {
      customerId: r.id,
      campaignId: campaign.id,
      channel: campaign.channel,
      to,
      from: isSms ? config.twilio.from : config.postmark.from,
      subject,
      body,
      segments: isSms ? countSms(body).segments : 1,
      status: result.status,
      provider: result.provider,
      providerId: result.status === "sent" ? result.providerId : null,
      error: result.status === "sent" ? null : result.error,
      testMode: config.testMode,
      sentAt: result.status === "sent" ? new Date() : null,
    },
  });
  if (result.status === "sent" && campaign.promoCode) {
    await prisma.redemption.create({
      data: { code: campaign.promoCode, customerId: r.id, campaignId: campaign.id, issuedAt },
    });
  }
  return result.status;
}

export async function dispatchCampaign(id: string, now = new Date()): Promise<DispatchResult | null> {
  // claim it (prevents two dispatchers sending the same campaign)
  const claimed = await prisma.campaign.updateMany({
    where: { id, status: "scheduled", scheduledAt: { lte: now } },
    data: { status: "sending" },
  });
  if (claimed.count === 0) return null;
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  const isSms = campaign.channel === "sms";

  if (isSms && !isWithinSmsWindow(new Date())) {
    await prisma.campaign.update({ where: { id }, data: { status: "scheduled", scheduledAt: nextSmsWindowStart(new Date()) } });
    return { sent: 0, failed: 0, blocked: 0, paused: true };
  }

  const rows = await loadCustomerIndex(new Date());
  const audience = buildAudience(rows, campaign.segment as SegmentKey, campaign.channel as "sms" | "email");
  const already = new Set(
    (await prisma.message.findMany({ where: { campaignId: id }, select: { customerId: true } })).map((m) => m.customerId),
  );
  const todo = audience.recipients.filter((r) => !already.has(r.id));
  const out: DispatchResult = { sent: 0, failed: 0, blocked: 0, paused: false };

  for (let i = 0; i < todo.length; i += BATCH) {
    if (isSms && !isWithinSmsWindow(new Date())) {
      out.paused = true;
      break;
    }
    const statuses = await Promise.all(todo.slice(i, i + BATCH).map((r) => sendOne(campaign, r, now)));
    for (const s of statuses) {
      if (s === "sent") out.sent++;
      else if (s === "blocked") out.blocked++;
      else out.failed++;
    }
  }

  const [total, segAgg] = await Promise.all([
    prisma.message.count({ where: { campaignId: id } }),
    prisma.message.aggregate({ where: { campaignId: id, status: "sent" }, _sum: { segments: true }, _count: true }),
  ]);
  const excluded = Object.values(audience.excluded).reduce((a, b) => a + b, 0);
  await prisma.campaign.update({
    where: { id },
    data: out.paused
      ? { status: "scheduled", scheduledAt: nextSmsWindowStart(new Date()), recipientCount: total, excludedCount: excluded }
      : {
          status: "sent",
          sentAt: new Date(),
          recipientCount: total,
          excludedCount: excluded,
          estCostCents: isSms
            ? estimateCostCents("sms", 1, segAgg._sum.segments ?? 0)
            : estimateCostCents("email", segAgg._count),
        },
  });
  return out;
}

/** Send every scheduled campaign that is due. Called by /api/cron/dispatch (and the "send due now" button). */
export async function runDueCampaigns(now = new Date()) {
  const due = await prisma.campaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });
  const results = [];
  for (const c of due) results.push({ id: c.id, result: await dispatchCampaign(c.id, now) });
  return results;
}

export async function cancelCampaign(id: string) {
  const res = await prisma.campaign.updateMany({ where: { id, status: "scheduled" }, data: { status: "cancelled" } });
  return res.count > 0;
}
