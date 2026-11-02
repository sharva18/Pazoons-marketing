// Sends scheduled campaigns that are due. Call every few minutes from a scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" {APP_URL}/api/cron/dispatch
import { config } from "@/lib/config";
import { runDueCampaigns } from "@/lib/messaging/campaigns";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!config.cronSecret || req.headers.get("authorization") !== `Bearer ${config.cronSecret}`) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json({ ran: await runDueCampaigns() });
}
