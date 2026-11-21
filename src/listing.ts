import { useCallback, useEffect, useState } from "react";
import { rc } from "./rc";
import { merge, type Item } from "./lib";

// Folder listings for the Files page, fetched per account so results (and progress) arrive as each
// account answers, and cached in memory so a folder you've opened shows instantly next time.

export type { Item };
export type Listing = { items: Item[]; sources: Record<string, string[]>; failed: Record<string, string>; at: number };

const cache = new Map<string, Listing>();
/** How long each account took last time (ms), for the "about N s left" estimate. */
export const lastDuration = new Map<string, number>();
const keyOf = (accounts: string[], path: string) => `${accounts.join("|")}\n${path}`;

/** Lists `path` in every account at once; `onProgress` gets the merged result so far after each account. */
export async function loadListing(accounts: string[], path: string, onProgress?: (partial: Listing, account: string) => void) {
  const done: [string, Item[]][] = [];
  const failed: Record<string, string> = {};
  const snapshot = (): Listing => ({ ...merge(accounts.flatMap((a) => done.filter(([d]) => d === a))), failed: { ...failed }, at: Date.now() });
  await Promise.all(accounts.map(async (a) => {
    const t0 = performance.now();
    try {
      done.push([a, (await rc<{ list: Item[] }>("operations/list", { fs: `${a}:`, remote: path })).list]);
    } catch (e) {
      // A folder that exists in only some accounts is normal for a pool: treat "not found" as empty.
      if (/not found/i.test((e as Error).message)) done.push([a, []]);
      else failed[a] = (e as Error).message;
    }
    lastDuration.set(a, performance.now() - t0);
    onProgress?.(snapshot(), a);
  }));
  const result = snapshot();
  cache.set(keyOf(accounts, path), result);
  return result;
}

/** Warms the cache (e.g. the pool's top folder while the Dashboard is open). */
export function prefetch(accounts: string[], path = "") {
  if (accounts.length && !cache.has(keyOf(accounts, path))) loadListing(accounts, path).catch(() => {});
}

export function useListing(accounts: string[], path: string) {
  const key = keyOf(accounts, path);
  const [state, setState] = useState<{ shown?: Listing; pending: string[]; started: number; cached: boolean }>({ pending: [], started: 0, cached: false });

  const load = useCallback(() => {
    if (!accounts.length) return;
    const cached = cache.get(key);
    const pending = new Set(accounts);
    const started = Date.now();
    let current = true;
    // Show the cached copy right away; otherwise show results as each account answers.
    setState({ shown: cached, pending: [...pending], started, cached: !!cached });
    loadListing(accounts, path, (partial, account) => {
      if (!current) return;
      pending.delete(account);
      setState((s) => ({ ...s, pending: [...pending], shown: s.cached ? s.shown : partial }));
    }).then((fresh) => { if (current) setState({ shown: fresh, pending: [], started, cached: false }); });
    return () => { current = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => load(), [load]);
  return { ...state, total: accounts.length, loading: state.pending.length > 0, refresh: load };
}
