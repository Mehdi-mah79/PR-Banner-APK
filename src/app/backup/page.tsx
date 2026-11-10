"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Share2, ShieldCheck } from "lucide-react";
import { ConfirmDialog, ErrorBox, Help, PageHeader, Spinner } from "@/components/ui";
import { useSettings, useToast } from "@/components/Providers";
import { ApiError, api, errMsg, exportBackupFile, getSafetyBackupBytes, useFetch } from "@/lib/client";
import { fa, faNum, formatBytes, formatDateTime } from "@/lib/format";

type Format = "zip" | "json" | "csv";
const FORMATS: { v: Format; title: string; desc: string; restorable: boolean; mime: string; ext: string }[] = [
  { v: "zip", title: "پشتیبان کامل (ZIP)", desc: "همهٔ بنرها، دسته‌ها، برچسب‌ها، مناسبت‌ها، یادآورها، تنظیمات و تصاویر اصلی همراه با فایل manifest و checksum از نوع SHA-256. تنها قالب کاملاً قابل بازیابی.", restorable: true, mime: "application/zip", ext: ".zip" },
  { v: "json", title: "خروجی ساختاریافته (JSON)", desc: "همهٔ رکوردها و ارتباط‌ها برای انتقال به برنامه‌های دیگر. تصاویر اصلی در این قالب نیستند؛ این یک پشتیبان کامل نیست.", restorable: true, mime: "application/json", ext: ".json" },
  { v: "csv", title: "خروجی صفحه‌گسترده (CSV)", desc: "فهرست بنرها با کدگذاری UTF-8 برای Excel یا Google Sheets. فقط برای مشاهده و گزارش است و قابل بازیابی نیست.", restorable: false, mime: "text/csv", ext: ".csv" },
];

interface ExportResult {
  filename: string;
  destination: string;
  size: number;
  sha256: string;
  verified: boolean;
  blob: Blob;
  mime: string;
}
interface Inspect {
  info: {
    format: "zip" | "json";
    schemaVersion: number;
    appVersion: string;
    createdAt: string | null;
    counts: { banners: number; categories: number; tags: number; reminders: number; images: number };
    checksumsVerified: boolean;
    missingImages: string[];
    corruptImages: string[];
    warnings: string[];
    duplicates: number;
    willAdd: number;
    currentCounts: { banners: number };
  };
  filename: string;
}
interface Report {
  mode: string;
  addedBanners: number;
  skippedDuplicates: number;
  addedReminders: number;
  addedImages: number;
  safetyBackup: string | null;
  integrityIssues: number;
}
interface LogRow {
  id: number;
  kind: string;
  format: string;
  filename: string;
  size: number;
  note: string;
  createdAt: string;
  hasData: boolean;
}

export default function BackupPage() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const log = useFetch<LogRow[]>("/api/backup/log");
  const [format, setFormat] = useState<Format | null>(null);
  const fmt = format ?? settings.backupFormat;
  const [busy, setBusy] = useState(false);
  const [exp, setExp] = useState<ExportResult | null>(null);
  const [expError, setExpError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [insp, setInsp] = useState<Inspect | null>(null);
  const [inspErr, setInspErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);

  async function doExport() {
    setBusy(true);
    setExp(null);
    setExpError(null);
    try {
      const built = await exportBackupFile(fmt);
      const ab = new ArrayBuffer(built.bytes.byteLength);
      new Uint8Array(ab).set(built.bytes);
      const blob = new Blob([ab], { type: built.mime });
      const filename = built.filename;
      const serverHash = built.sha256;

      const meta = FORMATS.find((f) => f.v === fmt)!;
      let destination = "";
      let verified = false;
      const w = window as unknown as {
        showSaveFilePicker?: (o: unknown) => Promise<{ name: string; createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>; getFile: () => Promise<File> }>;
      };
      if (w.showSaveFilePicker) {
        try {
          const handle = await w.showSaveFilePicker({ suggestedName: filename, types: [{ description: meta.title, accept: { [meta.mime]: [meta.ext] } }] });
          const ws = await handle.createWritable();
          await ws.write(blob);
          await ws.close();
          const written = await handle.getFile();
          if (written.size !== blob.size) throw new Error("اندازهٔ فایل ذخیره‌شده با فایل ساخته‌شده یکسان نیست.");
          destination = `مکان انتخاب‌شده توسط شما — ${handle.name}`;
          verified = true;
        } catch (e) {
          if ((e as Error).name === "AbortError") {
            toast("ذخیره لغو شد.", "info");
            return;
          }
          throw e;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        destination = "پوشهٔ دانلودهای دستگاه (Downloads)";
        verified = true;
      }
      await api("/api/backup/log", { method: "POST", json: { format: fmt, filename, size: blob.size, sha256: serverHash, destination } });
      setExp({ filename, destination, size: blob.size, sha256: serverHash, verified, blob, mime: meta.mime });
      log.reload();
      toast("پشتیبان ساخته و ذخیره شد.");
    } catch (e) {
      setExpError(errMsg(e));
      toast("پشتیبان‌گیری ناموفق بود.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!exp) return;
    const f = new File([exp.blob], exp.filename, { type: exp.mime });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: exp.filename });
      else toast("اشتراک‌گذاری مستقیم فایل پشتیبانی نمی‌شود؛ از دکمهٔ دانلود دوباره استفاده کنید.", "info");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("اشتراک‌گذاری ناموفق بود.", "error");
    }
  }

  function redownload() {
    if (!exp) return;
    const url = URL.createObjectURL(exp.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exp.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function downloadSafety(id: number) {
    const res = await getSafetyBackupBytes(id);
    if (!res) return toast("فایل پشتیبان ایمنی یافت نشد.", "error");
    const ab = new ArrayBuffer(res.bytes.byteLength);
    new Uint8Array(ab).set(res.bytes);
    const blob = new Blob([ab], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function pick(f: File | undefined) {
    setFile(f ?? null);
    setInsp(null);
    setInspErr(null);
    setReport(null);
    setRestoreErr(null);
    setConfirmReplace(false);
    if (!f) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("step", "inspect");
      setInsp(await api<Inspect>("/api/restore", { method: "POST", body: form }));
    } catch (e) {
      setInspErr(e instanceof ApiError ? e.message : errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!file) return;
    setRestoring(true);
    setRestoreErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("step", "apply");
      form.append("mode", mode);
      form.append("confirm", "yes");
      const r = await api<Report>("/api/restore", { method: "POST", body: form });
      setReport(r);
      setInsp(null);
      setFile(null);
      log.reload();
      toast("بازیابی انجام و صحت آن بررسی شد.");
    } catch (e) {
      setRestoreErr(errMsg(e));
      toast("بازیابی ناموفق بود؛ داده‌های فعلی تغییر نکرده‌اند.", "error");
    } finally {
      setRestoring(false);
      setConfirmReplace(false);
    }
  }

  const lastExport = log.data?.find((l) => l.kind === "export");
  const safety = log.data?.filter((l) => l.hasData) ?? [];

  return (
    <>
      <PageHeader title="پشتیبان‌گیری و بازیابی" subtitle="دادهٔ شما به‌صورت آفلاین روی دستگاه نگه‌داری می‌شود؛ برای ایمنی، فایل پشتیبان را ذخیره کنید." />

      <section className="card mb-5 space-y-4">
        <h2 className="font-bold text-gold">ساخت پشتیبان / خروجی</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FORMATS.map((f) => (
            <label key={f.v} className={`cursor-pointer rounded-xl border p-3 text-sm ${fmt === f.v ? "border-gold bg-surface2" : "border-line"}`}>
              <input type="radio" name="fmt" className="sr-only" checked={fmt === f.v} onChange={() => { setFormat(f.v); update({ backupFormat: f.v }); }} />
              <span className="mb-1 flex items-center gap-2 font-bold">
                {fmt === f.v && <CheckCircle2 size={16} className="text-gold" />}
                {f.title}
              </span>
              <span className="block text-xs leading-6 text-muted">{f.desc}</span>
              <span className={`chip mt-2 ${f.restorable ? "text-ok" : "text-warn"}`}>{f.v === "zip" ? "قابل بازیابی کامل" : f.restorable ? "قابل بازیابی (بدون تصویر)" : "فقط خروجی"}</span>
            </label>
          ))}
        </div>
        <button className="btn btn-gold" onClick={doExport} disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} ساخت و ذخیرهٔ فایل
        </button>
        {expError && (
          <div className="flex items-center gap-2 text-sm text-danger" role="alert">
            <AlertTriangle size={16} /> {expError}
          </div>
        )}
        {exp && (
          <div className="space-y-1 rounded-xl border border-ok p-3 text-sm" role="status">
            <p className="flex items-center gap-2 font-bold text-ok">
              <ShieldCheck size={18} /> فایل پشتیبان با موفقیت آماده شد
            </p>
            <p>نام فایل: <span className="ltr">{exp.filename}</span></p>
            <p>مقصد: {exp.destination}</p>
            <p>حجم: {formatBytes(exp.size)}</p>
            <p className="break-all text-xs text-muted">SHA-256: <span className="ltr">{exp.sha256}</span></p>
            <div className="flex gap-2 pt-2">
              <button className="btn btn-sm" onClick={share}>
                <Share2 size={14} /> اشتراک‌گذاری
              </button>
              <button className="btn btn-sm" onClick={redownload}>
                <Download size={14} /> دانلود دوباره
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted">
          آخرین پشتیبان موفق: {log.loading ? "…" : lastExport ? `${formatDateTime(lastExport.createdAt)} — ${lastExport.filename}` : "هنوز پشتیبانی گرفته نشده است"}
        </p>
      </section>

      <section className="card mb-5 space-y-4">
        <h2 className="flex items-center gap-1 font-bold text-gold">
          بازیابی از فایل پشتیبان <Help text="فایل ZIP یا JSON برنامه را انتخاب کنید. ابتدا فقط بررسی و خلاصه نمایش داده می‌شود و تا تأیید شما هیچ داده‌ای تغییر نمی‌کند." />
        </h2>
        <label className="btn cursor-pointer">
          <FileUp size={18} /> انتخاب فایل پشتیبان
          <input type="file" accept=".zip,.json,application/zip,application/json" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {busy && !exp && <Spinner label="در حال بررسی فایل…" />}
        {inspErr && <ErrorBox message={inspErr} />}
        {insp && (
          <div className="space-y-3 rounded-xl border border-line p-3 text-sm">
            <p className="font-bold">خلاصهٔ پشتیبان: <span className="ltr">{insp.filename}</span></p>
            <ul className="grid grid-cols-2 gap-1 md:grid-cols-3">
              <li>قالب: {insp.info.format === "zip" ? "ZIP کامل" : "JSON"}</li>
              <li>نسخهٔ ساختار: {fa(insp.info.schemaVersion)}</li>
              <li>نسخهٔ برنامه: <span className="ltr">{insp.info.appVersion || "—"}</span></li>
              <li>تاریخ ساخت: {insp.info.createdAt ? formatDateTime(insp.info.createdAt) : "—"}</li>
              <li>بنر: {faNum(insp.info.counts.banners)}</li>
              <li>دسته: {faNum(insp.info.counts.categories)}</li>
              <li>برچسب: {faNum(insp.info.counts.tags)}</li>
              <li>یادآور: {faNum(insp.info.counts.reminders)}</li>
              <li>تصویر: {faNum(insp.info.counts.images)}</li>
              <li>صحت checksum: {insp.info.checksumsVerified ? "✓ تأیید شد" : "— (در JSON وجود ندارد)"}</li>
            </ul>
            {insp.info.warnings.map((w) => (
              <p key={w} className="text-warn">⚠ {w}</p>
            ))}
            <div className="space-y-2 border-t border-line pt-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
                <span>
                  <b>ادغام (Merge)</b> — {faNum(insp.info.willAdd)} بنر جدید افزوده می‌شود و {faNum(insp.info.duplicates)} بنر تکراری نادیده گرفته می‌شود.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <span>
                  <b className="text-danger">جایگزینی (Replace)</b> — همهٔ {faNum(insp.info.currentCounts.banners)} بنر فعلی با {faNum(insp.info.counts.banners)} بنر پشتیبان جایگزین می‌شود.
                </span>
              </label>
            </div>
            <button className={`btn ${mode === "replace" ? "btn-danger" : "btn-gold"}`} disabled={restoring} onClick={() => setConfirmReplace(true)}>
              {restoring && <Loader2 size={16} className="animate-spin" />} {mode === "replace" ? "جایگزینی داده‌ها…" : "ادغام داده‌ها…"}
            </button>
          </div>
        )}
        {restoreErr && <ErrorBox message={restoreErr} />}
        {report && (
          <div className="space-y-1 rounded-xl border border-ok p-3 text-sm" role="status">
            <p className="flex items-center gap-2 font-bold text-ok">
              <CheckCircle2 size={18} /> بازیابی انجام شد
            </p>
            <p>بنر افزوده‌شده: {faNum(report.addedBanners)} · تکراری نادیده‌گرفته‌شده: {faNum(report.skippedDuplicates)}</p>
            <p>یادآور: {faNum(report.addedReminders)} · تصویر جدید: {faNum(report.addedImages)}</p>
          </div>
        )}
      </section>

      {safety.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold text-gold">پشتیبان‌های ایمنی خودکار</h2>
          <ul className="divide-y divide-line text-sm">
            {safety.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="ltr">{s.filename}</span> · {formatBytes(s.size)} · {formatDateTime(s.createdAt)}
                </span>
                <button className="btn btn-sm" onClick={() => downloadSafety(s.id)}>
                  <Download size={14} /> دانلود
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={confirmReplace}
        title={mode === "replace" ? "تأیید جایگزینی کامل داده‌ها" : "تأیید ادغام داده‌ها"}
        message={
          mode === "replace" ? (
            <>همهٔ بنرها، دسته‌ها، برچسب‌ها، یادآورها و تصاویر فعلی با محتوای فایل جایگزین می‌شوند. ادامه می‌دهید؟</>
          ) : (
            <>بنرهای جدید فایل به داده‌های فعلی افزوده می‌شوند. ادامه می‌دهید؟</>
          )
        }
        confirmLabel={mode === "replace" ? "بله، جایگزین کن" : "بله، ادغام کن"}
        danger={mode === "replace"}
        busy={restoring}
        onConfirm={restore}
        onCancel={() => setConfirmReplace(false)}
      />
    </>
  );
}
