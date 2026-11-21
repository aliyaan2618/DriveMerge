// Run with: node --test src/lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleUpstream, formatBytes, syncRequest, nextRun, NAME_RE, type SyncJob } from "./lib.ts";

test("toggleUpstream adds, removes and never duplicates", () => {
  assert.equal(toggleUpstream(undefined, "gd", true), "gd:");
  assert.equal(toggleUpstream("gd: od:", "gd", true), "od: gd:");
  assert.equal(toggleUpstream("gd: od:", "gd", false), "od:");
  assert.equal(toggleUpstream("gd:", "gd", false), "");
});

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(3.4 * 1024 ** 4), "3.4 TB");
  assert.equal(formatBytes(undefined), "—");
});

test("account names are restricted to safe characters", () => {
  assert.ok(NAME_RE.test("Google_Drive-2"));
  assert.ok(!NAME_RE.test("bad name"));
  assert.ok(!NAME_RE.test("a:b"));
});

const job: SyncJob = { id: "1", name: "x", src: "C:/Photos", dst: "pool:Photos", mode: "mirror", include: "", exclude: "*.tmp\n\n", minSize: "", maxSize: "10M", maxAge: "", lastRun: undefined };

test("syncRequest maps modes and filters", () => {
  assert.deepEqual(syncRequest(job), ["sync/sync", { srcFs: "C:/Photos", dstFs: "pool:Photos", _async: true, _filter: { ExcludeRule: ["*.tmp"], MaxSize: "10M" }, _config: { DryRun: false } }]);
  assert.deepEqual(syncRequest(job, true)[1]._config, { DryRun: true });
  assert.deepEqual(syncRequest({ ...job, mode: "update" })[1]._config, { UpdateOlder: true, DryRun: false });
  assert.equal(syncRequest({ ...job, mode: "twoway" }, true)[1].dryRun, true);
  const [m, p] = syncRequest({ ...job, mode: "twoway" });
  assert.equal(m, "sync/bisync");
  assert.equal(p.resync, true);
  assert.equal(syncRequest({ ...job, mode: "twoway", lastRun: { at: 1, ok: true } })[1].resync, false);
});

test("nextRun handles each repeat type", () => {
  const at = (s: string) => new Date(s); // local time
  const iso = (n?: number) => (n === undefined ? undefined : new Date(n).toString().slice(0, 21));
  const now = at("2026-11-19T21:00"); // a Thursday
  assert.equal(iso(nextRun({ repeat: "daily", time: "22:30" }, now)), iso(at("2026-11-19T22:30").getTime()));
  assert.equal(iso(nextRun({ repeat: "daily", time: "02:00" }, now)), iso(at("2026-11-20T02:00").getTime()));
  assert.equal(iso(nextRun({ repeat: "daily", time: "21:00" }, now)), iso(at("2026-11-20T21:00").getTime()), "exactly now counts as past");
  assert.equal(iso(nextRun({ repeat: "weekly", time: "09:00", days: [1] }, now)), iso(at("2026-11-23T09:00").getTime()), "next Monday");
  assert.equal(iso(nextRun({ repeat: "weekly", time: "23:00", days: [4] }, now)), iso(at("2026-11-19T23:00").getTime()), "later today");
  assert.equal(iso(nextRun({ repeat: "weekly", time: "20:00", days: [4] }, now)), iso(at("2026-11-26T20:00").getTime()), "same weekday next week");
  assert.equal(nextRun({ repeat: "weekly", time: "09:00", days: [] }, now), undefined);
  assert.equal(iso(nextRun({ repeat: "monthly", time: "08:00", day: 31 }, now)), iso(at("2026-11-30T08:00").getTime()), "31st clamps to Nov 30");
  assert.equal(iso(nextRun({ repeat: "monthly", time: "08:00", day: 5 }, now)), iso(at("2026-12-05T08:00").getTime()));
  assert.equal(iso(nextRun({ repeat: "monthly", time: "08:00", day: 31 }, at("2027-01-31T09:00"))), iso(at("2027-02-28T08:00").getTime()));
  assert.equal(iso(nextRun({ repeat: "once", time: "10:00", date: "2026-12-01" }, now)), iso(at("2026-12-01T10:00").getTime()));
  assert.equal(nextRun({ repeat: "once", time: "10:00", date: "2026-01-01" }, now), undefined);
});

test("taskXml builds a Task Scheduler definition per repeat type", async () => {
  const { taskXml } = await import("./lib.ts");
  const base: SyncJob = { ...job, id: "abc-123", name: `Tom & "Jerry"`, schedule: { repeat: "daily", time: "02:00" } };
  const today = new Date(2026, 10, 20);
  const daily = taskXml(base, "C:/Program Files/DriveMerge/drivemerge-run.ps1", today);
  assert.match(daily, /<StartBoundary>2026-11-20T02:00:00<\/StartBoundary><ScheduleByDay>/);
  assert.ok(daily.includes(`-File &quot;C:/Program Files/DriveMerge/drivemerge-run.ps1&quot; run abc-123 --scheduled`));
  assert.match(daily, /Tom &amp; &quot;Jerry&quot;/);
  assert.match(taskXml({ ...base, schedule: { repeat: "weekly", time: "09:30", days: [1, 5] } }, "s.ps1", today), /<DaysOfWeek><Monday \/><Friday \/><\/DaysOfWeek>/);
  assert.match(taskXml({ ...base, schedule: { repeat: "monthly", time: "08:00", day: 31 } }, "s.ps1", today), /<Day>Last<\/Day>/);
  assert.match(taskXml({ ...base, schedule: { repeat: "monthly", time: "08:00", day: 15 } }, "s.ps1", today), /<Day>15<\/Day>.*<December \/>/s);
  assert.match(taskXml({ ...base, schedule: { repeat: "once", time: "10:00", date: "2026-12-01" } }, "s.ps1", today), /<TimeTrigger><StartBoundary>2026-12-01T10:00:00/);
});

test("authorizeArgs reads rclone's authorize command", async () => {
  const { authorizeArgs } = await import("./lib.ts");
  assert.deepEqual(authorizeArgs('Execute the following:\n\n\trclone authorize "drive"\n\nThen paste the result.'), ["drive"]);
  assert.deepEqual(authorizeArgs('\trclone authorize "onedrive" "abc-id" "s3cret"\n'), ["onedrive", "abc-id", "s3cret"]);
  assert.deepEqual(authorizeArgs('\trclone authorize "drive" "eyJzY29wZSI6ImRyaXZlIn0"\n'), ["drive", "eyJzY29wZSI6ImRyaXZlIn0"]);
  assert.deepEqual(authorizeArgs("no command here"), []);
});

test("merge combines per-account listings like the pool", async () => {
  const { merge } = await import("./lib.ts");
  const f = (Name: string, IsDir = false) => ({ Path: Name, Name, Size: 1, ModTime: "", IsDir });
  const r = merge([["A", [f("Photos", true), f("a.txt")]], ["B", [f("Photos", true), f("b.txt")]]]);
  assert.deepEqual(r.items.map((i) => i.Name).sort(), ["Photos", "a.txt", "b.txt"]);
  assert.deepEqual(r.sources.Photos, ["A", "B"]);
  assert.deepEqual(r.sources["b.txt"], ["B"]);
});

test("formatBytes keeps pooled totals precise", async () => {
  const { formatBytes } = await import("./lib.ts");
  const TB = 1024 ** 4, GB = 1024 ** 3;
  assert.equal(formatBytes(5 * TB + 48 * GB), "5.05 TB");
  assert.equal(formatBytes(5 * TB), "5 TB");
  assert.equal(formatBytes(20 * GB), "20 GB");
  assert.equal(formatBytes(85.7 * 1024 ** 2), "85.7 MB");
  assert.equal(formatBytes(512), "512 B");
});
