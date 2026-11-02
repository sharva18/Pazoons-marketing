// Target fields a CSV column can be mapped to, plus header auto-detection.

export const IMPORT_FIELDS = [
  { key: "firstName", label: "First name", group: "Customer" },
  { key: "lastName", label: "Last name", group: "Customer" },
  { key: "fullName", label: "Full name (split automatically)", group: "Customer" },
  { key: "phone", label: "Phone", group: "Contact" },
  { key: "email", label: "Email", group: "Contact" },
  { key: "neighbourhood", label: "Neighbourhood", group: "Customer" },
  { key: "postalCode", label: "Postal code", group: "Customer" },
  { key: "birthday", label: "Birthday", group: "Customer" },
  { key: "firstOrderDate", label: "First order date", group: "Orders" },
  { key: "lastOrderDate", label: "Last order date", group: "Orders" },
  { key: "orderCount", label: "Number of orders", group: "Orders" },
  { key: "totalSpent", label: "Total spent ($)", group: "Orders" },
  { key: "smsOptIn", label: "SMS opt-in (yes/no)", group: "Consent" },
  { key: "emailOptIn", label: "Email opt-in (yes/no)", group: "Consent" },
  { key: "optInDate", label: "Opt-in date", group: "Consent" },
  { key: "unsubscribed", label: "Unsubscribed / do not contact (yes/no)", group: "Consent" },
  { key: "notes", label: "Notes", group: "Customer" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

const ALIASES: Record<ImportFieldKey, string[]> = {
  firstName: ["firstname", "first", "fname", "givenname", "given"],
  lastName: ["lastname", "last", "lname", "surname", "familyname"],
  fullName: ["name", "fullname", "customer", "customername", "contactname", "clientname"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "tel", "telephone", "contactphone"],
  email: ["email", "emailaddress", "mail", "contactemail"],
  neighbourhood: ["neighbourhood", "neighborhood", "area", "community", "district"],
  postalCode: ["postalcode", "postal", "postcode", "zip", "zipcode"],
  birthday: ["birthday", "birthdate", "dob", "dateofbirth", "bday"],
  firstOrderDate: ["firstorder", "firstorderdate", "firstvisit", "customersince", "firstpurchase", "createdat", "created"],
  lastOrderDate: ["lastorder", "lastorderdate", "lastvisit", "lastpurchase", "lastpurchasedate", "lastordered"],
  orderCount: ["orders", "ordercount", "numorders", "totalorders", "visits", "visitcount"],
  totalSpent: ["totalspent", "spent", "lifetimevalue", "ltv", "totalsales", "revenue", "lifetimespend"],
  smsOptIn: ["smsoptin", "smsconsent", "textoptin", "sms", "optinsms", "acceptssms", "smsmarketing", "acceptssmsmarketing"],
  emailOptIn: ["emailoptin", "emailconsent", "optinemail", "acceptsemail", "emailmarketing", "acceptsmarketing", "acceptsemailmarketing", "newsletter"],
  optInDate: ["optindate", "consentdate", "signupdate", "subscribeddate"],
  unsubscribed: ["unsubscribed", "optout", "optedout", "donotcontact", "dnc", "donotmail"],
  notes: ["notes", "note", "comments", "comment"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Guess a mapping from CSV headers. Each column is used at most once. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const aliases = ALIASES[field.key];
    const hit = headers.find((h) => !used.has(h) && aliases.includes(norm(h)));
    if (hit) {
      mapping[field.key] = hit;
      used.add(hit);
    }
  }
  // looser second pass for the essentials ("Mobile Phone #", "E-mail address")
  for (const key of ["phone", "email"] as const) {
    if (mapping[key]) continue;
    const hit = headers.find((h) => !used.has(h) && norm(h).includes(key === "phone" ? "phone" : "email") && !/opt|consent|market/i.test(h));
    if (hit) {
      mapping[key] = hit;
      used.add(hit);
    }
  }
  // a separate first + last name beats a "name" column
  if (mapping.firstName && mapping.fullName) delete mapping.fullName;
  return mapping;
}
