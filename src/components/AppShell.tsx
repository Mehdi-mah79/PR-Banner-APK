"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Archive,
  BellRing,
  CalendarDays,
  DatabaseBackup,
  FolderTree,
  LayoutDashboard,
  Menu,
  PlusCircle,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";

const NAV = [
  { href: "/", label: "داشبورد", desc: "نمای کلی آمار، رویدادهای پیش‌رو و دسترسی سریع", icon: LayoutDashboard },
  { href: "/banners", label: "بایگانی بنرها", desc: "جست‌وجو، فیلتر و مدیریت همهٔ بنرهای ثبت‌شده", icon: Archive },
  { href: "/banners/new", label: "ثبت بنر جدید", desc: "ثبت بنر، مناسبت و یادآورها در یک فرم", icon: PlusCircle },
  { href: "/reminders", label: "یادآورها", desc: "بررسی، ویرایش و تأیید انجام همهٔ یادآورها", icon: BellRing },
  { href: "/calendar", label: "تقویم شمسی", desc: "مناسبت‌ها و یادآورها روی تقویم جلالی", icon: CalendarDays },
  { href: "/categories", label: "دسته‌ها و برچسب‌ها", desc: "سازمان‌دهی بنرها با دسته‌بندی و برچسب", icon: FolderTree },
  { href: "/trash", label: "سطل بازیافت", desc: "بازیابی یا حذف دائمی بنرهای حذف‌شده", icon: Trash2 },
  { href: "/backup", label: "پشتیبان‌گیری و بازیابی", desc: "خروجی ZIP/JSON/CSV و بازیابی از فایل پشتیبان", icon: DatabaseBackup },
  { href: "/settings", label: "تنظیمات", desc: "ظاهر، تقویم، اعلان‌ها، ذخیره‌سازی و درباره برنامه", icon: SettingsIcon },
];

const BOTTOM = ["/", "/banners", "/banners/new", "/reminders"];

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/banners") return path === "/banners" || (path.startsWith("/banners/") && path !== "/banners/new");
  return path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-1 overflow-y-auto border-l border-line bg-surface p-4 md:flex">
        <div className="mb-4 px-2">
          <div className="text-lg font-extrabold text-gold">مدیریت بنرهای PR</div>
          <div className="text-xs text-muted">بایگانی و یادآوری مناسبت‌ها</div>
        </div>
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = active(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.desc}
              aria-current={on ? "page" : undefined}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${on ? "border-gold bg-surface2 text-gold" : "border-transparent hover:bg-surface2"}`}
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{n.label}</span>
                <span className="block text-[11px] leading-5 text-muted">{n.desc}</span>
              </span>
            </Link>
          );
        })}
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-8">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <span className="font-extrabold text-gold">مدیریت بنرهای PR</span>
          <button className="btn btn-ghost btn-sm" aria-label="منوی اصلی" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
      </div>

      {/* mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface md:hidden" aria-label="ناوبری اصلی">
        {NAV.filter((n) => BOTTOM.includes(n.href)).map((n) => {
          const Icon = n.icon;
          const on = active(path, n.href);
          const gold = n.href === "/banners/new";
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "text-gold" : "text-muted"}`}>
              <Icon size={gold ? 26 : 21} className={gold ? "text-gold" : ""} />
              {n.label.replace("بایگانی بنرها", "بایگانی").replace("ثبت بنر جدید", "ثبت بنر")}
            </Link>
          );
        })}
        <button className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted" onClick={() => setOpen(true)}>
          <Menu size={21} />
          بیشتر
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-80 max-w-[88%] overflow-y-auto bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold text-gold">منو</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="بستن منو">
                <X size={18} />
              </button>
            </div>
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`mb-1 flex items-start gap-3 rounded-xl border px-3 py-2.5 ${active(path, n.href) ? "border-gold text-gold" : "border-transparent"}`}>
                  <Icon size={20} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{n.label}</span>
                    <span className="block text-[11px] leading-5 text-muted">{n.desc}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
