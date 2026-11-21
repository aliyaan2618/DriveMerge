# DriveMerge Roadmap

DriveMerge pools several cloud storage accounts (Google Drive, OneDrive, Dropbox, Mega, Box, pCloud, SFTP, WebDAV and 60+ more) into one storage space, with file browsing and folder sync. It is a desktop app for Windows first, then macOS and Linux, released free and open source on GitHub.

**Out of scope:**
- A separate website. The GitHub repo and its README are the home page.
- Mounting clouds as a drive letter. DriveMerge is cloud storage only.
- File encryption. Files are stored in the clouds as they are.
- A password lock on DriveMerge's settings file.

---

## How it is built

| Part | Choice | Why |
|---|---|---|
| Desktop shell | Tauri v2 (Rust) | Small installers (~10–15 MB plus rclone), low memory, one codebase for all three systems |
| Interface | React + TypeScript, plain CSS, Lucide icons | Simple and fast, with no UI framework to fight |
| Storage engine | rclone v1.76.0 (MIT), bundled | Already handles 70+ cloud services, pooling and sync |
| Link between them | rclone's remote-control API on localhost | Random port and password on every launch, separate config file |

**Where things live**
- App code: `src/` (screens in `src/pages/`), Rust shell: `src-tauri/src/lib.rs`
- rclone download script (checksum-verified): `scripts/fetch-rclone.mjs`
- Your accounts and sign-in tokens: `%APPDATA%\com.drivemerge.app\rclone.conf` (never committed)

---

## Done

### Foundation
- [x] Tauri v2 + React + TypeScript project, Windows build tools set up
- [x] rclone downloaded from the official site, SHA256-checked, bundled with the app
- [x] App starts rclone in the background and stops it on exit (checked: nothing left running)
- [x] Engine locked to localhost with a random password per launch, and its own config file
- [x] MIT licence, third-party licence file (rclone), README, `.gitignore` that keeps account files out of git

### Design
- [x] Minimal, modern design system: neutral greys, one indigo accent, thin borders, rounded corners
- [x] Light, dark and system themes
- [x] Sidebar layout, live transfer indicator in the top bar
- [x] Keyboard focus outlines, labelled icon buttons, reduced-motion support

### Screens
- [x] **Free storage list on the Dashboard:** 10 services with free plans (up to 92 GB in total), how many of each you have, and an Add button that opens that service's sign-in
- [x] **Dashboard:** pool usage ring, quick numbers, per-account space, first-run welcome
- [x] **Accounts:** add or remove accounts, include or exclude each in the pool
  - Searchable list of 60+ services, popular ones first
  - Browser sign-in for Google Drive, OneDrive, Dropbox and similar
  - Forms built automatically for SFTP, WebDAV, S3 and others
  - Optional "use my own API credentials"
- [x] **Pool:** choose where new files go (Most free space, Fill one first, Spread evenly)
- [x] **Files:** browse the pool, upload (button or drag and drop), new folder, rename, delete with confirmation, download to Downloads, filter the current folder
- [x] **Sync:** saved jobs with Mirror, Update and Two-way modes, filters (include/exclude patterns, min/max size, changed within), live progress, stop, last result
- [x] **Activity:** live transfers with speed and progress, recent transfers, stop all
- [x] **Settings:** theme, bandwidth limit, about and credits

### Tested
- [x] Unit tests for pool editing, size formatting, name rules and sync mapping (`node --test src/lib.test.ts`)
- [x] Every screen tested against a real rclone engine with two local test folders
- [x] **Real Google Drive sign-in works** (19 November 2026)

### Phase 1 (Windows features), 19 November 2026
- [x] Files: search all clouds, duplicates, multi-select, move/copy (including between accounts), open, share links, "Stored in" column
- [x] Accounts: rename (keeps the sign-in), sign in again, "Needs sign-in" status, removal warning, cancel a sign-in, fallback sign-in link
- [x] Sync: Browse… buttons, Preview (dry run), report after each run, jobs saved to `sync-jobs.json` with export/import, notifications
- [x] App: tray icon, start with Windows, bandwidth limit kept, engine locked to the app's own address, app icon, minimum window size

### Phase 2 (power features), 19 November 2026
- [x] Scheduled sync jobs (once, daily, weekly, monthly) with "Next run" on each job, missed runs caught up at start, unit-tested schedule maths
- [x] Command line `drivemerge` (saved jobs by name, dry run, any rclone command), bundled with the app
- [x] Sync runs moved to a shared runner, so scheduled runs work from the tray with no window open

### Sign-in polish, 21 November 2026
- [x] Browser sign-in (Google Drive, OneDrive, Dropbox, Box, pCloud, Jottacloud) shows a DriveMerge "You're signed in" page and brings DriveMerge back to the front
- [x] Password sign-in (MEGA, Proton Drive, Koofr, Filen): clear labels, 2FA code up front, why there's no browser sign-in, where the password goes; Koofr shows one app-password box; Filen explains its API key
- [x] In-app dialogs replace Windows message boxes
- [x] Filen removed from the Dashboard's free-storage list (needs an API key from its CLI); still available under all services

### Bugs fixed during testing
- [x] A pool with only one account broke (rclone's union refuses one member). It now becomes a simple link to that account.
- [x] After the pool changed, rclone kept showing the old file list from its cache. The cache now clears on every change.
- [x] Two-way sync failed when the destination folder didn't exist. It now creates both folders first.
- [x] Google Drive allows two files with the same name in one folder, which broke the file list. Fixed.

---

## Known issues and limits
- **Google's shared login is temporary.** Drive sign-in uses rclone's shared Google login, which is retired during 2026. DriveMerge needs its own Google API login before release (see Phase 3).
- **Same-name files on Google Drive:** renaming or deleting one of two identically named files may act on either one.
- **Destination folders in the pool are typed as paths** (`pool:Photos`). Local folders have a Browse… button.
- **Release builds untested:** the engine only accepts the app's own address. In development that is checked; the installed (release) address `http://tauri.localhost` is checked when the first installer is built.
- **Untested providers:** only Google Drive has been tried with a real account. OneDrive, Dropbox, Mega and others should work but are unverified.

---

## Next: Phase 1, finish the Windows app

**Still to do in Phase 1**

**Pooling and accounts**
- [x] OneDrive tested with a real account (21 November 2026; needed the drive-choice retry)
- [ ] Test Dropbox, MEGA, Box, pCloud, SFTP and WebDAV with real accounts
- [x] Show which account each file is stored in
- [x] Rename an account, reconnect an account whose sign-in expired (shows "Needs sign-in")
- [x] Warn before an account is removed, with how much of the pool it holds

**Files**
- [x] Search across all clouds, not just the current folder
- [x] Find duplicate files and free up space
- [x] Copy and move between folders and between accounts
- [x] Select several files at once
- [x] Open a file with its usual program (downloads it first)
- [x] Stream videos and audio without downloading (built-in player; stream link for VLC for other formats)
- [x] Share links (copy a download link, for services that support links)

**Sync**
- [x] Browse… buttons for picking folders
- [x] "Preview changes" before running (dry run)
- [x] Report after each run: files copied, size, and failed files with reasons
- [x] Store sync jobs in a file in the app's data folder, with export and import

**General**
- [x] Tray icon: closing the window keeps DriveMerge running; Open and Quit in the tray menu
- [x] Live status (transfers and speed) in the tray menu and tray icon tooltip
- [x] Start with Windows (optional)
- [x] Desktop notifications when a sync finishes or fails
- [x] Notifications when a batch of uploads/downloads/moves finishes (if it took 10 s or more)
- [x] Keep the bandwidth limit after restart
- [x] Narrow the engine's allowed origin to the app itself
- [x] App icon and branding

## Phase 2: power features
- [x] **Scheduled jobs:** once, daily, weekly or monthly, on any sync job. Runs while DriveMerge is open or in the tray; a run missed while it was closed happens once at the next start
- [x] Run scheduled jobs even when DriveMerge isn't running: optional Windows Task Scheduler tasks (Settings), which step aside while the app is open
- [x] **Command line:** `drivemerge jobs`, `drivemerge run "Job name" [--dry-run]`, and any rclone command on your accounts and pool (`drivemerge ls pool:`). Settings shows the one-line command to add it to PATH
- [x] Command-line and Task Scheduler runs record the job's last result; the app doesn't re-run a job that already ran

## Phase 3: release on GitHub
- [x] Support for DriveMerge's own Google login, built in from GitHub secrets (`GDRIVE_CLIENT_ID`/`SECRET`)
- [ ] Create the Google project and pass Google's verification for the Drive scope (needs the maintainer's Google account; paid security assessment for public use)
- [ ] Own OneDrive and Dropbox app registrations if the shared ones become limited
- [x] GitHub Actions: tagging `vX.Y.Z` builds the Windows installer (unit tests and version check first)
- [x] Installers and the signed update file go to a draft GitHub Release, published by hand
- [x] Auto-update from GitHub Releases: checked at start, "Update to X" button, manual check in Settings, signed with a private key kept outside the repo
- [ ] Code signing for Windows (optional, about $10/month; without it SmartScreen warns on first run)
- [x] Guides for connecting accounts and Google Drive (`docs/`), shown on GitHub
- [x] Licence check: all shipped libraries are permissive (MIT/Apache/BSD/ISC) or MPL-2.0 used unmodified; listed in THIRD-PARTY-LICENSES.md

## Phase 4: macOS and Linux
- [ ] Extend the rclone download script to macOS (Intel and Apple Silicon) and Linux
- [ ] macOS build: `.dmg`, universal binary
- [ ] macOS signing and notarization (Apple Developer ID, $99/year; without it users must right-click → Open)
- [ ] Linux builds: `.AppImage`, `.deb`, `.rpm`
- [ ] Test the interface on Linux's web engine (WebKitGTK), which is Tauri's weakest platform
- [ ] Menu bar / tray behaviour per system

## Later ideas
- [ ] **Email results** of scheduled jobs (needs an SMTP account to send from)
- [ ] Storage analyzer: what is using the space in each account
- [ ] Pool health: warn when an account is nearly full or its sign-in is failing
- [ ] More languages

---

## Rough timeline (one developer)

| Phase | Effort |
|---|---|
| Phase 1: finish Windows app | 2–3 weeks |
| Phase 2: power features | 2–3 weeks |
| Phase 3: release on GitHub | 1–2 weeks |
| Phase 4: macOS and Linux | 1–2 weeks |
