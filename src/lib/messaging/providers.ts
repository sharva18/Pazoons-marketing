// SMS (Twilio) and email (Postmark) senders, called over their REST APIs.
//
// SAFETY: in test mode (the default) every send is checked against the mock-data rules first — a phone
// outside 555-01xx or an email not @example.com is BLOCKED and never leaves the app. With no credentials
// configured, sends are simulated locally. With Twilio TEST credentials / Postmark's POSTMARK_API_TEST token,
// the real APIs validate the request but deliver nothing.
import { randomUUID } from "crypto";
import { config } from "../config";
import { isFictionalPhone } from "../contact";

export type SendResult =
  | { status: "sent"; provider: "twilio" | "postmark" | "simulated"; providerId: string }
  | { status: "blocked" | "failed"; provider: string; error: string };

function guard(channel: "sms" | "email", to: string): SendResult | null {
  if (!config.testMode) return null;
  const ok = channel === "sms" ? isFictionalPhone(to) : to.toLowerCase().endsWith("@example.com");
  return ok ? null : { status: "blocked", provider: "guard", error: `Test mode: refused to send to non-test address ${to}` };
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const blocked = guard("sms", to);
  if (blocked) return blocked;
  const { sid, token, from } = config.twilio;
  if (!sid || !token) {
    if (!config.testMode) return { status: "failed", provider: "twilio", error: "Twilio is not configured" };
    return { status: "sent", provider: "simulated", providerId: `SIM${randomUUID().replace(/-/g, "").slice(0, 31)}` };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok || !json.sid) return { status: "failed", provider: "twilio", error: json.message ?? `HTTP ${res.status}` };
    return { status: "sent", provider: "twilio", providerId: json.sid };
  } catch (e) {
    return { status: "failed", provider: "twilio", error: e instanceof Error ? e.message : "network error" };
  }
}

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  html: string;
  oneClickUnsubscribeUrl: string;
  unsubscribeUrl: string;
}): Promise<SendResult> {
  const blocked = guard("email", msg.to);
  if (blocked) return blocked;
  const token = config.postmark.token;
  if (!token) {
    if (!config.testMode) return { status: "failed", provider: "postmark", error: "Postmark is not configured" };
    return { status: "sent", provider: "simulated", providerId: randomUUID() };
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
      body: JSON.stringify({
        From: config.postmark.from,
        To: msg.to,
        Subject: msg.subject,
        TextBody: msg.text,
        HtmlBody: msg.html,
        MessageStream: "broadcast",
        Headers: [
          // RFC 8058 one-click unsubscribe (Gmail / Yahoo bulk-sender requirement)
          { Name: "List-Unsubscribe", Value: `<${msg.oneClickUnsubscribeUrl}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { MessageID?: string; Message?: string; ErrorCode?: number };
    if (!res.ok || json.ErrorCode) return { status: "failed", provider: "postmark", error: json.Message ?? `HTTP ${res.status}` };
    return { status: "sent", provider: "postmark", providerId: json.MessageID ?? "" };
  } catch (e) {
    return { status: "failed", provider: "postmark", error: e instanceof Error ? e.message : "network error" };
  }
}
