import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./rc";
import { taskXml, type SyncJob } from "./lib";

// Optional: mirror each scheduled sync job as a Windows Task Scheduler task, so it runs while the app is closed.
const KEY = "drivemerge.runWhenClosed";

export function runWhenClosed() {
  try { return inTauri && localStorage.getItem(KEY) === "1"; } catch { return false; }
}

async function script() {
  const p = await import("@tauri-apps/api/path");
  return p.join(await p.resourceDir(), "drivemerge-run.ps1");
}

const register = async (j: SyncJob) => invoke("register_task", { id: j.id, xml: taskXml(j, await script(), new Date()) });
const remove = (j: SyncJob) => invoke("delete_task", { id: j.id });
const same = (a?: SyncJob, b?: SyncJob) => a?.name === b?.name && JSON.stringify(a?.schedule) === JSON.stringify(b?.schedule);

/** Creates, updates or removes tasks for jobs whose schedule (or name) changed between two saves. */
export async function syncTasks(prev: SyncJob[], next: SyncJob[]) {
  if (!runWhenClosed()) return;
  const before = new Map(prev.map((j) => [j.id, j]));
  const after = new Map(next.map((j) => [j.id, j]));
  for (const j of next) if (j.schedule && !same(before.get(j.id), j)) await register(j);
  for (const j of prev) if (j.schedule && !after.get(j.id)?.schedule) await remove(j);
}

/** Turns the feature on (registers every scheduled job) or off (removes their tasks). */
export async function setRunWhenClosed(on: boolean, jobs: SyncJob[]) {
  for (const j of jobs) if (j.schedule) await (on ? register(j) : remove(j));
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* applies this session only */ }
}
