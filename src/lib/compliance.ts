// CASL message formatting: every message identifies the shop and carries an opt-out.
import { SHOP } from "./constants";

export const SMS_OPT_OUT = "Reply STOP to opt out";

/** Replace {name} (and {first_name}) with the customer's first name, falling back to "there". */
export function mergeName(template: string, firstName: string | null | undefined): string {
  const name = firstName?.trim() || "there";
  return template.replace(/\{\s*(first_?)?name\s*\}/gi, name);
}

/** Final SMS text: merged body + shop identification + STOP instructions (added if missing). */
export function buildSmsBody(template: string, firstName: string | null | undefined): string {
  let body = mergeName(template, firstName).trim();
  if (!body.toLowerCase().includes(SHOP.name.toLowerCase())) body = `${SHOP.name}: ${body}`;
  if (!/reply stop/i.test(body)) body = `${body} ${SMS_OPT_OUT}`;
  return body;
}

/** Plain-text email footer: identification, mailing address, unsubscribe link. */
export function emailFooter(unsubscribeUrl: string): string {
  return [
    "--",
    `${SHOP.name} · ${SHOP.address} · ${SHOP.phoneDisplay}`,
    "You're getting this because you ordered from us or signed up for deals.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}

export function buildEmailBody(template: string, firstName: string | null | undefined, unsubscribeUrl: string): string {
  return `${mergeName(template, firstName).trim()}\n\n${emailFooter(unsubscribeUrl)}`;
}
