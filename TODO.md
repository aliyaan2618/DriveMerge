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
