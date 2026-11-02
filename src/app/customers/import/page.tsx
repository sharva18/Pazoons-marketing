import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { ImportWizard } from "./ImportWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import customers" };

export default async function ImportPage() {
  const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  return (
    <>
      <Link href="/customers" className="text-sm text-brand">
        ← Customers
      </Link>
      <div className="mt-2">
        <PageTitle sub="Bring in customers from a CSV. You'll see exactly what changes before anything is saved.">
          Import customers
        </PageTitle>
      </div>
      <ImportWizard mockDataOnly={process.env.MOCK_DATA_ONLY !== "false"} />

      {batches.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Recent imports</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {batches.map((b) => (
              <li key={b.id} className="px-4 py-3">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{b.fileName}</span>
                  <span className="shrink-0 text-muted">{formatDate(b.createdAt, true)}</span>
                </div>
                <div className="text-muted">
                  {b.rowCount} rows · {b.createdCount} new · {b.updatedCount} updated · {b.skippedCount} skipped ·{" "}
                  {b.consentsAdded} consents · {b.optOutsAdded} opt-outs
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
