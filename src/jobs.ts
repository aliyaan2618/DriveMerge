import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { nextRun, type SyncJob } from "./lib";

// Sync jobs live in sync-jobs.json in the app data folder; kept in memory after startup.
const OLD_KEY = "drivemerge.syncJobs";
const inTauri = "__TAURI_INTERNALS__" in window;
let jobs: SyncJob[] = [];
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
/** Re-renders when jobs are saved from anywhere (Sync page, scheduler, import). */
export const useJobs = () => useSyncExternalStore(subscribe, getJobs);

export async function initJobs() {
  if (!inTauri) {
    // Browser preview (dev only): no file access.
    try { jobs = JSON.parse(localStorage.getItem(OLD_KEY) ?? "[]"); } catch { jobs = []; }
    return;
  }
  jobs = JSON.parse(await invoke<string>("load_jobs"));
  // One-time move of jobs saved by earlier builds in WebView storage.
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old && !jobs.length) {
      jobs = JSON.parse(old);
      await saveJobs(jobs);
    }
    localStorage.removeItem(OLD_KEY);
  } catch { /* nothing to migrate */ }
}

export const getJobs = () => jobs;

export async function saveJobs(next: SyncJob[]) {
  jobs = next;
  listeners.forEach((fn) => fn());
  const json = JSON.stringify(next, null, 2);
  if (inTauri) await invoke("save_jobs", { json });
  else try { localStorage.setItem(OLD_KEY, json); } catch { /* preview only */ }
}

export const exportJobs = (path: string) => invoke("export_jobs", { path, json: JSON.stringify(jobs, null, 2) });

/** Adds jobs from an export file, giving each a new id so nothing is overwritten. */
export async function importJobs(path: string) {
  const added: SyncJob[] = JSON.parse(await invoke<string>("import_jobs", { path }));
  await saveJobs([...jobs, ...added.map((j) => ({ ...j, id: crypto.randomUUID(), lastRun: undefined, nextRun: j.schedule ? nextRun(j.schedule, new Date()) : undefined }))]);
  return added.length;
}

export const updateJob = (id: string, patch: Partial<SyncJob>) => saveJobs(jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)));
