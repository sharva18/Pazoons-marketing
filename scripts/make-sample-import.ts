/**
 * Builds public/samples/pazoons-sample-import.csv — a messy, POS-style export that exercises every
 * importer path against the seeded database. MOCK DATA ONLY (555-01xx phones, @example.com emails),
 * except two rows that deliberately break the mock-data rule to show the guard.
 *
 * Run after seeding: npx tsx scripts/make-sample-import.ts
 */
import { writeFileSync } from "fs";
import Papa from "papaparse";
import { PrismaClient } from "@prisma/client";
import { formatPhone } from "../src/lib/contact";

const prisma = new PrismaClient();
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const us = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;

async function main() {
  const withPhoneNoEmail = await prisma.customer.findMany({ where: { email: null, phone: { not: null } }, orderBy: { id: "asc" }, take: 2 });
  const noBirthday = await prisma.customer.findFirst({ where: { birthMonth: null, phone: { not: null }, email: { not: null } }, orderBy: { id: "desc" } });
  const smsSuppressed = await prisma.suppression.findFirst({ where: { channel: "sms" }, orderBy: { value: "asc" } });
  const supCustomer = await prisma.customer.findFirst({ where: { phone: smsSuppressed!.value } });
  const [a, b] = await prisma.customer.findMany({ where: { phone: { not: null }, email: { not: null } }, orderBy: { id: "asc" }, skip: 40, take: 2 });

  // new numbers: 555-01xx in area codes the seed doesn't use
  let n = 0;
  const newPhone = (style = 0) => {
    const ac = ["807", "249", "683", "382"][Math.floor(n / 100)];
    const num = `${ac}55501${String(n++ % 100).padStart(2, "0")}`;
    return style === 0 ? `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}` : style === 1 ? `${num.slice(0, 3)}.${num.slice(3, 6)}.${num.slice(6)}` : `+1${num}`;
  };

  type Row = Record<string, string>;
  const row = (r: Partial<Row>): Row => ({
    "Customer Name": "",
    Mobile: "",
    "E-mail": "",
    "Postal Code": "",
    Birthday: "",
    "Last Order": "",
    "Total Orders": "",
    "Lifetime Spend": "",
    "SMS Marketing": "",
    "Email Marketing": "",
    Unsubscribed: "",
    Notes: "",
    ...r,
  });

  const names = [
    "Jordan Blake", "PRIYA SHARMA", "marcus o'neil", "Hailey Tran", "Devon Clarke", "Nadia Haddad", "Tom Becker",
    "Aaliyah Grant", "Ben Okafor", "Chloe Desjardins", "Ivan Petrov", "Sam Reyes", "Rosa Martins", "Kenji Sato",
    "Leah Goldberg", "Owen MacLeod", "Fatou Diallo", "Ethan Wu", "Grace Lindqvist", "Victor Huang",
  ];
  const postal = ["N5V 3K2", "N5Y 4T1", "N5X 2B8", "N5W 1C4", "N6A 2M9", "N6G 5H3"];
  const rows: Row[] = [];

  // 20 new customers with mixed formats and consent
  names.forEach((name, i) => {
    const last = daysAgo([3, 12, 25, 40, 70, 95, 130, 200, 260, 330, 400, 15, 45, 8, 600, 21, 5, 75, 150, 33][i]);
    const first = name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
    rows.push(
      row({
        "Customer Name": name,
        Mobile: i % 5 === 4 ? "" : newPhone(i % 3),
        "E-mail": i % 4 === 3 ? "" : `${first}.${i}@example.com`,
        "Postal Code": postal[i % postal.length],
        Birthday: i % 3 === 0 ? ["Mar 14", "1990-07-02", "11/5", "Dec 24", "1985-02-28", "6/30/1992", "Nov 4"][i % 7] : "",
        "Last Order": i % 2 ? us(last) : iso(last),
        "Total Orders": String([1, 4, 2, 9, 1, 3, 1, 2, 6, 1, 3, 12, 1, 2, 5, 1, 2, 7, 1, 3][i]),
        "Lifetime Spend": `$${([36.5, 152.3, 61, 344.75, 24.99, 109.4, 46.99, 70.2, 233.1, 29.99, 98, 455.6, 35.99, 66, 180, 41.5, 71.98, 260.25, 26.99, 112][i]).toFixed(2)}`,
        "SMS Marketing": ["yes", "", "no", "Y", "", "", "TRUE", "", "", "yes", "", "", "", "yes", "", "", "", "", "", ""][i],
        "Email Marketing": ["yes", "", "", "yes", "", "no", "", "", "1", "", "", "yes", "", "", "", "", "yes", "", "", ""][i],
      }),
    );
  });
  // a later copy of Jordan Blake with only the phone (same person → merged)
  rows.push(row({ "Customer Name": "Jordan B", Mobile: rows[0].Mobile.replace(/\D/g, ""), "Last Order": iso(daysAgo(1)), "Total Orders": "2", Notes: "Prefers thin crust" }));
  // the same email typed in upper case on another row (merged)
  rows.push(row({ "Customer Name": "Devon Clarke", "E-mail": "DEVON.4@EXAMPLE.COM", Birthday: "Aug 9" }));
  // a new customer who unsubscribed in the old system
  rows.push(row({ "Customer Name": "Paul Lemieux", Mobile: newPhone(0), "E-mail": "paul.lemieux@example.com", "Last Order": iso(daysAgo(50)), Unsubscribed: "yes" }));

  // existing customers: fill blanks (email / birthday)
  for (const c of withPhoneNoEmail) {
    rows.push(row({ "Customer Name": `${c.firstName} ${c.lastName ?? ""}`.trim(), Mobile: formatPhone(c.phone), "E-mail": `${c.firstName.toLowerCase()}.new${c.id.slice(-4)}@example.com`, "Last Order": iso(daysAgo(2)), "Total Orders": String(c.orderCount + 1) }));
  }
  if (noBirthday) rows.push(row({ "Customer Name": noBirthday.firstName, "E-mail": noBirthday.email!, Birthday: "Sep 21", "Email Marketing": "yes" }));
  // existing customer who texted STOP: the export says SMS yes, but the suppression list wins
  if (supCustomer) rows.push(row({ "Customer Name": supCustomer.firstName, Mobile: formatPhone(supCustomer.phone), "SMS Marketing": "yes", "Last Order": iso(daysAgo(4)) }));
  // conflict: phone belongs to one customer, email to another
  rows.push(row({ "Customer Name": `${a.firstName} ${a.lastName}`, Mobile: formatPhone(a.phone), "E-mail": b.email!, "Last Order": iso(daysAgo(9)) }));

  // bad rows
  rows.push(row({ "Customer Name": "No Contact Info", "Last Order": iso(daysAgo(10)) }));
  rows.push(row({ "Customer Name": "Typo Number", Mobile: "519-67", "E-mail": "" }));
  rows.push(row({ "Customer Name": "Real Looking Phone", Mobile: "519-555-1234" }));
  rows.push(row({ "Customer Name": "Real Looking Email", "E-mail": "someone@pizzafan.test" }));

  writeFileSync("public/samples/pazoons-sample-import.csv", Papa.unparse(rows) + "\n");
  console.log(`Wrote ${rows.length} rows to public/samples/pazoons-sample-import.csv`);
}

main().finally(() => prisma.$disconnect());
