// Phone / email normalisation used for dedupe and the suppression list.

/** Normalise a North American phone number to E.164 (+1XXXXXXXXXX). Returns null if it can't. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** 519-555-0123 style display. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/** NANP 555-0100…555-0199 is reserved for fiction — the only range mock data may use. */
export function isFictionalPhone(e164: string): boolean {
  return /^\+1\d{3}55501\d{2}$/.test(e164);
}
