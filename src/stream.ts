import { rc } from "./rc";
import { POOL } from "./lib";

// Plays files straight from the pool: rclone serves it read-only over HTTP on localhost, at a random
// secret path, so a player can seek without downloading the whole file. Started on first use.
let server: { key: string; id: string; base: string } | undefined;

export const MEDIA = /\.(mp4|m4v|webm|mov|mkv|avi|mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
/** Formats the app's built-in player (WebView2) can usually play; others get a link for VLC. */
export const PLAYABLE = /\.(mp4|m4v|webm|mov|mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/** `poolKey` changes when accounts join or leave the pool, so the server is restarted on the new pool. */
export async function streamUrl(poolKey: string, path: string) {
  if (server?.key !== poolKey) {
    if (server) await rc("serve/stop", { id: server.id }).catch(() => {});
    const token = crypto.randomUUID();
    const r = await rc<{ id: string; addr: string }>("serve/start", { type: "http", fs: `${POOL}:`, addr: "127.0.0.1:0", read_only: true, baseurl: `/${token}` });
    server = { key: poolKey, id: r.id, base: `http://${r.addr}/${token}` };
  }
  return `${server.base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
