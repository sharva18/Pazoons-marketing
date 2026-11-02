import { describe, expect, it } from "vitest";
import { isWithinSmsWindow, nextSmsWindowStart, parseLocalDateTime, zonedTime, localParts } from "../time";
import { parseKeyword } from "./keywords";
import { unsubscribeToken, verifyUnsubscribeToken } from "./tokens";
import { isValidTwilioRequest, twilioSignature } from "./twilio-signature";
import { buildAudience } from "../segments";
import { buildSmsBody, buildEmailBody } from "../compliance";
import type { CustomerRow } from "../customers";

describe("quiet hours (America/Toronto)", () => {
  it("converts shop-local wall time across DST", () => {
    expect(zonedTime(2026, 7, 1, 9).toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT -4
    expect(zonedTime(2026, 12, 1, 9).toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST -5
    expect(parseLocalDateTime("2026-11-05T17:30")?.toISOString()).toBe("2026-11-05T22:30:00.000Z");
  });

  it("allows texts 9:00–20:59 only", () => {
    expect(isWithinSmsWindow(zonedTime(2026, 11, 5, 8, 59))).toBe(false);
    expect(isWithinSmsWindow(zonedTime(2026, 11, 5, 9, 0))).toBe(true);
    expect(isWithinSmsWindow(zonedTime(2026, 11, 5, 20, 59))).toBe(true);
    expect(isWithinSmsWindow(zonedTime(2026, 11, 5, 21, 0))).toBe(false);
    expect(isWithinSmsWindow(zonedTime(2026, 11, 6, 23, 30))).toBe(false); // late Friday: still no texts
  });

  it("moves a quiet-hours send to the next 9am", () => {
    expect(nextSmsWindowStart(zonedTime(2026, 11, 5, 22, 15)).toISOString()).toBe(zonedTime(2026, 11, 6, 9).toISOString());
    expect(nextSmsWindowStart(zonedTime(2026, 11, 6, 6, 0)).toISOString()).toBe(zonedTime(2026, 11, 6, 9).toISOString());
    const inside = zonedTime(2026, 11, 6, 12, 0);
    expect(nextSmsWindowStart(inside)).toBe(inside);
    // the night clocks fall back (Nov 1 2026, 2am): still lands on 9:00 local next morning
    const next = nextSmsWindowStart(zonedTime(2026, 10, 31, 23, 0));
    expect(localParts(next)).toMatchObject({ month: 11, day: 1, hour: 9, minute: 0 });
    // month end
    expect(localParts(nextSmsWindowStart(zonedTime(2026, 11, 30, 21, 30)))).toMatchObject({ month: 12, day: 1, hour: 9 });
  });
});

describe("SMS keywords", () => {
  it.each(["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "cancel", "END", "quit", "STOPALL", "ARRET", "arrêt"])("%s → stop", (w) =>
    expect(parseKeyword(w)).toBe("stop"),
  );
  it.each(["START", "unstop", "Yes"])("%s → start", (w) => expect(parseKeyword(w)).toBe("start"));
  it.each(["HELP", "aide"])("%s → help", (w) => expect(parseKeyword(w)).toBe("help"));
  it.each(["stop sending me pizza deals lol", "5", "The pizza was great", ""])("%s → no keyword", (w) => expect(parseKeyword(w)).toBeNull());
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = unsubscribeToken("cus_0042");
    expect(verifyUnsubscribeToken(t)).toBe("cus_0042");
    const forged = `${Buffer.from("cus_0043").toString("base64url")}.${t.split(".")[1]}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("Twilio signature", () => {
  const url = "https://example.com/api/webhooks/twilio";
  const params = { From: "+15195550101", Body: "STOP", MessageSid: "SM123" };
  it("accepts a correctly signed request and rejects a modified one", () => {
    const sig = twilioSignature("secret-token", url, params);
    expect(isValidTwilioRequest("secret-token", sig, url, params)).toBe(true);
    expect(isValidTwilioRequest("secret-token", sig, url, { ...params, Body: "START" })).toBe(false);
    expect(isValidTwilioRequest("other-token", sig, url, params)).toBe(false);
    expect(isValidTwilioRequest("secret-token", null, url, params)).toBe(false);
  });
});

describe("CASL message footers", () => {
  it("SMS always identifies the shop and has STOP instructions", () => {
    const s = buildSmsBody("Hey {name}, $5 off with COMEBACK", "Ana");
    expect(s).toBe("Pazoon's Pizza: Hey Ana, $5 off with COMEBACK Reply STOP to opt out");
    expect(buildSmsBody("Pazoon's Pizza here, {name}! Reply STOP to opt out", null)).toBe("Pazoon's Pizza here, there! Reply STOP to opt out");
  });
  it("email always has the address and an unsubscribe link", () => {
    const e = buildEmailBody("Hi {name}", "Ana", "https://x.example.com/u/abc");
    expect(e).toContain("1030 Adelaide St N, London, ON");
    expect(e).toContain("Unsubscribe: https://x.example.com/u/abc");
  });
});

describe("segment audiences", () => {
  const row = (over: Partial<CustomerRow>): CustomerRow => ({
    id: "x",
    firstName: "A",
    lastName: null,
    phone: "+15195550101",
    email: "a@example.com",
    neighbourhood: null,
    orderCount: 1,
    totalSpentCents: 0,
    lastOrderAt: null,
    daysSinceLast: 40,
    bucket: "lapsed_30_90",
    sms: "ok",
    email_: "ok",
    appShare: 0,
    ...over,
  });
  it("excludes customers without valid consent, with reasons", () => {
    const rows = [
      row({ id: "1" }),
      row({ id: "2", sms: "suppressed" }),
      row({ id: "3", sms: "revoked" }),
      row({ id: "4", sms: "none" }),
      row({ id: "5", sms: "expired" }),
      row({ id: "6", sms: "no_address" }),
      row({ id: "7", bucket: "active", daysSinceLast: 3 }), // not in segment
    ];
    const a = buildAudience(rows, "lapsed_30_90", "sms");
    expect(a.segmentSize).toBe(6);
    expect(a.recipients.map((r) => r.id)).toEqual(["1"]);
    expect(a.excluded).toEqual({ opted_out: 2, no_consent: 1, expired: 1, no_address: 1 });
    expect(buildAudience(rows, "lapsed_30_90", "email").recipients).toHaveLength(6);
  });
  it("app_orderers = mostly DoorDash / Uber Eats", () => {
    const rows = [row({ id: "1", appShare: 0.8 }), row({ id: "2", appShare: 0.5 }), row({ id: "3", appShare: 0 })];
    expect(buildAudience(rows, "app_orderers", "sms").recipients.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("test-mode send guard", () => {
  it("never sends to real-looking numbers or emails in test mode", async () => {
    const { sendSms, sendEmail } = await import("./providers");
    process.env.MESSAGING_TEST_MODE = "true";
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.POSTMARK_SERVER_TOKEN;
    expect((await sendSms("+15196734444", "hi")).status).toBe("blocked"); // the shop's real number
    expect((await sendSms("+15195550123", "hi")).status).toBe("sent"); // fictional → simulated
    const email = { subject: "s", text: "t", html: "h", unsubscribeUrl: "u", oneClickUnsubscribeUrl: "u" };
    expect((await sendEmail({ ...email, to: "real.person@gmail.com" })).status).toBe("blocked");
    expect((await sendEmail({ ...email, to: "a@example.com" })).status).toBe("sent");
  });
});
