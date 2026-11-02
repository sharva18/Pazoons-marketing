// Public pages (unsubscribe, opt-in): no owner navigation.
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>;
}
