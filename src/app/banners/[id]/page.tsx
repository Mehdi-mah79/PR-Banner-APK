"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { History, Pencil, Trash2, Zap, Download } from "lucide-react";
import { ConfirmDialog, ErrorBox, Modal, PageHeader, Spinner, StatusBadge, BannerThumb } from "@/components/ui";
import { useToast } from "@/components/Providers";
import { api, errMsg, useFetch, useImageUrl } from "@/lib/client";
import { diffDaysIso, todayIso } from "@/lib/calendar";
import { fa, formatDateTime, formatJalali, relativeDays } from "@/lib/format";
import type { BannerDTO } from "@/lib/types";

const REC: Record<string, string> = { none: "بدون تکرار", daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه", yearly: "سالانه" };

export default function BannerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: b, error, loading, reload } = useFetch<BannerDTO>(`/api/banners/${id}`);
  const usage = useFetch<{ id: number; usedAt: string; note: string }[]>(`/api/banners/${id}/usage`);
  const fullImgUrl = useImageUrl(b?.imageId ?? null, false);
  const [zoom, setZoom] = useState(false);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (error || !b) return <ErrorBox message={error ?? "بنر یافت نشد."} onRetry={reload} />;

  async function markUsed() {
    try {
      await api(`/api/banners/${id}/use`, { method: "POST" });
      toast("استفاده از بنر ثبت شد.");
      reload();
      usage.reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/api/banners/${id}`, { method: "DELETE" });
      toast("بنر به سطل بازیافت منتقل شد.");
      router.push("/banners");
    } catch (e) {
      toast(errMsg(e), "error");
      setBusy(false);
    }
  }

  const diff = b.occasionDate ? diffDaysIso(todayIso(), b.occasionDate) : null;

  return (
    <>
      <PageHeader
        title={b.title}
        subtitle={b.deletedAt ? "این بنر در سطل بازیافت است." : undefined}
        actions={
          <>
            <button className="btn" onClick={markUsed} title="ثبت یک مورد استفاده و به‌روزرسانی تاریخ آخرین استفاده">
              <Zap size={16} /> ثبت استفاده
            </button>
            <Link className="btn btn-gold" href={`/banners/${b.id}/edit`}>
              <Pencil size={16} /> ویرایش
            </Link>
            {!b.deletedAt && (
              <button className="btn btn-danger" onClick={() => setDel(true)}>
                <Trash2 size={16} /> حذف
              </button>
            )}
          </>
        }
      />
      <div className="grid gap-5 md:grid-cols-[320px_1fr]">
        <div>
          <button className="block w-full overflow-hidden rounded-2xl border border-line" onClick={() => b.imageId && setZoom(true)} aria-label="مشاهدهٔ تصویر در اندازهٔ کامل">
            <BannerThumb imageId={b.imageId} alt={b.title} className="aspect-square w-full" />
          </button>
          {fullImgUrl && (
            <a className="btn btn-sm mt-2 w-full" href={fullImgUrl} download={`${b.title}.jpg`}>
              <Download size={15} /> دانلود تصویر اصلی
            </a>
          )}
        </div>
        <div className="space-y-4">
          <div className="card space-y-2 text-sm">
            <Row k="مناسبت" v={b.occasionTitle || "—"} />
            <Row k="تاریخ مناسبت" v={`${formatJalali(b.occasionDate, "weekday")}${diff !== null ? ` (${relativeDays(diff)})` : ""}`} />
            <Row k="دسته‌بندی" v={b.categoryName ?? "بدون دسته"} />
            <Row k="برچسب‌ها" v={b.tags.length ? b.tags.map((t) => t.name).join("، ") : "—"} />
            <Row k="توضیحات" v={b.description || "—"} />
            <Row k="یادداشت" v={b.notes || "—"} />
            <Row k="تاریخ ثبت" v={formatDateTime(b.createdAt)} />
            <Row k="آخرین استفاده" v={b.lastUsedAt ? formatDateTime(b.lastUsedAt) : "هرگز"} />
            <Row k="تعداد استفاده" v={fa(b.usageCount)} />
          </div>
          <div className="card">
            <h2 className="mb-2 font-bold text-gold">یادآورها</h2>
            {b.reminders.length === 0 ? (
              <p className="text-sm text-muted">برای این بنر یادآوری تعریف نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {b.reminders.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 p-2 text-sm">
                    <span>
                      {formatDateTime(r.remindAt)} · {REC[r.recurrence]}
                    </span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-sm mt-3" href={`/banners/${b.id}/edit`}>
              ویرایش یادآورها
            </Link>
          </div>
          <div className="card">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-gold">
              <History size={18} /> تاریخچهٔ استفاده
            </h2>
            {!usage.data?.length ? (
              <p className="text-sm text-muted">هنوز استفاده‌ای ثبت نشده است.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {usage.data.slice(0, 15).map((u) => (
                  <li key={u.id}>{formatDateTime(u.usedAt)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} title="تصویر بنر" wide>
        {fullImgUrl && <img src={fullImgUrl} alt={b.title} className="mx-auto max-h-[75vh] w-auto rounded-lg" />}
      </Modal>
      <ConfirmDialog
        open={del}
        title="حذف بنر"
        message="بنر به سطل بازیافت منتقل می‌شود و یادآورهای آن دیگر اعلان نمی‌دهند. هر زمان می‌توانید آن را بازیابی کنید."
        confirmLabel="انتقال به سطل بازیافت"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDel(false)}
      />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="bidi min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</span>
    </div>
  );
}
