"use client";
import { useCallback, useEffect, useState } from "react";
import { exportBackupFile, getImageBlobUrl, getSafetyBackupBytes, handleLocalApi, saveImageRecord } from "./localDb";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  try {
    const res = await handleLocalApi(url, init);
    return res as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا در عملیات پایگاه‌داده محلی.";
    throw new ApiError(msg, 400);
  }
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "خطای ناشناخته";
}

export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    api<T>(url)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export function useImageUrl(imageId: number | null, wantThumb = false): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imageId) {
      setUrl(null);
      return;
    }
    let alive = true;
    getImageBlobUrl(imageId, wantThumb)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [imageId, wantThumb]);
  return url;
}

export async function makeThumb(file: File, max = 360): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return await new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

export async function uploadImage(file: File): Promise<number> {
  const thumb = await makeThumb(file);
  return await saveImageRecord(file, thumb);
}

export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

export { exportBackupFile, getSafetyBackupBytes };
