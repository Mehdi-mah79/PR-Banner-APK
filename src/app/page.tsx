"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Archive, BellRing, CalendarCheck, CalendarClock, DatabaseBackup, Image as ImageIcon, PlusCircle, TriangleAlert } from "lucide-react";
import { BannerThumb, EmptyState, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { RangeSelector } from "@/components/RangeSelector";
import { useSettings } from "@/components/Providers";
import { useFetch } from "@/lib/client";
import { diffDaysIso, resolveRange, todayIso } from "@/lib/calendar";
import { fa, formatDateTime, formatJalali, relativeDays } from "@/lib/format";
import { dashboardStats, upcomingEvents } from "@/lib/queries";
import type { BannerDTO } from "@/lib/types";

export default function DashboardPage() {
  const { settings, update } = useSettings();
  const { data, error, loading, reload } = useFetch<BannerDTO[]>("/api/banners");
  const today = todayIso();

  const stats = useMemo(() => (data ? dashboardStats(data, today) : null), [data, today]);
  const range = resolveRange(settings.upcomingRange, today);
  const events = useMemo(() => (data && range.ok ? upcomingEvents(data, range.from, range.to) : []), [data, range.ok, range.from, range.to]);

  return (
    <>
      <PageHeader title="داشبورد" subtitle={`امروز ${formatJalali(today, "weekday")}`} />
      {loading ? (
        <Spinner />
      ) : error || !stats ? (
        <ErrorBox message={error ?? "خطا در بارگذاری"} onRetry={reload} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat icon={<ImageIcon size={20} />} label="کل بنرها" value={stats.totalBanners} href="/banners" />
            <Stat icon={<CalendarClock size={20} />} label="مناسبت‌های پیش‌رو" value={stats.upcomingEvents} href="/banners" />
            <Stat icon={<CalendarCheck size={20} />} label="مناسبت‌های امروز" value={stats.todayEvents.length} tone="gold" />
            <Stat icon={<BellRing size={20} />} label="یادآورهای فعال" value={stats.activeReminders} href="/reminders" tone="info" />
            <Stat icon={<TriangleAlert size={20} />} label="یادآورهای معوق" value={stats.overdueReminders} href="/reminders" tone={stats.overdueReminders ? "danger" : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Quick href="/banners/new" icon={<PlusCircle size={20} />} label="ثبت بنر جدید" gold />
            <Quick href="/banners" icon={<Archive size={20} />} label="بایگانی" />
            <Quick href="/reminders" icon={<BellRing size={20} />} label="یادآورها" />
            <Quick href="/backup" icon={<DatabaseBackup size={20} />} label="پشتیبان‌گیری و بازیابی" />
          </div>

          {stats.todayEvents.length > 0 && (
            <section className="card border-gold">
              <h2 className="mb-2 font-bold text-gold">مناسبت‌های امروز</h2>
              <ul className="space-y-1">
                {stats.todayEvents.map((b) => (
                  <li key={b.id}>
                    <Link href={`/banners/${b.id}`} className="hover:text-gold">
                      {b.occasionTitle || b.title} <span className="text-xs text-muted">— {b.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 font-bold text-gold">مناسبت‌های پیش‌رو</h2>
            <div className="grid gap-4 md:grid-cols-[320px_1fr]">
              <RangeSelector value={settings.upcomingRange} onChange={(v) => update({ upcomingRange: v })} />
              <div>
                {!range.ok ? (
                  <p className="py-6 text-center text-sm text-muted">برای نمایش مناسبت‌ها بازهٔ معتبر انتخاب کنید.</p>
                ) : events.length === 0 ? (
                  <EmptyState title="مناسبتی در این بازه وجود ندارد" hint="بازهٔ دیگری انتخاب کنید یا بنر جدیدی با تاریخ مناسبت ثبت کنید." />
                ) : (
                  <ul className="divide-y divide-line">
                    {events.map((e) => (
                      <li key={`${e.bannerId}`}>
                        <Link href={`/banners/${e.bannerId}`} className="flex items-center justify-between gap-3 py-3 hover:text-gold">
                          <span className="min-w-0">
                            <span className="bidi block truncate font-semibold">{e.title}</span>
                            <span className="block truncate text-xs text-muted">{e.banner}</span>
                          </span>
                          <span className="shrink-0 text-end text-sm">
                            <span className="block text-gold">{formatJalali(e.date, settings.dateStyle)}</span>
                            <span className="block text-xs text-muted">{relativeDays(diffDaysIso(today, e.date))}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <MiniList title="آخرین بنرهای ثبت‌شده" items={stats.recent} stamp={(b) => formatDateTime(b.createdAt)} />
            <MiniList title="آخرین بنرهای استفاده‌شده" items={stats.recentlyUsed} stamp={(b) => formatDateTime(b.lastUsedAt)} empty="هنوز استفاده‌ای ثبت نشده است. در صفحهٔ هر بنر دکمهٔ «ثبت استفاده» را بزنید." />
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ icon, label, value, href, tone }: { icon: React.ReactNode; label: string; value: number; href?: string; tone?: "gold" | "info" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "text-gold";
  const inner = (
    <div className="card h-full">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <div className="text-2xl font-extrabold">{fa(value)}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Quick({ href, icon, label, gold }: { href: string; icon: React.ReactNode; label: string; gold?: boolean }) {
  return (
    <Link href={href} className={`btn !min-h-14 ${gold ? "btn-gold" : ""}`}>
      {icon} {label}
    </Link>
  );
}

function MiniList({ title, items, stamp, empty = "بنری وجود ندارد." }: { title: string; items: BannerDTO[]; stamp: (b: BannerDTO) => string; empty?: string }) {
  return (
    <section className="card">
      <h2 className="mb-2 font-bold text-gold">{title}</h2>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id}>
              <Link href={`/banners/${b.id}`} className="flex items-center gap-3 hover:text-gold">
                <BannerThumb imageId={b.imageId} alt={b.title} className="h-12 w-12 shrink-0 rounded-lg" />
                <span className="min-w-0">
                  <span className="bidi block truncate text-sm font-semibold">{b.title}</span>
                  <span className="block text-xs text-muted">{stamp(b)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
