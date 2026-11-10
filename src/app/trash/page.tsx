"use client";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { BannerThumb, ConfirmDialog, EmptyState, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useToast } from "@/components/Providers";
import { api, errMsg, useFetch } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import type { BannerDTO } from "@/lib/types";

export default function TrashPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<BannerDTO[]>("/api/banners?trashed=1");
  const [del, setDel] = useState<BannerDTO | "all" | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore(b: BannerDTO) {
    try {
      await api(`/api/banners/${b.id}/restore`, { method: "POST" });
      toast(`«${b.title}» بازیابی شد.`);
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  async function destroy() {
    if (!del) return;
    setBusy(true);
    try {
      if (del === "all") await api("/api/integrity", { method: "POST", json: { action: "emptyTrash" } });
      else await api(`/api/banners/${del.id}?permanent=1`, { method: "DELETE" });
      toast("حذف دائمی انجام شد.");
      setDel(null);
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="سطل بازیافت"
        subtitle="بنرهای حذف‌شده تا زمان حذف دائمی در اینجا می‌مانند و یادآورهای آن‌ها اعلان نمی‌دهند."
        actions={
          !!data?.length && (
            <button className="btn btn-danger" onClick={() => setDel("all")}>
              <Trash2 size={16} /> خالی کردن سطل
            </button>
          )
        }
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="سطل بازیافت خالی است" />
      ) : (
        <ul className="space-y-2">
          {data.map((b) => (
            <li key={b.id} className="card flex items-center gap-3">
              <BannerThumb imageId={b.imageId} alt={b.title} className="h-16 w-16 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="bidi truncate font-semibold">{b.title}</p>
                <p className="text-xs text-muted">حذف‌شده در {formatDateTime(b.deletedAt)}</p>
              </div>
              <button className="btn btn-sm" onClick={() => restore(b)}>
                <RotateCcw size={15} /> بازیابی
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setDel(b)} aria-label="حذف دائمی">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!del}
        title="حذف دائمی"
        message={
          del === "all"
            ? "همهٔ بنرهای سطل بازیافت همراه با یادآورها و تصاویرِ بدون استفاده برای همیشه حذف می‌شوند. این کار قابل بازگشت نیست."
            : `بنر «${del ? del.title : ""}» همراه با یادآورهایش برای همیشه حذف می‌شود. تصویر فقط در صورتی حذف می‌شود که بنر دیگری از آن استفاده نکند. این کار قابل بازگشت نیست.`
        }
        confirmLabel="حذف دائمی"
        danger
        busy={busy}
        onConfirm={destroy}
        onCancel={() => setDel(null)}
      />
    </>
  );
}
