# AGENTS.md

Guidance for AI coding agents (Claude, Codex, Copilot, Cursor, Gemini and others) installing, running or changing DriveMerge.

DriveMerge is a Windows desktop app that pools cloud storage accounts (Google Drive, OneDrive, Dropbox and 60+ more) into one space. It is a Tauri v2 shell (Rust) around a React + TypeScript UI, and it drives a bundled **rclone** through rclone's remote-control API on localhost.

## Ground rules
- **Never type, ask for, or store the user's cloud passwords or sign-in codes.** Adding Google Drive, OneDrive, Dropbox and similar opens the user's browser; the user signs in themselves. For SFTP/WebDAV/Mega, the user enters credentials in the app.
- **Never commit secrets:** `rclone.conf`, `*.key`, `.env`, or anything from `%APPDATA%\com.drivemerge.app\`. `.gitignore` already covers the usual paths; check `git status` before committing.
- **Ask before destructive actions** on the user's cloud data (`delete`, `purge`, `sync` in mirror mode, `move`). Prefer `--dry-run` first.
- Platform today: **Windows 10/11 only.** macOS and Linux are planned, not supported.

---

## Install and use (as an end user)

### Install the latest release
```powershell
$dir = Join-Path $env:TEMP "drivemerge-install"; New-Item -ItemType Directory -Force $dir | Out-Null
gh release download --repo aliyaan2618/DriveMerge --pattern "*-setup.exe" --dir $dir --clobber
Start-Process (Get-ChildItem $dir -Filter "*-setup.exe")[0].FullName -ArgumentList "/S" -Wait
```
- `/S` runs the installer silently. Without `gh`, download the `*-setup.exe` asset from <https://github.com/aliyaan2618/DriveMerge/releases/latest>.
- The installer isn't code-signed, so a person double-clicking it sees a SmartScreen warning ("More info", then "Run anyway").
- Installed copies update themselves from GitHub Releases.

### Run
- Start **DriveMerge** from the Start menu. Closing the window keeps it in the system tray; quit from the tray menu.
- Accounts are added in the app: **Accounts → Add account**. The user completes the sign-in.

### Command line (works without the app open)
The install folder contains `drivemerge.cmd`, `drivemerge-run.ps1` and `rclone.exe`. For a per-user install that folder is usually `%LOCALAPPDATA%\DriveMerge`. Call the command by full path, or add the folder to the user's PATH (Settings → Command line in the app shows the exact one-liner).

```powershell
drivemerge help                              # usage
drivemerge listremotes                       # accounts, plus "pool:" (all accounts combined)
drivemerge about pool:                       # combined used/free space
drivemerge lsf pool:Photos                   # list files
drivemerge copy C:\Backups pool:Backups -P   # copy into the pool (new files go to the account the pool picks)
drivemerge jobs                              # saved sync jobs (made in the app)
drivemerge run "Photos backup" --dry-run     # preview a saved job
drivemerge run "Photos backup"               # run it (records the result in sync-jobs.json)
```
- Any rclone command works; DriveMerge only points rclone at its own config. Reference: <https://rclone.org/commands/>.
- `pool:` is an rclone **union** remote over the accounts ticked "In pool" (an **alias** when only one account is in it).
- Exit codes: `2` = bad job name or usage; otherwise rclone's own exit codes.

### Where data lives
| What | Path |
|---|---|
| Accounts, sign-in tokens, pool | `%APPDATA%\com.drivemerge.app\rclone.conf` |
| Sync jobs and schedules | `%APPDATA%\com.drivemerge.app\sync-jobs.json` |

Schedules run while the app is running (window or tray). With **Settings → Run schedules when DriveMerge is closed**, each scheduled job also gets a Windows task `DriveMerge<job id>` that runs `drivemerge-run.ps1 run <id> --scheduled` (it exits without running if the app is open). Turning the setting off removes the tasks; uninstalling does not.

---

## Build and develop

### Prerequisites (Windows)
- Node.js 20+ (22 used in CI)
- Rust stable (`winget install Rustlang.Rustup`)
- Visual Studio 2022 Build Tools with the C++ workload (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`)
- WebView2 runtime (preinstalled on Windows 11)

### Commands
```powershell
npm install
npm run tauri dev          # run the app; first run downloads and SHA256-verifies rclone into src-tauri/binaries/
npx tsc --noEmit           # type-check
node --test src/lib.test.ts  # unit tests (pure helpers: pool editing, sync mapping, schedules)
npm run tauri build        # release installer; needs TAURI_SIGNING_PRIVATE_KEY(+_PASSWORD) env vars
```
If `cargo` isn't found after installing Rust, add `%USERPROFILE%\.cargo\bin` to PATH for the session.

**UI without the desktop shell:** run a test engine and open the UI in a normal browser:
```powershell
rclone rcd --config <test.conf> --rc-addr 127.0.0.1:5572 --rc-user dev --rc-pass dev --rc-allow-origin http://localhost:1420
npm run dev   # then open http://localhost:1420/?rc=http://127.0.0.1:5572&user=dev&pass=dev
```
Use `alias` remotes pointing at local folders as fake accounts. Desktop-only features (downloads, open, dialogs, tray, updates) are disabled in this mode.

### Layout
| Path | What |
|---|---|
| `src/rc.ts` | rclone API client (`rc()`, `upload()`, `useRc()`), Tauri detection, notifications |
| `src/lib.ts` | Pure helpers, unit-tested: pool upstreams, `syncRequest()`, `nextRun()`, formatting |
| `src/accounts.tsx` | Accounts, pool (union/alias) management, setup/OAuth question loop, rename/reconnect |
| `src/jobs.ts` / `src/runner.ts` | Sync job storage (`sync-jobs.json` via Rust) and the shared runner + scheduler |
| `src/pages/*.tsx` | Screens: Dashboard, Files, Sync, Accounts, Activity, Settings |
| `src/update.ts` | Auto-update (Tauri updater against GitHub Releases) |
| `src-tauri/src/lib.rs` | Starts/stops rclone, tray, jobs file I/O, settings carry-over |
| `cli/` | `drivemerge.cmd` and `drivemerge-run.ps1` (bundled next to the app) |
| `scripts/fetch-rclone.mjs` | Downloads the official rclone and checks its SHA256 |
| `.github/workflows/release.yml` | Tag `vX.Y.Z` builds the installer into a draft release |

### Conventions and gotchas
- **Keep `cli/drivemerge-run.ps1` in step with `syncRequest()` in `src/lib.ts`**; both turn a sync job into the same rclone call.
- **After changing the pool, call `fscache/clear`** (`savePool()` does). rclone caches remotes and keeps serving old accounts otherwise.
- **A union needs 2+ upstreams;** one account becomes an `alias`. `savePool()` handles it.
- Two-way sync (`bisync`) needs both folders to exist and a `--resync` on its first successful run.
- The engine listens on a random localhost port with a random password per launch and only allows the app's origin (`http://localhost:1420` in dev, `http://tauri.localhost` in release).
- The app version lives only in `package.json`; `tauri.conf.json` reads it.
- Browser sign-in in the desktop app answers rclone's `config_is_local` with false, then runs `rclone authorize <args from config_token's help> --template auth.html` (Rust `authorize` command), so the browser shows `auth.html` (a Go template using .OK/.Name/.Description) and the app is shown again when it returns. The browser preview keeps rclone's own flow.
- Dialogs: use `ask` / `askText` / `tell` from `src/dialogs.tsx`, never window.confirm/prompt/alert.
- Task Scheduler XML comes from `taskXml()` in `src/lib.ts` (unit-tested); `src/tasks.ts` keeps tasks in step on every jobs save.
- Streaming: `src/stream.ts` starts `serve/start type=http` read-only on 127.0.0.1 with a random `baseurl` token; restart it when the pool changes.
- `drivemerge-run.ps1` runs under Windows PowerShell 5.1: read JSON via `Read-Jobs` (5.1 wraps arrays) and write without a BOM.
- `.cmd` and `.ps1` files must keep CRLF line endings (`.gitattributes`).
- Account names must match `^[A-Za-z0-9_-]{1,40}$` (they go into rclone union upstream strings).
- Style: fonts are bundled: Geist (`--sans`) for text, Plus Jakarta Sans (`--num`, class `num`) for numbers, Geist Mono (`--mono`) only for code. Plain CSS tokens in `src/styles.css` (light/dark), Google Material Symbols via `src/icons.tsx` (add new icons there), shared `PageHeader`/`Stat` in `src/ui.tsx`, no UI framework. Keep screens minimal; label every icon-only button.
- Out of scope by decision: drive-letter mounting, file encryption, a settings password, a website.

### Release
1. Bump `version` in `package.json`, commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The workflow builds `DriveMerge_X.Y.Z_x64-setup.exe`, its `.sig` and `latest.json` into a **draft** release. A human reviews and publishes it.

Repository secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (required), `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` (optional, see `docs/google-drive.md`).

See `ROADMAP.md` for what's done and planned.
