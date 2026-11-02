// RFC 8058 one-click unsubscribe: mail clients POST here from the List-Unsubscribe header. Takes effect instantly.
import { prisma } from "@/lib/db";
import { optOut } from "@/lib/messaging/optout";
import { verifyUnsubscribeToken } from "@/lib/messaging/tokens";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = verifyUnsubscribeToken((await params).token);
  const customer = id ? await prisma.customer.findUnique({ where: { id }, select: { email: true } }) : null;
  if (!customer?.email) return new Response("Invalid link", { status: 404 });
  await optOut("email", customer.email, "unsubscribe");
  return new Response("Unsubscribed", { status: 200 });
}
