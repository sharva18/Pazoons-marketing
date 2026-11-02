import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";
import { buildSmsBody } from "./compliance";
import { countSms } from "./sms";

describe("promo templates", () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))("%s fits one GSM-7 SMS with a long name", (_n, t) => {
    const c = countSms(buildSmsBody(t.sms, "Christopher"));
    expect(c.encoding).toBe("GSM-7");
    expect(c.segments).toBe(1);
  });
  it.each(TEMPLATES.map((t) => [t.name, t] as const))("%s pushes ordering direct and mentions its code", (_n, t) => {
    expect(t.sms).toContain("519-673-4444");
    expect(t.email).toContain("519-673-4444");
    if (t.promoCode) {
      expect(t.sms).toContain(t.promoCode);
      expect(t.email).toContain(t.promoCode);
    }
  });
});
