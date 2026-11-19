# Lists or runs DriveMerge sync jobs from sync-jobs.json. Called by drivemerge.cmd:
#   drivemerge jobs
#   drivemerge run "Job name" [--dry-run] [extra rclone flags]
# Must build the same rclone call as syncRequest() in src/lib.ts.
$ErrorActionPreference = "Stop"
function Fail($msg) { [Console]::Error.WriteLine($msg); exit 2 }
$data = Join-Path $env:APPDATA "com.drivemerge.app"
$jobsFile = Join-Path $data "sync-jobs.json"
$rclone = Join-Path $PSScriptRoot "rclone.exe"
$jobs = @(if (Test-Path $jobsFile) { Get-Content $jobsFile -Raw | ConvertFrom-Json } else { @() })

$command = $args[0]
if ($command -eq "jobs") {
    if (-not $jobs.Count) { "No saved sync jobs. Create them in the DriveMerge app."; exit 0 }
    foreach ($j in $jobs) { "{0,-28} {1,-8} {2} -> {3}" -f $j.name, $j.mode, $j.src, $j.dst }
    exit 0
}

$name = $args[1]
if (-not $name) { Fail 'Usage: drivemerge run "Job name" [--dry-run]' }
$job = $jobs | Where-Object { $_.name -ieq $name } | Select-Object -First 1
if (-not $job) { Fail "No sync job named '$name'. Run 'drivemerge jobs' to see them." }

$extra = @($args | Select-Object -Skip 2)
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
        if ($extra -notcontains "--dry-run") { & $rclone mkdir $job.src; & $rclone mkdir $job.dst }
        $cmd = @("bisync", $job.src, $job.dst)
        if (-not $job.lastRun.ok) { $cmd += "--resync" }
    }
    default { Fail "Unknown mode '$($job.mode)' in job '$name'." }
}

"Running '$($job.name)' ($($job.mode)): $($job.src) -> $($job.dst)"
& $rclone @cmd @flags -v --stats-one-line --stats 10s @extra
exit $LASTEXITCODE
