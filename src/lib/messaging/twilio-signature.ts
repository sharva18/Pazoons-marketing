// Twilio request validation: HMAC-SHA1 over the full URL + sorted POST params, keyed by the auth token.
import { createHmac, timingSafeEqual } from "crypto";

export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function isValidTwilioRequest(authToken: string, signature: string | null, url: string, params: Record<string, string>) {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
