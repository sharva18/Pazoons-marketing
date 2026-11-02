// Import planning: a pure function from (CSV rows, column mapping, existing customers) to a plan.
// The same function powers the dry-run preview and the real import, so what you see is what you get.
//
// Rules:
// - A row needs a valid phone or email; everything else is optional.
// - Dedupe: rows that share a phone OR an email (directly or through a chain) become one customer.
// - Match existing customers by phone first, then email. If the phone and the email point at two
//   different existing customers, the row is a conflict and is skipped.
// - Existing customers: only blanks are filled in; order stats take the later/larger value.
// - CASL: imports never override the suppression list or a past revocation. Express consent needs an
//   explicit opt-in column; implied consent (from a purchase) needs a last-order date within 2 years.
// - Mock-data mode: rows with real-looking phones/emails are rejected.
import { canContact, isConsentValid, impliedConsentExpiry, type ConsentLike } from "../consent";
import { formatPhone, isFictionalPhone, normalizeEmail, normalizePhone } from "../contact";
import type { MessageChannel } from "../constants";
import type { ColumnMapping, ImportFieldKey } from "./fields";
import {
  cleanText,
  parseBirthday,
  parseBool,
  parseDate,
  parseFsa,
  parseIntSafe,
  parseMoneyCents,
  splitName,
  tidyName,
} from "./values";

export type CsvRow = Record<string, string>;

export type ImportOptions = {
  /** Treat customers with a purchase in the last 2 years as having implied consent (CASL). */
  impliedFromPurchase: boolean;
  /** Reject non-fictional phone numbers / non-@example.com emails. */
  mockDataOnly: boolean;
};

export type ExistingCustomer = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  notes: string | null;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  orderCount: number;
  totalSpentCents: number;
  consents: ConsentLike[];
};

export type ExistingIndex = {
  customers: ExistingCustomer[];
  /** "sms:+15195550123" / "email:a@example.com" */
  suppressed: Set<string>;
};

export type ParsedRecord = {
  rows: number[]; // 1-based data row numbers (header excluded) — for messages
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  orderCount: number | null;
  totalSpentCents: number | null;
  smsOptIn: boolean | null;
  emailOptIn: boolean | null;
  optInDate: Date | null;
  unsubscribed: boolean;
  notes: string | null;
};

export type PlannedConsent = {
  channel: MessageChannel;
  type: "express" | "implied";
  source: "import" | "purchase";
  grantedAt: Date;
  evidence: string;
};

export type CustomerFields = {
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  neighbourhood?: string | null;
  postalFsa?: string | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  notes?: string | null;
  firstOrderAt?: Date | null;
  lastOrderAt?: Date | null;
  orderCount?: number;
  totalSpentCents?: number;
};

export type PlannedCustomer = {
  rows: number[];
  action: "create" | "update" | "unchanged";
  existingId?: string;
  displayName: string;
  contact: string;
  fields: CustomerFields; // for update: only the changed fields
  consents: PlannedConsent[];
  /** opt-outs found in the file: add to suppression + revoke active consents */
  optOuts: { channel: MessageChannel; value: string }[];
};

export type Issue = { rows: number[]; level: "skipped" | "warning"; message: string };

export type ImportPlan = {
  rowCount: number;
  customers: PlannedCustomer[];
  issues: Issue[];
  summary: {
    create: number;
    update: number;
    unchanged: number;
    skipped: number;
    mergedRows: number; // rows folded into another row of the same file
    consents: { smsExpress: number; smsImplied: number; emailExpress: number; emailImplied: number };
    consentBlocked: number; // suppressed or previously revoked: no consent added
    impliedExpired: number; // purchase older than 2 years: implied consent not added
    optOuts: number;
  };
};

const get = (row: CsvRow, mapping: ColumnMapping, key: ImportFieldKey) => {
  const col = mapping[key];
  return col ? row[col] : undefined;
};

export function parseRow(row: CsvRow, mapping: ColumnMapping, rowNumber: number): ParsedRecord {
  let first = cleanText(get(row, mapping, "firstName"), 60);
  let last = cleanText(get(row, mapping, "lastName"), 60);
  const full = cleanText(get(row, mapping, "fullName"), 120);
  if (!first && full) {
    const s = splitName(full);
    first = s.first;
    last = last ?? s.last;
  }
  const bday = parseBirthday(get(row, mapping, "birthday"));
  const lastOrderAt = parseDate(get(row, mapping, "lastOrderDate"));
  return {
    rows: [rowNumber],
    firstName: tidyName(first),
    lastName: tidyName(last),
    phone: normalizePhone(get(row, mapping, "phone")),
    email: normalizeEmail(get(row, mapping, "email")),
    neighbourhood: cleanText(get(row, mapping, "neighbourhood"), 60),
    postalFsa: parseFsa(get(row, mapping, "postalCode")),
    birthMonth: bday?.month ?? null,
    birthDay: bday?.day ?? null,
    firstOrderAt: parseDate(get(row, mapping, "firstOrderDate")),
    lastOrderAt,
    orderCount: parseIntSafe(get(row, mapping, "orderCount")),
    totalSpentCents: parseMoneyCents(get(row, mapping, "totalSpent")),
    smsOptIn: parseBool(get(row, mapping, "smsOptIn")),
    emailOptIn: parseBool(get(row, mapping, "emailOptIn")),
    optInDate: parseDate(get(row, mapping, "optInDate")),
    unsubscribed: parseBool(get(row, mapping, "unsubscribed")) === true,
    notes: cleanText(get(row, mapping, "notes"), 500),
  };
}

const maxDate = (a: Date | null | undefined, b: Date | null | undefined) =>
  !a ? (b ?? null) : !b ? a : a > b ? a : b;
const minDate = (a: Date | null | undefined, b: Date | null | undefined) =>
  !a ? (b ?? null) : !b ? a : a < b ? a : b;
const maxNum = (a: number | null | undefined, b: number | null | undefined) =>
  a == null ? (b ?? null) : b == null ? a : Math.max(a, b);
const orBool = (a: boolean | null, b: boolean | null) => (a === true || b === true ? true : (a ?? b));

function mergeRecords(a: ParsedRecord, b: ParsedRecord): ParsedRecord {
  return {
    rows: [...a.rows, ...b.rows],
    firstName: a.firstName ?? b.firstName,
    lastName: a.lastName ?? b.lastName,
    phone: a.phone ?? b.phone,
    email: a.email ?? b.email,
    neighbourhood: a.neighbourhood ?? b.neighbourhood,
    postalFsa: a.postalFsa ?? b.postalFsa,
    birthMonth: a.birthMonth ?? b.birthMonth,
    birthDay: a.birthMonth ? a.birthDay : b.birthDay,
    firstOrderAt: minDate(a.firstOrderAt, b.firstOrderAt),
    lastOrderAt: maxDate(a.lastOrderAt, b.lastOrderAt),
    orderCount: maxNum(a.orderCount, b.orderCount),
    totalSpentCents: maxNum(a.totalSpentCents, b.totalSpentCents),
    smsOptIn: orBool(a.smsOptIn, b.smsOptIn),
    emailOptIn: orBool(a.emailOptIn, b.emailOptIn),
    optInDate: maxDate(a.optInDate, b.optInDate),
    unsubscribed: a.unsubscribed || b.unsubscribed,
    notes: [a.notes, b.notes].filter(Boolean).join(" / ") || null,
  };
}

export function planImport(
  rows: CsvRow[],
  mapping: ColumnMapping,
  options: ImportOptions,
  existing: ExistingIndex,
  meta: { fileName: string; now?: Date },
): ImportPlan {
  const now = meta.now ?? new Date();
  const issues: Issue[] = [];
  const summary: ImportPlan["summary"] = {
    create: 0,
    update: 0,
    unchanged: 0,
    skipped: 0,
    mergedRows: 0,
    consents: { smsExpress: 0, smsImplied: 0, emailExpress: 0, emailImplied: 0 },
    consentBlocked: 0,
    impliedExpired: 0,
    optOuts: 0,
  };

  if (!mapping.phone && !mapping.email) {
    issues.push({ rows: [], level: "skipped", message: "Map a Phone or Email column — it's how customers are matched." });
    return { rowCount: rows.length, customers: [], issues, summary: { ...summary, skipped: rows.length } };
  }

  // 1) parse + validate rows
  const parsed: ParsedRecord[] = [];
  rows.forEach((row, i) => {
    const n = i + 1;
    const rawPhone = get(row, mapping, "phone")?.trim();
    const rawEmail = get(row, mapping, "email")?.trim();
    const rec = parseRow(row, mapping, n);
    if (rawPhone && !rec.phone) issues.push({ rows: [n], level: "warning", message: `Phone "${rawPhone}" isn't a valid number — ignored` });
    if (rawEmail && !rec.email) issues.push({ rows: [n], level: "warning", message: `Email "${rawEmail}" isn't valid — ignored` });
    if (options.mockDataOnly) {
      if (rec.phone && !isFictionalPhone(rec.phone)) {
        issues.push({ rows: [n], level: "skipped", message: "Real-looking phone number — mock-data mode only allows 555-01xx test numbers" });
        summary.skipped++;
        return;
      }
      if (rec.email && !rec.email.endsWith("@example.com")) {
        issues.push({ rows: [n], level: "skipped", message: "Real-looking email — mock-data mode only allows @example.com" });
        summary.skipped++;
        return;
      }
    }
    if (!rec.phone && !rec.email) {
      if (Object.values(row).some((v) => v?.trim())) {
        issues.push({ rows: [n], level: "skipped", message: "No valid phone or email" });
        summary.skipped++;
      }
      return;
    }
    if (rec.firstOrderAt && rec.firstOrderAt > now) rec.firstOrderAt = null;
    if (rec.lastOrderAt && rec.lastOrderAt > now) {
      issues.push({ rows: [n], level: "warning", message: "Last order date is in the future — ignored" });
      rec.lastOrderAt = null;
    }
    parsed.push(rec);
  });

  // 2) dedupe within the file: union-find over shared phone / email
  const parent = parsed.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();
  parsed.forEach((r, i) => {
    for (const key of [r.phone && `p:${r.phone}`, r.email && `e:${r.email}`]) {
      if (!key) continue;
      const j = firstByKey.get(key);
      if (j === undefined) firstByKey.set(key, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, ParsedRecord[]>();
  parsed.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  const records: ParsedRecord[] = [];
  for (const group of groups.values()) {
    const merged = group.reduce(mergeRecords);
    if (group.length > 1) {
      summary.mergedRows += group.length - 1;
      const phones = new Set(group.map((g) => g.phone).filter(Boolean));
      const emails = new Set(group.map((g) => g.email).filter(Boolean));
      const extra = phones.size > 1 || emails.size > 1 ? ` (kept ${[merged.phone, merged.email].filter(Boolean).join(", ")})` : "";
      issues.push({ rows: merged.rows, level: "warning", message: `Duplicate rows merged into one customer${extra}` });
    }
    records.push(merged);
  }

  // 3) match against existing customers and plan changes
  const byPhone = new Map<string, ExistingCustomer>();
  const byEmail = new Map<string, ExistingCustomer>();
  for (const c of existing.customers) {
    if (c.phone) byPhone.set(c.phone, c);
    if (c.email) byEmail.set(c.email, c);
  }

  const customers: PlannedCustomer[] = [];
  for (const rec of records) {
    const pMatch = rec.phone ? byPhone.get(rec.phone) : undefined;
    const eMatch = rec.email ? byEmail.get(rec.email) : undefined;
    if (pMatch && eMatch && pMatch.id !== eMatch.id) {
      issues.push({
        rows: rec.rows,
        level: "skipped",
        message: `Phone matches ${name(pMatch)} but email matches ${name(eMatch)} — fix by hand`,
      });
      summary.skipped += rec.rows.length;
      continue;
    }
    const match = pMatch ?? eMatch;

    const fields: CustomerFields = {};
    let phone = rec.phone;
    let email = rec.email;
    if (match) {
      // fill blanks only; never overwrite what the shop already has
      const fill = <K extends keyof CustomerFields>(k: K, v: CustomerFields[K], current: unknown) => {
        if (v != null && v !== "" && (current == null || current === "")) fields[k] = v;
      };
      fill("firstName", rec.firstName ?? undefined, match.firstName);
      fill("lastName", rec.lastName, match.lastName);
      if (rec.phone && !match.phone) fill("phone", rec.phone, match.phone);
      if (rec.email && !match.email) fill("email", rec.email, match.email);
      fill("neighbourhood", rec.neighbourhood, match.neighbourhood);
      fill("postalFsa", rec.postalFsa, match.postalFsa);
      if (rec.birthMonth && !match.birthMonth) {
        fields.birthMonth = rec.birthMonth;
        fields.birthDay = rec.birthDay;
      }
      fill("notes", rec.notes, match.notes);
      const last = maxDate(match.lastOrderAt, rec.lastOrderAt);
      if (last && last.getTime() !== match.lastOrderAt?.getTime()) fields.lastOrderAt = last;
      const first = minDate(match.firstOrderAt, rec.firstOrderAt ?? rec.lastOrderAt);
      if (first && first.getTime() !== match.firstOrderAt?.getTime()) fields.firstOrderAt = first;
      if (rec.orderCount != null && rec.orderCount > match.orderCount) fields.orderCount = rec.orderCount;
      if (rec.totalSpentCents != null && rec.totalSpentCents > match.totalSpentCents) fields.totalSpentCents = rec.totalSpentCents;
      phone = match.phone ?? rec.phone;
      email = match.email ?? rec.email;
      if (rec.phone && match.phone && rec.phone !== match.phone)
        issues.push({ rows: rec.rows, level: "warning", message: `Different phone than ${name(match)}'s — kept the existing one` });
      if (rec.email && match.email && rec.email !== match.email)
        issues.push({ rows: rec.rows, level: "warning", message: `Different email than ${name(match)}'s — kept the existing one` });
      // a phone/email being added must not belong to someone else (can't, or it would have matched) — guard anyway
      if (fields.phone && byPhone.has(fields.phone)) delete fields.phone;
      if (fields.email && byEmail.has(fields.email)) delete fields.email;
    } else {
      fields.firstName = rec.firstName ?? "";
      fields.lastName = rec.lastName;
      fields.phone = rec.phone;
      fields.email = rec.email;
      fields.neighbourhood = rec.neighbourhood;
      fields.postalFsa = rec.postalFsa;
      fields.birthMonth = rec.birthMonth;
      fields.birthDay = rec.birthDay;
      fields.notes = rec.notes;
      fields.lastOrderAt = rec.lastOrderAt;
      fields.firstOrderAt = rec.firstOrderAt ?? rec.lastOrderAt;
      fields.orderCount = rec.orderCount ?? (rec.lastOrderAt ? 1 : 0);
      fields.totalSpentCents = rec.totalSpentCents ?? 0;
    }

    // consent / opt-outs
    const lastOrderAt = maxDate(match?.lastOrderAt, rec.lastOrderAt);
    const consents: PlannedConsent[] = [];
    const optOuts: PlannedCustomer["optOuts"] = [];
    const addresses: Record<MessageChannel, string | null> = { sms: phone, email };

    if (rec.unsubscribed) {
      for (const channel of ["sms", "email"] as const) {
        const value = addresses[channel];
        if (value && !existing.suppressed.has(`${channel}:${value}`)) optOuts.push({ channel, value });
      }
      summary.optOuts += optOuts.length;
    } else {
      for (const channel of ["sms", "email"] as const) {
        const value = addresses[channel];
        if (!value) continue;
        const optIn = channel === "sms" ? rec.smsOptIn : rec.emailOptIn;
        const priorConsents = match?.consents.filter((c) => c.channel === channel) ?? [];
        const blocked = existing.suppressed.has(`${channel}:${value}`) || priorConsents.some((c) => c.revokedAt);
        const wantsExpress = optIn === true;
        const wantsImplied = !wantsExpress && options.impliedFromPurchase && !!lastOrderAt;
        if (!wantsExpress && !wantsImplied) continue;
        if (blocked) {
          summary.consentBlocked++;
          issues.push({
            rows: rec.rows,
            level: "warning",
            message: `${channel === "sms" ? "SMS" : "Email"} opted out before — stays opted out (suppression list wins)`,
          });
          continue;
        }
        if (wantsExpress) {
          if (priorConsents.some((c) => c.type === "express" && isConsentValid(c, lastOrderAt, now))) continue;
          const grantedAt = rec.optInDate && rec.optInDate <= now ? rec.optInDate : now;
          consents.push({
            channel,
            type: "express",
            source: "import",
            grantedAt,
            evidence: `CSV import "${meta.fileName}", row ${rec.rows.join("+")}: ${mapping[channel === "sms" ? "smsOptIn" : "emailOptIn"]} = yes`,
          });
          summary.consents[channel === "sms" ? "smsExpress" : "emailExpress"]++;
        } else if (lastOrderAt) {
          if (impliedConsentExpiry(lastOrderAt) <= now) {
            summary.impliedExpired++;
            continue;
          }
          const already = match && canContact({ phone, email, lastOrderAt, consents: priorConsents }, channel, false, now);
          if (already) continue;
          consents.push({
            channel,
            type: "implied",
            source: "purchase",
            grantedAt: minDate(match?.firstOrderAt, rec.firstOrderAt ?? lastOrderAt) ?? lastOrderAt,
            evidence: `CSV import "${meta.fileName}", row ${rec.rows.join("+")}: purchase, last order ${lastOrderAt.toISOString().slice(0, 10)}`,
          });
          summary.consents[channel === "sms" ? "smsImplied" : "emailImplied"]++;
        }
      }
    }

    const action: PlannedCustomer["action"] = !match
      ? "create"
      : Object.keys(fields).length || consents.length || optOuts.length
        ? "update"
        : "unchanged";
    summary[action]++;
    customers.push({
      rows: rec.rows,
      action,
      existingId: match?.id,
      displayName: [fields.firstName ?? match?.firstName, fields.lastName ?? match?.lastName].filter(Boolean).join(" ") || "(no name)",
      contact: [phone && formatPhone(phone), email].filter(Boolean).join(" · "),
      fields,
      consents,
      optOuts,
    });
  }

  return { rowCount: rows.length, customers, issues, summary };
}

function name(c: ExistingCustomer) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || c.email || c.id;
}
