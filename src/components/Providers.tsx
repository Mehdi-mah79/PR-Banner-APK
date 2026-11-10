"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { setPersianDigits } from "@/lib/format";
import { api } from "@/lib/client";
import { ReminderWatcher } from "./ReminderWatcher";

interface SettingsCtx {
  settings: Settings;
  loaded: boolean;
  update: (partial: Partial<Settings>) => Promise<void>;
}
const SettingsContext = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, loaded: false, update: async () => {} });
export const useSettings = () => useContext(SettingsContext);

type ToastKind = "ok" | "error" | "info";
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}
const ToastContext = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  setPersianDigits(settings.persianDigits);

  const toast = useCallback((msg: string, kind: ToastKind = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  useEffect(() => {
    api<Settings>("/api/settings")
      .then((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }))
      .catch(() => toast("بارگذاری تنظیمات ناموفق بود؛ مقادیر پیش‌فرض استفاده می‌شود.", "error"))
      .finally(() => setLoaded(true));
  }, [toast]);

  // apply appearance settings
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = settings.theme === "system" ? (mq.matches ? "dark" : "light") : settings.theme;
      root.dataset.theme = theme;
    };
    apply();
    root.dataset.font = settings.fontSize;
    root.dataset.density = settings.density;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, settings.fontSize, settings.density]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const update = useCallback(
    async (partial: Partial<Settings>) => {
      const prev = settings;
      setSettings((s) => ({ ...s, ...partial })); // optimistic
      try {
        const saved = await api<Settings>("/api/settings", { method: "PUT", json: partial });
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      } catch {
        setSettings(prev);
        toast("ذخیرهٔ تنظیمات ناموفق بود.", "error");
      }
    },
    [settings, toast],
  );

  const value = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update]);

  return (
    <SettingsContext.Provider value={value}>
      <ToastContext.Provider value={toast}>
        <div key={String(settings.persianDigits)}>{children}</div>
        {loaded && <ReminderWatcher />}
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl ${
                t.kind === "error" ? "border-danger bg-surface text-danger" : t.kind === "info" ? "border-info bg-surface text-info" : "border-ok bg-surface text-ok"
              }`}
            >
              {t.kind === "error" ? "✕ " : t.kind === "ok" ? "✓ " : "ⓘ "}
              {t.msg}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </SettingsContext.Provider>
  );
}
