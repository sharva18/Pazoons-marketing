"use server";

import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { SEGMENT_KEYS, type SegmentKey } from "@/lib/segments";
import { cancelCampaign, createCampaign, runDueCampaigns } from "@/lib/messaging/campaigns";
import { handleInboundSms } from "@/lib/messaging/optout";
import { parseLocalDateTime } from "@/lib/time";
import { prisma } from "@/lib/db";

export type SendInput = {
  name: string;
  channel: "sms" | "email";
  segment: string;
  subject?: string;
  body: string;
  promoCode?: string;
  sendMode: "now" | "schedule";
  scheduleLocal?: string; // "2026-11-05T17:30", shop time
};

export type SendResponse =
  | { ok: true; id: string; scheduledAt: string; movedForQuietHours: boolean; sentNow: boolean }
  | { ok: false; error: string };

export async function sendCampaignAction(input: SendInput): Promise<SendResponse> {
  const name = input.name?.trim();
  const body = input.body?.trim();
  if (!name) return { ok: false, error: "Give the promo a name." };
  if (!body) return { ok: false, error: "Write a message." };
  if (input.channel !== "sms" && input.channel !== "email") return { ok: false, error: "Pick SMS or email." };
  if (!SEGMENT_KEYS.includes(input.segment as SegmentKey)) return { ok: false, error: "Pick who to send to." };
  if (input.channel === "sms" && body.length > 600) return { ok: false, error: "That text is too long (max 600 characters)." };
  if (input.channel === "email" && !input.subject?.trim()) return { ok: false, error: "Emails need a subject line." };
  const promoCode = input.promoCode?.trim().toUpperCase() || undefined;
  if (promoCode && !/^[A-Z0-9]{3,15}$/.test(promoCode)) return { ok: false, error: "Promo codes are 3–15 letters or numbers." };

  let sendAt: Date | null = null;
  if (input.sendMode === "schedule") {
    sendAt = input.scheduleLocal ? parseLocalDateTime(input.scheduleLocal) : null;
    if (!sendAt) return { ok: false, error: "Pick a date and time." };
    if (sendAt.getTime() < Date.now() - 60_000) return { ok: false, error: "That time is in the past." };
  }

  const { campaign, scheduledAt, movedForQuietHours, result } = await createCampaign({
    name: name.slice(0, 80),
    channel: input.channel,
    segment: input.segment as SegmentKey,
    subject: input.subject?.trim().slice(0, 150),
    body,
    promoCode,
    sendAt,
  });
  revalidatePath("/promo");
  revalidatePath("/");
  return { ok: true, id: campaign.id, scheduledAt: scheduledAt.toISOString(), movedForQuietHours, sentNow: !!result && !result.paused };
}

export async function cancelCampaignAction(id: string) {
  await cancelCampaign(id);
  revalidatePath("/promo");
  revalidatePath(`/promo/${id}`);
}

export async function runDueAction() {
  await runDueCampaigns();
  revalidatePath("/promo");
}

/** Test mode only: pretend a customer texted us (to try STOP / START / HELP without Twilio). */
export async function simulateSmsReplyAction(customerId: string, formData: FormData) {
  if (!config.testMode) throw new Error("Only available in test mode");
  const body = String(formData.get("body") ?? "").trim();
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true } });
  if (!body || !c?.phone) return;
  await handleInboundSms(c.phone, body, { simulated: true });
  revalidatePath(`/customers/${customerId}`);
}
