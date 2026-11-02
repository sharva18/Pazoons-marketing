// CASL consent logic. Pure functions so they can be used by the app, the seed script and tests.
import { IMPLIED_CONSENT_YEARS, type MessageChannel } from "./constants";

export type ConsentLike = {
  channel: string;
  type: string;
  grantedAt: Date;
  revokedAt: Date | null;
};

/** When implied consent from a purchase expires: 2 years after the LAST purchase. */
export function impliedConsentExpiry(lastOrderAt: Date): Date {
  const d = new Date(lastOrderAt);
  d.setFullYear(d.getFullYear() + IMPLIED_CONSENT_YEARS);
  return d;
}

/**
 * Is a single consent record valid right now?
 * - revoked → never valid
 * - express → valid until revoked
 * - implied → valid until 2 years after the customer's last purchase
 */
export function isConsentValid(consent: ConsentLike, lastOrderAt: Date | null, now: Date = new Date()): boolean {
  if (consent.revokedAt) return false;
  if (consent.grantedAt > now) return false;
  if (consent.type === "express") return true;
  if (consent.type === "implied") {
    const basis = lastOrderAt ?? consent.grantedAt;
    return impliedConsentExpiry(basis) > now;
  }
  return false;
}

/**
 * Can we message this customer on this channel? Needs a contact address, at least one valid,
 * un-revoked consent record for that channel, and the address must not be on the suppression list.
 * A revocation always wins: if the most recent record for the channel is revoked, the answer is no.
 */
export function canContact(
  customer: { phone: string | null; email: string | null; lastOrderAt: Date | null; consents: ConsentLike[] },
  channel: MessageChannel,
  suppressed: boolean,
  now: Date = new Date(),
): boolean {
  if (suppressed) return false;
  const address = channel === "sms" ? customer.phone : customer.email;
  if (!address) return false;
  const records = customer.consents
    .filter((c) => c.channel === channel)
    .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
  if (records.length === 0) return false;
  const latestRevocation = records
    .filter((c) => c.revokedAt)
    .reduce<Date | null>((max, c) => (!max || c.revokedAt! > max ? c.revokedAt! : max), null);
  return records.some(
    (c) => isConsentValid(c, customer.lastOrderAt, now) && (!latestRevocation || c.grantedAt > latestRevocation),
  );
}
