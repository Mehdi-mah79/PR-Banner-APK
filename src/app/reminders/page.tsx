"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellOff, Check, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorBox, Modal, PageHeader, Spinner, StatusBadge, Toggle } from "@/components/ui";
import { JalaliDatePicker } from "@/components/JalaliDatePicker";
import { useSettings, useToast } from "@/components/Providers";
import { api, errMsg, useFetch } from "@/lib/client";
import { dateToIso, localDateTime } from "@/lib/calendar";
import { formatDateTime, normalizeSearch } from "@/lib/format";
import { getPermission, requestPermission, type Perm } from "@/lib/notify";
import type { ReminderDTO } from "@/lib/types";

type Filter = "all" | "active" | "inactive" | "overdue" | "upcoming" | "completed";
const FILTERS: [Filter, string][] = [
  ["all", "همه"],
  ["active", "فعال"],
  ["inactive", "غیرفعال"],
  ["overdue", "معوق"],
  ["upcoming", "پیش‌رو"],
  ["completed", "انجام‌شده"],
];
const REC: Record<string, string> = { none: "بدون تکرار", daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه", yearly: "سالانه" };
const EVENT: Record<string, string> = {
  created: "ایجاد شد",
  updated: "ویرایش شد",
  fired: "اعلان نمایش داده شد",
  completed: "تکمیل شد",
  enabled: "فعال شد",
  disabled: "غیرفعال شد",
  deleted: "حذف شد",
};

export default function RemindersPage() {
  const toast = useToast();
  const { update } = useSettings();
  const { data, error, loading, reload } = useFetch<{ reminders: ReminderDTO[]; notificationsEnabled: boolean }>("/api/reminders");
  const [tab, setTab] = useState<"list" | "history">("list");
  const history = useFetch<{ id: number; bannerTitle: string; event: string; note: string; at: string }[]>(tab === "history" ? "/api/reminders?history=1" : null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [edit, setEdit] = useState<{ r: ReminderDTO; date: string; time: string } | null>(null);
  const [del, setDel] = useState<ReminderDTO | null>(null);
  const [perm, setPerm] = useState<Perm>("default");
  useEffect(() => setPerm(getPermission()), []);

  const list = useMemo(() => {
    const nq = normalizeSearch(q);
    return (data?.reminders ?? []).filter((r) => {
      if (nq && !normalizeSearch(`${r.bannerTitle} ${r.occasionTitle} ${r.message}`).includes(nq)) return false;
      switch (filter) {
        case "active":
          return r.active && !r.completedAt;
        case "inactive":
          return !r.active;
        case "overdue":
          return r.status === "overdue";
        case "upcoming":
          return r.status === "scheduled" || r.status === "paused";
        case "completed":
          return !!r.completedAt;
        default:
          return true;
      }
    });
  }, [data, q, filter]);

  async function act(r: ReminderDTO, json: Record<string, unknown>, ok: string) {
    try {
      await api(`/api/reminders/${r.id}`, { method: "PATCH", json });
      toast(ok);
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  function openEdit(r: ReminderDTO) {
    const d = new Date(r.remindAt);
    setEdit({ r, date: dateToIso(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` });
  }

  return (
    <>
      <PageHeader title="یادآورها" subtitle="وضعیت واقعی همهٔ یادآورها؛ ایجاد یادآور جدید در فرم ثبت یا ویرایش بنر انجام می‌شود." help="وضعیت هر یادآور از زمان فعلی، فعال بودن آن، تأیید انجام و روشن بودن اعلان‌ها محاسبه می‌شود." />

      {(data && !data.notificationsEnabled) || perm !== "granted" ? (
        <div className="card mb-4 space-y-2 border-warn text-sm" role="status">
          <p className="flex items-center gap-2 font-semibold text-warn">
            <BellOff size={18} /> وضعیت اعلان
          </p>
          {data && !data.notificationsEnabled && (
            <p>
              اعلان‌ها در تنظیمات برنامه خاموش است؛ یادآورها حذف نشده‌اند اما اعلانی نمایش داده نمی‌شود.{" "}
              <button className="btn btn-sm mr-2" onClick={() => update({ notificationsEnabled: true })}>
                روشن کردن اعلان‌ها
              </button>
            </p>
          )}
          {perm === "unsupported" && <p>این دستگاه/مرورگر از اعلان سیستمی پشتیبانی نمی‌کند؛ فقط هشدار درون‌برنامه‌ای نمایش داده می‌شود.</p>}
          {perm === "denied" && <p>مجوز اعلان رد شده است؛ از تنظیمات مرورگر یا دستگاه آن را فعال کنید.</p>}
          {perm === "default" && (
            <p>
              مجوز اعلان سیستمی هنوز داده نشده است.{" "}
              <button className="btn btn-gold btn-sm mr-2" onClick={async () => setPerm(await requestPermission())}>
                درخواست مجوز
              </button>
            </p>
          )}
          <p className="text-xs text-muted">اعلان فقط زمانی نمایش داده می‌شود که برنامه (یا سرویس‌ورکر آن) در حال اجرا باشد.</p>
        </div>
      ) : null}

      <div className="mb-4 flex gap-2">
        <button className={`btn ${tab === "list" ? "btn-gold" : ""}`} onClick={() => setTab("list")}>
          فهرست یادآورها
        </button>
        <button className={`btn ${tab === "history" ? "btn-gold" : ""}`} onClick={() => setTab("history")}>
          تاریخچه
        </button>
      </div>

      {tab === "history" ? (
        history.loading ? (
          <Spinner />
        ) : history.error ? (
          <ErrorBox message={history.error} onRetry={history.reload} />
        ) : !history.data?.length ? (
          <EmptyState title="تاریخچه‌ای ثبت نشده است" />
        ) : (
          <ul className="card divide-y divide-line">
            {history.data.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <b className="bidi">{h.bannerTitle || "—"}</b> — {EVENT[h.event] ?? h.event}
                  {h.note && <span className="text-xs text-muted"> ({h.note})</span>}
                </span>
                <span className="text-xs text-muted">{formatDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="card mb-4 space-y-3">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute right-3 top-3 text-muted" />
              <input className="input bidi !pr-10" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در یادآورها…" aria-label="جست‌وجو" />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(([k, label]) => (
                <button key={k} className={`chip !px-3 !py-1.5 ${filter === k ? "chip-on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorBox message={error} onRetry={reload} />
          ) : list.length === 0 ? (
            <EmptyState title="یادآوری یافت نشد" hint="هنگام ثبت یا ویرایش یک بنر می‌توانید یادآور اضافه کنید." />
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="card space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/banners/${r.bannerId}`} className="bidi font-bold hover:text-gold">
                        {r.bannerTitle}
                      </Link>
                      <p className="text-xs text-muted">مناسبت: {r.occasionTitle || "—"}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm">
                    {formatDateTime(r.remindAt)} · {REC[r.recurrence]}
                    {r.lastFiredAt && <span className="text-xs text-muted"> · آخرین اعلان: {formatDateTime(r.lastFiredAt)}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 text-xs">
                      فعال <Toggle checked={r.active} onChange={(v) => act(r, { action: "toggle", active: v }, v ? "یادآور فعال شد." : "یادآور غیرفعال شد.")} label="فعال بودن یادآور" />
                    </span>
                    <button className="btn btn-sm" onClick={() => openEdit(r)}>
                      <Pencil size={14} /> ویرایش زمان
                    </button>
                    {r.completedAt ? (
                      <button className="btn btn-sm" onClick={() => act(r, { action: "reopen" }, "یادآور بازگشایی شد.")}>
                        <RotateCcw size={14} /> بازگشایی
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => act(r, { action: "complete" }, "یادآور تکمیل شد.")}>
                        <Check size={14} /> تأیید انجام
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>
                      <Trash2 size={14} /> حذف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title="ویرایش زمان یادآور">
        {edit && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{edit.r.bannerTitle}</p>
            <div>
              <label className="label">تاریخ</label>
              <JalaliDatePicker value={edit.date} onChange={(iso) => setEdit({ ...edit, date: iso })} ariaLabel="تاریخ یادآور" />
            </div>
            <div>
              <label className="label">ساعت</label>
              <input type="time" className="input" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} />
            </div>
            <button
              className="btn btn-gold"
              disabled={!edit.date || !edit.time}
              onClick={async () => {
                await act(edit.r, { action: "reschedule", remindAt: localDateTime(edit.date, edit.time).toISOString() }, "زمان یادآور تغییر کرد.");
                setEdit(null);
              }}
            >
              ذخیرهٔ زمان جدید
            </button>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!del}
        title="حذف یادآور"
        message="این یادآور حذف می‌شود و دیگر اعلانی نخواهد داشت. خود بنر حذف نمی‌شود."
        confirmLabel="حذف یادآور"
        danger
        onConfirm={async () => {
          if (del) {
            try {
              await api(`/api/reminders/${del.id}`, { method: "DELETE" });
              toast("یادآور حذف شد.");
              reload();
            } catch (e) {
              toast(errMsg(e), "error");
            }
          }
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      />
    </>
  );
}
