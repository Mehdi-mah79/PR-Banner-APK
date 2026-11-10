/**
 * Calendar layer: all Jalali <-> Gregorian conversion and range logic lives here.
 * Canonical storage format: Gregorian ISO date "YYYY-MM-DD" (dates) and UTC ISO timestamps (instants).
 * Conversion is delegated to `jalaali-js` (arithmetic 33-year-cycle implementation).
 */
import * as jalaali from "jalaali-js";

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Saturday-first week, as used in Iran. */
export const WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;
export const WEEKDAYS_LONG = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"] as const;

export interface JDate {
  jy: number;
  jm: number;
  jd: number;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function isValidIso(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isoToJalali(iso: string): JDate {
  const [y, m, d] = iso.split("-").map(Number);
  const j = jalaali.toJalaali(y, m, d);
  return { jy: j.jy, jm: j.jm, jd: j.jd };
}

export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${pad(g.gy, 4)}-${pad(g.gm)}-${pad(g.gd)}`;
}

export function isLeapJalali(jy: number): boolean {
  return jalaali.isLeapJalaaliYear(jy);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return jalaali.isValidJalaaliDate(jy, jm, jd);
}

/** Local calendar date of a Date as ISO (no UTC shift). */
export function dateToIso(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return dateToIso(now);
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function diffDaysIso(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/** Weekday index with Saturday = 0 ... Friday = 6. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday = 0
  return (js + 1) % 7;
}

export function addJalaliMonths(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  const idx = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(idx / 12), jm: (idx % 12) + 1 };
}

// ---------- Upcoming-event ranges ----------

export type RangeKind = "week" | "nextMonth" | "month" | "custom";

export interface RangeSelection {
  kind: RangeKind;
  jy?: number;
  jm?: number;
  from?: string;
  to?: string;
}

export interface ResolvedRange {
  ok: boolean;
  from: string;
  to: string;
  error?: string;
}

export function monthBounds(jy: number, jm: number): { from: string; to: string } {
  return { from: jalaliToIso(jy, jm, 1), to: jalaliToIso(jy, jm, jalaliMonthLength(jy, jm)) };
}

/**
 * Resolves one of exactly four supported range kinds to inclusive ISO bounds.
 *  - week:      today .. today+6 (seven calendar days including today)
 *  - nextMonth: whole Jalali month following the current Jalali month
 *  - month:     whole selected Jalali month
 *  - custom:    user-selected inclusive range (end must not precede start)
 */
export function resolveRange(sel: RangeSelection, today: string): ResolvedRange {
  switch (sel.kind) {
    case "week":
      return { ok: true, from: today, to: addDaysIso(today, 6) };
    case "nextMonth": {
      const cur = isoToJalali(today);
      const n = addJalaliMonths(cur.jy, cur.jm, 1);
      return { ok: true, ...monthBounds(n.jy, n.jm) };
    }
    case "month": {
      const cur = isoToJalali(today);
      const jy = sel.jy ?? cur.jy;
      const jm = sel.jm ?? cur.jm;
      if (jm < 1 || jm > 12) return { ok: false, from: today, to: today, error: "ماه انتخاب‌شده معتبر نیست." };
      return { ok: true, ...monthBounds(jy, jm) };
    }
    case "custom": {
      if (!isValidIso(sel.from) || !isValidIso(sel.to)) {
        return { ok: false, from: today, to: today, error: "تاریخ شروع و پایان را انتخاب کنید." };
      }
      if (sel.to < sel.from) {
        return { ok: false, from: sel.from, to: sel.to, error: "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد." };
      }
      return { ok: true, from: sel.from, to: sel.to };
    }
  }
}

export function inRange(iso: string | null | undefined, from: string, to: string): boolean {
  return !!iso && iso >= from && iso <= to;
}

// ---------- Reminder time helpers ----------

export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** Builds a local-time Date for an ISO date and "HH:MM". */
export function localDateTime(iso: string, time: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function reminderFromOffset(occasionIso: string, offsetDays: number, time: string): Date {
  return localDateTime(addDaysIso(occasionIso, -offsetDays), time);
}

/** Next occurrence for a recurring reminder (Jalali-aware for monthly/yearly). */
export function nextOccurrence(from: Date, rec: Recurrence): Date {
  const d = new Date(from.getTime());
  if (rec === "daily") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (rec === "weekly") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (rec === "monthly" || rec === "yearly") {
    const j = isoToJalali(dateToIso(from));
    const t = addJalaliMonths(j.jy, j.jm, rec === "monthly" ? 1 : 12);
    const day = Math.min(j.jd, jalaliMonthLength(t.jy, t.jm));
    const iso = jalaliToIso(t.jy, t.jm, day);
    const [y, m, dd] = iso.split("-").map(Number);
    return new Date(y, m - 1, dd, from.getHours(), from.getMinutes(), 0, 0);
  }
  return d;
}
