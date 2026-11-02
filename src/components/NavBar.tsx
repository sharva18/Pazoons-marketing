"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "Overview",
    icon: <path d="M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z" />,
  },
  {
    href: "/promo",
    label: "Promo",
    icon: <path d="M4 5h16v11H8l-4 4zM8 9h8M8 12h5" />,
  },
  {
    href: "/automations",
    label: "Automations",
    icon: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  },
  {
    href: "/customers",
    label: "Customers",
    icon: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.2 2.5 3.5 5.2" />,
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Inline links for wider screens (header). */
export function NavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={`items-center gap-1 ${className}`}>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            isActive(pathname, item.href) ? "bg-brand text-brand-ink" : "text-ink-2 hover:bg-card-2"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar for phones. */
export function NavBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
