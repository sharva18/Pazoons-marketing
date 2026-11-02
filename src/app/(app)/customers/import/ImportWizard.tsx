"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState, useTransition } from "react";
import { IMPORT_FIELDS, guessMapping, type ColumnMapping, type ImportFieldKey } from "@/lib/import/fields";
import { commitImport, previewImport, type PreviewResponse } from "./actions";
import type { ImportResult } from "@/lib/import/apply";

type Parsed = { fileName: string; csv: string; headers: string[]; rows: Record<string, string>[] };
type Step = "upload" | "map" | "review" | "done";

const GROUPS = ["Contact", "Customer", "Orders", "Consent"] as const;
const num = (n: number) => n.toLocaleString("en-CA");

export function ImportWizard({ mockDataOnly }: { mockDataOnly: boolean }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [implied, setImplied] = useState(true);
  const [preview, setPreview] = useState<Extract<PreviewResponse, { ok: true }> | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load(fileName: string, csv: string) {
    const res = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    const headers = (res.meta.fields ?? []).filter(Boolean);
    if (headers.length === 0 || res.data.length === 0) {
      setError("Couldn't find a header row and data in that file. Is it a CSV?");
      return;
    }
    setError(null);
    setFile({ fileName, csv, headers, rows: res.data });
    const guessed = guessMapping(headers);
    setMapping(guessed);
    setImplied(true);
    setStep("map");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setError("That file is over 8 MB. Split it into smaller files.");
      return;
    }
    load(f.name, await f.text());
    e.target.value = "";
  }

  async function useSample() {
    const res = await fetch("/samples/pazoons-sample-import.csv");
    load("pazoons-sample-import.csv", await res.text());
  }

  const input = file && { csv: file.csv, fileName: file.fileName, mapping, impliedFromPurchase: implied };

  function check() {
    if (!input) return;
    startTransition(async () => {
      const res = await previewImport(input);
      if (!res.ok) return setError(res.error);
      setError(null);
      setPreview(res);
      setStep("review");
    });
  }

  function run() {
    if (!input) return;
    startTransition(async () => {
      const res = await commitImport(input);
      if (!res.ok) return setError(res.error);
      setError(null);
      setResult(res.result);
      setStep("done");
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setStep("upload");
  }

  return (
    <div>
      <Steps step={step} />
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-bad/40 p-3 text-sm text-bad">
          ✕ {error}
        </div>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line bg-card p-8 text-center hover:border-brand">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">Choose a CSV file</span>
            <span className="text-sm text-muted">Export from your POS, DoorDash/Uber Eats, or a spreadsheet</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
          </label>
          <button type="button" onClick={useSample} className="w-full rounded-xl border border-line bg-card py-3 text-sm font-medium">
            Try it with the sample file
          </button>
          <ul className="space-y-1 text-sm text-muted">
            <li>• Each customer needs a phone number or an email.</li>
            <li>• Duplicates (same phone or email) are merged; existing customers are updated, never overwritten.</li>
            <li>• Anyone who opted out stays opted out — imports can&apos;t undo a STOP or unsubscribe.</li>
            {mockDataOnly && (
              <li className="text-warn">• Mock-data mode: only 555-01xx test numbers and @example.com emails are accepted.</li>
            )}
          </ul>
        </div>
      )}

      {step === "map" && file && (
        <MapStep
          file={file}
          mapping={mapping}
          setMapping={setMapping}
          implied={implied}
          setImplied={setImplied}
          onBack={reset}
          onNext={check}
          pending={pending}
        />
      )}

      {step === "review" && preview && (
        <ReviewStep preview={preview} onBack={() => setStep("map")} onImport={run} pending={pending} />
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-good/40 bg-card p-4">
            <div className="font-semibold text-good">✓ Import finished</div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Tile label="New customers" value={result.created} />
              <Tile label="Updated" value={result.updated} />
              <Tile label="Consents added" value={result.consentsAdded} />
              <Tile label="Opt-outs added" value={result.optOutsAdded} />
            </dl>
            {result.skipped > 0 && <p className="mt-3 text-sm text-muted">{num(result.skipped)} rows skipped.</p>}
          </div>
          <div className="flex gap-2">
            <Link href="/customers" className="flex-1 rounded-xl bg-brand py-3 text-center font-medium text-brand-ink">
              View customers
            </Link>
            <button type="button" onClick={reset} className="flex-1 rounded-xl border border-line bg-card py-3 font-medium">
              Import another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const steps: [Step, string][] = [
    ["upload", "File"],
    ["map", "Columns"],
    ["review", "Check"],
    ["done", "Done"],
  ];
  const idx = steps.findIndex(([s]) => s === step);
  return (
    <ol className="mb-4 flex gap-1 text-xs font-medium">
      {steps.map(([s, label], i) => (
        <li key={s} className="flex-1">
          <div className={`h-1 rounded-full ${i <= idx ? "bg-brand" : "bg-line"}`} />
          <div className={`mt-1 ${i === idx ? "text-ink" : "text-muted"}`}>{label}</div>
        </li>
      ))}
    </ol>
  );
}

function MapStep({
  file,
  mapping,
  setMapping,
  implied,
  setImplied,
  onBack,
  onNext,
  pending,
}: {
  file: Parsed;
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  implied: boolean;
  setImplied: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  pending: boolean;
}) {
  const sampleOf = (col?: string) => {
    if (!col) return "";
    const v = file.rows.map((r) => r[col]?.trim()).find(Boolean);
    return v ? (v.length > 32 ? v.slice(0, 32) + "…" : v) : "(empty)";
  };
  const used = useMemo(() => new Set(Object.values(mapping)), [mapping]);
  const unmapped = file.headers.filter((h) => !used.has(h));
  const canContinue = !!(mapping.phone || mapping.email);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">{file.fileName}</span> · {num(file.rows.length)} rows · {file.headers.length} columns. We
        guessed the columns below — check them.
      </p>

      {GROUPS.map((group) => (
        <section key={group} className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">{group}</h2>
          <div className="space-y-3">
            {IMPORT_FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="block">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-ink-2">{f.label}</span>
                  {mapping[f.key] && <span className="truncate text-xs text-muted">e.g. {sampleOf(mapping[f.key])}</span>}
                </div>
                <select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[f.key as ImportFieldKey] = e.target.value;
                    else delete next[f.key as ImportFieldKey];
                    setMapping(next);
                  }}
                  className={`mt-1 w-full rounded-xl border bg-card px-3 py-2.5 text-base ${
                    mapping[f.key] ? "border-brand/60" : "border-line text-muted"
                  }`}
                >
                  <option value="">— not in file —</option>
                  {file.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {group === "Consent" && (
            <label className="mt-4 flex gap-3 rounded-xl bg-card-2 p-3 text-sm">
              <input
                type="checkbox"
                checked={implied}
                onChange={(e) => setImplied(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="font-medium">These are paying customers</span>
                <span className="block text-muted">
                  Under CASL a purchase gives <em>implied</em> consent for 2 years after the last order. Needs a last order date.
                  Customers marked “yes” in an opt-in column get <em>express</em> consent instead.
                </span>
              </span>
            </label>
          )}
        </section>
      ))}

      {unmapped.length > 0 && <p className="text-xs text-muted">Not imported: {unmapped.join(", ")}</p>}

      <div className="sticky bottom-20 flex gap-2 md:bottom-4">
        <button type="button" onClick={onBack} className="rounded-xl border border-line bg-card px-4 py-3 font-medium">
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue || pending}
          className="flex-1 rounded-xl bg-brand py-3 font-medium text-brand-ink disabled:opacity-50"
        >
          {pending ? "Checking…" : canContinue ? "Check file" : "Map a phone or email column"}
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  preview,
  onBack,
  onImport,
  pending,
}: {
  preview: Extract<PreviewResponse, { ok: true }>;
  onBack: () => void;
  onImport: () => void;
  pending: boolean;
}) {
  const s = preview.summary;
  const changes = s.create + s.update;
  const skipped = preview.issues.filter((i) => i.level === "skipped");
  const warnings = preview.issues.filter((i) => i.level === "warning");

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">Nothing has been saved yet. Here&apos;s what the import will do with {num(preview.rowCount)} rows:</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Tile label="New customers" value={s.create} />
        <Tile label="Existing — updated" value={s.update} />
        <Tile label="Existing — no change" value={s.unchanged} />
        <Tile label="Duplicate rows merged" value={s.mergedRows} />
        <Tile label="Rows skipped" value={s.skipped} tone={s.skipped ? "bad" : undefined} />
      </dl>

      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="mb-2 font-semibold">Consent (CASL)</h2>
        <ul className="space-y-1.5">
          <Line label="SMS — express (opted in)" value={s.consents.smsExpress} />
          <Line label="SMS — implied (purchase < 2 yrs)" value={s.consents.smsImplied} />
          <Line label="Email — express (opted in)" value={s.consents.emailExpress} />
          <Line label="Email — implied (purchase < 2 yrs)" value={s.consents.emailImplied} />
          <Line label="Opt-outs added to suppression list" value={s.optOuts} />
          <Line label="Kept opted out (on suppression list)" value={s.consentBlocked} />
          <Line label="Purchase older than 2 yrs — no consent" value={s.impliedExpired} />
        </ul>
      </section>

      {preview.issues.length > 0 && <p className="text-xs text-muted">Row numbers match your spreadsheet (row 1 = headers).</p>}
      {skipped.length > 0 && <IssueList title="Skipped rows" issues={skipped} tone="bad" />}
      {warnings.length > 0 && <IssueList title="Warnings" issues={warnings} />}

      {preview.sample.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Preview{changes > preview.sample.length ? ` (first ${preview.sample.length})` : ""}</h2>
          <ul className="divide-y divide-line">
            {preview.sample.map((r) => (
              <li key={r.rows.join("-")} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className={`shrink-0 text-xs font-medium ${r.action === "create" ? "text-good" : "text-ink-2"}`}>
                    {r.action === "create" ? "+ New" : "↻ Update"}
                  </span>
                </div>
                <div className="truncate text-muted">{r.contact}</div>
                {(r.consents.length > 0 || r.changes.length > 0) && (
                  <div className="text-xs text-muted">
                    {[...r.consents, ...(r.changes.length ? [`fills: ${r.changes.join(", ")}`] : [])].join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-20 flex gap-2 md:bottom-4">
        <button type="button" onClick={onBack} className="rounded-xl border border-line bg-card px-4 py-3 font-medium">
          Back
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={pending || changes === 0}
          className="flex-1 rounded-xl bg-brand py-3 font-medium text-brand-ink disabled:opacity-50"
        >
          {pending ? "Importing…" : changes === 0 ? "Nothing to import" : `Import ${num(changes)} customer${changes === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${tone === "bad" ? "text-bad" : ""}`}>{num(value)}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2">
      <span className={value ? "text-ink-2" : "text-muted"}>{label}</span>
      <span className="font-medium tabular-nums">{num(value)}</span>
    </li>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: { rows: number[]; message: string }[]; tone?: "bad" }) {
  const [open, setOpen] = useState(issues.length <= 6);
  const shown = open ? issues : issues.slice(0, 6);
  return (
    <section className={`rounded-2xl border bg-card p-4 text-sm ${tone === "bad" ? "border-bad/40" : "border-line"}`}>
      <h2 className={`mb-2 font-semibold ${tone === "bad" ? "text-bad" : ""}`}>
        {tone === "bad" ? "✕" : "!"} {title} · {num(issues.length)}
      </h2>
      <ul className="space-y-1.5">
        {shown.map((i, k) => (
          <li key={k}>
            <span className="text-muted tabular-nums">{i.rows.length ? `Row ${i.rows.map((r) => r + 1).join(", ")}: ` : ""}</span>
            {i.message}
          </li>
        ))}
      </ul>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-brand">
          Show all {num(issues.length)}
        </button>
      )}
    </section>
  );
}
