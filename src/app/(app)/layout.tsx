import { NavBar, NavLinks } from "@/components/NavBar";
import { SHOP } from "@/lib/constants";

// Owner-facing shell: header + bottom tab bar.
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const testMode = process.env.MESSAGING_TEST_MODE !== "false";
  return (
    <>
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight">
                Repeat<span className="text-brand">Slice</span>
              </span>
              <span className="truncate text-sm text-muted">{SHOP.name}</span>
            </div>
            {testMode && (
              <span className="shrink-0 rounded-full border border-warn/40 px-2 py-0.5 text-xs font-medium text-warn">
                Test mode
              </span>
            )}
            <NavLinks className="hidden md:flex" />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 pt-4 pb-28 md:pb-12">{children}</main>
        <NavBar />
    </>
  );
}
