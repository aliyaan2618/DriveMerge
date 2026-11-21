// Pure helpers (no React, no network) so they can be unit-tested with `node --test`.

export const POOL = "pool";
export const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;

export const POLICIES = [
  { id: "mfs", label: "Most free space", help: "New files go to the account with the most room." },
  { id: "lfs", label: "Fill one first", help: "Fill the fullest account that still has room, then move on." },
  { id: "lus", label: "Spread evenly", help: "New files go to the account using the least space." },
] as const;

export const upstreams = (s = "") => s.split(/\s+/).filter(Boolean);

export function toggleUpstream(current: string | undefined, name: string, on: boolean) {
  const list = upstreams(current).filter((u) => u !== `${name}:`);
  if (on) list.push(`${name}:`);
  return list.join(" ");
}

export function formatBytes(n?: number | null) {
  if (n == null || n < 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) (n /= 1024), i++;
  // Two decimals under 10, one under 100, so pooled totals like 5.05 TB aren't rounded to "5.0 TB".
  const digits = i === 0 || n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${String(Number(n.toFixed(digits)))} ${u[i]}`;
}

/** Exact size for tooltips, e.g. "5,549,374,111,232 bytes". */
export const exactBytes = (n?: number | null) => (n == null ? "" : `${n.toLocaleString()} bytes`);

export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

export type SyncMode = "mirror" | "update" | "twoway";
export const SYNC_MODES: { id: SyncMode; label: string; help: string }[] = [
  { id: "mirror", label: "Mirror", help: "Make the destination an exact copy. Extra files there are deleted." },
  { id: "update", label: "Update", help: "Copy new and newer files. Nothing is deleted." },
  { id: "twoway", label: "Two-way", help: "Keep both sides in step. Changes on either side are copied across." },
];

export type SyncJob = {
  id: string;
  name: string;
  src: string;
  dst: string;
  mode: SyncMode;
  include: string;
  exclude: string;
  minSize: string;
  maxSize: string;
  maxAge: string;
  schedule?: Schedule;
  /** Epoch ms of the next scheduled run; set from `schedule` whenever the job is saved or runs. */
  nextRun?: number;
  lastRun?: { at: number; ok: boolean; error?: string; count?: number; bytes?: number; failed?: { name: string; error: string }[]; source?: "cli" };
};

export type Repeat = "once" | "daily" | "weekly" | "monthly";
/** time is "HH:MM" local; date "YYYY-MM-DD" (once); days 0=Sunday..6 (weekly); day 1..31 (monthly). */
export type Schedule = { repeat: Repeat; time: string; date?: string; days?: number[]; day?: number };

/** Next run strictly after `after`, in local time; undefined when a one-off date has passed. */
export function nextRun(s: Schedule, after: Date): number | undefined {
  const [hh, mm] = s.time.split(":").map(Number);
  const at = (y: number, m: number, d: number) => new Date(y, m, d, hh, mm).getTime();
  const t = after.getTime();
  const y = after.getFullYear(), m = after.getMonth(), d = after.getDate();
  switch (s.repeat) {
    case "once": {
      const [yy, mo, dd] = (s.date ?? "").split("-").map(Number);
      const when = at(yy, mo - 1, dd);
      return when > t ? when : undefined;
    }
    case "daily":
      return at(y, m, d) > t ? at(y, m, d) : at(y, m, d + 1);
    case "weekly":
      for (let i = 0; i <= 7; i++) {
        const when = at(y, m, d + i);
        if (s.days?.includes(new Date(when).getDay()) && when > t) return when;
      }
      return undefined; // no weekdays picked
    case "monthly":
      for (let i = 0; i <= 12; i++) {
        const last = new Date(y, m + i + 1, 0).getDate(); // 31st becomes the month's last day
        const when = at(y, m + i, Math.min(s.day ?? 1, last));
        if (when > t) return when;
      }
  }
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Maps a saved sync job to the rclone rc method and parameters that run it. */
export function syncRequest(job: SyncJob, dryRun = false): [string, Record<string, unknown>] {
  const filter: Record<string, unknown> = {};
  if (lines(job.include).length) filter.IncludeRule = lines(job.include);
  if (lines(job.exclude).length) filter.ExcludeRule = lines(job.exclude);
  if (job.minSize.trim()) filter.MinSize = job.minSize.trim();
  if (job.maxSize.trim()) filter.MaxSize = job.maxSize.trim();
  if (job.maxAge.trim()) filter.MaxAge = job.maxAge.trim();
  const common = { _async: true, _filter: filter, _config: { DryRun: dryRun } };
  switch (job.mode) {
    case "mirror":
      return ["sync/sync", { srcFs: job.src, dstFs: job.dst, ...common }];
    case "update":
      return ["sync/copy", { srcFs: job.src, dstFs: job.dst, ...common, _config: { UpdateOlder: true, DryRun: dryRun } }];
    case "twoway":
      // bisync needs a --resync baseline until it has completed once.
      return ["sync/bisync", { path1: job.src, path2: job.dst, resync: !job.lastRun?.ok, dryRun, ...common }];
  }
}

/** Services with a free plan that DriveMerge can add, largest first. Checked November 2026; providers change these. */
export const FREE_TIERS: { type: string; gb: number; note?: string }[] = [
  { type: "mega", gb: 20 },
  { type: "drive", gb: 15, note: "Shared with Gmail and Photos" },
  { type: "box", gb: 10, note: "Files up to 250 MB each" },
  { type: "pcloud", gb: 10, note: "Full 10 GB after a short setup checklist" },
  { type: "koofr", gb: 10 },
  { type: "onedrive", gb: 5 },
  { type: "jottacloud", gb: 5 },
  { type: "dropbox", gb: 2 },
];

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Windows Task Scheduler definition that runs a job through the command-line script.
 * XML instead of schtasks flags: schtasks parses dates in the PC's regional format.
 */
export function taskXml(job: SyncJob, script: string, today: Date): string {
  const s = job.schedule!;
  const date = s.repeat === "once" ? s.date! : today.toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const start = `<StartBoundary>${date}T${s.time}:00</StartBoundary>`;
  // shortcut: day 29/30 are skipped in shorter months (the app moves them to the last day); 31 maps to "Last".
  const day = (s.day ?? 1) >= 31 ? "Last" : String(s.day ?? 1);
  const trigger =
    s.repeat === "once" ? `<TimeTrigger>${start}</TimeTrigger>`
    : s.repeat === "daily" ? `<CalendarTrigger>${start}<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>`
    : s.repeat === "weekly" ? `<CalendarTrigger>${start}<ScheduleByWeek><DaysOfWeek>${(s.days ?? []).map((d) => `<${WEEKDAYS[d]} />`).join("")}</DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek></CalendarTrigger>`
    : `<CalendarTrigger>${start}<ScheduleByMonth><DaysOfMonth><Day>${day}</Day></DaysOfMonth><Months>${MONTHS.map((m) => `<${m} />`).join("")}</Months></ScheduleByMonth></CalendarTrigger>`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${xml(`DriveMerge sync job "${job.name}". Managed by DriveMerge (Settings → Run schedules when DriveMerge is closed).`)}</Description></RegistrationInfo>
  <Triggers>${trigger}</Triggers>
  <Settings>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>${xml(`-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${script}" run ${job.id} --scheduled`)}</Arguments></Exec></Actions>
</Task>`;
}

/** Arguments for `rclone authorize`, taken from rclone's config_token question ("rclone authorize "drive" "id" "secret""). */
export function authorizeArgs(help: string): string[] {
  const cmd = /rclone authorize((?:\s+"[^"]*")+)/.exec(help)?.[1] ?? "";
  return [...cmd.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

export type Item = { Path: string; Name: string; Size: number; ModTime: string; IsDir: boolean };

/** Combines per-account listings like the pool does: one row per name, noting which accounts hold it. */
export function merge(results: [string, Item[]][]): { items: Item[]; sources: Record<string, string[]> } {
  const byName = new Map<string, Item>();
  const sources: Record<string, string[]> = {};
  for (const [account, list] of results)
    for (const it of list) {
      if (!byName.has(it.Name)) byName.set(it.Name, it);
      (sources[it.Name] ??= []).push(account);
    }
  return { items: [...byName.values()], sources };
}

