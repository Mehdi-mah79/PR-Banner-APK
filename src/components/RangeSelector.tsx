"use client";
import { JALALI_MONTHS, isoToJalali, resolveRange, todayIso, type RangeKind, type RangeSelection } from "@/lib/calendar";
import { fa, formatJalali } from "@/lib/format";
import { JalaliDatePicker } from "./JalaliDatePicker";
import { Help } from "./ui";

const OPTIONS: { v: RangeKind; label: string }[] = [
  { v: "week", label: "یک هفتهٔ آینده" },
  { v: "nextMonth", label: "ماه آینده" },
  { v: "month", label: "ماه انتخابی" },
  { v: "custom", label: "بازهٔ تاریخ دلخواه" },
];

export function RangeSelector({ value, onChange }: { value: RangeSelection; onChange: (v: RangeSelection) => void }) {
  const today = todayIso();
  const cur = isoToJalali(today);
  const resolved = resolveRange(value, today);
  const jy = value.jy ?? cur.jy;
  const jm = value.jm ?? cur.jm;
  const years = Array.from({ length: 9 }, (_, i) => cur.jy - 3 + i);

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="range-kind">
          نمایش مناسبت‌ها برای <Help text="بازهٔ نمایش مناسبت‌های پیش‌رو را تعیین می‌کند. انتخاب شما ذخیره می‌شود." />
        </label>
        <select
          id="range-kind"
          className="input"
          value={value.kind}
          onChange={(e) => {
            const kind = e.target.value as RangeKind;
            onChange(kind === "month" ? { kind, jy, jm } : kind === "custom" ? { kind, from: value.from, to: value.to } : { kind });
          }}
        >
          {OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {value.kind === "month" && (
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="ماه" className="input" value={jm} onChange={(e) => onChange({ kind: "month", jy, jm: Number(e.target.value) })}>
            {JALALI_MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label="سال" className="input" value={jy} onChange={(e) => onChange({ kind: "month", jy: Number(e.target.value), jm })}>
            {[...new Set([...years, jy])].sort().map((y) => (
              <option key={y} value={y}>
                {fa(y)}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.kind === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <JalaliDatePicker value={value.from ?? null} onChange={(iso) => onChange({ ...value, kind: "custom", from: iso })} placeholder="تاریخ شروع" ariaLabel="تاریخ شروع" invalid={!resolved.ok && !!value.from && !!value.to} />
          <JalaliDatePicker value={value.to ?? null} onChange={(iso) => onChange({ ...value, kind: "custom", to: iso })} placeholder="تاریخ پایان" ariaLabel="تاریخ پایان" invalid={!resolved.ok && !!value.from && !!value.to} />
        </div>
      )}

      <p className="text-sm" aria-live="polite">
        {resolved.ok ? (
          <span className="text-muted">
            بازهٔ فعال: <b className="text-gold">{formatJalali(resolved.from)}</b> تا <b className="text-gold">{formatJalali(resolved.to)}</b>
          </span>
        ) : (
          <span className="text-danger" role="alert">
            {resolved.error}
          </span>
        )}
      </p>
    </div>
  );
}
