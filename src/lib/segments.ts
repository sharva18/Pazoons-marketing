// Promo segments: who a campaign targets, and who is excluded on a channel (and why).
import type { CustomerRow } from "./customers";
import type { MessageChannel } from "./constants";
import type { ConsentStatus } from "./consent";

export const SEGMENTS = [
  { key: "all", label: "Everyone", hint: "All customers" },
  { key: "active", label: "Active", hint: "Ordered in the last 30 days" },
  { key: "lapsed_all", label: "All lapsed", hint: "No order in 30+ days" },
  { key: "lapsed_30_90", label: "Lapsed 30–90 days", hint: "Easiest to win back" },
  { key: "lapsed_90_180", label: "Lapsed 90–180 days", hint: "Needs a stronger offer" },
  { key: "lapsed_180_plus", label: "Lapsed 180+ days", hint: "Last chance" },
  { key: "one_timers", label: "One-time customers", hint: "Ordered once — turn them into regulars" },
  { key: "regulars", label: "Regulars", hint: "5+ orders" },
  { key: "app_orderers", label: "Mostly order via apps", hint: "Most orders through DoorDash / Uber Eats — push direct" },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];
export const SEGMENT_KEYS = SEGMENTS.map((s) => s.key) as SegmentKey[];
export const segmentLabel = (key: string) => SEGMENTS.find((s) => s.key === key)?.label ?? key;

export function inSegment(r: CustomerRow, key: SegmentKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "active":
      return r.bucket === "active";
    case "lapsed_all":
      return r.bucket.startsWith("lapsed");
    case "lapsed_30_90":
    case "lapsed_90_180":
    case "lapsed_180_plus":
      return r.bucket === key;
    case "one_timers":
      return r.orderCount === 1;
    case "regulars":
      return r.orderCount >= 5;
    case "app_orderers":
      return r.appShare > 0.5;
  }
}

export type ExclusionReason = "no_consent" | "opted_out" | "expired" | "no_address";
export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  no_consent: "No consent",
  opted_out: "Opted out",
  expired: "Consent expired (no purchase in 2 yrs)",
  no_address: "No phone/email on file",
};

function reasonFor(status: ConsentStatus): ExclusionReason | null {
  switch (status) {
    case "ok":
      return null;
    case "no_address":
      return "no_address";
    case "suppressed":
    case "revoked":
      return "opted_out";
    case "expired":
      return "expired";
    default:
      return "no_consent";
  }
}

export type Audience = {
  segmentSize: number;
  recipients: CustomerRow[];
  excluded: Record<ExclusionReason, number>;
};

/** Split a segment into recipients (valid consent on this channel) and exclusions by reason. */
export function buildAudience(rows: CustomerRow[], key: SegmentKey, channel: MessageChannel): Audience {
  const excluded: Record<ExclusionReason, number> = { no_consent: 0, opted_out: 0, expired: 0, no_address: 0 };
  const recipients: CustomerRow[] = [];
  let segmentSize = 0;
  for (const r of rows) {
    if (!inSegment(r, key)) continue;
    segmentSize++;
    const reason = reasonFor(channel === "sms" ? r.sms : r.email_);
    if (reason) excluded[reason]++;
    else recipients.push(r);
  }
  return { segmentSize, recipients, excluded };
}

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
  draft: "Draft",
};
