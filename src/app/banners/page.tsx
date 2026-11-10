"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BellRing, Filter, LayoutGrid, List, Plus, Search, Trash2, X } from "lucide-react";
import { BannerThumb, ConfirmDialog, EmptyState, ErrorBox, Help, PageHeader, Spinner } from "@/components/ui";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { useSettings, useToast } from "@/components/Providers";
import { api, errMsg, useFetch } from "@/lib/client";
import { todayIso } from "@/lib/calendar";
import { fa, formatJalali } from "@/lib/format";
import { EMPTY_FILTER, filterBanners, hasActiveReminders, type ArchiveFilter, type SortKey } from "@/lib/queries";
import type { BannerDTO } from "@/lib/types";

export default function ArchivePage() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<BannerDTO[]>("/api/banners");
  const cats = useFetch<{ categories: { id: number; name: string; count: number }[]; uncategorized: number }>("/api/categories");
  const tags = useFetch<{ id: number; name: string; count: number }[]>("/api/tags");
  const [f, setF] = useState<ArchiveFilter>(EMPTY_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [del, setDel] = useState<BannerDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  const list = useMemo(() => filterBanners(data ?? [], f, today), [data, f, today]);
  const patch = (p: Partial<ArchiveFilter>) => setF((x) => ({ ...x, ...p }));
  const activeFilters =
    (f.categoryId !== null ? 1 : 0) + f.tagIds.length + (f.from ? 1 : 0) + (f.to ? 1 : 0) + [f.upcomingOnly, f.activeReminders, f.noReminders, f.recentlyUsed].filter(Boolean).length;

  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await api(`/api/banners/${del.id}`, { method: "DELETE" });
      toast("بنر به سطل بازیافت منتقل شد.");
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
        title="بایگانی بنرها"
        subtitle={data ? `${fa(list.length)} بنر از ${fa(data.length)} بنر` : undefined}
        help="همهٔ بنرهای ثبت‌شده در اینجا هستند. جست‌وجو روی عنوان، توضیحات، مناسبت، دسته، برچسب و یادداشت‌ها انجام می‌شود و با اعداد فارسی و انگلیسی کار می‌کند."
        actions={
          <Link href="/banners/new" className="btn btn-gold">
            <Plus size={18} /> ثبت بنر جدید
          </Link>
        }
      />

      <div className="card mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-52 flex-1">
            <Search size={18} className="pointer-events-none absolute right-3 top-3 text-muted" />
            <input className="input bidi !pr-10" type="search" placeholder="جست‌وجو در بنرها…" value={f.q} onChange={(e) => patch({ q: e.target.value })} aria-label="جست‌وجو" />
          </div>
          <select className="input !w-auto" value={f.sort} onChange={(e) => patch({ sort: e.target.value as SortKey })} aria-label="مرتب‌سازی">
            <option value="created">جدیدترین ثبت</option>
            <option value="occasion">تاریخ مناسبت</option>
            <option value="title">عنوان (الفبایی)</option>
            <option value="used">آخرین استفاده</option>
          </select>
          <button className={`btn ${activeFilters ? "chip-on" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter size={16} /> فیلترها {activeFilters > 0 && `(${fa(activeFilters)})`}
          </button>
          <button className="btn" aria-label={settings.archiveView === "grid" ? "نمایش لیستی" : "نمایش شبکه‌ای"} onClick={() => update({ archiveView: settings.archiveView === "grid" ? "list" : "grid" })}>
            {settings.archiveView === "grid" ? <List size={18} /> : <LayoutGrid size={18} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
            <div>
              <label className="label">دسته‌بندی</label>
              <select
                className="input"
                value={f.categoryId === null ? "" : String(f.categoryId)}
                onChange={(e) => patch({ categoryId: e.target.value === "" ? null : e.target.value === "none" ? "none" : Number(e.target.value) })}
              >
                <option value="">همه</option>
                <option value="none">بدون دسته ({fa(cats.data?.uncategorized ?? 0)})</option>
                {cats.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({fa(c.count)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">بازهٔ تاریخ مناسبت</label>
              <div className="grid grid-cols-2 gap-2">
                <JalaliDatePicker value={f.from} onChange={(iso) => patch({ from: iso })} placeholder="از تاریخ" />
                <JalaliDatePicker value={f.to} onChange={(iso) => patch({ to: iso })} placeholder="تا تاریخ" />
              </div>
              {f.from && f.to && f.to < f.from && <p className="mt-1 text-xs text-danger">تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.</p>}
            </div>
            <div className="md:col-span-2">
              <label className="label">برچسب‌ها</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.data?.length === 0 && <span className="text-xs text-muted">برچسبی وجود ندارد.</span>}
                {tags.data?.map((t) => {
                  const on = f.tagIds.includes(t.id);
                  return (
                    <button key={t.id} className={`chip ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => patch({ tagIds: on ? f.tagIds.filter((x) => x !== t.id) : [...f.tagIds, t.id] })}>
                      {on && "✓ "}
                      {t.name} ({fa(t.count)})
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {(
                [
                  ["upcomingOnly", "فقط مناسبت‌های پیش‌رو"],
                  ["activeReminders", "دارای یادآور فعال"],
                  ["noReminders", "بدون یادآور"],
                  ["recentlyUsed", "اخیراً استفاده‌شده (۳۰ روز)"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`chip !px-3 !py-1.5 ${f[k] ? "chip-on" : ""}`} aria-pressed={f[k]} onClick={() => patch({ [k]: !f[k] })}>
                  {f[k] ? "✓ " : ""}
                  {label}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...EMPTY_FILTER, sort: f.sort, q: f.q })}>
                <X size={14} /> پاک‌کردن فیلترها
              </button>
              <Help text="فیلترها با هم ترکیب می‌شوند: بنر باید همهٔ شرایط انتخاب‌شده را داشته باشد." />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState
          title={data?.length ? "بنری با این شرایط پیدا نشد" : "هنوز بنری ثبت نشده است"}
          hint={data?.length ? "جست‌وجو یا فیلترها را تغییر دهید." : "اولین بنر خود را همراه با مناسبت و یادآور ثبت کنید."}
          action={
            !data?.length && (
              <Link href="/banners/new" className="btn btn-gold">
                ثبت بنر جدید
              </Link>
            )
          }
        />
      ) : (
        <ul className={settings.archiveView === "grid" ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" : "space-y-2"}>
          {list.map((b) => (
            <li key={b.id} className={`card relative overflow-hidden !p-0 ${settings.archiveView === "list" ? "flex" : ""}`}>
              <Link href={`/banners/${b.id}`} className={settings.archiveView === "list" ? "flex flex-1 gap-3" : "block"}>
                <BannerThumb imageId={b.imageId} alt={b.title} className={settings.archiveView === "list" ? "h-24 w-24 shrink-0" : "aspect-[4/3] w-full"} />
                <div className="min-w-0 p-3">
                  <p className="bidi truncate font-bold">{b.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{b.occasionTitle}</p>
                  <p className="mt-1 text-xs text-gold">{formatJalali(b.occasionDate)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {b.categoryName && <span className="chip">{b.categoryName}</span>}
                    {hasActiveReminders(b) && (
                      <span className="chip text-info">
                        <BellRing size={11} /> {fa(b.reminders.filter((r) => r.active && !r.completedAt).length)}
                      </span>
                    )}
                    {b.tags.slice(0, 2).map((t) => (
                      <span key={t.id} className="chip">
                        #{t.name}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
              <button className="btn btn-sm absolute left-2 top-2 !min-h-8 !px-2 bg-surface/90" aria-label={`حذف ${b.title}`} onClick={() => setDel(b)}>
                <Trash2 size={14} className="text-danger" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!del}
        title="حذف بنر"
        message={<>بنر «{del?.title}» به سطل بازیافت منتقل می‌شود و قابل بازیابی است.</>}
        confirmLabel="انتقال به سطل بازیافت"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDel(null)}
      />
    </>
  );
}
