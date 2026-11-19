// Downloads the official rclone build, verifies its SHA256, and places it as a Tauri sidecar.
// shortcut: Windows x64 only, add mac/linux targets (and unzip instead of tar) when we port.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const triple = "x86_64-pc-windows-msvc";
const dest = join("src-tauri", "binaries", `rclone-${triple}.exe`);
if (existsSync(dest)) process.exit(0);

const base = "https://downloads.rclone.org";
const version = (await (await fetch(`${base}/version.txt`)).text()).trim().split(" ").pop();
const name = `rclone-${version}-windows-amd64.zip`;
const sums = await (await fetch(`${base}/${version}/SHA256SUMS`)).text();
const expected = sums.split("\n").find((l) => l.endsWith(name))?.split(/\s+/)[0];
if (!expected) throw new Error(`No checksum found for ${name}`);

const zip = Buffer.from(await (await fetch(`${base}/${version}/${name}`)).arrayBuffer());
const actual = createHash("sha256").update(zip).digest("hex");
if (actual !== expected) throw new Error(`Checksum mismatch for ${name}`);

const work = join(tmpdir(), `rclone-fetch-${Date.now()}`);
mkdirSync(work, { recursive: true });
writeFileSync(join(work, "r.zip"), zip);
execFileSync("tar", ["-xf", "r.zip"], { cwd: work });
mkdirSync(join("src-tauri", "binaries"), { recursive: true });
copyFileSync(join(work, `rclone-${version}-windows-amd64`, "rclone.exe"), dest);
rmSync(work, { recursive: true, force: true });
console.log(`rclone ${version} ready at ${dest}`);
