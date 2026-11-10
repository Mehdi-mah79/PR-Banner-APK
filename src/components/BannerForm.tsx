"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellPlus, CheckCircle2, ImagePlus, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { ApiError, api, errMsg, newKey, uploadImage } from "@/lib/client";
import { dateToIso, reminderFromOffset, localDateTime, type Recurrence } from "@/lib/calendar";
import { fa, formatDateTime, formatJalali } from "@/lib/format";
import { getPermission, requestPermission, type Perm } from "@/lib/notify";
import type { BannerDTO, BannerInput, ReminderInput } from "@/lib/types";
import { validateBannerInput } from "@/lib/types";
import { JalaliDatePicker } from "./JalaliDatePicker";
import { useSettings, useToast } from "./Providers";
import { BannerThumb, Field, Help, Spinner, Toggle } from "./ui";

interface Draft {
  key: string;
  id?: number;
  mode: "offset" | "custom";
  offsetDays: number;
  date: string | null;
  time: string;
  recurrence: Recurrence;
  active: boolean;
  message: string;
  editing: boolean;
}

const OFFSETS = [0, 1, 2, 3, 7, 14, 30];
const RECURRENCE: { v: Recurrence; label: string }[] = [
  { v: "none", label: "بدون تکرار" },
  { v: "daily", label: "هر روز" },
  { v: "weekly", label: "هر هفته" },
  { v: "monthly", label: "هر ماه شمسی" },
  { v: "yearly", label: "هر سال شمسی" },
];

function resolve(d: Draft, occasionDate: string | null): Date | null {
  if (!/^\d{2}:\d{2}$/.test(d.time)) return null;
  if (d.mode === "offset") return occasionDate ? reminderFromOffset(occasionDate, d.offsetDays, d.time) : null;
  return d.date ? localDateTime(d.date, d.time) : null;
}

function describe(d: Draft, occasionDate: string | null): string {
  const at = resolve(d, occasionDate);
  const when = at ? formatDateTime(at) : "زمان نامشخص";
  const rel = d.mode === "offset" ? (d.offsetDays === 0 ? "در روز مناسبت" : `${fa(d.offsetDays)} روز قبل از مناسبت`) : "تاریخ دلخواه";
  const rec = RECURRENCE.find((r) => r.v === d.recurrence)?.label ?? "";
  return `${rel} — ${when}${d.recurrence !== "none" ? ` — ${rec}` : ""}`;
}

export function BannerForm({ bannerId }: { bannerId?: number }) {
  const toast = useToast();
  const { settings, loaded } = useSettings();

  const [loading, setLoading] = useState(!!bannerId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | undefined>(bannerId);
  const clientKey = useRef(newKey());

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [occasionTitle, setOccasionTitle] = useState("");
  const [occasionDate, setOccasionDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [imageId, setImageId] = useState<number | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [allTags, setAllTags] = useState<{ id: number; name: string }[]>([]);
  const [newCat, setNewCat] = useState<string | null>(null);

  const [candidate, setCandidate] = useState<{ file: File; url: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ file: File; url: string; uploadedId?: number } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ banner: BannerDTO; perm: Perm } | null>(null);

  function applyBanner(b: BannerDTO) {
    setTitle(b.title);
    setDescription(b.description);
    setCategoryId(b.categoryId);
    setTagNames(b.tags.map((t) => t.name));
    setOccasionTitle(b.occasionTitle);
    setOccasionDate(b.occasionDate);
    setNotes(b.notes);
    setImageId(b.imageId);
    setRemindersEnabled(b.remindersEnabled);
    setDrafts(
      b.reminders.map((r) => {
        const d = new Date(r.remindAt);
        return {
          key: `r${r.id}`,
          id: r.id,
          mode: r.offsetDays !== null ? "offset" : "custom",
          offsetDays: r.offsetDays ?? 1,
          date: dateToIso(d),
          time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          recurrence: r.recurrence,
          active: r.active,
          message: r.message,
          editing: false,
        };
      }),
    );
  }

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>("/api/categories").then((r) => setCats(r.categories)).catch(() => {});
    api<{ id: number; name: string }[]>("/api/tags").then(setAllTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bannerId) return;
    api<BannerDTO>(`/api/banners/${bannerId}`)
      .then(applyBanner)
      .catch((e) => setLoadError(errMsg(e)))
      .finally(() => setLoading(false));
  }, [bannerId]);

  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = !!(title || description || notes || drafts.length);
  }, [title, description, notes, drafts]);

  function addTag(raw: string) {
    const parts = raw.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setTagNames((t) => [...new Set([...t, ...parts.map((p) => p.slice(0, 40))])]);
    setTagInput("");
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
      toast("فقط تصاویر JPG، PNG، WebP و GIF پذیرفته می‌شود.", "error");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast("حجم تصویر نباید بیش از ۱۰ مگابایت باشد.", "error");
      return;
    }
    if (candidate) URL.revokeObjectURL(candidate.url);
    setCandidate({ file: f, url: URL.createObjectURL(f) });
  }

  function addReminder() {
    setRemindersEnabled(true);
    setDrafts((d) => [
      ...d,
      {
        key: newKey(),
        mode: "offset",
        offsetDays: settings.defaultReminderOffsetDays,
        date: occasionDate,
        time: settings.defaultReminderTime,
        recurrence: "none",
        active: true,
        message: "",
        editing: true,
      },
    ]);
  }
  const patchDraft = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const pastCount = useMemo(
    () => drafts.filter((d) => d.active && (resolve(d, occasionDate)?.getTime() ?? Infinity) < Date.now()).length,
    [drafts, occasionDate],
  );

  async function save() {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "عنوان بنر الزامی است.";
    if (!occasionDate) errs.occasionDate = "تاریخ مناسبت را انتخاب کنید.";
    if (remindersEnabled) {
      drafts.forEach((d) => {
        if (d.mode === "custom" && !d.date) errs[d.key] = "تاریخ یادآور را انتخاب کنید.";
        else if (d.mode === "offset" && !occasionDate) errs[d.key] = "برای یادآور نسبی ابتدا تاریخ مناسبت را مشخص کنید.";
        else if (!/^\d{2}:\d{2}$/.test(d.time)) errs[d.key] = "ساعت یادآور معتبر نیست.";
      });
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast("لطفاً خطاهای فرم را برطرف کنید.", "error");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setResult(null);
    try {
      let imgId = imageId;
      if (confirmed) {
        if (!confirmed.uploadedId) {
          const id = await uploadImage(confirmed.file);
          setConfirmed({ ...confirmed, uploadedId: id });
          imgId = id;
        } else imgId = confirmed.uploadedId;
      }
      const reminders: ReminderInput[] = [];
      for (const d of drafts) {
        const at = resolve(d, occasionDate);
        if (!at) continue;
        if (!remindersEnabled && !d.id) continue;
        reminders.push({
          id: d.id,
          remindAt: at.toISOString(),
          offsetDays: d.mode === "offset" ? d.offsetDays : null,
          recurrence: d.recurrence,
          active: d.active,
          message: d.message.trim(),
        });
      }
      const payload: BannerInput = {
        title,
        description,
        categoryId,
        tagNames,
        occasionTitle: occasionTitle.trim() || title,
        occasionDate,
        notes,
        imageId: imgId,
        remindersEnabled,
        reminders,
        clientKey: clientKey.current,
      };
      const v = validateBannerInput(payload);
      if (v.length) throw new Error(v[0]);
      const saved = savedId
        ? await api<BannerDTO>(`/api/banners/${savedId}`, { method: "PUT", json: payload })
        : await api<BannerDTO>("/api/banners", { method: "POST", json: payload });
      setSavedId(saved.id);
      setImageId(saved.imageId);
      setConfirmed(null);
      applyBanner(saved);
      setResult({ banner: saved, perm: getPermission() });
      dirtyRef.current = false;
      toast("بنر ذخیره شد.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : errMsg(e);
      setSaveError(`${msg} هیچ داده‌ای تکراری ثبت نمی‌شود؛ می‌توانید دوباره تلاش کنید.`);
      toast("ذخیره‌سازی ناموفق بود.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || loading) return <Spinner />;
  if (loadError) return <div className="card text-danger">{loadError}</div>;

  const previewUrl = confirmed?.url ?? null;
  const activeReminderCount = drafts.filter((d) => d.active).length;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      {result && <ResultPanel result={result} onPerm={(p) => setResult({ ...result, perm: p })} />}
      {saveError && (
        <div className="card flex flex-wrap items-center gap-3 border-danger text-sm text-danger" role="alert">
          <AlertTriangle size={18} /> {saveError}
          <button type="button" className="btn btn-sm" onClick={save} disabled={saving}>
            تلاش مجدد
          </button>
        </div>
      )}

      <section className="card space-y-4">
        <h2 className="font-bold text-gold">اطلاعات بنر</h2>
        <Field label="عنوان بنر" required error={errors.title}>
          <input className="input bidi" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تبریک نوروز ۱۴۰۵" />
        </Field>
        <Field label="توضیحات بنر">
          <textarea className="input bidi min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="دسته‌بندی" help="دسته‌بندی برای فیلتر کردن بایگانی استفاده می‌شود. بدون دسته هم می‌توانید ذخیره کنید.">
            <div className="flex gap-2">
              <select className="input" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">بدون دسته</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={() => setNewCat(newCat === null ? "" : null)} aria-label="دستهٔ جدید">
                +
              </button>
            </div>
            {newCat !== null && (
              <div className="mt-2 flex gap-2">
                <input className="input" value={newCat} placeholder="نام دستهٔ جدید" onChange={(e) => setNewCat(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={async () => {
                    try {
                      const c = await api<{ id: number; name: string }>("/api/categories", { method: "POST", json: { name: newCat } });
                      setCats((x) => [...x, c]);
                      setCategoryId(c.id);
                      setNewCat(null);
                    } catch (e) {
                      toast(errMsg(e), "error");
                    }
                  }}
                >
                  افزودن
                </button>
              </div>
            )}
          </Field>
          <Field label="برچسب‌ها" help="برچسب را بنویسید و Enter یا ویرگول بزنید. برچسب‌ها در جست‌وجو و فیلتر استفاده می‌شوند.">
            <input
              className="input bidi"
              list="tag-suggestions"
              value={tagInput}
              placeholder="افزودن برچسب…"
              onChange={(e) => (/[,،]/.test(e.target.value) ? addTag(e.target.value) : setTagInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => addTag(tagInput)}
            />
            <datalist id="tag-suggestions">
              {allTags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagNames.map((t) => (
                <span key={t} className="chip chip-on">
                  {t}
                  <button type="button" aria-label={`حذف برچسب ${t}`} onClick={() => setTagNames((x) => x.filter((y) => y !== t))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold text-gold">مناسبت</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="عنوان مناسبت" help="اگر خالی بماند، عنوان بنر به‌عنوان عنوان مناسبت ثبت می‌شود.">
            <input className="input bidi" value={occasionTitle} onChange={(e) => setOccasionTitle(e.target.value)} placeholder="در صورت تفاوت با عنوان بنر" />
          </Field>
          <Field label="تاریخ مناسبت" required error={errors.occasionDate}>
            <JalaliDatePicker value={occasionDate} onChange={setOccasionDate} invalid={!!errors.occasionDate} ariaLabel="تاریخ مناسبت" />
          </Field>
        </div>
        <Field label="یادداشت‌های تکمیلی">
          <textarea className="input bidi min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gold">تصویر بنر</h2>
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-36 w-36 shrink-0 overflow-hidden rounded-xl border border-line">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="پیش‌نمایش بنر" className="h-full w-full object-cover" />
            ) : (
              <BannerThumb imageId={imageId} alt="تصویر فعلی بنر" className="h-full w-full" />
            )}
          </div>
          <div className="space-y-2">
            <label className="btn cursor-pointer">
              <ImagePlus size={18} /> انتخاب تصویر از دستگاه
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p className="text-xs text-muted">فرمت‌های JPG، PNG، WebP، GIF — حداکثر ۱۰ مگابایت. تصویر اصلی بدون کاهش کیفیت ذخیره می‌شود.</p>
            {confirmed && <p className="text-xs text-ok">✓ تصویر تأیید شد و هنگام ذخیره ثبت می‌شود: {confirmed.file.name}</p>}
          </div>
        </div>
        {candidate && (
          <div className="rounded-xl border border-gold p-3">
            <p className="mb-2 text-sm font-semibold">پیش‌نمایش تصویر انتخاب‌شده — آیا تأیید می‌کنید؟</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={candidate.url} alt="پیش‌نمایش" className="mb-3 max-h-64 w-auto rounded-lg" />
            <div className="flex gap-2">
              <button type="button" className="btn btn-gold btn-sm" onClick={() => { setConfirmed({ file: candidate.file, url: candidate.url }); setCandidate(null); }}>
                تأیید تصویر
              </button>
              <button type="button" className="btn btn-sm" onClick={() => { URL.revokeObjectURL(candidate.url); setCandidate(null); }}>
                انصراف
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4" aria-labelledby="rem-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rem-title" className="flex items-center gap-1 font-bold text-gold">
            یادآوری و تنظیمات اعلان
            <Help text="یادآورها همین‌جا و همراه با ثبت بنر ساخته می‌شوند؛ نیازی به ذخیرهٔ جداگانه یا رفتن به منوی دیگر نیست. می‌توانید چند یادآور برای یک مناسبت تعریف کنید." />
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span>فعال‌سازی یادآور برای این بنر</span>
            <Toggle checked={remindersEnabled} onChange={setRemindersEnabled} label="فعال‌سازی یادآور برای این بنر" />
          </div>
        </div>

        {!settings.notificationsEnabled && remindersEnabled && (
          <p className="rounded-lg border border-warn p-2 text-xs text-warn">اعلان‌ها در تنظیمات برنامه خاموش است؛ یادآورها ذخیره می‌شوند اما تا روشن شدن اعلان‌ها نمایش داده نمی‌شوند.</p>
        )}

        {!remindersEnabled ? (
          <p className="text-sm text-muted">
            یادآوری خاموش است و برای این بنر اعلانی ساخته نمی‌شود.
            {drafts.length > 0 && " یادآورهای موجود حذف نمی‌شوند، فقط غیرفعال می‌شوند."}
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {drafts.map((d) => (
                <li key={d.key} className="rounded-xl border border-line bg-surface2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-sm ${d.active ? "" : "text-muted line-through"}`}>{describe(d, occasionDate)}</p>
                    <div className="flex items-center gap-1">
                      <Toggle checked={d.active} onChange={(v) => patchDraft(d.key, { active: v })} label="فعال بودن این یادآور" />
                      <button type="button" className="btn btn-ghost btn-sm" aria-label="ویرایش یادآور" onClick={() => patchDraft(d.key, { editing: !d.editing })}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm text-danger" aria-label="حذف یادآور" onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {errors[d.key] && <p className="mt-1 text-xs text-danger" role="alert">{errors[d.key]}</p>}
                  {d.editing && (
                    <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                      <Field label="نوع زمان‌بندی">
                        <select className="input" value={d.mode} onChange={(e) => patchDraft(d.key, { mode: e.target.value as Draft["mode"] })}>
                          <option value="offset">نسبت به تاریخ مناسبت</option>
                          <option value="custom">تاریخ و ساعت دلخواه</option>
                        </select>
                      </Field>
                      {d.mode === "offset" ? (
                        <Field label="چند روز قبل از مناسبت" help="گزینه‌های آماده فقط میان‌بر هستند؛ برای زمان دقیق‌تر «تاریخ و ساعت دلخواه» را انتخاب کنید.">
                          <select className="input" value={d.offsetDays} onChange={(e) => patchDraft(d.key, { offsetDays: Number(e.target.value) })}>
                            {[...new Set([...OFFSETS, d.offsetDays])].sort((a, b) => a - b).map((o) => (
                              <option key={o} value={o}>
                                {o === 0 ? "در روز مناسبت" : `${fa(o)} روز قبل`}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label="تاریخ یادآور">
                          <JalaliDatePicker value={d.date} onChange={(iso) => patchDraft(d.key, { date: iso })} ariaLabel="تاریخ یادآور" invalid={!!errors[d.key]} />
                        </Field>
                      )}
                      <Field label="ساعت یادآور">
                        <input type="time" className="input" value={d.time} onChange={(e) => patchDraft(d.key, { time: e.target.value })} />
                      </Field>
                      <Field label="تکرار" help="یادآور تکرارشونده پس از هر اعلان خودکار به نوبت بعدی منتقل می‌شود.">
                        <select className="input" value={d.recurrence} onChange={(e) => patchDraft(d.key, { recurrence: e.target.value as Recurrence })}>
                          {RECURRENCE.map((r) => (
                            <option key={r.v} value={r.v}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="متن اعلان (اختیاری)">
                          <input className="input bidi" value={d.message} maxLength={300} onChange={(e) => patchDraft(d.key, { message: e.target.value })} placeholder="اگر خالی باشد از عنوان مناسبت استفاده می‌شود" />
                        </Field>
                      </div>
                      <div>
                        <button type="button" className="btn btn-sm" onClick={() => patchDraft(d.key, { editing: false })}>
                          <CheckCircle2 size={15} /> تأیید یادآور
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={addReminder}>
              <BellPlus size={18} /> افزودن یادآور
            </button>
            <div className="rounded-lg border border-line p-3 text-sm" aria-live="polite">
              <b>خلاصه:</b>{" "}
              {drafts.length === 0 ? "هنوز یادآوری تعریف نشده است؛ بنر بدون اعلان ذخیره می‌شود." : `${fa(drafts.length)} یادآور (${fa(activeReminderCount)} فعال)`}
              {pastCount > 0 && <p className="mt-1 text-xs text-warn">⚠ {fa(pastCount)} یادآور فعال در گذشته است و بلافاصله پس از ذخیره به‌صورت معوق نمایش داده می‌شود.</p>}
            </div>
          </>
        )}
      </section>

      <div className="sticky bottom-16 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 md:bottom-4">
        <button type="submit" className="btn btn-gold min-w-40" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? "در حال ذخیره…" : savedId ? "ذخیرهٔ تغییرات" : "ذخیرهٔ بنر و یادآورها"}
        </button>
        <Link href={savedId ? `/banners/${savedId}` : "/banners"} className="btn btn-ghost">
          {savedId ? "مشاهدهٔ بنر" : "انصراف"}
        </Link>
        {occasionDate && <span className="text-xs text-muted">مناسبت: {formatJalali(occasionDate, "weekday")}</span>}
      </div>
    </form>
  );
}

function ResultPanel({ result, onPerm }: { result: { banner: BannerDTO; perm: Perm }; onPerm: (p: Perm) => void }) {
  const { settings } = useSettings();
  const { banner, perm } = result;
  const activeN = banner.reminders.filter((r) => r.active).length;
  const needsPerm = activeN > 0 && perm !== "granted";
  return (
    <div className="card space-y-2 border-ok" role="status">
      <p className="flex items-center gap-2 font-bold text-ok">
        <CheckCircle2 size={18} /> بنر «{banner.title}» با {fa(banner.reminders.length)} یادآور ذخیره شد ({fa(activeN)} فعال).
      </p>
      {activeN > 0 && (
        <ul className="list-inside list-disc text-xs text-muted">
          {banner.reminders.map((r) => (
            <li key={r.id}>
              {formatDateTime(r.remindAt)} — {r.status === "overdue" ? "معوق" : r.status === "paused" ? "متوقف (اعلان‌ها خاموش)" : r.active ? "زمان‌بندی‌شده" : "غیرفعال"}
            </li>
          ))}
        </ul>
      )}
      {needsPerm && (
        <div className="rounded-lg border border-warn p-2 text-xs text-warn">
          {perm === "unsupported"
            ? "این مرورگر/دستگاه از اعلان سیستمی پشتیبانی نمی‌کند؛ یادآورها فقط به‌صورت هشدار درون‌برنامه‌ای و تا زمانی که برنامه باز است نمایش داده می‌شوند."
            : perm === "denied"
              ? "مجوز اعلان رد شده است. برای دریافت اعلان سیستمی، مجوز را از تنظیمات مرورگر/دستگاه فعال کنید."
              : "مجوز اعلان هنوز داده نشده است؛ بدون آن اعلان سیستمی نمایش داده نمی‌شود."}
          {perm === "default" && (
            <button type="button" className="btn btn-gold btn-sm mr-2" onClick={async () => onPerm(await requestPermission())}>
              فعال‌سازی اعلان
            </button>
          )}
        </div>
      )}
      {!settings.notificationsEnabled && activeN > 0 && <p className="text-xs text-warn">اعلان‌ها در تنظیمات برنامه خاموش است.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link className="btn btn-sm" href={`/banners/${banner.id}`}>مشاهدهٔ بنر</Link>
        <Link className="btn btn-sm" href="/banners">بایگانی</Link>
        <a className="btn btn-sm" href="/banners/new">ثبت بنر دیگر</a>
      </div>
    </div>
  );
}
