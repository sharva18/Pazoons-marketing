// Opt-out / opt-in handling. Opt-outs take effect immediately: suppression entry + all active consents revoked.
import { prisma } from "../db";
import { SHOP } from "../constants";
import type { MessageChannel } from "../constants";
import { normalizeEmail, normalizePhone } from "../contact";
import { config } from "../config";
import { parseKeyword } from "./keywords";

export async function optOut(channel: MessageChannel, rawValue: string, reason: "STOP" | "unsubscribe" | "complaint" | "bounce" | "manual") {
  const value = channel === "sms" ? normalizePhone(rawValue) : normalizeEmail(rawValue);
  if (!value) return { ok: false as const };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.suppression.upsert({
      where: { channel_value: { channel, value } },
      create: { channel, value, reason },
      update: {},
    });
    const customers = await tx.customer.findMany({ where: channel === "sms" ? { phone: value } : { email: value }, select: { id: true } });
    await tx.consent.updateMany({
      where: { customerId: { in: customers.map((c) => c.id) }, channel, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
  });
  return { ok: true as const, value };
}

/** Customer texted START: their own express re-opt-in. Lifts the SMS suppression and records express consent. */
export async function smsOptIn(rawPhone: string, evidence: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.suppression.deleteMany({ where: { channel: "sms", value: phone } });
    const customer = await tx.customer.findUnique({ where: { phone } });
    if (customer) {
      await tx.consent.create({
        data: { customerId: customer.id, channel: "sms", type: "express", grantedAt: now, source: "sms_keyword", evidence },
      });
    }
  });
}

export const REPLIES = {
  stop: `${SHOP.name}: You're unsubscribed and won't get more texts from us. Reply START to resubscribe.`,
  start: `${SHOP.name}: You're subscribed to deals again. Reply STOP to opt out anytime.`,
  help: `${SHOP.name}, ${SHOP.address}, ${SHOP.phoneDisplay}. Deals by text. Reply STOP to opt out.`,
};

/**
 * Handle an inbound SMS (Twilio webhook or the test-mode simulator). Records the message and applies
 * STOP / START / HELP instantly. Returns the auto-reply text, if any.
 */
export async function handleInboundSms(from: string, body: string, meta: { providerId?: string; simulated?: boolean } = {}) {
  const phone = normalizePhone(from) ?? from;
  const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true } });
  await prisma.message.create({
    data: {
      customerId: customer?.id,
      direction: "inbound",
      channel: "sms",
      to: config.twilio.from,
      from: phone,
      body: body.slice(0, 1600),
      status: "received",
      provider: meta.simulated ? "simulated" : "twilio",
      providerId: meta.providerId,
      testMode: config.testMode,
      sentAt: new Date(),
    },
  });

  const keyword = parseKeyword(body);
  if (keyword === "stop") await optOut("sms", phone, "STOP");
  else if (keyword === "start") await smsOptIn(phone, `Replied "${body.trim().slice(0, 20)}" by SMS`);
  // non-keyword replies are stored; the "How was it?" automation (step 5) reads them
  const reply = keyword ? REPLIES[keyword] : null;
  if (reply) {
    await prisma.message.create({
      data: {
        customerId: customer?.id,
        channel: "sms",
        to: phone,
        from: config.twilio.from,
        body: reply,
        status: "sent",
        provider: meta.simulated ? "simulated" : "twilio",
        testMode: config.testMode,
        sentAt: new Date(),
      },
    });
  }
  return { keyword, reply };
}
