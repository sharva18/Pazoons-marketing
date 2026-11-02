// Lenient parsers for values found in POS / spreadsheet exports.

export function parseBool(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (["y", "yes", "true", "1", "x", "✓", "opted in", "optin", "opt-in", "subscribed", "on"].includes(v)) return true;
  if (["n", "no", "false", "0", "opted out", "optout", "opt-out", "unsubscribed", "off", "-"].includes(v)) return false;
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parse a date: 2026-03-14, 2026/03/14, 3/14/2026, 14/3/2026 (when unambiguous), 3/14/26, "Mar 14 2026", ISO timestamps.
 * Slash dates are read month-first (North American) unless the first number is > 12.
 */
export function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return mk(+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    if (a > 12 && b <= 12) [a, b] = [b, a];
    let y = +m[3];
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return mk(y, a, b);
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function mk(y: number, mo: number, d: number, h = 12, mi = 0): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  // noon UTC ≈ morning in Toronto: stays on the same calendar day
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

/** Birthday → month/day (year ignored). Accepts 1990-05-14, 05/14, 5/14/1990, "May 14", "14 May". */
export function parseBirthday(raw: string | undefined): { month: number; day: number } | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return md(+m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,4})?$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a > 12 ? md(b, a) : md(a, b);
  }
  m = v.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})/) ?? null;
  if (m && MONTHS.includes(m[1])) return md(MONTHS.indexOf(m[1]) + 1, +m[2]);
  m = v.match(/^(\d{1,2})\s+([a-z]{3})/);
  if (m && MONTHS.includes(m[2])) return md(MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}

function md(month: number, day: number) {
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= max ? { month, day } : null;
}

/** "$1,234.50" → 123450 cents. */
export function parseMoneyCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const v = raw.replace(/[^0-9.\-]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function parseIntSafe(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function cleanText(raw: string | undefined, max = 120): string | null {
  const v = raw?.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

/** "N5V 1A1" / "n5v1a1" → "N5V". */
export function parseFsa(raw: string | undefined): string | null {
  const m = raw?.toUpperCase().replace(/\s/g, "").match(/^([A-Z]\d[A-Z])/);
  return m ? m[1] : null;
}

export function splitName(full: string): { first: string; last: string | null } {
  const v = full.trim();
  if (v.includes(",")) {
    const [last, first] = v.split(",").map((s) => s.trim());
    return { first: first || last, last: first ? last : null };
  }
  const parts = v.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Title-case names that arrive in ALL CAPS or all lower case. */
export function tidyName(s: string | null): string | null {
  if (!s) return s;
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
}
