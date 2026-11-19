import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

type RcInfo = { url: string; user: string; pass: string };

let info: Promise<RcInfo> | undefined;
function getInfo() {
  return (info ??=
    "__TAURI_INTERNALS__" in window
      ? invoke<RcInfo>("rc_info")
      : // Dev-only: run the UI in a normal browser against `rclone rcd`, e.g. ?rc=http://127.0.0.1:5572&user=u&pass=p
        (() => {
          const q = new URLSearchParams(location.search);
          return Promise.resolve({ url: q.get("rc") ?? "http://127.0.0.1:5572", user: q.get("user") ?? "", pass: q.get("pass") ?? "" });
        })());
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const i = await getInfo();
  const res = await fetch(`${i.url}/${path}`, {
    ...init,
    method: "POST",
    headers: { ...init.headers, Authorization: "Basic " + btoa(`${i.user}:${i.pass}`) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${path} failed (${res.status})`);
  return json;
}

export function rc<T = any>(method: string, params: object = {}): Promise<T> {
  return call<T>(method, { headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
}

export function upload(fs: string, remote: string, files: FileList | File[]) {
  const form = new FormData();
  for (const f of files) form.append("file", f, f.name);
  return call(`operations/uploadfile?${new URLSearchParams({ fs, remote })}`, { body: form });
}

/** Waits for the rclone engine to accept requests (it takes a moment after launch). */
export async function ready() {
  for (let i = 0; ; i++) {
    try {
      return await rc<{ version: string }>("core/version");
    } catch (e) {
      if (i >= 40) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export function useRc<T = any>(method: string, params: object = {}) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const key = method + JSON.stringify(params);
  const reload = useCallback(
    () =>
      rc<T>(method, params).then(
        (data) => set({ data, loading: false }),
        (e) => set({ error: e.message, loading: false }),
      ),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => void reload(), [reload]);
  return { ...state, reload };
}

export const inTauri = "__TAURI_INTERNALS__" in window;

/** Desktop notification; silently skipped if the user hasn't allowed them. */
export async function notify(title: string, body: string) {
  if (!inTauri) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body });
  } catch { /* notifications unavailable */ }
}
