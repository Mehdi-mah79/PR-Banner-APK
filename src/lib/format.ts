/** UI formatting (digits, Jalali date strings, search normalisation). Calendar math is in calendar.ts. */
import { JALALI_MONTHS, WEEKDAYS_LONG, isoToJalali, isValidIso, weekdayIndex } from "./calendar";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
let usePersianDigits = true;

export function setPersianDigits(v: boolean) {
  usePersianDigits = v;
}

export function latinToFa(s: string): string {
  return s.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Formats any value with Persian digits when the preference is on. */
export function fa(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return usePersianDigits ? latinToFa(s) : s;
}

export function faNum(n: number): string {
  return fa(n.toLocaleString("en-US").replace(/,/g, "٬"));
}

/** Converts Persian/Arabic-Indic digits to ASCII. */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Normalises text for Persian-aware search. */
export function normalizeSearch(s: string | null | undefined): string {
  if (!s) return "";
  return toLatinDigits(s)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export type DateStyle = "long" | "numeric" | "weekday";

export function formatJalali(iso: string | null | undefined, style: DateStyle = "long"): string {
  if (!isValidIso(iso)) return "—";
  const { jy, jm, jd } = isoToJalali(iso);
  if (style === "numeric") return fa(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`);
  const base = `${fa(jd)} ${JALALI_MONTHS[jm - 1]} ${fa(jy)}`;
  return style === "weekday" ? `${WEEKDAYS_LONG[weekdayIndex(iso)]} ${base}` : base;
}

export function formatTime(d: Date): string {
  return fa(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

export function formatDateTime(value: string | Date | null | undefined, style: DateStyle = "long"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${formatJalali(iso, style)}، ${formatTime(d)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${fa(n)} بایت`;
  if (n < 1024 * 1024) return `${fa((n / 1024).toFixed(1))} کیلوبایت`;
  if (n < 1024 * 1024 * 1024) return `${fa((n / 1024 / 1024).toFixed(1))} مگابایت`;
  return `${fa((n / 1024 / 1024 / 1024).toFixed(2))} گیگابایت`;
}

export function relativeDays(diff: number): string {
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === -1) return "دیروز";
  return diff > 0 ? `${fa(diff)} روز دیگر` : `${fa(-diff)} روز پیش`;
}
