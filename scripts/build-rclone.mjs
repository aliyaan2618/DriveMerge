// Builds rclone from its official source at RCLONE_TAG with DriveMerge's fixes (patches/rclone/*.patch)
// and puts it where Tauri expects the bundled engine. Used by the release workflow; needs git and Go.
// The same fixes live on the `drivemerge` branch of the private repo aliyaan2618/rclone.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RCLONE_TAG = "v1.76.0"; // keep in step with the patches; drop a patch once rclone ships the fix
const triple = "x86_64-pc-windows-msvc"; // shortcut: Windows only, add targets when macOS/Linux builds start
const dest = resolve("src-tauri", "binaries", `rclone-${triple}.exe`);
const patches = resolve("patches", "rclone");

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const work = mkdtempSync(join(tmpdir(), "rclone-src-"));
try {
  // autocrlf off: the patches are LF and must apply byte for byte.
  run("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--depth", "1", "--branch", RCLONE_TAG, "https://github.com/rclone/rclone.git", work]);
  for (const p of readdirSync(patches).filter((f) => f.endsWith(".patch")).sort()) {
    console.log(`Applying ${p}`);
    run("git", ["apply", "--whitespace=nowarn", join(patches, p)], work);
  }
  mkdirSync(resolve("src-tauri", "binaries"), { recursive: true });
  // Empty VersionSuffix: same version string (and Proton app-version header) as the official release.
  run("go", ["build", "-trimpath", "-ldflags", "-s -w -X github.com/rclone/rclone/fs.VersionSuffix=", "-o", dest, "."], work);
  run(dest, ["version"]);
} finally {
  rmSync(work, { recursive: true, force: true });
}
