import { describe, expect, it } from "vitest";
import { guessMapping } from "./fields";
import { planImport, type ExistingCustomer, type ExistingIndex, type ImportOptions } from "./plan";
import { parseBirthday, parseDate, parseMoneyCents } from "./values";

const NOW = new Date("2026-11-02T17:00:00Z");
const OPTS: ImportOptions = { impliedFromPurchase: true, mockDataOnly: true };
const HEADERS = ["Name", "Phone", "Email", "Last Order", "SMS Opt-in", "Email Opt-in", "Unsubscribed"];
const mapping = guessMapping(HEADERS);
const row = (r: Partial<Record<(typeof HEADERS)[number], string>>) =>
  Object.fromEntries(HEADERS.map((h) => [h, r[h] ?? ""])) as Record<string, string>;

const existingCustomer = (over: Partial<ExistingCustomer>): ExistingCustomer => ({
  id: "c1",
  firstName: "Ann",
  lastName: "Lee",
  phone: null,
  email: null,
  neighbourhood: null,
  postalFsa: null,
  birthMonth: null,
  birthDay: null,
  notes: null,
  firstOrderAt: new Date("2025-01-01"),
  lastOrderAt: new Date("2026-10-01"),
  orderCount: 3,
  totalSpentCents: 10000,
  consents: [],
  ...over,
});
const empty: ExistingIndex = { customers: [], suppressed: new Set() };
const plan = (rows: Record<string, string>[], existing = empty, opts = OPTS) =>
  planImport(rows, mapping, opts, existing, { fileName: "t.csv", now: NOW });

describe("guessMapping", () => {
  it("maps common export headers", () => {
    expect(mapping).toMatchObject({
      fullName: "Name",
      phone: "Phone",
      email: "Email",
      lastOrderDate: "Last Order",
      smsOptIn: "SMS Opt-in",
      emailOptIn: "Email Opt-in",
      unsubscribed: "Unsubscribed",
    });
    expect(guessMapping(["First Name", "Surname", "Mobile Phone #", "E-mail Address"])).toMatchObject({
      firstName: "First Name",
      lastName: "Surname",
      phone: "Mobile Phone #",
      email: "E-mail Address",
    });
  });
});

describe("value parsers", () => {
  it("parses dates, birthdays and money", () => {
    expect(parseDate("2026-03-14")?.toISOString().slice(0, 10)).toBe("2026-03-14");
    expect(parseDate("3/14/2026")?.toISOString().slice(0, 10)).toBe("2026-03-14");
    expect(parseDate("14/3/2026")?.toISOString().slice(0, 10)).toBe("2026-03-14");
    expect(parseDate("nope")).toBeNull();
    expect(parseBirthday("May 14")).toEqual({ month: 5, day: 14 });
    expect(parseBirthday("1990-07-02")).toEqual({ month: 7, day: 2 });
    expect(parseBirthday("2/30")).toBeNull();
    expect(parseMoneyCents("$1,234.50")).toBe(123450);
  });
});

describe("planImport", () => {
  it("creates new customers with implied consent from a recent purchase", () => {
    const p = plan([row({ Name: "Jo Smith", Phone: "(519) 555-0101", Email: "jo@example.com", "Last Order": "2026-10-20" })]);
    expect(p.summary.create).toBe(1);
    const c = p.customers[0];
    expect(c.fields).toMatchObject({ firstName: "Jo", lastName: "Smith", phone: "+15195550101", email: "jo@example.com" });
    expect(c.consents.map((k) => `${k.channel}:${k.type}`).sort()).toEqual(["email:implied", "sms:implied"]);
  });

  it("gives express consent only from an explicit opt-in", () => {
    const p = plan([row({ Phone: "519-555-0101", "SMS Opt-in": "yes" })]);
    expect(p.customers[0].consents).toEqual([expect.objectContaining({ channel: "sms", type: "express" })]);
  });

  it("adds no implied consent when the last purchase is over 2 years old, or the option is off", () => {
    expect(plan([row({ Phone: "519-555-0101", "Last Order": "2024-10-01" })]).customers[0].consents).toEqual([]);
    expect(plan([row({ Phone: "519-555-0101", "Last Order": "2026-10-01" })], empty, { ...OPTS, impliedFromPurchase: false }).customers[0].consents).toEqual([]);
  });

  it("merges in-file duplicates by phone OR email, including chains", () => {
    const p = plan([
      row({ Name: "A", Phone: "519-555-0101" }),
      row({ Phone: "+1 519 555 0101", Email: "a@example.com" }),
      row({ Email: "A@EXAMPLE.COM", "Last Order": "2026-10-01" }),
      row({ Name: "B", Phone: "519-555-0102" }),
    ]);
    expect(p.summary.create).toBe(2);
    expect(p.summary.mergedRows).toBe(2);
    expect(p.customers[0].fields).toMatchObject({ phone: "+15195550101", email: "a@example.com" });
  });

  it("matches existing customers by phone or email and only fills blanks", () => {
    const existing: ExistingIndex = {
      customers: [existingCustomer({ phone: "+15195550101", lastName: "Lee" })],
      suppressed: new Set(),
    };
    const p = plan([row({ Name: "Annie Wong", Phone: "519-555-0101", Email: "ann@example.com", "Last Order": "2026-10-25" })], existing);
    expect(p.summary.update).toBe(1);
    expect(p.customers[0].fields).toEqual({ email: "ann@example.com", lastOrderAt: new Date(Date.UTC(2026, 9, 25, 12)) });
  });

  it("skips rows whose phone and email belong to two different customers", () => {
    const existing: ExistingIndex = {
      customers: [existingCustomer({ id: "c1", phone: "+15195550101" }), existingCustomer({ id: "c2", email: "b@example.com" })],
      suppressed: new Set(),
    };
    const p = plan([row({ Phone: "519-555-0101", Email: "b@example.com" })], existing);
    expect(p.summary.skipped).toBe(1);
    expect(p.customers).toHaveLength(0);
  });

  it("never re-grants consent to someone on the suppression list (re-imports can't override STOP)", () => {
    const existing: ExistingIndex = {
      customers: [existingCustomer({ phone: "+15195550101" })],
      suppressed: new Set(["sms:+15195550101"]),
    };
    const p = plan([row({ Phone: "519-555-0101", "SMS Opt-in": "yes", "Last Order": "2026-10-30" })], existing);
    expect(p.customers[0].consents).toEqual([]);
    expect(p.summary.consentBlocked).toBe(1);
  });

  it("never re-grants consent after a revocation, even if the suppression entry is missing", () => {
    const existing: ExistingIndex = {
      customers: [
        existingCustomer({
          email: "ann@example.com",
          consents: [{ channel: "email", type: "implied", grantedAt: new Date("2025-01-01"), revokedAt: new Date("2026-02-01") }],
        }),
      ],
      suppressed: new Set(),
    };
    const p = plan([row({ Email: "ann@example.com", "Email Opt-in": "yes" })], existing);
    expect(p.customers[0].consents).toEqual([]);
  });

  it("turns 'unsubscribed' into opt-outs on every channel", () => {
    const p = plan([row({ Phone: "519-555-0101", Email: "x@example.com", "SMS Opt-in": "yes", Unsubscribed: "yes" })]);
    expect(p.customers[0].consents).toEqual([]);
    expect(p.customers[0].optOuts).toEqual([
      { channel: "sms", value: "+15195550101" },
      { channel: "email", value: "x@example.com" },
    ]);
  });

  it("rejects real-looking contact details in mock-data mode", () => {
    const p = plan([row({ Phone: "519-673-4444" }), row({ Email: "someone@gmail.com" })]);
    expect(p.summary.skipped).toBe(2);
    expect(plan([row({ Phone: "519-673-4444" })], empty, { ...OPTS, mockDataOnly: false }).summary.create).toBe(1);
  });

  it("skips rows with no usable phone or email", () => {
    const p = plan([row({ Name: "Nobody" }), row({ Phone: "519-67" })]);
    expect(p.summary.skipped).toBe(2);
  });

  it("refuses to run without a phone or email column", () => {
    const p = planImport([{ Name: "X" }], { fullName: "Name" }, OPTS, empty, { fileName: "t.csv", now: NOW });
    expect(p.customers).toHaveLength(0);
    expect(p.issues[0].message).toMatch(/Phone or Email/);
  });
});
