import { useSyncExternalStore } from "react";
import { notify, rc } from "./rc";
import { formatBytes, nextRun, syncRequest, type SyncJob } from "./lib";
import { getJobs, updateJob } from "./jobs";

export type Progress = { bytes: number; totalBytes: number; transfers?: number; deletes?: number; checks?: number };
type State = { running: Record<string, number>; progress: Record<string, Progress> };

// Which jobs are running (job id -> rclone job id) and their live progress, shared by the Sync page and the scheduler.
let state: State = { running: {}, progress: {} };
const listeners = new Set<() => void>();
const set = (patch: (s: State) => State) => { state = patch(state); listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export const useRunner = () => useSyncExternalStore(subscribe, () => state);

/** Runs a job (or a dry run) to completion. Returns final stats for a dry run; records lastRun otherwise. */
export async function runJob(job: SyncJob, dryRun = false): Promise<Progress | undefined> {
  if (state.running[job.id]) return;
  try {
    // bisync aborts if either side is missing; mkdir is a no-op when the folder exists.
    if (job.mode === "twoway" && !dryRun) for (const fs of [job.src, job.dst]) await rc("operations/mkdir", { fs, remote: "" });
    const [method, params] = syncRequest(job, dryRun);
    const { jobid } = await rc<{ jobid: number }>(method, params);
    set((s) => ({ ...s, running: { ...s.running, [job.id]: jobid } }));
    const group = `job/${jobid}`;
    let st: { finished: boolean; success: boolean; error: string };
    let stats: Progress;
    do {
      await new Promise((r) => setTimeout(r, 1000));
      st = await rc("job/status", { jobid });
      stats = await rc<Progress>("core/stats", { group });
      set((s) => ({ ...s, progress: { ...s.progress, [job.id]: stats } }));
    } while (!st.finished);
    if (dryRun) {
      if (!st.success) throw new Error(st.error);
      return stats;
    }
    const { transferred } = await rc<{ transferred?: { name: string; error: string }[] }>("core/transferred", { group });
    const failed = (transferred ?? []).filter((t) => t.error).slice(0, 50).map((t) => ({ name: t.name, error: t.error }));
    await updateJob(job.id, { lastRun: { at: Date.now(), ok: st.success, error: st.error || undefined, count: stats.transfers ?? 0, bytes: stats.bytes, failed } });
    notify(st.success ? "Sync finished" : "Sync failed", st.success ? `${job.name}: ${stats.transfers ?? 0} file(s), ${formatBytes(stats.bytes)}` : `${job.name}: ${st.error}`);
  } catch (e) {
    if (dryRun) throw e;
    await updateJob(job.id, { lastRun: { at: Date.now(), ok: false, error: (e as Error).message } });
    notify("Sync failed", `${job.name}: ${(e as Error).message}`);
  } finally {
    set(({ running: { [job.id]: _, ...running }, progress }) => ({ running, progress }));
  }
}

/** Starts every job whose scheduled time has come. Runs missed while CloudMerge was closed happen once, at startup. */
export async function runDueJobs(now = Date.now()) {
  for (const job of getJobs()) {
    if (!job.schedule || !job.nextRun || job.nextRun > now || state.running[job.id]) continue;
    // Book the following run first, so a slow or failing run can't trigger twice.
    await updateJob(job.id, { nextRun: nextRun(job.schedule, new Date(now)) });
    runJob(job);
  }
}

export function startScheduler() {
  runDueJobs();
  // Hidden windows may have timers slowed, so check often; a run is at most a minute late.
  const t = setInterval(runDueJobs, 30_000);
  return () => clearInterval(t);
}
