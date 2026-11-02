import "server-only";
import { prisma } from "../db";
import type { ColumnMapping } from "./fields";
import type { ExistingIndex, ImportOptions, ImportPlan } from "./plan";

export async function loadExistingIndex(): Promise<ExistingIndex> {
  const [customers, suppressions] = await Promise.all([
    prisma.customer.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        neighbourhood: true,
        postalFsa: true,
        birthMonth: true,
        birthDay: true,
        notes: true,
        firstOrderAt: true,
        lastOrderAt: true,
        orderCount: true,
        totalSpentCents: true,
        consents: { select: { channel: true, type: true, grantedAt: true, revokedAt: true } },
      },
    }),
    prisma.suppression.findMany({ select: { channel: true, value: true } }),
  ]);
  return { customers, suppressed: new Set(suppressions.map((s) => `${s.channel}:${s.value}`)) };
}

export type ImportResult = {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  consentsAdded: number;
  optOutsAdded: number;
};

/** Apply a plan atomically and record an ImportBatch for the audit trail. */
export async function applyImport(
  plan: ImportPlan,
  meta: { fileName: string; mapping: ColumnMapping; options: ImportOptions },
): Promise<ImportResult> {
  const now = new Date();
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          fileName: meta.fileName,
          rowCount: plan.rowCount,
          skippedCount: plan.summary.skipped,
          mapping: JSON.stringify(meta.mapping),
          options: JSON.stringify(meta.options),
        },
      });
      const tag = ` [import:${batch.id}]`;
      let created = 0;
      let updated = 0;
      let consentsAdded = 0;
      let optOutsAdded = 0;

      for (const c of plan.customers) {
        if (c.action === "unchanged") continue;
        const consents = c.consents.map((k) => ({ ...k, evidence: k.evidence + tag }));
        let customerId: string;
        if (c.action === "create") {
          const f = c.fields;
          const row = await tx.customer.create({
            data: {
              firstName: f.firstName ?? "",
              lastName: f.lastName ?? null,
              phone: f.phone ?? null,
              email: f.email ?? null,
              neighbourhood: f.neighbourhood ?? null,
              postalFsa: f.postalFsa ?? null,
              birthMonth: f.birthMonth ?? null,
              birthDay: f.birthDay ?? null,
              notes: f.notes ?? null,
              firstOrderAt: f.firstOrderAt ?? null,
              lastOrderAt: f.lastOrderAt ?? null,
              orderCount: f.orderCount ?? 0,
              totalSpentCents: f.totalSpentCents ?? 0,
              source: "import",
              consents: { create: consents },
            },
          });
          customerId = row.id;
          created++;
        } else {
          customerId = c.existingId!;
          await tx.customer.update({
            where: { id: customerId },
            data: { ...c.fields, consents: { create: consents } },
          });
          updated++;
        }
        consentsAdded += consents.length;

        for (const o of c.optOuts) {
          await tx.suppression.upsert({
            where: { channel_value: { channel: o.channel, value: o.value } },
            create: { channel: o.channel, value: o.value, reason: "unsubscribe" },
            update: {},
          });
          await tx.consent.updateMany({
            where: { customerId, channel: o.channel, revokedAt: null },
            data: { revokedAt: now, revokeReason: "unsubscribe" },
          });
          optOutsAdded++;
        }
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: { createdCount: created, updatedCount: updated, consentsAdded, optOutsAdded },
      });
      return { batchId: batch.id, created, updated, skipped: plan.summary.skipped, consentsAdded, optOutsAdded };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
