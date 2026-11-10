"use client";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export type Perm = "granted" | "denied" | "default" | "unsupported";

const CHANNEL_ID = "pr_banner_reminders";
let channelReady = false;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensureNotificationChannel(): Promise<void> {
  if (!isNativeAndroid() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "یادآورهای بنر روابط عمومی",
      description: "اعلان‌ها و هشدارهای زمان‌بندی‌شده برای مناسبت‌ها و بنرها",
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
    channelReady = true;
  } catch {
    /* ignore on web */
  }
}

export function getPermission(): Perm {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeAndroid()) {
    const cached = localStorage.getItem("cap_notif_perm") as Perm | null;
    LocalNotifications.checkPermissions()
      .then((res) => {
        const mapped: Perm = res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
        localStorage.setItem("cap_notif_perm", mapped);
      })
      .catch(() => {});
    return cached ?? "default";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<Perm> {
  if (isNativeAndroid()) {
    try {
      await ensureNotificationChannel();
      const res = await LocalNotifications.requestPermissions();
      const mapped: Perm = res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
      localStorage.setItem("cap_notif_perm", mapped);
      return mapped;
    } catch {
      return "denied";
    }
  }
  if (!("Notification" in window)) return "unsupported";
  return await Notification.requestPermission();
}

export async function syncNativeSchedules(
  reminders: {
    id: number;
    bannerId: number;
    bannerTitle: string;
    occasionTitle: string;
    remindAt: string;
    active: boolean;
    completedAt: string | null;
    message: string;
  }[],
  notificationsEnabled: boolean,
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await ensureNotificationChannel();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (!notificationsEnabled) return;
    const now = Date.now();
    const upcoming = reminders
      .filter((r) => r.active && !r.completedAt && new Date(r.remindAt).getTime() > now + 2000)
      .slice(0, 100);
    if (upcoming.length === 0) return;
    await LocalNotifications.schedule({
      notifications: upcoming.map((r) => ({
        id: r.id,
        title: `یادآوری بنر: ${r.bannerTitle || "مناسبت"}`,
        body: r.message || r.occasionTitle || "زمان آماده‌سازی و انتشار بنر فرا رسیده است.",
        schedule: { at: new Date(r.remindAt), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { url: `/banners/${r.bannerId}`, reminderId: r.id },
      })),
    });
  } catch {
    /* ignore if permission not yet granted */
  }
}

export async function showNotification(
  title: string,
  body: string,
  url: string,
  opts: { sound: boolean; vibrate: boolean; tag?: string },
): Promise<boolean> {
  if (isNativeAndroid()) {
    try {
      await ensureNotificationChannel();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") return false;
      }
      localStorage.setItem("cap_notif_perm", "granted");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor((Date.now() % 2000000000) + 100000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 800), allowWhileIdle: true },
            channelId: CHANNEL_ID,
            extra: { url },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  if (getPermission() !== "granted") return false;
  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    dir: "rtl",
    lang: "fa",
    tag: opts.tag,
    data: { url },
    silent: !opts.sound,
  };
  if (opts.vibrate) options.vibrate = [200, 100, 200];
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      window.location.hash = `#${url}`;
    };
    return true;
  } catch {
    return false;
  }
}

export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* audio unavailable */
  }
}
