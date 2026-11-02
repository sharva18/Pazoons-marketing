import { PageTitle } from "@/components/ui";

export const metadata = { title: "New promo" };

export default function Page() {
  return (
    <>
      <PageTitle>New promo</PageTitle>
      <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
        Coming next: {"Step 4 — campaign composer with segment picker, {name} merge, SMS preview and cost."}
      </p>
    </>
  );
}
