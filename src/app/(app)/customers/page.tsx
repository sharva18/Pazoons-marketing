import Link from "next/link";
import {
  CONSENT_FILTERS,
  CONSENT_FILTER_LABELS,
  SORTS,
  SORT_LABELS,
  STATUS_FILTERS,
  STATUS_FILTER_LABELS,
  filterCustomers,
  loadCustomerIndex,
  parseEnum,
} from "@/lib/customers";
import { formatDaysAgo, formatMoney, formatNumber } from "@/lib/format";
import { formatPhone } from "@/lib/contact";
import { ConsentBadge, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = parseEnum(sp.status, STATUS_FILTERS, "all");
  const consent = parseEnum(sp.consent, CONSENT_FILTERS, "any");
  const sort = parseEnum(sp.sort, SORTS, "recent");
  const page = Math.max(1, Number(sp.page) || 1);

  const all = await loadCustomerIndex();
  const rows = filterCustomers(all, { q, status, consent, sort });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const href = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, status, consent, sort, page: undefined as string | number | undefined, ...patch };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.status !== "all") params.set("status", String(merged.status));
    if (merged.consent !== "any") params.set("consent", String(merged.consent));
    if (merged.sort !== "recent") params.set("sort", String(merged.sort));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    const s = params.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle sub={`${formatNumber(all.length)} customers`}>Customers</PageTitle>
        <Link
          href="/customers/import"
          className="mt-1 shrink-0 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium"
        >
          Import CSV
        </Link>
      </div>

      <form action="/customers" className="flex gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        {consent !== "any" && <input type="hidden" name="consent" value={consent} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name, phone, email, area…"
          aria-label="Search customers"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-base outline-none focus:border-brand"
        />
        <select
          name="sort"
          defaultValue={sort}
          aria-label="Sort"
          className="w-28 rounded-xl border border-line bg-card px-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-brand px-4 font-medium text-brand-ink">
          Go
        </button>
      </form>

      <ChipRow label="Last order">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f} href={href({ status: f })} active={status === f}>
            {STATUS_FILTER_LABELS[f]}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label="Consent">
        {CONSENT_FILTERS.map((f) => (
          <Chip key={f} href={href({ consent: f })} active={consent === f}>
            {CONSENT_FILTER_LABELS[f]}
          </Chip>
        ))}
      </ChipRow>

      <div className="mt-4 mb-2 flex items-baseline justify-between text-sm text-muted">
        <span>
          {formatNumber(rows.length)} match{rows.length === 1 ? "" : "es"}
        </span>
        {(q || status !== "all" || consent !== "any") && (
          <Link href="/customers" className="text-brand">
            Clear filters
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No customers match.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-card-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {`${c.firstName} ${c.lastName ?? ""}`.trim() || "(no name)"}
                  </div>
                  <div className="truncate text-sm text-muted">
                    {[c.neighbourhood, c.phone ? formatPhone(c.phone) : c.email].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <ConsentBadge channel="SMS" status={c.sms} />
                    <ConsentBadge channel="Email" status={c.email_} />
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className={c.bucket === "active" ? "font-medium" : "font-medium text-bad"}>
                    {formatDaysAgo(c.daysSinceLast)}
                  </div>
                  <div className="text-muted tabular-nums">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                  </div>
                  <div className="text-muted tabular-nums">{formatMoney(c.totalSpentCents, false)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
          <PageLink href={current > 1 ? href({ page: current - 1 }) : undefined}>← Prev</PageLink>
          <span className="text-muted tabular-nums">
            Page {current} of {pages}
          </span>
          <PageLink href={current < pages ? href({ page: current + 1 }) : undefined}>Next →</PageLink>
        </nav>
      )}
    </>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
        active ? "border-brand bg-brand text-brand-ink" : "border-line bg-card text-ink-2"
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({ href, children }: { href?: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className="rounded-xl border border-line bg-card px-4 py-2 font-medium">
      {children}
    </Link>
  ) : (
    <span className="rounded-xl border border-line px-4 py-2 text-muted opacity-50">{children}</span>
  );
}
