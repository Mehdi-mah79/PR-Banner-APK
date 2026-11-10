"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Info, Loader2, X, BellOff, ImageOff } from "lucide-react";
import type { ReminderStatus } from "@/lib/types";
import { useImageUrl } from "@/lib/client";

export function PageHeader({ title, subtitle, actions, help }: { title: string; subtitle?: string; actions?: ReactNode; help?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-gold">
          {title}
          {help && <Help text={help} />}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        title={text}
        aria-label={`راهنما: ${text}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-gold"
      >
        <Info size={15} />
      </button>
      {open && (
        <span role="tooltip" className="absolute right-0 top-7 z-30 w-60 rounded-lg border border-line bg-surface2 p-2.5 text-xs font-normal leading-6 text-fg shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

export function Field({ label, help, error, children, required }: { label: string; help?: string; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-danger"> *</span>} {help && <Help text={help} />}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 md:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card max-h-[90vh] w-full overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-gold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="بستن">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأیید",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm leading-7">{message}</div>
      <div className="mt-4 flex justify-start gap-2">
        <button className={`btn ${danger ? "btn-danger" : "btn-gold"}`} onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} {confirmLabel}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          انصراف
        </button>
      </div>
    </Modal>
  );
}

export function Spinner({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <CircleSlash className="text-muted" size={28} />
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-wrap items-center gap-3 border-danger text-danger" role="alert">
      <AlertTriangle size={18} /> <span className="text-sm">{message}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          تلاش دوباره
        </button>
      )}
    </div>
  );
}

const STATUS: Record<ReminderStatus, { label: string; cls: string; icon: ReactNode }> = {
  scheduled: { label: "زمان‌بندی‌شده", cls: "text-info border-info", icon: <Clock size={12} /> },
  overdue: { label: "گذشته / معوق", cls: "text-danger border-danger", icon: <AlertTriangle size={12} /> },
  completed: { label: "انجام‌شده", cls: "text-ok border-ok", icon: <CheckCircle2 size={12} /> },
  inactive: { label: "غیرفعال", cls: "text-muted border-line", icon: <CircleSlash size={12} /> },
  paused: { label: "متوقف (اعلان‌ها خاموش)", cls: "text-warn border-warn", icon: <BellOff size={12} /> },
};

export function StatusBadge({ status }: { status: ReminderStatus }) {
  const s = STATUS[status];
  return (
    <span className={`chip ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export function BannerThumb({ imageId, alt, full, className = "" }: { imageId: number | null; alt: string; full?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = useImageUrl(imageId, !full);
  if (!imageId || broken || !src) {
    return (
      <div className={`flex items-center justify-center bg-surface2 text-muted ${className}`} aria-label="بدون تصویر">
        <ImageOff size={26} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={`object-cover ${className}`}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${checked ? "border-gold bg-gold" : "border-line bg-surface2"} disabled:opacity-50`}
    >
      <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "right-1" : "right-6"}`} />
    </button>
  );
}
