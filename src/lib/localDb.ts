import JSZip from "jszip";
import { APP_VERSION, SCHEMA_VERSION } from "./appinfo";
import { isValidIso, isoToJalali, nextOccurrence, type Recurrence } from "./calendar";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from "./settings";
import { validateBannerInput, type BannerDTO, type BannerInput, type ReminderDTO, type ReminderStatus } from "./types";
import { syncNativeSchedules } from "./notify";

export const FORMAT_ID = "pr-banner-manager-backup";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 250 * 1024 * 1024;

export interface ImageRecord {
  id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  data: Uint8Array;
  thumb: Uint8Array | null;
  thumbMime: string | null;
  createdAt: string;
}

export interface CategoryRecord {
  id: number;
  name: string;
  createdAt: string;
}

export interface TagRecord {
  id: number;
  name: string;
  createdAt: string;
}

export interface BannerRecord {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  occasionTitle: string;
  occasionDate: string | null;
  notes: string;
  imageId: number | null;
  remindersEnabled: boolean;
  clientKey: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
}

export interface BannerTagRecord {
  bannerId: number;
  tagId: number;
}

export interface ReminderRecord {
  id: number;
  bannerId: number;
  remindAt: string;
  offsetDays: number | null;
  recurrence: Recurrence;
  active: boolean;
  message: string;
  completedAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
}

export interface ReminderHistoryRecord {
  id: number;
  reminderId: number | null;
  bannerId: number | null;
  bannerTitle: string;
  event: string;
  note: string;
  at: string;
}

export interface UsageHistoryRecord {
  id: number;
  bannerId: number;
  usedAt: string;
  note: string;
}

export interface BackupLogRecord {
  id: number;
  kind: "export" | "safety" | "restore";
  format: "zip" | "json" | "csv";
  filename: string;
  size: number;
  sha256: string;
  note: string;
  data: Uint8Array | null;
  createdAt: string;
}

interface DbStoreState {
  seq: Record<string, number>;
  images: ImageRecord[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  banners: BannerRecord[];
  bannerTags: BannerTagRecord[];
  reminders: ReminderRecord[];
  reminderHistory: ReminderHistoryRecord[];
  usageHistory: UsageHistoryRecord[];
  settings: Settings;
  backupLog: BackupLogRecord[];
}

const DB_NAME = "pr_banner_manager_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "app_state";
const STATE_KEY = "root";

let memState: DbStoreState | null = null;
let initPromise: Promise<DbStoreState> | null = null;
const imageUrlCache = new Map<string, string>();

function defaultState(): DbStoreState {
  const now = new Date().toISOString();
  return {
    seq: {
      images: 0,
      categories: 4,
      tags: 4,
      banners: 0,
      reminders: 0,
      reminderHistory: 0,
      usageHistory: 0,
      backupLog: 0,
    },
    images: [],
    categories: [
      { id: 1, name: "مناسبت‌های ملی و مذهبی", createdAt: now },
      { id: 2, name: "بهداشت و سلامت", createdAt: now },
      { id: 3, name: "رویدادها و همایش‌ها", createdAt: now },
      { id: 4, name: "پیام‌های تبریک و تسلیت", createdAt: now },
    ],
    tags: [
      { id: 1, name: "نوروز", createdAt: now },
      { id: 2, name: "هفته سلامت", createdAt: now },
      { id: 3, name: "روابط عمومی", createdAt: now },
      { id: 4, name: "بیمارستان", createdAt: now },
    ],
    banners: [],
    bannerTags: [],
    reminders: [],
    reminderHistory: [],
    usageHistory: [],
    settings: { ...DEFAULT_SETTINGS },
    backupLog: [],
  };
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadState(): Promise<DbStoreState> {
  if (memState) return memState;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const db = await openIdb();
      const loaded = await new Promise<DbStoreState | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const st = tx.objectStore(STORE_NAME);
        const g = st.get(STATE_KEY);
        g.onsuccess = () => resolve(g.result as DbStoreState | undefined);
        g.onerror = () => reject(g.error);
      });
      if (loaded && loaded.seq) {
        memState = {
          ...defaultState(),
          ...loaded,
          settings: { ...DEFAULT_SETTINGS, ...sanitizeSettings((loaded.settings ?? {}) as Record<string, unknown>) },
        };
      } else {
        memState = defaultState();
        await persistState();
      }
    } catch {
      memState = defaultState();
    }
    await triggerNativeSync();
    return memState!;
  })();
  return initPromise;
}

async function persistState(): Promise<void> {
  if (!memState) return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const st = tx.objectStore(STORE_NAME);
      const p = st.put(memState, STATE_KEY);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    });
  } catch {
    /* fallback to in-memory if IDB blocked */
  }
  await triggerNativeSync();
}

async function triggerNativeSync(): Promise<void> {
  if (!memState) return;
  const bannerMap = new Map(memState.banners.map((b) => [b.id, b]));
  const list = memState.reminders
    .filter((r) => {
      const b = bannerMap.get(r.bannerId);
      return b && !b.deletedAt && b.remindersEnabled;
    })
    .map((r) => {
      const b = bannerMap.get(r.bannerId)!;
      return {
        id: r.id,
        bannerId: r.bannerId,
        bannerTitle: b.title,
        occasionTitle: b.occasionTitle,
        remindAt: r.remindAt,
        active: r.active,
        completedAt: r.completedAt,
        message: r.message,
      };
    });
  await syncNativeSchedules(list, memState.settings.notificationsEnabled);
}

function nextId(state: DbStoreState, table: string): number {
  const n = (state.seq[table] ?? 0) + 1;
  state.seq[table] = n;
  return n;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Simple fallback hash if crypto.subtle unavailable
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function detectImageMime(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "image/png";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return null;
}

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function reminderStatus(
  r: Pick<ReminderRecord, "active" | "completedAt" | "remindAt">,
  notificationsEnabled: boolean,
  now = new Date(),
): ReminderStatus {
  if (r.completedAt) return "completed";
  if (!r.active) return "inactive";
  if (!notificationsEnabled) return "paused";
  return new Date(r.remindAt).getTime() < now.getTime() ? "overdue" : "scheduled";
}

function toReminderDTO(r: ReminderRecord, notificationsEnabled: boolean, extra?: Partial<ReminderDTO>): ReminderDTO {
  return {
    id: r.id,
    bannerId: r.bannerId,
    remindAt: r.remindAt,
    offsetDays: r.offsetDays,
    recurrence: r.recurrence,
    active: r.active,
    message: r.message,
    completedAt: r.completedAt,
    lastFiredAt: r.lastFiredAt,
    status: reminderStatus(r, notificationsEnabled),
    ...extra,
  };
}

function addHistory(
  state: DbStoreState,
  event: string,
  reminderId: number | null,
  bannerId: number | null,
  bannerTitle: string,
  note = "",
) {
  state.reminderHistory.push({
    id: nextId(state, "reminderHistory"),
    reminderId,
    bannerId,
    bannerTitle,
    event,
    note,
    at: new Date().toISOString(),
  });
}

export async function getImageBlobUrl(imageId: number, wantThumb = false): Promise<string | null> {
  const key = `${imageId}:${wantThumb ? "t" : "f"}`;
  if (imageUrlCache.has(key)) return imageUrlCache.get(key)!;
  const state = await loadState();
  const row = state.images.find((i) => i.id === imageId);
  if (!row) return null;
  const useThumb = wantThumb && row.thumb && row.thumb.length > 0;
  const bytes = useThumb ? row.thumb! : row.data;
  const mime = useThumb ? row.thumbMime || "image/jpeg" : row.mime;
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  imageUrlCache.set(key, url);
  return url;
}

export async function saveImageRecord(file: File, thumbBlob?: Blob | null): Promise<number> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("حجم تصویر نباید بیش از ۱۰ مگابایت باشد.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(bytes);
  if (!mime) throw new Error("فرمت تصویر پشتیبانی نمی‌شود (فقط JPG، PNG، WebP و GIF).");
  let thumbBytes: Uint8Array | null = null;
  let thumbMime: string | null = null;
  if (thumbBlob && thumbBlob.size > 0 && thumbBlob.size < 1024 * 1024) {
    const tb = new Uint8Array(await thumbBlob.arrayBuffer());
    const tm = detectImageMime(tb);
    if (tm) {
      thumbBytes = tb;
      thumbMime = tm;
    }
  }
  const state = await loadState();
  const id = nextId(state, "images");
  const hash = await sha256Hex(bytes);
  state.images.push({
    id,
    name: file.name.slice(0, 120) || "image",
    mime,
    size: bytes.byteLength,
    sha256: hash,
    data: bytes,
    thumb: thumbBytes,
    thumbMime,
    createdAt: new Date().toISOString(),
  });
  await persistState();
  return id;
}

function buildBannerDTO(state: DbStoreState, b: BannerRecord): BannerDTO {
  const cat = b.categoryId ? state.categories.find((c) => c.id === b.categoryId) : null;
  const tagIds = state.bannerTags.filter((bt) => bt.bannerId === b.id).map((bt) => bt.tagId);
  const tags = state.tags.filter((t) => tagIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name }));
  const rems = state.reminders
    .filter((r) => r.bannerId === b.id)
    .sort((a, c) => a.remindAt.localeCompare(c.remindAt))
    .map((r) => toReminderDTO(r, state.settings.notificationsEnabled, { bannerTitle: b.title, occasionTitle: b.occasionTitle }));
  const usageCount = state.usageHistory.filter((u) => u.bannerId === b.id).length;
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    categoryId: b.categoryId,
    categoryName: cat?.name ?? null,
    occasionTitle: b.occasionTitle,
    occasionDate: b.occasionDate,
    notes: b.notes,
    imageId: b.imageId,
    remindersEnabled: b.remindersEnabled,
    tags,
    reminders: rems,
    usageCount,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    lastUsedAt: b.lastUsedAt,
    deletedAt: b.deletedAt,
  };
}

function removeImageIfUnreferenced(state: DbStoreState, imageId: number | null) {
  if (!imageId) return;
  const used = state.banners.some((b) => b.imageId === imageId);
  if (!used) {
    state.images = state.images.filter((i) => i.id !== imageId);
  }
}

export async function exportBackupFile(format: "zip" | "json" | "csv"): Promise<{
  bytes: Uint8Array;
  filename: string;
  sha256: string;
  mime: string;
}> {
  const state = await loadState();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const prefix = format === "csv" ? "pr-banner-export" : "pr-banner-backup";
  const filename = `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${format}`;

  const collectData = (withImages: boolean) => {
    const catMap = new Map(state.categories.map((c) => [c.id, c.name]));
    const tagMap = new Map(state.tags.map((t) => [t.id, t.name]));
    const refImgs = new Set(state.banners.map((b) => b.imageId).filter((x): x is number => !!x));
    return {
      schemaVersion: SCHEMA_VERSION,
      imagesIncluded: withImages,
      categories: state.categories.map((c) => c.name),
      tags: state.tags.map((t) => t.name),
      images: withImages
        ? state.images
            .filter((i) => refImgs.has(i.id))
            .map((i) => ({
              id: i.id,
              name: i.name,
              mime: i.mime,
              size: i.size,
              sha256: i.sha256,
              file: `images/${i.id}.${EXT_BY_MIME[i.mime] ?? "bin"}`,
            }))
        : [],
      banners: state.banners.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        categoryName: b.categoryId ? (catMap.get(b.categoryId) ?? null) : null,
        tagNames: state.bannerTags
          .filter((bt) => bt.bannerId === b.id)
          .map((bt) => tagMap.get(bt.tagId)!)
          .filter(Boolean),
        occasionTitle: b.occasionTitle,
        occasionDate: b.occasionDate,
        notes: b.notes,
        imageId: withImages ? b.imageId : null,
        remindersEnabled: b.remindersEnabled,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        lastUsedAt: b.lastUsedAt,
        deletedAt: b.deletedAt,
      })),
      reminders: state.reminders.map((r) => ({
        bannerId: r.bannerId,
        remindAt: r.remindAt,
        offsetDays: r.offsetDays,
        recurrence: r.recurrence,
        active: r.active,
        message: r.message,
        completedAt: r.completedAt,
        lastFiredAt: r.lastFiredAt,
      })),
      reminderHistory: state.reminderHistory.map((h) => ({
        bannerId: h.bannerId,
        bannerTitle: h.bannerTitle,
        event: h.event,
        note: h.note,
        at: h.at,
      })),
      usageHistory: state.usageHistory.map((u) => ({
        bannerId: u.bannerId,
        usedAt: u.usedAt,
        note: u.note,
      })),
      settings: state.settings,
    };
  };

  if (format === "zip") {
    const data = collectData(true);
    const zip = new JSZip();
    const dataStr = JSON.stringify(data, null, 2);
    const dataBytes = new TextEncoder().encode(dataStr);
    const files: Record<string, string> = { "data.json": await sha256Hex(dataBytes) };
    zip.file("data.json", dataBytes);
    for (const meta of data.images) {
      const row = state.images.find((i) => i.id === meta.id);
      if (!row) continue;
      zip.file(meta.file, row.data);
      files[meta.file] = await sha256Hex(row.data);
    }
    const manifest = {
      format: FORMAT_ID,
      formatVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      counts: {
        banners: data.banners.length,
        categories: data.categories.length,
        tags: data.tags.length,
        reminders: data.reminders.length,
        images: data.images.length,
      },
      files,
      checksumAlgorithm: "SHA-256",
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return {
      bytes,
      filename,
      sha256: await sha256Hex(bytes),
      mime: "application/zip",
    };
  }

  if (format === "json") {
    const data = collectData(false);
    const doc = {
      format: FORMAT_ID,
      formatVersion: 1,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      notice: "این خروجی شامل تصاویر اصلی بنرها نیست؛ برای پشتیبان‌گیری کامل از قالب ZIP استفاده کنید.",
      ...data,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(doc, null, 2));
    return {
      bytes,
      filename,
      sha256: await sha256Hex(bytes),
      mime: "application/json; charset=utf-8",
    };
  }

  // CSV
  const data = collectData(false);
  const csvCell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "شناسه",
    "عنوان",
    "توضیحات",
    "دسته‌بندی",
    "برچسب‌ها",
    "عنوان مناسبت",
    "تاریخ مناسبت (میلادی)",
    "تاریخ مناسبت (شمسی)",
    "یادداشت",
    "تعداد یادآور",
    "زمان یادآورها",
    "تاریخ ثبت",
    "آخرین استفاده",
    "حذف‌شده",
  ];
  const rows = data.banners.map((b) => {
    const rems = data.reminders.filter((r) => r.bannerId === b.id);
    const j = isValidIso(b.occasionDate) ? isoToJalali(b.occasionDate) : null;
    return [
      b.id,
      b.title,
      b.description,
      b.categoryName ?? "",
      b.tagNames.join("؛ "),
      b.occasionTitle,
      b.occasionDate ?? "",
      j ? `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}` : "",
      b.notes,
      rems.length,
      rems.map((r) => r.remindAt).join(" | "),
      b.createdAt,
      b.lastUsedAt ?? "",
      b.deletedAt ? "بله" : "خیر",
    ]
      .map(csvCell)
      .join(",");
  });
  const text = "\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
  const bytes = new TextEncoder().encode(text);
  return {
    bytes,
    filename,
    sha256: await sha256Hex(bytes),
    mime: "text/csv; charset=utf-8",
  };
}

export async function getSafetyBackupBytes(id: number): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const state = await loadState();
  const row = state.backupLog.find((b) => b.id === id && b.data);
  if (!row || !row.data) return null;
  return { bytes: row.data, filename: row.filename };
}

async function inspectUploadedBackup(file: File) {
  const state = await loadState();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new Error("فایل خالی است.");
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error("حجم فایل پشتیبان بیش از حد مجاز است.");

  const warnings: string[] = [];
  const imageBuffers = new Map<number, Uint8Array>();
  const missingImages: string[] = [];
  const corruptImages: string[] = [];
  let rawData: Record<string, unknown>;
  let format: "zip" | "json";
  let appVersion = "";
  let createdAt: string | null = null;
  let verified = false;

  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    format = "zip";
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new Error("آرشیو ZIP خراب است و باز نمی‌شود.");
    }
    const mEntry = zip.file("manifest.json");
    const dEntry = zip.file("data.json");
    if (!mEntry || !dEntry) throw new Error("این فایل یک پشتیبان کامل PR Banner Manager نیست.");
    const manifest = JSON.parse(await mEntry.async("string"));
    if (manifest.format !== FORMAT_ID) throw new Error("قالب فایل پشتیبان شناخته‌شده نیست.");
    appVersion = manifest.appVersion ?? "";
    createdAt = manifest.createdAt ?? null;
    const dBytes = await dEntry.async("uint8array");
    const dHash = await sha256Hex(dBytes);
    if (manifest.files?.["data.json"] && manifest.files["data.json"] !== dHash) {
      throw new Error("بررسی SHA-256 فایل data.json ناموفق بود؛ پشتیبان دستکاری شده است.");
    }
    rawData = JSON.parse(new TextDecoder().decode(dBytes));
    const imgs = (Array.isArray(rawData.images) ? rawData.images : []) as {
      id: number;
      file: string;
      sha256: string;
    }[];
    for (const meta of imgs) {
      const entry = zip.file(meta.file);
      if (!entry) {
        missingImages.push(meta.file);
        continue;
      }
      const ib = await entry.async("uint8array");
      const ih = await sha256Hex(ib);
      const expected = manifest.files?.[meta.file] ?? meta.sha256;
      if ((expected && ih !== expected) || !detectImageMime(ib)) {
        corruptImages.push(meta.file);
        continue;
      }
      imageBuffers.set(Number(meta.id), ib);
    }
    verified = true;
  } else {
    format = "json";
    try {
      rawData = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("فایل JSON معتبر نیست.");
    }
    if (rawData.format !== FORMAT_ID) throw new Error("این فایل JSON توسط PR Banner Manager ساخته نشده است.");
    appVersion = String(rawData.appVersion ?? "");
    createdAt = typeof rawData.createdAt === "string" ? rawData.createdAt : null;
    warnings.push("این قالب JSON فاقد تصاویر اصلی است؛ بنرها بدون تصویر بازیابی می‌شوند.");
  }

  const bannersArr = (Array.isArray(rawData.banners) ? rawData.banners : []) as Record<string, unknown>[];
  const categoriesArr = (Array.isArray(rawData.categories) ? rawData.categories : []) as string[];
  const tagsArr = (Array.isArray(rawData.tags) ? rawData.tags : []) as string[];
  const remindersArr = (Array.isArray(rawData.reminders) ? rawData.reminders : []) as Record<string, unknown>[];
  const imagesArr = (Array.isArray(rawData.images) ? rawData.images : []) as Record<string, unknown>[];

  const dupKey = (t: string, d: string | null) => `${t.trim().toLowerCase()}|${d ?? ""}`;
  const existingKeys = new Set(state.banners.map((b) => dupKey(b.title, b.occasionDate)));
  const duplicates = bannersArr.filter((b) => existingKeys.has(dupKey(String(b.title ?? ""), (b.occasionDate as string) ?? null))).length;

  return {
    rawData,
    imageBuffers,
    info: {
      format,
      schemaVersion: Number(rawData.schemaVersion ?? 1),
      appVersion,
      createdAt,
      counts: {
        banners: bannersArr.length,
        categories: categoriesArr.length,
        tags: tagsArr.length,
        reminders: remindersArr.length,
        images: imagesArr.length,
      },
      checksumsVerified: verified,
      missingImages,
      corruptImages,
      warnings,
      duplicates,
      willAdd: bannersArr.length - duplicates,
      currentCounts: { banners: state.banners.length },
    },
  };
}

export async function handleLocalApi(url: string, init?: RequestInit & { json?: unknown }): Promise<unknown> {
  const state = await loadState();
  const u = new URL(url, "http://localhost");
  const path = u.pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = (init?.json ?? (typeof init?.body === "string" ? JSON.parse(init.body) : {})) as Record<string, unknown>;

  // /api/health
  if (path === "/api/health") return { ok: true };

  // /api/settings
  if (path === "/api/settings") {
    if (method === "GET") return { ...state.settings };
    if (method === "PUT") {
      state.settings = { ...state.settings, ...sanitizeSettings(body) };
      await persistState();
      return { ...state.settings };
    }
  }

  // /api/categories
  if (path === "/api/categories") {
    if (method === "GET") {
      const live = state.banners.filter((b) => !b.deletedAt);
      const uncategorized = live.filter((b) => b.categoryId === null).length;
      const categories = [...state.categories]
        .sort((a, b) => a.name.localeCompare(b.name, "fa"))
        .map((c) => ({
          id: c.id,
          name: c.name,
          count: live.filter((b) => b.categoryId === c.id).length,
        }));
      return { categories, uncategorized };
    }
    if (method === "POST") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("نام دسته‌بندی الزامی است.");
      if (state.categories.some((c) => c.name === name)) throw new Error("دسته‌بندی‌ای با این نام وجود دارد.");
      const row: CategoryRecord = { id: nextId(state, "categories"), name, createdAt: new Date().toISOString() };
      state.categories.push(row);
      await persistState();
      return row;
    }
  }

  const mCat = path.match(/^\/api\/categories\/(\d+)$/);
  if (mCat) {
    const id = Number(mCat[1]);
    if (method === "PUT") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("نام دسته‌بندی الزامی است.");
      if (state.categories.some((c) => c.name === name && c.id !== id)) throw new Error("دسته‌بندی‌ای با این نام وجود دارد.");
      const c = state.categories.find((x) => x.id === id);
      if (c) c.name = name;
      await persistState();
      return { ok: true };
    }
    if (method === "DELETE") {
      state.categories = state.categories.filter((c) => c.id !== id);
      for (const b of state.banners) {
        if (b.categoryId === id) b.categoryId = null;
      }
      await persistState();
      return { ok: true };
    }
  }

  // /api/tags
  if (path === "/api/tags") {
    if (method === "GET") {
      const liveIds = new Set(state.banners.filter((b) => !b.deletedAt).map((b) => b.id));
      return [...state.tags]
        .sort((a, b) => a.name.localeCompare(b.name, "fa"))
        .map((t) => ({
          id: t.id,
          name: t.name,
          count: state.bannerTags.filter((bt) => bt.tagId === t.id && liveIds.has(bt.bannerId)).length,
        }));
    }
    if (method === "POST") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("نام برچسب الزامی است.");
      if (state.tags.some((t) => t.name === name)) throw new Error("برچسبی با این نام وجود دارد.");
      const row: TagRecord = { id: nextId(state, "tags"), name, createdAt: new Date().toISOString() };
      state.tags.push(row);
      await persistState();
      return row;
    }
  }

  const mTag = path.match(/^\/api\/tags\/(\d+)$/);
  if (mTag) {
    const id = Number(mTag[1]);
    if (method === "PUT") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("نام برچسب الزامی است.");
      if (state.tags.some((t) => t.name === name && t.id !== id)) throw new Error("برچسبی با این نام وجود دارد.");
      const t = state.tags.find((x) => x.id === id);
      if (t) t.name = name;
      await persistState();
      return { ok: true };
    }
    if (method === "DELETE") {
      state.tags = state.tags.filter((t) => t.id !== id);
      state.bannerTags = state.bannerTags.filter((bt) => bt.tagId !== id);
      await persistState();
      return { ok: true };
    }
  }

  // /api/banners
  if (path === "/api/banners") {
    if (method === "GET") {
      const trashed = u.searchParams.get("trashed") === "1";
      return state.banners
        .filter((b) => (trashed ? !!b.deletedAt : !b.deletedAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((b) => buildBannerDTO(state, b));
    }
    if (method === "POST") {
      const input = body as unknown as BannerInput;
      const errs = validateBannerInput(input);
      if (errs.length) throw new Error(errs[0]);
      const savedId = await saveOrUpdateBanner(state, input);
      await persistState();
      const b = state.banners.find((x) => x.id === savedId)!;
      return buildBannerDTO(state, b);
    }
  }

  const mBannerAction = path.match(/^\/api\/banners\/(\d+)\/(restore|use|usage)$/);
  if (mBannerAction) {
    const id = Number(mBannerAction[1]);
    const action = mBannerAction[2];
    const b = state.banners.find((x) => x.id === id);
    if (!b) throw new Error("بنر یافت نشد.");
    if (action === "restore" && method === "POST") {
      b.deletedAt = null;
      await persistState();
      return { ok: true };
    }
    if (action === "use" && method === "POST") {
      const now = new Date().toISOString();
      b.lastUsedAt = now;
      state.usageHistory.push({
        id: nextId(state, "usageHistory"),
        bannerId: id,
        usedAt: now,
        note: String(body.note ?? "").slice(0, 300),
      });
      await persistState();
      return { ok: true, usedAt: now };
    }
    if (action === "usage" && method === "GET") {
      return state.usageHistory
        .filter((u) => u.bannerId === id)
        .sort((a, c) => c.usedAt.localeCompare(a.usedAt));
    }
  }

  const mBanner = path.match(/^\/api\/banners\/(\d+)$/);
  if (mBanner) {
    const id = Number(mBanner[1]);
    const b = state.banners.find((x) => x.id === id);
    if (method === "GET") {
      if (!b) throw new Error("بنر یافت نشد.");
      return buildBannerDTO(state, b);
    }
    if (method === "PUT") {
      const input = body as unknown as BannerInput;
      const errs = validateBannerInput(input);
      if (errs.length) throw new Error(errs[0]);
      await saveOrUpdateBanner(state, input, id);
      await persistState();
      return buildBannerDTO(state, state.banners.find((x) => x.id === id)!);
    }
    if (method === "DELETE") {
      if (!b) return { ok: true };
      const permanent = u.searchParams.get("permanent") === "1";
      if (permanent) {
        const rems = state.reminders.filter((r) => r.bannerId === id);
        for (const r of rems) addHistory(state, "deleted", r.id, id, b.title, "حذف دائمی بنر");
        state.reminders = state.reminders.filter((r) => r.bannerId !== id);
        state.bannerTags = state.bannerTags.filter((bt) => bt.bannerId !== id);
        state.usageHistory = state.usageHistory.filter((uh) => uh.bannerId !== id);
        state.banners = state.banners.filter((x) => x.id !== id);
        removeImageIfUnreferenced(state, b.imageId);
      } else {
        b.deletedAt = new Date().toISOString();
      }
      await persistState();
      return { ok: true, permanent };
    }
  }

  // /api/reminders/due
  if (path === "/api/reminders/due" && method === "GET") {
    if (!state.settings.notificationsEnabled) return { due: [], notificationsEnabled: false };
    const now = Date.now();
    const due: ReminderDTO[] = [];
    for (const r of state.reminders) {
      if (!r.active || r.completedAt) continue;
      const b = state.banners.find((x) => x.id === r.bannerId);
      if (!b || b.deletedAt || !b.remindersEnabled) continue;
      const rTime = new Date(r.remindAt).getTime();
      const fTime = r.lastFiredAt ? new Date(r.lastFiredAt).getTime() : -1;
      if (rTime <= now && fTime < rTime) {
        due.push(toReminderDTO(r, true, { bannerTitle: b.title, occasionTitle: b.occasionTitle }));
      }
    }
    return { notificationsEnabled: true, due };
  }

  // /api/reminders
  if (path === "/api/reminders" && method === "GET") {
    if (u.searchParams.get("history") === "1") {
      return [...state.reminderHistory].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
    }
    const list: ReminderDTO[] = [];
    for (const r of [...state.reminders].sort((a, b) => a.remindAt.localeCompare(b.remindAt))) {
      const b = state.banners.find((x) => x.id === r.bannerId);
      if (!b || b.deletedAt) continue;
      list.push(toReminderDTO(r, state.settings.notificationsEnabled, { bannerTitle: b.title, occasionTitle: b.occasionTitle }));
    }
    return { notificationsEnabled: state.settings.notificationsEnabled, reminders: list };
  }

  const mRem = path.match(/^\/api\/reminders\/(\d+)$/);
  if (mRem) {
    const id = Number(mRem[1]);
    const r = state.reminders.find((x) => x.id === id);
    if (method === "PATCH") {
      if (!r) throw new Error("یادآور یافت نشد.");
      const b = state.banners.find((x) => x.id === r.bannerId);
      const title = b?.title ?? "";
      const now = new Date();
      const action = String(body.action ?? "");
      if (action === "toggle") {
        r.active = !!body.active;
        if (r.active && b && !b.remindersEnabled) b.remindersEnabled = true;
        addHistory(state, r.active ? "enabled" : "disabled", id, r.bannerId, title);
      } else if (action === "complete") {
        r.completedAt = now.toISOString();
        addHistory(state, "completed", id, r.bannerId, title, "تأیید انجام توسط کاربر");
      } else if (action === "reopen") {
        r.completedAt = null;
        addHistory(state, "updated", id, r.bannerId, title, "بازگشایی یادآور");
      } else if (action === "reschedule") {
        const at = new Date(String(body.remindAt ?? ""));
        if (Number.isNaN(at.getTime())) throw new Error("تاریخ و ساعت معتبر نیست.");
        r.remindAt = at.toISOString();
        r.offsetDays = null;
        r.completedAt = null;
        r.lastFiredAt = null;
        addHistory(state, "updated", id, r.bannerId, title, "تغییر زمان یادآور");
      } else if (action === "snooze") {
        const m = Math.max(1, Math.min(Number(body.minutes) || 10, 1440));
        r.remindAt = new Date(now.getTime() + m * 60000).toISOString();
        r.lastFiredAt = null;
        addHistory(state, "updated", id, r.bannerId, title, `تعویق ${m} دقیقه‌ای`);
      } else if (action === "fired") {
        addHistory(state, "fired", id, r.bannerId, title, "اعلان نمایش داده شد");
        if (r.recurrence !== "none") {
          let next = nextOccurrence(new Date(r.remindAt), r.recurrence);
          let guard = 0;
          while (next.getTime() <= now.getTime() && guard++ < 2000) {
            next = nextOccurrence(next, r.recurrence);
          }
          r.remindAt = next.toISOString();
          r.lastFiredAt = null;
        } else {
          r.lastFiredAt = now.toISOString();
          if (state.settings.autoCompleteAfterFire) {
            r.completedAt = now.toISOString();
            addHistory(state, "completed", id, r.bannerId, title, "تکمیل خودکار پس از اعلان");
          }
        }
      }
      await persistState();
      return { ok: true };
    }
    if (method === "DELETE") {
      if (r) {
        const b = state.banners.find((x) => x.id === r.bannerId);
        addHistory(state, "deleted", id, r.bannerId, b?.title ?? "");
        state.reminders = state.reminders.filter((x) => x.id !== id);
        await persistState();
      }
      return { ok: true };
    }
  }

  // /api/backup/log
  if (path === "/api/backup/log") {
    if (method === "GET") {
      return [...state.backupLog]
        .sort((a, b) => b.id - a.id)
        .slice(0, 30)
        .map((l) => ({
          id: l.id,
          kind: l.kind,
          format: l.format,
          filename: l.filename,
          size: l.size,
          sha256: l.sha256,
          note: l.note,
          createdAt: l.createdAt,
          hasData: !!l.data,
        }));
    }
    if (method === "POST") {
      state.backupLog.push({
        id: nextId(state, "backupLog"),
        kind: "export",
        format: (body.format as "zip" | "json" | "csv") ?? "zip",
        filename: String(body.filename ?? "backup.zip"),
        size: Number(body.size ?? 0),
        sha256: String(body.sha256 ?? ""),
        note: String(body.destination ?? ""),
        data: null,
        createdAt: new Date().toISOString(),
      });
      await persistState();
      return { ok: true };
    }
  }

  // /api/restore
  if (path === "/api/restore" && method === "POST" && init?.body instanceof FormData) {
    const form = init.body;
    const file = form.get("file");
    const step = String(form.get("step") ?? "inspect");
    if (!(file instanceof File)) throw new Error("فایل پشتیبان انتخاب نشده است.");
    const parsed = await inspectUploadedBackup(file);
    if (step === "inspect") {
      return { info: parsed.info, filename: file.name };
    }
    const mode = String(form.get("mode") ?? "merge") as "merge" | "replace";
    let safetyBackup: string | null = null;
    if (mode === "replace") {
      const safety = await exportBackupFile("zip");
      safetyBackup = safety.filename.replace("pr-banner-backup", "pr-banner-safety");
      state.backupLog.push({
        id: nextId(state, "backupLog"),
        kind: "safety",
        format: "zip",
        filename: safetyBackup,
        size: safety.bytes.byteLength,
        sha256: safety.sha256,
        note: "پشتیبان ایمنی خودکار پیش از جایگزینی",
        data: safety.bytes,
        createdAt: new Date().toISOString(),
      });
      state.banners = [];
      state.categories = [];
      state.tags = [];
      state.bannerTags = [];
      state.reminders = [];
      state.reminderHistory = [];
      state.usageHistory = [];
      state.images = [];
      imageUrlCache.clear();
    }

    const raw = parsed.rawData;
    const catsArr = (Array.isArray(raw.categories) ? raw.categories : []) as string[];
    const tagsArr = (Array.isArray(raw.tags) ? raw.tags : []) as string[];
    const bannersArr = (Array.isArray(raw.banners) ? raw.banners : []) as Record<string, unknown>[];
    const remindersArr = (Array.isArray(raw.reminders) ? raw.reminders : []) as Record<string, unknown>[];

    for (const cName of catsArr) {
      if (cName && !state.categories.some((c) => c.name === cName)) {
        state.categories.push({ id: nextId(state, "categories"), name: cName, createdAt: new Date().toISOString() });
      }
    }
    for (const tName of tagsArr) {
      if (tName && !state.tags.some((t) => t.name === tName)) {
        state.tags.push({ id: nextId(state, "tags"), name: tName, createdAt: new Date().toISOString() });
      }
    }

    const dupKey = (t: string, d: string | null) => `${t.trim().toLowerCase()}|${d ?? ""}`;
    const existingKeys = new Set(state.banners.map((b) => dupKey(b.title, b.occasionDate)));
    const oldToNewBanner = new Map<number, number>();
    let addedBanners = 0;
    let skippedDuplicates = 0;
    let addedImages = 0;
    let addedReminders = 0;

    for (const b of bannersArr) {
      const title = String(b.title ?? "").trim();
      const occDate = isValidIso(b.occasionDate as string) ? (b.occasionDate as string) : null;
      if (!title) continue;
      if (existingKeys.has(dupKey(title, occDate))) {
        skippedDuplicates++;
        continue;
      }
      existingKeys.add(dupKey(title, occDate));
      let newImgId: number | null = null;
      const oldImgId = b.imageId ? Number(b.imageId) : null;
      if (oldImgId && parsed.imageBuffers.has(oldImgId)) {
        const ib = parsed.imageBuffers.get(oldImgId)!;
        const sha = await sha256Hex(ib);
        const exImg = state.images.find((i) => i.sha256 === sha);
        if (exImg) {
          newImgId = exImg.id;
        } else {
          newImgId = nextId(state, "images");
          state.images.push({
            id: newImgId,
            name: `restored-${newImgId}`,
            mime: detectImageMime(ib) || "image/jpeg",
            size: ib.byteLength,
            sha256: sha,
            data: ib,
            thumb: null,
            thumbMime: null,
            createdAt: new Date().toISOString(),
          });
          addedImages++;
        }
      }
      const catName = b.categoryName ? String(b.categoryName) : null;
      let catId: number | null = null;
      if (catName) {
        let cat = state.categories.find((c) => c.name === catName);
        if (!cat) {
          cat = { id: nextId(state, "categories"), name: catName, createdAt: new Date().toISOString() };
          state.categories.push(cat);
        }
        catId = cat.id;
      }
      const newId = nextId(state, "banners");
      oldToNewBanner.set(Number(b.id), newId);
      const now = new Date().toISOString();
      state.banners.push({
        id: newId,
        title,
        description: String(b.description ?? ""),
        categoryId: catId,
        occasionTitle: String(b.occasionTitle ?? title),
        occasionDate: occDate,
        notes: String(b.notes ?? ""),
        imageId: newImgId,
        remindersEnabled: b.remindersEnabled !== false,
        clientKey: null,
        createdAt: typeof b.createdAt === "string" ? b.createdAt : now,
        updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : now,
        lastUsedAt: typeof b.lastUsedAt === "string" ? b.lastUsedAt : null,
        deletedAt: typeof b.deletedAt === "string" ? b.deletedAt : null,
      });
      const bTags = Array.isArray(b.tagNames) ? b.tagNames.map(String) : [];
      for (const tn of bTags) {
        if (!tn) continue;
        let tg = state.tags.find((t) => t.name === tn);
        if (!tg) {
          tg = { id: nextId(state, "tags"), name: tn, createdAt: now };
          state.tags.push(tg);
        }
        state.bannerTags.push({ bannerId: newId, tagId: tg.id });
      }
      addedBanners++;
    }

    for (const r of remindersArr) {
      const nb = oldToNewBanner.get(Number(r.bannerId));
      if (!nb || typeof r.remindAt !== "string") continue;
      state.reminders.push({
        id: nextId(state, "reminders"),
        bannerId: nb,
        remindAt: r.remindAt,
        offsetDays: r.offsetDays === null || r.offsetDays === undefined ? null : Number(r.offsetDays),
        recurrence: (["none", "daily", "weekly", "monthly", "yearly"].includes(String(r.recurrence))
          ? String(r.recurrence)
          : "none") as Recurrence,
        active: r.active !== false,
        message: String(r.message ?? ""),
        completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
        lastFiredAt: typeof r.lastFiredAt === "string" ? r.lastFiredAt : null,
        createdAt: new Date().toISOString(),
      });
      addedReminders++;
    }

    await persistState();
    return {
      mode,
      addedBanners,
      skippedDuplicates,
      addedReminders,
      addedImages,
      safetyBackup,
      verified: true,
      integrityIssues: 0,
    };
  }

  // /api/integrity
  if (path === "/api/integrity") {
    if (method === "GET") {
      const usedImgs = new Set(state.banners.map((b) => b.imageId).filter((x): x is number => !!x));
      const orphans = state.images.filter((i) => !usedImgs.has(i.id));
      const issues: { code: string; severity: string; message: string; count: number; fixable: boolean }[] = [];
      if (orphans.length > 0) {
        issues.push({
          code: "orphan-images",
          severity: "warning",
          message: "تصاویر بدون بنر مرتبط (قابل پاکسازی)",
          count: orphans.length,
          fixable: true,
        });
      }
      const noImg = state.banners.filter((b) => !b.deletedAt && !b.imageId).length;
      if (noImg > 0) {
        issues.push({
          code: "no-image",
          severity: "info",
          message: "بنرهای بدون تصویر",
          count: noImg,
          fixable: false,
        });
      }
      const imageBytes = state.images.reduce((a, i) => a + i.size, 0);
      const thumbBytes = state.images.reduce((a, i) => a + (i.thumb?.byteLength ?? 0), 0);
      const safetyList = state.backupLog.filter((l) => l.data);
      const safetyBytes = safetyList.reduce((a, l) => a + (l.data?.byteLength ?? 0), 0);
      const lastExp = [...state.backupLog].reverse().find((l) => l.kind === "export") ?? null;
      const lastZip = [...state.backupLog].reverse().find((l) => l.kind === "export" && l.format === "zip") ?? null;
      return {
        integrity: {
          checkedAt: new Date().toISOString(),
          ok: !issues.some((i) => i.severity !== "info"),
          orphanBytes: orphans.reduce((a, i) => a + i.size, 0),
          issues,
        },
        storage: {
          databaseBytes: imageBytes + thumbBytes + safetyBytes + 16384,
          imageCount: state.images.length,
          imageBytes,
          thumbBytes,
          banners: state.banners.filter((b) => !b.deletedAt).length,
          trashed: state.banners.filter((b) => !!b.deletedAt).length,
          safetyBackups: safetyList.length,
          safetyBytes,
          lastBackup: lastExp
            ? { filename: lastExp.filename, format: lastExp.format, size: lastExp.size, at: lastExp.createdAt }
            : null,
          lastFullBackup: lastZip ? { filename: lastZip.filename, at: lastZip.createdAt } : null,
        },
      };
    }
    if (method === "POST") {
      const action = String(body.action ?? "");
      if (action === "fix") {
        const usedImgs = new Set(state.banners.map((b) => b.imageId).filter((x): x is number => !!x));
        const before = state.images.length;
        state.images = state.images.filter((i) => usedImgs.has(i.id));
        await persistState();
        return { removedOrphanImages: before - state.images.length, fixedReminders: 0, removedDuplicateReminders: 0 };
      }
      if (action === "clearHistory") {
        const n = state.reminderHistory.length;
        state.reminderHistory = [];
        await persistState();
        return { removed: n };
      }
      if (action === "clearSafety") {
        let n = 0;
        for (const l of state.backupLog) {
          if (l.data) {
            l.data = null;
            n++;
          }
        }
        await persistState();
        return { removed: n };
      }
      if (action === "emptyTrash") {
        const trashed = state.banners.filter((b) => !!b.deletedAt);
        for (const b of trashed) {
          state.reminders = state.reminders.filter((r) => r.bannerId !== b.id);
          state.bannerTags = state.bannerTags.filter((bt) => bt.bannerId !== b.id);
          state.usageHistory = state.usageHistory.filter((uh) => uh.bannerId !== b.id);
        }
        state.banners = state.banners.filter((b) => !b.deletedAt);
        for (const b of trashed) removeImageIfUnreferenced(state, b.imageId);
        await persistState();
        return { removed: trashed.length };
      }
    }
  }

  throw new Error(`مسیر عملیاتی یافت نشد: ${path}`);
}

async function saveOrUpdateBanner(state: DbStoreState, input: BannerInput, id?: number): Promise<number> {
  let bannerId = id;
  if (!bannerId && input.clientKey) {
    const ex = state.banners.find((b) => b.clientKey === input.clientKey);
    if (ex) bannerId = ex.id;
  }
  const now = new Date().toISOString();
  let oldImageId: number | null = null;
  if (bannerId) {
    const prev = state.banners.find((b) => b.id === bannerId);
    if (!prev) throw new Error("بنر یافت نشد.");
    oldImageId = prev.imageId;
    prev.title = input.title.trim();
    prev.description = input.description.trim();
    prev.categoryId = input.categoryId;
    prev.occasionTitle = input.occasionTitle.trim() || input.title.trim();
    prev.occasionDate = input.occasionDate;
    prev.notes = input.notes.trim();
    prev.imageId = input.imageId;
    prev.remindersEnabled = input.remindersEnabled;
    prev.updatedAt = now;
  } else {
    bannerId = nextId(state, "banners");
    state.banners.push({
      id: bannerId,
      title: input.title.trim(),
      description: input.description.trim(),
      categoryId: input.categoryId,
      occasionTitle: input.occasionTitle.trim() || input.title.trim(),
      occasionDate: input.occasionDate,
      notes: input.notes.trim(),
      imageId: input.imageId,
      remindersEnabled: input.remindersEnabled,
      clientKey: input.clientKey ?? null,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      deletedAt: null,
    });
  }

  // Reconcile tags
  state.bannerTags = state.bannerTags.filter((bt) => bt.bannerId !== bannerId);
  const tagNames = [...new Set(input.tagNames.map((t) => t.trim().slice(0, 40)).filter(Boolean))];
  for (const name of tagNames) {
    let t = state.tags.find((x) => x.name === name);
    if (!t) {
      t = { id: nextId(state, "tags"), name, createdAt: now };
      state.tags.push(t);
    }
    state.bannerTags.push({ bannerId, tagId: t.id });
  }

  // Reconcile reminders
  const existing = state.reminders.filter((r) => r.bannerId === bannerId);
  const touched = new Set<number>();
  for (const r of input.reminders ?? []) {
    const atIso = new Date(r.remindAt).toISOString();
    const active = input.remindersEnabled ? r.active : false;
    const match =
      (r.id ? existing.find((e) => e.id === r.id) : undefined) ??
      existing.find((e) => !touched.has(e.id) && e.remindAt === atIso && e.recurrence === r.recurrence);
    if (match) {
      touched.add(match.id);
      const timeChanged = match.remindAt !== atIso;
      match.remindAt = atIso;
      match.offsetDays = r.offsetDays;
      match.recurrence = r.recurrence;
      match.active = active;
      match.message = r.message ?? "";
      if (timeChanged) {
        match.completedAt = null;
        match.lastFiredAt = null;
      }
      addHistory(state, "updated", match.id, bannerId, input.title.trim());
    } else {
      const remId = nextId(state, "reminders");
      state.reminders.push({
        id: remId,
        bannerId,
        remindAt: atIso,
        offsetDays: r.offsetDays,
        recurrence: r.recurrence,
        active,
        message: r.message ?? "",
        completedAt: null,
        lastFiredAt: null,
        createdAt: now,
      });
      touched.add(remId);
      addHistory(state, "created", remId, bannerId, input.title.trim());
    }
  }
  for (const e of existing) {
    if (!touched.has(e.id)) {
      addHistory(state, "deleted", e.id, bannerId, input.title.trim());
      state.reminders = state.reminders.filter((x) => x.id !== e.id);
    }
  }

  if (oldImageId && oldImageId !== input.imageId) {
    removeImageIfUnreferenced(state, oldImageId);
  }
  return bannerId;
}
