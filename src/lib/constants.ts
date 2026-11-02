// Shared constants for RepeatSlice. Imported by both the app and prisma/seed.ts (keep relative-import friendly).

export const SHOP = {
  name: "Pazoon's Pizza",
  address: "1030 Adelaide St N, London, ON",
  phoneDisplay: "519-673-4444",
  phoneE164: "+15196734444",
  timezone: "America/Toronto",
  lateNights: ["Friday", "Saturday"],
} as const;

export const CHANNELS = ["sms", "email"] as const;
export type MessageChannel = (typeof CHANNELS)[number];

export const ORDER_CHANNELS = ["phone", "walk_in", "doordash", "ubereats", "online"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];
export const DIRECT_ORDER_CHANNELS: OrderChannel[] = ["phone", "walk_in", "online"];
export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  phone: "Phone",
  walk_in: "Walk-in",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  online: "Online",
};

export const CONSENT_TYPES = ["express", "implied"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];
export const CONSENT_SOURCES = ["purchase", "optin_page", "counter", "import", "phone_call"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** CASL: implied consent from a purchase lasts 2 years from the last purchase. */
export const IMPLIED_CONSENT_YEARS = 2;

/** Quiet hours for SMS, shop local time: sending allowed from 9:00 until 21:00. */
export const SMS_SEND_WINDOW = { startHour: 9, endHour: 21 } as const;

export type Deal = {
  name: string;
  description: string;
  minPrice: number; // dollars
  maxPrice: number;
};

/** Pazoon's real deals. */
export const DEALS: Deal[] = [
  { name: "Single Deal", description: "1 pizza, 3 toppings, 2 drinks, 1 dip", minPrice: 20.99, maxPrice: 26.99 },
  { name: "Double Deal", description: "2 pizzas, 3 toppings each, drinks and dips", minPrice: 33.99, maxPrice: 43.99 },
  { name: "Family Deal", description: "2 pizzas, 15 wings, 6 pops, breadsticks or wedges", minPrice: 46.99, maxPrice: 56.99 },
  { name: "Pizza & Wings", description: "Large pizza and wings", minPrice: 35.99, maxPrice: 35.99 },
  { name: "2 Can Dine", description: "Dinner for two", minPrice: 29.99, maxPrice: 29.99 },
  { name: "Wings (10)", description: "10 wings", minPrice: 12.99, maxPrice: 12.99 },
  { name: "Panzerotti", description: "Panzerotti", minPrice: 15.99, maxPrice: 15.99 },
  { name: "Cheesy breadsticks", description: "Cheesy breadsticks", minPrice: 7.99, maxPrice: 7.99 },
];

export type Neighbourhood = { name: string; fsa: string; weight: number; northeast: boolean };

/** London, ON neighbourhoods, weighted toward the shop's northeast catchment. */
export const NEIGHBOURHOODS: Neighbourhood[] = [
  { name: "Huron Heights", fsa: "N5V", weight: 16, northeast: true },
  { name: "Carling", fsa: "N5Y", weight: 13, northeast: true },
  { name: "Stoney Creek", fsa: "N5X", weight: 12, northeast: true },
  { name: "East London", fsa: "N5W", weight: 11, northeast: true },
  { name: "Old East Village", fsa: "N5W", weight: 9, northeast: true },
  { name: "Argyle", fsa: "N5V", weight: 9, northeast: true },
  { name: "Masonville", fsa: "N6G", weight: 6, northeast: false },
  { name: "Old North", fsa: "N5Y", weight: 6, northeast: false },
  { name: "Fanshawe", fsa: "N5X", weight: 6, northeast: false },
  { name: "Westmount", fsa: "N6J", weight: 4, northeast: false },
  { name: "Byron", fsa: "N6K", weight: 3, northeast: false },
  { name: "Downtown", fsa: "N6A", weight: 5, northeast: false },
];

/** Lapsed buckets (days since last order). */
export const RECENCY_BUCKETS = [
  { key: "active", label: "Ordered in last 30 days", minDays: 0, maxDays: 30 },
  { key: "lapsed_30_90", label: "30–90 days", minDays: 30, maxDays: 90 },
  { key: "lapsed_90_180", label: "90–180 days", minDays: 90, maxDays: 180 },
  { key: "lapsed_180_plus", label: "180+ days", minDays: 180, maxDays: Infinity },
] as const;

export const AUTOMATION_KEYS = ["winback", "first_order_thanks", "birthday_week", "fifth_order", "feedback"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];
