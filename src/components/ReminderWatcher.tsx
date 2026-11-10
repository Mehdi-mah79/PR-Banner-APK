"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { beep, showNotification } from "@/lib/notify";
import type { ReminderDTO } from "@/lib/types";
import { useSettings, useToast } from "./Providers";

/**
 * Polls for due reminders while the app is open, delivers a system notification (when permitted),
 * and shows an in-app alert with "done" / "snooze" actions. Delivery is recorded in reminder history.
 */
export function ReminderWatcher() {
  const { settings } = useSettings();
  const toast = useToast();
  const [alerts, setAlerts] = useState<ReminderDTO[]>([]);
  const seen = useRef(new Set<string>());

  const check = useCallback(async () => {
    try {
      const { due } = await api<{ due: ReminderDTO[] }>("/api/reminders/due");
      const fresh = due.filter((r) => !seen.current.has(`${r.id}@${r.remindAt}`));
      if (!fresh.length) return;
      for (const r of fresh) {
        seen.current.add(`${r.id}@${r.remindAt}`);
        const title = `یادآوری: ${r.bannerTitle ?? "بنر"}`;
        const body = r.message || r.occasionTitle || "زمان یادآوری فرا رسیده است.";
        await showNotification(title, body, `/banners/${r.bannerId}`, {
          sound: settings.notifySound,
          vibrate: settings.notifyVibrate,
          tag: `reminder-${r.id}`,
        });
        await api(`/api/reminders/${r.id}`, { method: "PATCH", json: { action: "fired" } }).catch(() => {});
      }
      if (settings.notifySound) beep();
      if (settings.notifyVibrate && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
      setAlerts((a) => [...a, ...fresh]);
    } catch {
      /* offline or server restarting: try again on next tick */
    }
  }, [settings.notifySound, settings.notifyVibrate]);

  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    const t0 = setTimeout(check, 1500);
    const iv = setInterval(check, 30000);
    const vis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [check, settings.notificationsEnabled]);

  async function act(r: ReminderDTO, action: "complete" | "snooze") {
    try {
      await api(`/api/reminders/${r.id}`, {
        method: "PATCH",
        json: action === "snooze" ? { action, minutes: settings.snoozeMinutes } : { action },
      });
      seen.current.delete(`${r.id}@${r.remindAt}`);
      toast(action === "complete" ? "یادآور تکمیل شد." : "یادآور به تعویق افتاد.");
    } catch {
      toast("انجام عملیات ناموفق بود.", "error");
    }
    setAlerts((a) => a.filter((x) => x.id !== r.id));
  }

  if (!alerts.length) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 md:items-center" role="alertdialog" aria-label="یادآورهای رسیده">
      <div className="card max-h-[80vh] w-full max-w-md overflow-y-auto">
        <div className="mb-3 flex items-center gap-2 text-gold">
          <BellRing size={20} />
          <h2 className="font-bold">یادآورهای رسیده</h2>
        </div>
        <ul className="space-y-3">
          {alerts.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface2 p-3">
              <Link href={`/banners/${r.bannerId}`} onClick={() => setAlerts([])} className="font-semibold hover:text-gold">
                {r.bannerTitle}
              </Link>
              <p className="mt-1 text-xs text-muted">
                {r.occasionTitle} · {formatDateTime(r.remindAt)}
              </p>
              {r.message && <p className="mt-1 text-sm">{r.message}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-gold btn-sm" onClick={() => act(r, "complete")}>
                  انجام شد
                </button>
                <button className="btn btn-sm" onClick={() => act(r, "snooze")}>
                  تعویق
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAlerts((a) => a.filter((x) => x.id !== r.id))}>
                  بستن
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
