import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { inTauri } from "./rc";

/** Asks GitHub Releases for a newer signed version; null when up to date. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!inTauri) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
}

export async function installUpdate(update: Update) {
  // Download first, so a failed download leaves the app working.
  await update.download();
  await invoke("stop_engine");
  await update.install();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
