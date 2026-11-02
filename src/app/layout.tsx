import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar, NavLinks } from "@/components/NavBar";
import { SHOP } from "@/lib/constants";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "RepeatSlice", template: "%s · RepeatSlice" },
  description: `Turn one-time customers into regulars — ${SHOP.name}`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const testMode = process.env.MESSAGING_TEST_MODE !== "false";
  return (
    <html lang="en-CA">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
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
      </body>
    </html>
  );
}
