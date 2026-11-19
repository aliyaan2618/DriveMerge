# DriveMerge

Merge multiple Google Drive, OneDrive, Dropbox, Mega and 60+ other cloud accounts into one storage space. A free, open-source alternative to MultCloud: a desktop app (Tauri + React) powered by [rclone](https://rclone.org).

**[Download for Windows](https://github.com/aliyaan2618/DriveMerge/releases/latest)** · [Website](https://aliyaan2618.github.io/DriveMerge/) · [Roadmap](ROADMAP.md)

Windows 10/11 now; macOS and Linux next. The installer isn't code-signed yet, so Windows SmartScreen may warn on first run: click "More info", then "Run anyway". Installed copies update themselves from GitHub Releases.

## Features
- Pool accounts into one space; choose where new files go (most free space, fill one first, spread evenly)
- File browser across all accounts: upload, download, open, rename, move between accounts, share links, search, duplicates
- Sync folders (mirror, update, two-way) with filters, preview, reports and schedules
- Tray icon, start with Windows, notifications, bandwidth limit
- Command line: `drivemerge run "Job name"`, `drivemerge ls pool:` and any rclone command

Guides: [connecting accounts](docs/providers.md) · [Google Drive with your own Google login](docs/google-drive.md)

## Develop (Windows)
Needs Node 20+, Rust, and the Visual Studio C++ Build Tools.

```
npm install
npm run tauri dev
```
The first run downloads and checksum-verifies the official rclone build into `src-tauri/binaries/`. Unit tests: `node --test src/lib.test.ts`.

## Release
1. Set the new version in `package.json` (the app reads it from there).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub Actions builds the installer and a signed update file into a **draft** release. Check it, then publish it. Installed copies pick it up on their next start.

Repository secrets used by the workflow:
- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: signs updates. Keep a backup of the key; without it, existing installs can't receive updates.
- `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` (optional): DriveMerge's own Google login, see [docs/google-drive.md](docs/google-drive.md).

## Licence
MIT. Bundles rclone (MIT), see THIRD-PARTY-LICENSES.md. Not affiliated with Google, Microsoft, Dropbox or rclone.
