# rclone patches

DriveMerge bundles rclone built from its official source (tag in `scripts/build-rclone.mjs`) with these fixes applied in order. The same commits are on the `drivemerge` branch of the private repo aliyaan2618/rclone.

| Patch | Fixes | Upstream status | Drop when |
|---|---|---|---|
| 0001 protondrive | Proton Drive failed with "refusing to follow HTTPS to HTTP redirect" | Ours; not yet sent (see TODO.md) | rclone fixes it |
| 0002 union | Overwriting a file in the pool updated only one account, leaving stale copies (rclone#10364) | PR rclone#10378, open | #10378 is in a release |
| 0003 + 0004 lib/rest | WebDAV ranged downloads (and streaming) broken in 1.76.0 (rclone#10349) | PR rclone#10350, open | #10350 is in a release |
| 0005 koofr | Koofr "429 Too Many Requests" failed instead of retrying (rclone#10394) | PR rclone#10395, open | #10395 is in a release |

Not patched, handled in DriveMerge instead: Drime moves delete files (rclone#10370, PR #10384), so Drime is hidden from the services list.

To update: bump `RCLONE_TAG`, delete patches whose fix is in that release, and check the rest still apply (`node scripts/build-rclone.mjs`).
