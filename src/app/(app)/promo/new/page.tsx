import { loadCustomerIndex } from "@/lib/customers";
import { SEGMENTS, buildAudience } from "@/lib/segments";
import { TEMPLATES } from "@/lib/templates";
import { config } from "@/lib/config";
import { Composer, type SegmentOption } from "./Composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "New promo" };

export default async function NewPromoPage() {
  const rows = await loadCustomerIndex();
  const segments: SegmentOption[] = SEGMENTS.map((s) => {
    const per = (channel: "sms" | "email") => {
      const a = buildAudience(rows, s.key, channel);
      const names = a.recipients.map((r) => r.firstName).filter(Boolean);
      return {
        recipients: a.recipients.length,
        excluded: a.excluded,
        sampleName: names[0] ?? "there",
        longestName: names.reduce((m, n) => (n.length > m.length ? n : m), "there"),
      };
    };
    return { key: s.key, label: s.label, hint: s.hint, size: buildAudience(rows, s.key, "sms").segmentSize, sms: per("sms"), email: per("email") };
  });
  return <Composer segments={segments} templates={TEMPLATES} testMode={config.testMode} />;
}
