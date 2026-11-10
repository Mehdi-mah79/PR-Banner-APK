/** Pure data queries over banner DTOs: search, filter, sort, upcoming events, dashboard statistics. */
import { addDaysIso, inRange } from "./calendar";
import { normalizeSearch } from "./format";
import type { BannerDTO } from "./types";

export type SortKey = "created" | "occasion" | "title" | "used";

export interface ArchiveFilter {
  q: string;
  categoryId: number | "none" | null;
  tagIds: number[];
  from: string | null;
  to: string | null;
  upcomingOnly: boolean;
  activeReminders: boolean;
  noReminders: boolean;
  recentlyUsed: boolean;
  sort: SortKey;
}

export const EMPTY_FILTER: ArchiveFilter = {
  q: "",
  categoryId: null,
  tagIds: [],
  from: null,
  to: null,
  upcomingOnly: false,
  activeReminders: false,
  noReminders: false,
  recentlyUsed: false,
  sort: "created",
};

export function hasActiveReminders(b: BannerDTO): boolean {
  return b.reminders.some((r) => r.active && !r.completedAt);
}

export function filterBanners(list: BannerDTO[], f: ArchiveFilter, today: string, now = new Date()): BannerDTO[] {
  const q = normalizeSearch(f.q);
  const tokens = q ? q.split(" ") : [];
  const recentCutoff = now.getTime() - 30 * 86400000;
  const out = list.filter((b) => {
    if (tokens.length) {
      const hay = normalizeSearch(
        [b.title, b.description, b.occasionTitle, b.categoryName ?? "", b.tags.map((t) => t.name).join(" "), b.notes].join(" "),
      );
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    if (f.categoryId === "none" && b.categoryId !== null) return false;
    if (typeof f.categoryId === "number" && b.categoryId !== f.categoryId) return false;
    if (f.tagIds.length && !f.tagIds.every((id) => b.tags.some((t) => t.id === id))) return false;
    if (f.from && (!b.occasionDate || b.occasionDate < f.from)) return false;
    if (f.to && (!b.occasionDate || b.occasionDate > f.to)) return false;
    if (f.upcomingOnly && !(b.occasionDate && b.occasionDate >= today)) return false;
    if (f.activeReminders && !hasActiveReminders(b)) return false;
    if (f.noReminders && b.reminders.length > 0) return false;
    if (f.recentlyUsed && !(b.lastUsedAt && new Date(b.lastUsedAt).getTime() >= recentCutoff)) return false;
    return true;
  });
  return sortBanners(out, f.sort);
}

export function sortBanners(list: BannerDTO[], sort: SortKey): BannerDTO[] {
  const arr = [...list];
  switch (sort) {
    case "created":
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "occasion":
      return arr.sort((a, b) => (a.occasionDate ?? "9999").localeCompare(b.occasionDate ?? "9999"));
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title, "fa"));
    case "used":
      return arr.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  }
}

export interface UpcomingEvent {
  bannerId: number;
  title: string;
  banner: string;
  date: string;
}

/** Occasions of non-deleted banners inside [from, to] (inclusive), sorted chronologically. */
export function upcomingEvents(list: BannerDTO[], from: string, to: string): UpcomingEvent[] {
  return list
    .filter((b) => !b.deletedAt && inRange(b.occasionDate, from, to))
    .map((b) => ({ bannerId: b.id, title: b.occasionTitle || b.title, banner: b.title, date: b.occasionDate! }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "fa"));
}

export function dashboardStats(list: BannerDTO[], today: string, now = new Date()) {
  const live = list.filter((b) => !b.deletedAt);
  const allReminders = live.flatMap((b) => b.reminders);
  const active = allReminders.filter((r) => r.active && !r.completedAt);
  return {
    totalBanners: live.length,
    upcomingEvents: live.filter((b) => b.occasionDate && b.occasionDate >= today).length,
    todayEvents: live.filter((b) => b.occasionDate === today),
    activeReminders: active.length,
    overdueReminders: active.filter((r) => new Date(r.remindAt).getTime() < now.getTime()).length,
    recent: [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    recentlyUsed: live
      .filter((b) => b.lastUsedAt)
      .sort((a, b) => b.lastUsedAt!.localeCompare(a.lastUsedAt!))
      .slice(0, 5),
  };
}

export { addDaysIso };
