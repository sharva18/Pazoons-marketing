"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import type { ColumnMapping } from "@/lib/import/fields";
import { planImport, type CsvRow, type ImportOptions, type ImportPlan } from "@/lib/import/plan";
import { applyImport, loadExistingIndex, type ImportResult } from "@/lib/import/apply";

const MAX_ROWS = 20_000;

export type PreviewResponse =
  | { ok: true; summary: ImportPlan["summary"]; rowCount: number; issues: ImportPlan["issues"]; sample: SampleRow[] }
  | { ok: false; error: string };

export type SampleRow = { rows: number[]; action: string; name: string; contact: string; consents: string[]; changes: string[] };

type Input = { csv: string; fileName: string; mapping: ColumnMapping; impliedFromPurchase: boolean };

function parseCsv(csv: string): CsvRow[] {
  const res = Papa.parse<CsvRow>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  return res.data;
}

function options(input: Input): ImportOptions {
  // mock-data guard is server-controlled, never from the browser
  return { impliedFromPurchase: input.impliedFromPurchase, mockDataOnly: process.env.MOCK_DATA_ONLY !== "false" };
}

async function plan(input: Input) {
  const rows = parseCsv(input.csv);
  if (rows.length === 0) throw new Error("The file has no data rows.");
  if (rows.length > MAX_ROWS) throw new Error(`Too many rows (${rows.length}). Split the file into ${MAX_ROWS}-row parts.`);
  const existing = await loadExistingIndex();
  return planImport(rows, input.mapping, options(input), existing, { fileName: input.fileName });
}

export async function previewImport(input: Input): Promise<PreviewResponse> {
  try {
    const p = await plan(input);
    const sample: SampleRow[] = p.customers
      .filter((c) => c.action !== "unchanged")
      .slice(0, 30)
      .map((c) => ({
        rows: c.rows,
        action: c.action,
        name: c.displayName,
        contact: c.contact,
        consents: [
          ...c.consents.map((k) => `${k.channel === "sms" ? "SMS" : "Email"} ${k.type}`),
          ...c.optOuts.map((o) => `${o.channel === "sms" ? "SMS" : "Email"} opt-out`),
        ],
        changes: c.action === "update" ? Object.keys(c.fields) : [],
      }));
    return { ok: true, summary: p.summary, rowCount: p.rowCount, issues: p.issues.slice(0, 200), sample };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the file." };
  }
}

export async function commitImport(input: Input): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  try {
    // re-plan on the server against the current database — never trust a plan from the browser
    const p = await plan(input);
    const result = await applyImport(p, { fileName: input.fileName, mapping: input.mapping, options: options(input) });
    revalidatePath("/");
    revalidatePath("/customers");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
