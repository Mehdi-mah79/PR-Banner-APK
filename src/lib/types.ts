import type { Recurrence } from "./calendar";

export type ReminderStatus = "scheduled" | "overdue" | "completed" | "inactive" | "paused";

export interface ReminderDTO {
  id: number;
  bannerId: number;
  bannerTitle?: string;
  occasionTitle?: string;
  remindAt: string;
  offsetDays: number | null;
  recurrence: Recurrence;
  active: boolean;
  message: string;
  completedAt: string | null;
  lastFiredAt: string | null;
  status: ReminderStatus;
}

export interface BannerDTO {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  occasionTitle: string;
  occasionDate: string | null;
  notes: string;
  imageId: number | null;
  remindersEnabled: boolean;
  tags: { id: number; name: string }[];
  reminders: ReminderDTO[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
}

export interface ReminderInput {
  id?: number;
  remindAt: string; // ISO instant
  offsetDays: number | null;
  recurrence: Recurrence;
  active: boolean;
  message?: string;
}

export interface BannerInput {
  title: string;
  description: string;
  categoryId: number | null;
  tagNames: string[];
  occasionTitle: string;
  occasionDate: string | null;
  notes: string;
  imageId: number | null;
  remindersEnabled: boolean;
  reminders: ReminderInput[];
  clientKey?: string;
}

export function validateBannerInput(i: Partial<BannerInput>): string[] {
  const errors: string[] = [];
  if (!i.title || !i.title.trim()) errors.push("عنوان بنر الزامی است.");
  if (i.title && i.title.length > 200) errors.push("عنوان بنر نباید بیش از ۲۰۰ نویسه باشد.");
  if (!i.occasionDate) errors.push("تاریخ مناسبت الزامی است.");
  if (i.remindersEnabled) {
    for (const r of i.reminders ?? []) {
      if (!r.remindAt || Number.isNaN(new Date(r.remindAt).getTime())) {
        errors.push("تاریخ و ساعت یادآور معتبر نیست.");
        break;
      }
    }
  }
  return errors;
}
