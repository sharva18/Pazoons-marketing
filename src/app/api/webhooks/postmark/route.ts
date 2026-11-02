// Postmark webhooks: spam complaints, hard bounces and Postmark-hosted unsubscribes → email suppression.
// Configure the webhook URL as  {APP_URL}/api/webhooks/postmark?token={POSTMARK_WEBHOOK_TOKEN}
import { config } from "@/lib/config";
import { optOut } from "@/lib/messaging/optout";

type Payload = { RecordType?: string; Type?: string; Email?: string; Recipient?: string; SuppressSending?: boolean };

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!config.postmark.webhookToken || token !== config.postmark.webhookToken) return new Response("Forbidden", { status: 403 });
  const p = (await req.json()) as Payload;
  const email = p.Email ?? p.Recipient;
  if (!email) return Response.json({ ok: true, ignored: true });

  if (p.RecordType === "SpamComplaint") await optOut("email", email, "complaint");
  else if (p.RecordType === "Bounce" && p.Type === "HardBounce") await optOut("email", email, "bounce");
  else if (p.RecordType === "SubscriptionChange" && p.SuppressSending) await optOut("email", email, "unsubscribe");
  else return Response.json({ ok: true, ignored: true });
  return Response.json({ ok: true });
}
