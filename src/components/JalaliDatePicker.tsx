"use client";
import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  JALALI_MONTHS,
  WEEKDAYS_SHORT,
  addJalaliMonths,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  todayIso,
  weekdayIndex,
} from "@/lib/calendar";
import { fa, formatJalali } from "@/lib/format";
import { Modal } from "./ui";

export function MonthNav({ jy, jm, onChange }: { jy: number; jm: number; onChange: (jy: number, jm: number) => void }) {
  const years = Array.from({ length: 41 }, (_, i) => jy - 20 + i);
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" className="btn btn-sm" aria-label="ماه بعد" onClick={() => { const n = addJalaliMonths(jy, jm, 1); onChange(n.jy, n.jm); }}>
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2">
        <select aria-label="ماه" className="input !min-h-9 !w-auto !py-1" value={jm} onChange={(e) => onChange(jy, Number(e.target.value))}>
          {JALALI_MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="سال" className="input !min-h-9 !w-auto !py-1" value={jy} onChange={(e) => onChange(Number(e.target.value), jm)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {fa(y)}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn-sm" aria-label="ماه قبل" onClick={() => { const n = addJalaliMonths(jy, jm, -1); onChange(n.jy, n.jm); }}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function MonthGrid({
  jy,
  jm,
  selected,
  onSelect,
  badge,
  cellExtra,
}: {
  jy: number;
  jm: number;
  selected?: string | null;
  onSelect: (iso: string) => void;
  badge?: (iso: string) => number;
  cellExtra?: (iso: string) => ReactNode;
}) {
  const today = todayIso();
  const len = jalaliMonthLength(jy, jm);
  const offset = weekdayIndex(jalaliToIso(jy, jm, 1));
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted">
        {WEEKDAYS_SHORT.map((w, i) => (
          <div key={w} className={i === 6 ? "text-danger" : ""}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const iso = jalaliToIso(jy, jm, d);
          const isSel = selected === iso;
          const isToday = today === iso;
          const n = badge?.(iso) ?? 0;
          return (
            <button
              type="button"
              key={iso}
              onClick={() => onSelect(iso)}
              aria-label={formatJalali(iso, "weekday")}
              aria-pressed={isSel}
              className={`relative flex min-h-11 flex-col items-center justify-center rounded-lg border text-sm ${
                isSel ? "border-gold bg-gold font-bold text-gold-fg" : isToday ? "border-gold text-gold" : "border-transparent hover:bg-surface2"
              } ${(i % 7) === 6 && !isSel ? "text-danger" : ""}`}
            >
              {fa(d)}
              {n > 0 && (
                <span className={`absolute bottom-0.5 text-[9px] font-bold ${isSel ? "text-gold-fg" : "text-gold"}`}>● {n > 1 ? fa(n) : ""}</span>
              )}
              {cellExtra?.(iso)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Jalali date field. Value and onChange use the canonical Gregorian ISO date (YYYY-MM-DD). */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  ariaLabel,
  invalid,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const base = isoToJalali(value ?? todayIso());
  const [view, setView] = useState({ jy: base.jy, jm: base.jm });

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel ?? placeholder}
        className={`input flex items-center justify-between text-start ${invalid ? "!border-danger" : ""}`}
        onClick={() => {
          const b = isoToJalali(value ?? todayIso());
          setView({ jy: b.jy, jm: b.jm });
          setOpen(true);
        }}
      >
        <span className={value ? "" : "text-muted"}>{value ? formatJalali(value, "weekday") : placeholder}</span>
        <CalendarDays size={18} className="text-gold" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="انتخاب تاریخ شمسی">
        <MonthNav jy={view.jy} jm={view.jm} onChange={(jy, jm) => setView({ jy, jm })} />
        <MonthGrid
          jy={view.jy}
          jm={view.jm}
          selected={value}
          onSelect={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              onChange(todayIso());
              setOpen(false);
            }}
          >
            امروز
          </button>
        </div>
      </Modal>
    </>
  );
}
