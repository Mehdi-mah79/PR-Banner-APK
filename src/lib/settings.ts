import type { RangeSelection } from "./calendar";

export const DEFAULT_SETTINGS = {
  theme: "dark" as "dark" | "light" | "system",
  fontSize: "medium" as "small" | "medium" | "large" | "xlarge",
  density: "comfortable" as "comfortable" | "compact",
  persianDigits: true,
  dateStyle: "long" as "long" | "numeric" | "weekday",
  notificationsEnabled: true,
  notifySound: true,
  notifyVibrate: true,
  defaultReminderOffsetDays: 1,
  defaultReminderTime: "09:00",
  snoozeMinutes: 10,
  autoCompleteAfterFire: false,
  backupFormat: "zip" as "zip" | "json" | "csv",
  archiveView: "grid" as "grid" | "list",
  upcomingRange: { kind: "week" } as RangeSelection,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export function sanitizeSettings(input: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    if (!(k in input)) continue;
    const v = input[k];
    const d = DEFAULT_SETTINGS[k];
    if (typeof d === "boolean" && typeof v === "boolean") out[k] = v;
    else if (typeof d === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.min(v, 100000));
    else if (typeof d === "string" && typeof v === "string") {
      const allowed: Partial<Record<SettingKey, string[]>> = {
        theme: ["dark", "light", "system"],
        fontSize: ["small", "medium", "large", "xlarge"],
        density: ["comfortable", "compact"],
        dateStyle: ["long", "numeric", "weekday"],
        backupFormat: ["zip", "json", "csv"],
        archiveView: ["grid", "list"],
      };
      const list = allowed[k];
      if (list && !list.includes(v)) continue;
      if (k === "defaultReminderTime" && !/^\d{2}:\d{2}$/.test(v)) continue;
      out[k] = v;
    } else if (k === "upcomingRange" && v && typeof v === "object" && "kind" in (v as object)) {
      const kind = (v as { kind: string }).kind;
      if (["week", "nextMonth", "month", "custom"].includes(kind)) out[k] = v;
    }
  }
  return out as Partial<Settings>;
}
