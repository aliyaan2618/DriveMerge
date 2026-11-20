# Lists or runs DriveMerge sync jobs from sync-jobs.json. Called by drivemerge.cmd:
#   drivemerge jobs
#   drivemerge run "Job name" [--dry-run] [extra rclone flags]
#   drivemerge run <job id> --scheduled     (used by Windows Task Scheduler; skips if the app is open)
# Must build the same rclone call as syncRequest() in src/lib.ts.
$ErrorActionPreference = "Stop"
function Fail($msg) { [Console]::Error.WriteLine($msg); exit 2 }
$data = Join-Path $env:APPDATA "com.drivemerge.app"
$jobsFile = Join-Path $data "sync-jobs.json"
# Task Scheduler calls this script directly, without drivemerge.cmd setting the config path.
if (-not $env:RCLONE_CONFIG) { $env:RCLONE_CONFIG = Join-Path $data "rclone.conf" }
$rclone = Join-Path $PSScriptRoot "rclone.exe"
# Windows PowerShell 5.1 returns a JSON array as one object; assigning first, then @(), gives a flat list.
function Read-Jobs { $j = if (Test-Path $jobsFile) { Get-Content $jobsFile -Raw | ConvertFrom-Json } else { @() }; , @($j) }
$jobs = Read-Jobs

$command = $args[0]
if ($command -eq "jobs") {
    if (-not $jobs.Count) { "No saved sync jobs. Create them in the DriveMerge app."; exit 0 }
    foreach ($j in $jobs) { "{0,-28} {1,-8} {2} -> {3}" -f $j.name, $j.mode, $j.src, $j.dst }
    exit 0
}

$name = $args[1]
if (-not $name) { Fail 'Usage: drivemerge run "Job name" [--dry-run]' }
$job = $jobs | Where-Object { $_.name -ieq $name -or $_.id -eq $name } | Select-Object -First 1
if (-not $job) { Fail "No sync job named '$name'. Run 'drivemerge jobs' to see them." }

$extra = @($args | Select-Object -Skip 2 | Where-Object { $_ -ne "--scheduled" })
$scheduled = $args -contains "--scheduled"
# While the app is open its own scheduler runs the job; running it twice would clash.
if ($scheduled -and (Get-Process -Name "DriveMerge", "drivemerge-app" -ErrorAction SilentlyContinue)) {
    "DriveMerge is open and runs '$($job.name)' itself."; exit 0
}
$dryRun = $extra -contains "--dry-run"
$flags = @()
foreach ($p in ($job.include -split "`n")) { if ($p.Trim()) { $flags += "--include", $p.Trim() } }
foreach ($p in ($job.exclude -split "`n")) { if ($p.Trim()) { $flags += "--exclude", $p.Trim() } }
if ($job.minSize.Trim()) { $flags += "--min-size", $job.minSize.Trim() }
if ($job.maxSize.Trim()) { $flags += "--max-size", $job.maxSize.Trim() }
if ($job.maxAge.Trim()) { $flags += "--max-age", $job.maxAge.Trim() }

switch ($job.mode) {
    "mirror" { $cmd = @("sync", $job.src, $job.dst) }
    "update" { $cmd = @("copy", $job.src, $job.dst, "--update") }
    "twoway" {
        # bisync aborts if either side is missing.
        if (-not $dryRun) { & $rclone mkdir $job.src; & $rclone mkdir $job.dst }
        $cmd = @("bisync", $job.src, $job.dst)
        if (-not $job.lastRun.ok) { $cmd += "--resync" }
    }
    default { Fail "Unknown mode '$($job.mode)' in job '$name'." }
}

"Running '$($job.name)' ($($job.mode)): $($job.src) -> $($job.dst)"
& $rclone @cmd @flags -v --stats-one-line --stats 10s @extra
$code = $LASTEXITCODE
if ($dryRun) { exit $code }

# Record the result so the app shows it (and doesn't re-run a job that already ran).
# Re-read the file: the run may have taken hours. Written without a BOM, then swapped in.
$all = Read-Jobs
foreach ($j in $all) {
    if ($j.id -eq $job.id) {
        $result = [ordered]@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); ok = ($code -eq 0); source = "cli" }
        if ($code -ne 0) { $result.error = "rclone exit code $code (see the command-line output)" }
        $j | Add-Member -NotePropertyName lastRun -NotePropertyValue ([pscustomobject]$result) -Force
    }
}
$tmp = "$jobsFile.tmp"
[IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $all -Depth 10))
Move-Item -Force $tmp $jobsFile
exit $code
