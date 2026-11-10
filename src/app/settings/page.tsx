"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, DatabaseBackup, HardDrive, Info, Palette, CalendarDays, Wrench } from "lucide-react";
import { ConfirmDialog, ErrorBox, PageHeader, Spinner, Toggle } from "@/components/ui";
import { useSettings, useToast } from "@/components/Providers";
import { api, errMsg, useFetch } from "@/lib/client";
import { APP_NAME, APP_VERSION, APP_VERSION_CODE, SCHEMA_VERSION } from "@/lib/appinfo";
import { fa, formatBytes, formatDateTime, formatJalali } from "@/lib/format";
import { getPermission, requestPermission, showNotification, type Perm } from "@/lib/notify";
import { todayIso } from "@/lib/calendar";
import type { Settings } from "@/lib/settings";

interface Integrity {
  integrity: { checkedAt: string; ok: boolean; orphanBytes: number; issues: { code: string; severity: string; message: string; count: number; fixable: boolean }[] };
  storage: {
    databaseBytes: number;
    imageCount: number;
    imageBytes: number;
    thumbBytes: number;
    banners: number;
    trashed: number;
    safetyBackups: number;
    safetyBytes: number;
    lastBackup: { filename: string; format: string; size: number; at: string } | null;
    lastFullBackup: { filename: string; at: string } | null;
  };
}

const PERM_LABEL: Record<Perm, string> = { granted: "مجاز", denied: "رد شده", default: "هنوز پرسیده نشده", unsupported: "پشتیبانی نمی‌شود" };

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 font-bold text-gold">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs leading-6 text-muted">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={`chip !px-3 !py-1.5 ${value === v ? "chip-on !bg-surface" : ""}`} onClick={() => onChange(v)}>
          {value === v ? "✓ " : ""}
          {l}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { settings: s, update } = useSettings();
  const toast = useToast();
  const info = useFetch<Integrity>("/api/integrity");
  const [perm, setPerm] = useState<Perm>("default");
  useEffect(() => setPerm(getPermission()), []);
  const [danger, setDanger] = useState<null | { action: string; title: string; msg: string }>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update({ [k]: v } as Partial<Settings>);

  async function runDanger() {
    if (!danger) return;
    setBusy(true);
    try {
      const r = await api<{ removed: number }>("/api/integrity", { method: "POST", json: { action: danger.action } });
      toast(`انجام شد (${fa(r.removed)} مورد).`);
      info.reload();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
      setDanger(null);
    }
  }

  async function fix() {
    try {
      const r = await api<{ removedOrphanImages: number; fixedReminders: number; removedDuplicateReminders: number }>("/api/integrity", { method: "POST", json: { action: "fix" } });
      toast(`اصلاح شد: ${fa(r.removedOrphanImages)} تصویر بی‌مصرف، ${fa(r.fixedReminders)} یادآور ناسازگار، ${fa(r.removedDuplicateReminders)} یادآور تکراری.`);
      info.reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  async function testNotification() {
    let p = getPermission();
    if (p === "default") p = await requestPermission();
    setPerm(p);
    if (p !== "granted") return toast("مجوز اعلان داده نشده است.", "error");
    const ok = await showNotification("آزمایش اعلان", "اعلان‌های برنامه به‌درستی کار می‌کنند.", "/settings", { sound: s.notifySound, vibrate: s.notifyVibrate, tag: "test" });
    toast(ok ? "اعلان آزمایشی ارسال شد." : "ارسال اعلان ناموفق بود.", ok ? "ok" : "error");
  }

  const st = info.data?.storage;
  const ig = info.data?.integrity;

  return (
    <>
      <PageHeader title="تنظیمات" subtitle="همهٔ تنظیمات بلافاصله ذخیره و اعمال می‌شوند." />
      <div className="space-y-5">
        <Group icon={<Palette size={18} />} title="ظاهر">
          <Row title="پوسته" desc="تیره (پیش‌فرض، مشکی و طلایی)، روشن یا هماهنگ با تنظیم دستگاه.">
            <Seg label="پوسته" value={s.theme} onChange={(v) => set("theme", v)} options={[["dark", "تیره"], ["light", "روشن"], ["system", "سیستم"]]} />
          </Row>
          <Row title="اندازهٔ متن" desc="اندازهٔ همهٔ نوشته‌ها و عناصر برنامه را بزرگ یا کوچک می‌کند.">
            <Seg label="اندازهٔ متن" value={s.fontSize} onChange={(v) => set("fontSize", v)} options={[["small", "کوچک"], ["medium", "متوسط"], ["large", "بزرگ"], ["xlarge", "خیلی بزرگ"]]} />
          </Row>
          <Row title="تراکم نمایش" desc="در حالت فشرده فاصله‌ها کمتر می‌شود و اطلاعات بیشتری در صفحه جا می‌گیرد.">
            <Seg label="تراکم" value={s.density} onChange={(v) => set("density", v)} options={[["comfortable", "راحت"], ["compact", "فشرده"]]} />
          </Row>
          <Row title="نمای بایگانی" desc="نمایش بنرها به‌صورت شبکه‌ای یا فهرستی.">
            <Seg label="نمای بایگانی" value={s.archiveView} onChange={(v) => set("archiveView", v)} options={[["grid", "شبکه‌ای"], ["list", "فهرستی"]]} />
          </Row>
        </Group>

        <Group icon={<CalendarDays size={18} />} title="تقویم و تاریخ">
          <Row title="تقویم" desc="تقویم شمسی (جلالی) تقویم پیش‌فرض و تنها تقویم برنامه است؛ تاریخ‌ها در پایگاه‌داده به‌صورت میلادی ISO ذخیره می‌شوند.">
            <span className="chip chip-on">شمسی</span>
          </Row>
          <Row title="اعداد فارسی" desc="نمایش اعداد در کل برنامه با ارقام فارسی (۱۲۳) یا لاتین (123).">
            <Toggle checked={s.persianDigits} onChange={(v) => set("persianDigits", v)} label="اعداد فارسی" />
          </Row>
          <Row title="قالب نمایش تاریخ" desc={`در فهرست مناسبت‌های داشبورد اعمال می‌شود. نمونه: ${formatJalali(todayIso(), s.dateStyle)}`}>
            <Seg label="قالب تاریخ" value={s.dateStyle} onChange={(v) => set("dateStyle", v)} options={[["long", "۱۴ فروردین ۱۴۰۵"], ["numeric", "۱۴۰۵/۰۱/۱۴"], ["weekday", "با نام روز"]]} />
          </Row>
        </Group>

        <Group icon={<Bell size={18} />} title="اعلان‌ها و یادآورها">
          <Row title="فعال بودن اعلان‌ها" desc="خاموش کردن، اعلان‌ها را متوقف می‌کند اما هیچ یادآوری حذف نمی‌شود؛ با روشن کردن دوباره، یادآورها ادامه می‌یابند.">
            <Toggle checked={s.notificationsEnabled} onChange={(v) => set("notificationsEnabled", v)} label="فعال بودن اعلان‌ها" />
          </Row>
          <Row title="صدای اعلان" desc="پخش یک صدای کوتاه هنگام رسیدن یادآور.">
            <Toggle checked={s.notifySound} onChange={(v) => set("notifySound", v)} label="صدای اعلان" />
          </Row>
          <Row title="لرزش" desc="لرزش دستگاه هنگام اعلان (در دستگاه‌هایی که پشتیبانی می‌کنند).">
            <Toggle checked={s.notifyVibrate} onChange={(v) => set("notifyVibrate", v)} label="لرزش" />
          </Row>
          <Row title="پیش‌فرض فاصلهٔ یادآور" desc="هنگام افزودن یادآور جدید در فرم بنر، چند روز قبل از مناسبت پیشنهاد شود.">
            <select className="input !w-auto" aria-label="روز قبل" value={s.defaultReminderOffsetDays} onChange={(e) => set("defaultReminderOffsetDays", Number(e.target.value))}>
              {[0, 1, 2, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "روز مناسبت" : `${fa(d)} روز قبل`}
                </option>
              ))}
            </select>
          </Row>
          <Row title="پیش‌فرض ساعت یادآور" desc="ساعت پیشنهادی برای یادآورهای جدید.">
            <input type="time" className="input !w-auto" aria-label="ساعت" value={s.defaultReminderTime} onChange={(e) => e.target.value && set("defaultReminderTime", e.target.value)} />
          </Row>
          <Row title="مدت تعویق" desc="با زدن «تعویق» در هشدار یادآور، اعلان پس از این مدت دوباره نمایش داده می‌شود.">
            <select className="input !w-auto" aria-label="دقیقه" value={s.snoozeMinutes} onChange={(e) => set("snoozeMinutes", Number(e.target.value))}>
              {[5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {fa(m)} دقیقه
                </option>
              ))}
            </select>
          </Row>
          <Row title="تکمیل خودکار پس از اعلان" desc="اگر روشن باشد، یادآورهای بدون تکرار پس از نمایش اعلان خودکار «انجام‌شده» می‌شوند؛ در غیر این صورت تا تأیید شما «معوق» می‌مانند.">
            <Toggle checked={s.autoCompleteAfterFire} onChange={(v) => set("autoCompleteAfterFire", v)} label="تکمیل خودکار" />
          </Row>
          <div className="rounded-xl border border-line p-3 text-sm">
            <p>
              وضعیت مجوز اعلان سیستمی: <b className={perm === "granted" ? "text-ok" : "text-warn"}>{PERM_LABEL[perm]}</b>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {perm === "default" && (
                <button className="btn btn-gold btn-sm" onClick={async () => setPerm(await requestPermission())}>
                  درخواست مجوز
                </button>
              )}
              <button className="btn btn-sm" onClick={testNotification}>
                ارسال اعلان آزمایشی
              </button>
            </div>
            {perm === "denied" && <p className="mt-2 text-xs text-warn">برای فعال‌سازی، به تنظیمات سایت در مرورگر (یا تنظیمات اعلان‌های دستگاه) بروید و اعلان را مجاز کنید.</p>}
            <p className="mt-2 text-xs leading-6 text-muted">
              در نسخهٔ اندروید، یادآورها از طریق ماژول اعلان بومی اندروید (@capacitor/local-notifications) زمان‌بندی می‌شوند تا حتی هنگام بسته بودن برنامه هشدار بدهند.
            </p>
          </div>
        </Group>

        <Group icon={<HardDrive size={18} />} title="پشتیبان‌گیری و ذخیره‌سازی">
          <Row title="قالب پیش‌فرض پشتیبان" desc="قالب انتخاب‌شده‌ی پیش‌فرض در صفحهٔ پشتیبان‌گیری.">
            <Seg label="قالب پشتیبان" value={s.backupFormat} onChange={(v) => set("backupFormat", v)} options={[["zip", "ZIP کامل"], ["json", "JSON"], ["csv", "CSV"]]} />
          </Row>
          <Row title="پشتیبان‌گیری و بازیابی" desc={st?.lastBackup ? `آخرین پشتیبان: ${formatDateTime(st.lastBackup.at)} — ${st.lastBackup.filename}` : "هنوز پشتیبانی گرفته نشده است."}>
            <Link href="/backup" className="btn btn-gold btn-sm">
              <DatabaseBackup size={15} /> باز کردن
            </Link>
          </Row>
          {info.loading ? (
            <Spinner />
          ) : info.error || !st || !ig ? (
            <ErrorBox message={info.error ?? "خطا"} onRetry={info.reload} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Mini k="حجم پایگاه‌داده" v={formatBytes(st.databaseBytes)} />
                <Mini k={`تصاویر (${fa(st.imageCount)})`} v={formatBytes(st.imageBytes)} />
                <Mini k="بندانگشتی‌ها" v={formatBytes(st.thumbBytes)} />
                <Mini k="پشتیبان‌های ایمنی" v={`${fa(st.safetyBackups)} · ${formatBytes(st.safetyBytes)}`} />
              </div>
              <div className="rounded-xl border border-line p-3 text-sm">
                <p className="mb-2 font-semibold">بررسی یکپارچگی داده ({formatDateTime(ig.checkedAt)})</p>
                {ig.issues.length === 0 ? (
                  <p className="text-ok">✓ مشکلی یافت نشد.</p>
                ) : (
                  <ul className="space-y-1">
                    {ig.issues.map((i) => (
                      <li key={i.code} className={i.severity === "error" ? "text-danger" : i.severity === "warning" ? "text-warn" : "text-muted"}>
                        {i.severity === "error" ? "✕" : i.severity === "warning" ? "⚠" : "ⓘ"} {i.message}: {fa(i.count)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-sm" onClick={info.reload}>
                    بررسی دوباره
                  </button>
                  {ig.issues.some((i) => i.fixable) && (
                    <button className="btn btn-gold btn-sm" onClick={fix}>
                      اصلاح خودکار موارد قابل‌اصلاح
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </Group>

        <Group icon={<Wrench size={18} />} title="مدیریت داده">
          <Row title="سطل بازیافت" desc={`بنرهای حذف‌شده را بازیابی یا برای همیشه پاک کنید. ${st ? `(${fa(st.trashed)} مورد)` : ""}`}>
            <Link href="/trash" className="btn btn-sm">
              مشاهده
            </Link>
          </Row>
          <Row title="خروجی اطلاعات" desc="دریافت JSON یا CSV از همهٔ اطلاعات در صفحهٔ پشتیبان‌گیری.">
            <Link href="/backup" className="btn btn-sm">
              خروجی گرفتن
            </Link>
          </Row>
          <Row title="پاک‌کردن تاریخچهٔ یادآورها" desc="فقط سابقهٔ رویدادها پاک می‌شود؛ خود یادآورها دست‌نخورده می‌مانند.">
            <button className="btn btn-danger btn-sm" onClick={() => setDanger({ action: "clearHistory", title: "پاک‌کردن تاریخچه", msg: "تاریخچهٔ همهٔ یادآورها برای همیشه پاک می‌شود. یادآورها حذف نمی‌شوند." })}>
              پاک‌کردن
            </button>
          </Row>
          <Row title="پاک‌کردن پشتیبان‌های ایمنی موقت" desc="فایل پشتیبان‌های ایمنیِ خودکار (پیش از جایگزینی) را برای آزاد شدن فضا پاک می‌کند.">
            <button className="btn btn-danger btn-sm" onClick={() => setDanger({ action: "clearSafety", title: "پاک‌کردن پشتیبان‌های ایمنی", msg: "پشتیبان‌های ایمنی خودکار حذف می‌شوند و دیگر امکان بازگشت به آن‌ها نیست." })}>
              پاک‌کردن
            </button>
          </Row>
          <Row title="خالی‌کردن سطل بازیافت" desc="همهٔ بنرهای حذف‌شده، یادآورها و تصاویر بدون استفادهٔ آن‌ها برای همیشه پاک می‌شوند.">
            <button className="btn btn-danger btn-sm" onClick={() => setDanger({ action: "emptyTrash", title: "خالی‌کردن سطل بازیافت", msg: "این کار قابل بازگشت نیست. ادامه می‌دهید؟" })}>
              خالی‌کردن
            </button>
          </Row>
        </Group>

        <Group icon={<Info size={18} />} title="دربارهٔ برنامه">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">نام</dt>
            <dd>{APP_NAME}</dd>
            <dt className="text-muted">نسخه</dt>
            <dd className="ltr text-right">{APP_VERSION}</dd>
            <dt className="text-muted">کد نسخه</dt>
            <dd>{fa(APP_VERSION_CODE)}</dd>
            <dt className="text-muted">نسخهٔ ساختار داده</dt>
            <dd>{fa(SCHEMA_VERSION)}</dd>
            <dt className="text-muted">نوع ساخت</dt>
            <dd>اندروید بومی (Capacitor + React + Vite + دیتابیس آفلاین IndexedDB و اعلان‌های بومی اندروید)</dd>
          </dl>
          <div className="rounded-xl border border-line p-3 text-xs leading-7 text-muted">
            <b className="text-fg">حریم خصوصی:</b> همهٔ اطلاعات و تصاویر فقط در پایگاه‌داده‌ای که برنامه به آن متصل است نگه‌داری می‌شوند. برنامه هیچ داده‌ای به سرویس‌های خارجی نمی‌فرستد و هیچ ردیاب یا تحلیل‌گری ندارد. تنها زمانی داده از برنامه خارج می‌شود که خودتان پشتیبان/خروجی بگیرید یا اشتراک بگذارید.
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">مجوزهای متن‌باز</summary>
            <ul className="mt-2 list-inside list-disc text-xs leading-7 text-muted">
              <li>Next.js، React، jalaali-js، lucide-react، Tailwind CSS — MIT / ISC</li>
              <li>Drizzle ORM — Apache-2.0</li>
              <li>node-postgres (pg) — MIT</li>
              <li>JSZip — MIT یا GPL-3.0 (انتخاب MIT)</li>
              <li>فونت Vazirmatn — SIL Open Font License 1.1</li>
            </ul>
          </details>
        </Group>
      </div>
      <ConfirmDialog open={!!danger} title={danger?.title ?? ""} message={danger?.msg} confirmLabel="تأیید و ادامه" danger busy={busy} onConfirm={runDanger} onCancel={() => setDanger(null)} />
    </>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <div className="text-xs text-muted">{k}</div>
      <div className="font-bold">{v}</div>
    </div>
  );
}
