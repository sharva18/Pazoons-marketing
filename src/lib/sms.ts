// SMS helpers: segment counting and cost estimate.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€\f";

export type SmsCount = { encoding: "GSM-7" | "UCS-2"; units: number; segments: number; perSegment: number };

/** Count SMS segments. GSM-7: 160 chars (153 per part when split). UCS-2 (emoji, smart quotes…): 70 (67). */
export function countSms(text: string): SmsCount {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) {
    // UCS-2 counts UTF-16 code units (emoji = 2)
    units = text.length;
    const segments = units <= 70 ? 1 : Math.ceil(units / 67);
    return { encoding: "UCS-2", units, segments, perSegment: segments === 1 ? 70 : 67 };
  }
  const segments = units <= 160 ? 1 : Math.ceil(units / 153);
  return { encoding: "GSM-7", units, segments, perSegment: segments === 1 ? 160 : 153 };
}

/** Rough Twilio Canada outbound SMS price per segment, in USD cents (estimate only). */
export const SMS_COST_CENTS_PER_SEGMENT = 0.83;
/** Rough Postmark cost per email, in USD cents. */
export const EMAIL_COST_CENTS = 0.12;
