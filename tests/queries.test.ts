import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, dashboardStats, filterBanners, upcomingEvents } from "../src/lib/queries";
import { jalaliToIso, resolveRange } from "../src/lib/calendar";
import type { BannerDTO } from "../src/lib/types";

function b(id: number, over: Partial<BannerDTO> = {}): BannerDTO {
  return {
    id,
    title: `بنر ${id}`,
    description: "",
    categoryId: null,
    categoryName: null,
    occasionTitle: "",
    occasionDate: null,
    notes: "",
    imageId: null,
    remindersEnabled: true,
    tags: [],
    reminders: [],
    usageCount: 0,
    createdAt: `2025-01-0${id}T00:00:00.000Z`,
    updatedAt: "2025-01-01T00:00:00.000Z",
    lastUsedAt: null,
    deletedAt: null,
    ...over,
  };
}

const today = "2025-03-18"; // 1403/12/28
const list = [
  b(1, { occasionTitle: "نوروز", occasionDate: jalaliToIso(1404, 1, 1) }),
  b(2, { occasionTitle: "روز زمین", occasionDate: jalaliToIso(1403, 12, 29) }),
  b(3, { occasionTitle: "ولادت", occasionDate: jalaliToIso(1404, 1, 20), categoryId: 5, categoryName: "مذهبی", tags: [{ id: 1, name: "تبریک" }] }),
  b(4, { occasionTitle: "حذف شده", occasionDate: jalaliToIso(1404, 1, 5), deletedAt: "2025-01-01T00:00:00.000Z" }),
  b(5, { occasionTitle: "بعدی", occasionDate: jalaliToIso(1404, 2, 1), reminders: [{ id: 1, bannerId: 5, remindAt: "2025-05-01T00:00:00.000Z", offsetDays: 1, recurrence: "none", active: true, message: "", completedAt: null, lastFiredAt: null, status: "scheduled" }] }),
];

describe("upcoming events", () => {
  it("next month returns only that Jalali month and excludes deleted", () => {
    const r = resolveRange({ kind: "nextMonth" }, today); // current month Esfand 1403 -> Farvardin 1404
    const ev = upcomingEvents(list, r.from, r.to);
    expect(ev.map((e) => e.bannerId)).toEqual([1, 3]);
  });
  it("week returns only next seven days", () => {
    const r = resolveRange({ kind: "week" }, today);
    expect(upcomingEvents(list, r.from, r.to).map((e) => e.bannerId)).toEqual([2, 1]); // 29 Esfand and 1 Farvardin, but not 20 Farvardin
  });
  it("selected month and custom range", () => {
    const m = resolveRange({ kind: "month", jy: 1404, jm: 2 }, today);
    expect(upcomingEvents(list, m.from, m.to).map((e) => e.bannerId)).toEqual([5]);
    const c = resolveRange({ kind: "custom", from: jalaliToIso(1404, 1, 1), to: jalaliToIso(1404, 1, 20) }, today);
    expect(upcomingEvents(list, c.from, c.to).map((e) => e.bannerId)).toEqual([1, 3]);
  });
  it("is sorted chronologically", () => {
    const ev = upcomingEvents(list, "2025-01-01", "2026-01-01");
    expect(ev.map((e) => e.date)).toEqual([...ev.map((e) => e.date)].sort());
  });
});

describe("archive search and filters", () => {
  it("searches Persian text, digits, tags and categories", () => {
    expect(filterBanners(list, { ...EMPTY_FILTER, q: "نوروز" }, today).map((x) => x.id)).toEqual([1]);
    expect(filterBanners(list, { ...EMPTY_FILTER, q: "تبریک" }, today).map((x) => x.id)).toEqual([3]);
    expect(filterBanners(list, { ...EMPTY_FILTER, q: "مذهبی" }, today).map((x) => x.id)).toEqual([3]);
    expect(filterBanners(list, { ...EMPTY_FILTER, q: "بنر ۵" }, today).map((x) => x.id)).toEqual([5]);
  });
  it("filters reminders / category", () => {
    expect(filterBanners(list, { ...EMPTY_FILTER, activeReminders: true }, today).map((x) => x.id)).toEqual([5]);
    expect(filterBanners(list, { ...EMPTY_FILTER, noReminders: true }, today).length).toBe(4);
    expect(filterBanners(list, { ...EMPTY_FILTER, categoryId: "none" }, today).length).toBe(4);
    expect(filterBanners(list, { ...EMPTY_FILTER, sort: "occasion" }, today)[0].id).toBe(2);
  });
  it("dashboard statistics come from data", () => {
    const s = dashboardStats(list, today, new Date("2025-06-01T00:00:00Z"));
    expect(s.totalBanners).toBe(4); // the deleted banner is excluded
    expect(s.activeReminders).toBe(1);
    expect(s.overdueReminders).toBe(1);
  });
});
