// Signed, non-guessable unsubscribe tokens: base64url(customerId).base64url(hmac)
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";

const sign = (payload: string) => createHmac("sha256", config.secret).update(`unsub:${payload}`).digest("base64url").slice(0, 22);

export function unsubscribeToken(customerId: string): string {
  const payload = Buffer.from(customerId).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(payload, "base64url").toString();
}

export const unsubscribeUrl = (customerId: string) => `${config.appUrl}/u/${unsubscribeToken(customerId)}`;
export const oneClickUnsubscribeUrl = (customerId: string) =>
  `${config.appUrl}/api/unsubscribe/${unsubscribeToken(customerId)}`;
