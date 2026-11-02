// Promo templates built on Pazoon's real deals. They push ordering DIRECT (call / walk in) to save app commissions.
// SMS bodies stick to plain GSM-7 characters (no em dashes / emoji) and fit ONE segment (160 chars) including the
// automatic shop name + STOP footer, even for long first names (see templates.test.ts).
// The shop name and "Reply STOP to opt out" / the email footer are added automatically at send time.

export type PromoTemplate = {
  key: string;
  name: string;
  bestFor: string;
  sms: string;
  emailSubject: string;
  email: string;
  promoCode: string;
};

export const TEMPLATES: PromoTemplate[] = [
  {
    key: "order_direct",
    name: "Order direct & save",
    bestFor: "app_orderers",
    sms: "Hey {name}, skip the app fees! Call 519-673-4444 or walk in. Code DIRECT5 = $5 off your next order.",
    emailSubject: "{name}, save $5 when you order direct",
    email:
      "Hi {name},\n\nDid you know DoorDash and Uber Eats add fees and higher menu prices? Order straight from us and you get our best price.\n\nCall 519-673-4444 or walk in at 1030 Adelaide St N and use code DIRECT5 for $5 off your next order.\n\nThanks for supporting a local pizza shop!\nPazoon's Pizza",
    promoCode: "DIRECT5",
  },
  {
    key: "family_deal",
    name: "Family Deal night",
    bestFor: "regulars",
    sms: "{name}, Family Deal: 2 pizzas, 15 wings, 6 pops + sticks from $46.99. Call 519-673-4444, code FAMILY = free dip.",
    emailSubject: "Family Deal night, {name}?",
    email:
      "Hi {name},\n\nOur Family Deal feeds everyone: 2 pizzas, 15 wings, 6 pops and cheesy breadsticks or wedges, from $46.99.\n\nCall 519-673-4444 or walk in and mention code FAMILY for a free dip.\n\nPazoon's Pizza",
    promoCode: "FAMILY",
  },
  {
    key: "late_night",
    name: "Late-night Fri & Sat",
    bestFor: "active",
    sms: "Up late, {name}? Open late Fri & Sat! Double Deal from $33.99, code LATENITE = $5 off. Call 519-673-4444.",
    emailSubject: "Open late tonight, {name}",
    email:
      "Hi {name},\n\nHungry after hours? We're open late every Friday and Saturday.\n\nGrab a Double Deal from $33.99 and take $5 off with code LATENITE. Call 519-673-4444 or walk in at 1030 Adelaide St N.\n\nPazoon's Pizza",
    promoCode: "LATENITE",
  },
  {
    key: "two_can_dine",
    name: "2 Can Dine",
    bestFor: "one_timers",
    sms: "Date night, {name}? 2 Can Dine $29.99. Call 519-673-4444 or walk in, code DATE = free cheesy breadsticks.",
    emailSubject: "Dinner for two, {name}: $29.99",
    email:
      "Hi {name},\n\nOur 2 Can Dine is $29.99 and it's perfect for a night in.\n\nCall 519-673-4444 or walk in and use code DATE for free cheesy breadsticks.\n\nPazoon's Pizza",
    promoCode: "DATE",
  },
  {
    key: "win_back",
    name: "We miss you",
    bestFor: "lapsed_30_90",
    sms: "We miss you, {name}! $5 off any deal this week with code COMEBACK. Call 519-673-4444 or walk in.",
    emailSubject: "It's been a while, {name} - $5 off on us",
    email:
      "Hi {name},\n\nIt's been a while! Come back this week and take $5 off any deal with code COMEBACK: Single, Double, Family, Pizza & Wings or 2 Can Dine.\n\nCall 519-673-4444 or walk in at 1030 Adelaide St N. Ordering direct always gets you the best price.\n\nSee you soon,\nPazoon's Pizza",
    promoCode: "COMEBACK",
  },
  {
    key: "pizza_wings",
    name: "Pizza & Wings",
    bestFor: "all",
    sms: "{name}, large Pizza & Wings $35.99 tonight! Call 519-673-4444 or walk in. Add cheesy breadsticks $7.99.",
    emailSubject: "Pizza & Wings for $35.99, {name}",
    email:
      "Hi {name},\n\nLarge pizza and wings for $35.99. Add cheesy breadsticks for $7.99 or a panzerotti for $15.99.\n\nCall 519-673-4444 or walk in at 1030 Adelaide St N.\n\nPazoon's Pizza",
    promoCode: "",
  },
];
