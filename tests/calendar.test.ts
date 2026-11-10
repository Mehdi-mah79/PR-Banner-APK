import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  isLeapJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  nextOccurrence,
  resolveRange,
  weekdayIndex,
} from "../src/lib/calendar";
import { normalizeSearch, formatJalali, latinToFa } from "../src/lib/format";

describe("Jalali conversion", () => {
  it("converts Nowruz dates", () => {
    expect(jalaliToIso(1403, 1, 1)).toBe("2024-03-20");
    expect(jalaliToIso(1404, 1, 1)).toBe("2025-03-21");
    expect(jalaliToIso(1405, 1, 1)).toBe("2026-03-21");
    expect(isoToJalali("2025-03-21")).toEqual({ jy: 1404, jm: 1, jd: 1 });
  });
  it("handles leap years and last day of the year", () => {
    expect(isLeapJalali(1403)).toBe(true);
    expect(isLeapJalali(1404)).toBe(false);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliToIso(1403, 12, 30)).toBe("2025-03-20");
    expect(isoToJalali("2025-03-20")).toEqual({ jy: 1403, jm: 12, jd: 30 });
    expect(isoToJalali("2026-03-20")).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });
  it("month lengths", () => {
    for (let m = 1; m <= 6; m++) expect(jalaliMonthLength(1404, m)).toBe(31);
    for (let m = 7; m <= 11; m++) expect(jalaliMonthLength(1404, m)).toBe(30);
  });
  it("round-trips every day of several years", () => {
    let iso = jalaliToIso(1398, 1, 1);
    for (let i = 0; i < 365 * 8; i++) {
      const j = isoToJalali(iso);
      expect(jalaliToIso(j.jy, j.jm, j.jd)).toBe(iso);
      iso = addDaysIso(iso, 1);
    }
  });
  it("weekday uses Saturday as first day", () => {
    expect(weekdayIndex("2025-03-22")).toBe(0); // Saturday
    expect(weekdayIndex("2025-03-28")).toBe(6); // Friday
  });
});

describe("upcoming range selection", () => {
  it("week: seven days including today", () => {
    expect(resolveRange({ kind: "week" }, "2025-03-18")).toMatchObject({ ok: true, from: "2025-03-18", to: "2025-03-24" });
  });
  it("next month is the following Jalali month, not +30 days", () => {
    // 1403/11/15 -> next month is Esfand 1403 (30 days, leap)
    const today = jalaliToIso(1403, 11, 15);
    const r = resolveRange({ kind: "nextMonth" }, today);
    expect(r).toMatchObject({ ok: true, from: jalaliToIso(1403, 12, 1), to: jalaliToIso(1403, 12, 30) });
    // year transition: Esfand -> Farvardin of the next year
    const r2 = resolveRange({ kind: "nextMonth" }, jalaliToIso(1404, 12, 10));
    expect(r2).toMatchObject({ from: jalaliToIso(1405, 1, 1), to: jalaliToIso(1405, 1, 31) });
  });
  it("selected month covers whole month with correct length", () => {
    expect(resolveRange({ kind: "month", jy: 1404, jm: 7 }, "2025-01-01")).toMatchObject({ from: jalaliToIso(1404, 7, 1), to: jalaliToIso(1404, 7, 30) });
    expect(resolveRange({ kind: "month", jy: 1404, jm: 12 }, "2025-01-01")).toMatchObject({ to: jalaliToIso(1404, 12, 29) });
  });
  it("custom range is inclusive and validated", () => {
    expect(resolveRange({ kind: "custom", from: "2025-04-01", to: "2025-04-10" }, "2025-03-01")).toMatchObject({ ok: true });
    expect(resolveRange({ kind: "custom", from: "2025-04-10", to: "2025-04-01" }, "2025-03-01").ok).toBe(false);
    expect(resolveRange({ kind: "custom" }, "2025-03-01").ok).toBe(false);
  });
});

describe("recurrence & formatting", () => {
  it("monthly recurrence keeps the Jalali day (clamped)", () => {
    const d = new Date(2025, 8, 22, 9, 0); // 1404/06/31
    const n = nextOccurrence(d, "monthly");
    expect(isoToJalali(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`)).toEqual({ jy: 1404, jm: 7, jd: 30 });
    expect(n.getHours()).toBe(9);
  });
  it("normalises Persian search text", () => {
    expect(normalizeSearch("علي ۱۲۳ كتاب")).toBe("علی 123 کتاب");
    expect(latinToFa("2025")).toBe("۲۰۲۵");
    expect(formatJalali("2025-03-21", "numeric")).toBe("۱۴۰۴/۰۱/۰۱");
  });
});
