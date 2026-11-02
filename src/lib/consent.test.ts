import { describe, expect, it } from "vitest";
import { canContact, consentStatus, impliedConsentExpiry, isConsentValid } from "./consent";

const NOW = new Date("2026-11-02T17:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const base = { phone: "+15195550100", email: "a@example.com" };

describe("CASL consent", () => {
  it("implied consent expires 2 years after the LAST purchase", () => {
    expect(impliedConsentExpiry(d("2024-11-10")).toISOString().slice(0, 10)).toBe("2026-11-10");
    const implied = { channel: "sms", type: "implied", grantedAt: d("2020-01-01"), revokedAt: null };
    expect(isConsentValid(implied, d("2024-11-10"), NOW)).toBe(true); // last order < 2y ago
    expect(isConsentValid(implied, d("2024-10-30"), NOW)).toBe(false); // last order > 2y ago
  });

  it("express consent lasts until revoked", () => {
    const express = { channel: "sms", type: "express", grantedAt: d("2019-01-01"), revokedAt: null };
    expect(isConsentValid(express, d("2019-01-01"), NOW)).toBe(true);
    expect(isConsentValid({ ...express, revokedAt: d("2026-01-01") }, null, NOW)).toBe(false);
  });

  it("a revocation beats older consent records on the same channel", () => {
    const consents = [
      { channel: "sms", type: "express", grantedAt: d("2025-01-01"), revokedAt: null },
      { channel: "sms", type: "implied", grantedAt: d("2024-06-01"), revokedAt: d("2025-06-01") },
    ];
    expect(canContact({ ...base, lastOrderAt: d("2026-10-01"), consents }, "sms", false, NOW)).toBe(false);
    // a NEW express opt-in after the revocation counts
    consents.push({ channel: "sms", type: "express", grantedAt: d("2025-09-01"), revokedAt: null });
    expect(canContact({ ...base, lastOrderAt: d("2026-10-01"), consents }, "sms", false, NOW)).toBe(true);
  });

  it("the suppression list always wins", () => {
    const consents = [{ channel: "sms", type: "express", grantedAt: d("2026-01-01"), revokedAt: null }];
    expect(canContact({ ...base, lastOrderAt: d("2026-10-01"), consents }, "sms", true, NOW)).toBe(false);
    expect(consentStatus({ ...base, lastOrderAt: d("2026-10-01"), consents }, "sms", true, NOW)).toBe("suppressed");
  });

  it("consent is per channel", () => {
    const consents = [{ channel: "email", type: "express", grantedAt: d("2026-01-01"), revokedAt: null }];
    const c = { ...base, lastOrderAt: d("2026-10-01"), consents };
    expect(canContact(c, "email", false, NOW)).toBe(true);
    expect(canContact(c, "sms", false, NOW)).toBe(false);
    expect(consentStatus(c, "sms", false, NOW)).toBe("none");
  });

  it("needs an address", () => {
    const consents = [{ channel: "sms", type: "express", grantedAt: d("2026-01-01"), revokedAt: null }];
    expect(consentStatus({ phone: null, email: null, lastOrderAt: null, consents }, "sms", false, NOW)).toBe("no_address");
  });
});
