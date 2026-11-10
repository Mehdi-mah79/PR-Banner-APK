"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MonthGrid, MonthNav } from "@/components/JalaliDatePicker";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useFetch } from "@/lib/client";
import { dateToIso, isoToJalali, monthBounds, todayIso } from "@/lib/calendar";
import { fa, formatDateTime, formatJalali } from "@/lib/format";
import type { BannerDTO } from "@/lib/types";

export default function CalendarPage() {
  const { data, error, loading, reload } = useFetch<BannerDTO[]>("/api/banners");
  const t = isoToJalali(todayIso());
  const [view, setView] = useState({ jy: t.jy, jm: t.jm });
  const [sel, setSel] = useState<string>(todayIso());

  const { from, to } = monthBounds(view.jy, view.jm);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data ?? []) {
      if (b.occasionDate) m.set(b.occasionDate, (m.get(b.occasionDate) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const occasions = (data ?? []).filter((b) => b.occasionDate === sel);
  const reminders = (data ?? []).flatMap((b) => b.reminders.filter((r) => dateToIso(new Date(r.remindAt)) === sel).map((r) => ({ b, r })));
  const monthCount = (data ?? []).filter((b) => b.occasionDate && b.occasionDate >= from && b.occasionDate <= to).length;

  return (
    <>
      <PageHeader title="تقویم شمسی" subtitle="روزهای دارای مناسبت با نقطهٔ طلایی مشخص شده‌اند." help="روی هر روز بزنید تا مناسبت‌ها و یادآورهای همان روز را ببینید." />
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="card">
            <MonthNav jy={view.jy} jm={view.jm} onChange={(jy, jm) => setView({ jy, jm })} />
            <MonthGrid jy={view.jy} jm={view.jm} selected={sel} onSelect={setSel} badge={(iso) => byDay.get(iso) ?? 0} />
            <p className="mt-3 text-xs text-muted">{fa(monthCount)} مناسبت در این ماه</p>
          </div>
          <div className="space-y-3">
            <div className="card">
              <h2 className="mb-2 font-bold text-gold">{formatJalali(sel, "weekday")}</h2>
              {occasions.length === 0 ? (
                <p className="text-sm text-muted">مناسبتی در این روز ثبت نشده است.</p>
              ) : (
                <ul className="space-y-1">
                  {occasions.map((b) => (
                    <li key={b.id}>
                      <Link href={`/banners/${b.id}`} className="hover:text-gold">
                        {b.occasionTitle || b.title} <span className="text-xs text-muted">— {b.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/banners/new" className="btn btn-sm mt-3">
                ثبت بنر جدید
              </Link>
            </div>
            <div className="card">
              <h2 className="mb-2 font-bold text-gold">یادآورهای این روز</h2>
              {reminders.length === 0 ? (
                <p className="text-sm text-muted">یادآوری ثبت نشده است.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {reminders.map(({ b, r }) => (
                    <li key={r.id}>
                      <Link href={`/banners/${b.id}`} className="hover:text-gold">
                        {formatDateTime(r.remindAt)} — {b.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
