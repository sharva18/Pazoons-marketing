// Inbound SMS from Twilio (set as the number's "A message comes in" webhook): POST, form-encoded.
// STOP/ARRET → opted out instantly; START → re-subscribed; HELP → info. Replies are returned as TwiML.
import { config } from "@/lib/config";
import { handleInboundSms } from "@/lib/messaging/optout";
import { isValidTwilioRequest } from "@/lib/messaging/twilio-signature";

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  if (config.twilio.token) {
    // Twilio signs the public URL it called; behind a proxy use APP_URL rather than the internal URL
    const url = `${config.appUrl}/api/webhooks/twilio`;
    if (!isValidTwilioRequest(config.twilio.token, req.headers.get("x-twilio-signature"), url, params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (!config.testMode) {
    return new Response("Twilio not configured", { status: 503 });
  }

  if (!params.From || params.Body === undefined) return new Response("Bad request", { status: 400 });
  const { reply } = await handleInboundSms(params.From, params.Body, { providerId: params.MessageSid });
  const twiml = reply ? `<Response><Message>${xml(reply)}</Message></Response>` : "<Response/>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${twiml}`, { headers: { "Content-Type": "text/xml" } });
}
