# To do later

Things we decided to do later. The full plan is in [ROADMAP.md](ROADMAP.md).

## Send the Proton Drive fix to rclone

DriveMerge ships rclone built with our own fix for Proton Drive (`patches/rclone/0001-protondrive-fix-refusing-to-follow-HTTPS-to-HTTP-red.patch`, also the `drivemerge` branch of the private repo [aliyaan2618/rclone](https://github.com/aliyaan2618/rclone)). If rclone accepts it, we can go back to the official rclone and drop the patch.

- **What it fixes:** Proton's API answers some signed-in https requests with a redirect to the same host over plain http. rclone 1.76 refuses that ("refusing to follow HTTPS to HTTP redirect"), so Proton Drive remotes fail. The fix makes that hop over https instead, inside the Proton backend only; nothing is sent unencrypted, other hosts are unaffected, and a redirect back to the same URL is still refused so it can't loop.
- **Confirmed:** works with a real Proton account (21 November 2026); 6 unit tests in `backend/protondrive/https_upgrade_internal_test.go`.
- **Before opening the PR:**
  - [ ] Read rclone's [CONTRIBUTING.md](https://github.com/rclone/rclone/blob/master/CONTRIBUTING.md), especially "AI-assisted contributions": the submitter must understand every line and answer review questions.
  - [ ] Rebase the `drivemerge` branch onto rclone's latest `master` and re-run `go test ./backend/protondrive/`.
  - [ ] Check rclone's issues and pull requests for an existing fix for the same error, and link any issue in the PR.
  - [ ] Open the PR from a public fork of rclone (the private copy can't be used for a PR), with the commit message already on the branch.
- **After rclone releases the fix:** bump `RCLONE_TAG` in `scripts/build-rclone.mjs`, delete the patch, and (if no patches remain) switch the release workflow back to `scripts/fetch-rclone.mjs`.

## Drop rclone patches as upstream fixes ship

Each time rclone releases a new version, check [patches/rclone/README.md](patches/rclone/README.md): drop patches whose pull request is in that release, bump `RCLONE_TAG`, and unhide Drime once rclone#10384 ships.

## rclone issues to handle later

From a review of all open rclone issues (21 November 2026). None has a fix in rclone yet; check before starting.

- [ ] **Proton uploads freeze after one block error** ([rclone#10224](https://github.com/rclone/rclone/issues/10224)): large uploads to Proton stall for good. Patch rclone once a fix exists.
- [ ] **1.76.0 hangs listing Windows network drives** ([rclone#10280](https://github.com/rclone/rclone/issues/10280)): syncing from a NAS or mapped drive can hang. Marked for rclone's next point release; update `RCLONE_TAG` when it ships.
- [ ] **Google Drive same-name files skipped in sync** ([rclone#9267](https://github.com/rclone/rclone/issues/9267)): only one copy is backed up and the sync still says it succeeded. Show a warning in the sync report when rclone notices duplicates.
- [ ] **Transfer history drops changed files** ([rclone#10087](https://github.com/rclone/rclone/issues/10087)): on big syncs the Report and Activity → Recent can miss changed or failed files. Raise rclone's history limit or build the report from the job's own stats.

## Pool features

- [ ] **Full account: try the next one** ([rclone#5308](https://github.com/rclone/rclone/issues/5308)): when the account the pool picked is full, retry the upload on another account instead of failing.
- [ ] **OneDrive in the pool re-uploads files when only the date changed** ([rclone#4869](https://github.com/rclone/rclone/issues/4869)): wastes bandwidth; look for a setting or a patch.
