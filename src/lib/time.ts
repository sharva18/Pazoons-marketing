// Shop-local time helpers (America/Toronto) and SMS quiet hours.
import { SHOP, SMS_SEND_WINDOW } from "./constants";

const TZ = SHOP.timezone;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of `d` in the shop's time zone. */
export function localParts(d: Date): Parts {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** Offset (ms) of the shop's zone from UTC at instant `d` (negative for Toronto). */
function offsetAt(d: Date): number {
  const p = localParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(d.getTime() / 60_000) * 60_000;
}

/** Convert a shop-local wall time to a UTC Date (DST-aware). */
export function zonedTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetAt(new Date(guess));
  t = guess - offsetAt(new Date(t)); // second pass settles DST edges
  return new Date(t);
}

/** Parse "2026-11-05T17:30" (from <input type="datetime-local">) as shop-local time. */
export function parseLocalDateTime(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? zonedTime(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}

/** Format a Date for <input type="datetime-local"> in shop time. */
export function toLocalInputValue(d: Date): string {
  const p = localParts(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** CASL / courtesy quiet hours: texts only between 9:00 and 21:00 shop time. */
export function isWithinSmsWindow(d: Date): boolean {
  const { hour } = localParts(d);
  return hour >= SMS_SEND_WINDOW.startHour && hour < SMS_SEND_WINDOW.endHour;
}

/** The next moment texts may be sent: `d` itself if inside the window, otherwise the next 9:00. */
export function nextSmsWindowStart(d: Date): Date {
  if (isWithinSmsWindow(d)) return d;
  const p = localParts(d);
  const start = zonedTime(p.year, p.month, p.day, SMS_SEND_WINDOW.startHour);
  if (p.hour < SMS_SEND_WINDOW.startHour) return start;
  // after 21:00 → tomorrow 9:00 (via noon UTC tomorrow to stay on the right local date)
  const tomorrow = localParts(new Date(zonedTime(p.year, p.month, p.day, 12).getTime() + 86_400_000));
  return zonedTime(tomorrow.year, tomorrow.month, tomorrow.day, SMS_SEND_WINDOW.startHour);
}

export function formatShopTime(d: Date): string {
  return d.toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
