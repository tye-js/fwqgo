import type { LookupAddress } from "node:dns";
// Bun substitutes a partial shim for the bare "undici" specifier. The explicit
// entry point runs the installed transport and its DNS lookup on both runtimes.
import { Agent, fetch, type RequestInit } from "undici/index.js";

export type PinnedHttpRequestInit = Omit<
  RequestInit,
  "dispatcher" | "headers"
> & {
  headers?: HeadersInit;
};

const dispatchers = new Map<string, Agent>();
const MAX_DISPATCHERS = 100;

function getDispatcher(url: URL, addresses: readonly LookupAddress[]) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const key = `${hostname}|${addresses.map(({ address, family }) => `${address}/${family}`).join(",")}`;
  const cached = dispatchers.get(key);
  if (cached) {
    dispatchers.delete(key);
    dispatchers.set(key, cached);
    return cached;
  }

  const dispatcher = new Agent({
    connect: {
      lookup(host, options, callback) {
        const candidates = addresses.filter(
          (address) => !options.family || address.family === options.family,
        );
        if (host.replace(/\.$/, "") !== hostname || candidates.length === 0) {
          callback(new Error("No approved address for this host"), "", 0);
          return;
        }
        if (options.all) {
          callback(null, candidates);
        } else {
          const first = candidates[0]!;
          callback(null, first.address, first.family);
        }
      },
    },
  });
  dispatchers.set(key, dispatcher);
  if (dispatchers.size > MAX_DISPATCHERS) {
    const oldestKey = dispatchers.keys().next().value;
    if (oldestKey) {
      const oldest = dispatchers.get(oldestKey);
      dispatchers.delete(oldestKey);
      // Drain active responses before releasing an evicted connection pool.
      void oldest?.close().catch(() => undefined);
    }
  }
  return dispatcher;
}

/** Transport only: callers must validate every address before passing it here. */
export async function fetchPinnedHttpUrl(
  url: URL,
  addresses: readonly LookupAddress[],
  init: PinnedHttpRequestInit,
): Promise<Response> {
  if (addresses.length === 0) throw new Error("No approved public address");
  const response = await fetch(url, {
    ...init,
    headers: Object.fromEntries(new Headers(init.headers)),
    dispatcher: getDispatcher(url, addresses),
    redirect: "manual",
  });
  // Both implement Fetch Response. Undici's declaration predates the DOM
  // iterator Symbol.dispose member; contain that type mismatch at this boundary.
  return response as unknown as Response;
}
