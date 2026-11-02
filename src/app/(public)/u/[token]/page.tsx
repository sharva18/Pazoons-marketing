// Email unsubscribe page (linked from every email footer). Public, no login.
// Opening the page does not unsubscribe (mail scanners prefetch links) — one tap on the button does.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/messaging/tokens";
import { optOut } from "@/lib/messaging/optout";
import { SHOP } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function emailForToken(token: string): Promise<string | null> {
  const id = verifyUnsubscribeToken(token);
  if (!id) return null;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { email: true } });
  return customer?.email ?? null;
}

async function unsubscribeAction(token: string) {
  "use server";
  const email = await emailForToken(token);
  if (email) await optOut("email", email, "unsubscribe");
  revalidatePath(`/u/${token}`);
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await emailForToken(token);
  const done = email ? !!(await prisma.suppression.findUnique({ where: { channel_value: { channel: "email", value: email } } })) : false;

  return (
    <div className="mx-auto max-w-sm py-10 text-center">
      <h1 className="text-2xl font-bold">{SHOP.name}</h1>
      {!email ? (
        <p className="mt-4 text-muted">This unsubscribe link isn&apos;t valid. Call us at {SHOP.phoneDisplay} and we&apos;ll remove you.</p>
      ) : done ? (
        <>
          <p className="mt-4 text-lg font-medium text-good">✓ You&apos;re unsubscribed</p>
          <p className="mt-2 text-muted">{email} won&apos;t get any more promo emails from us.</p>
        </>
      ) : (
        <form action={unsubscribeAction.bind(null, token)} className="mt-6">
          <p className="text-muted">Stop promo emails to</p>
          <p className="mt-1 font-medium break-all">{email}</p>
          <button type="submit" className="mt-6 w-full rounded-xl bg-brand py-3 font-medium text-brand-ink">
            Unsubscribe
          </button>
        </form>
      )}
      <p className="mt-10 text-xs text-muted">
        {SHOP.name} · {SHOP.address} · {SHOP.phoneDisplay}
      </p>
    </div>
  );
}
