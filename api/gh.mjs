// A relay for gist sync, run as a Vercel Function. Some networks (a work laptop) block GitHub but
// not this site, so on Vercel the page sends each sync call here as /api/gh?url=<GitHub URL> and
// this passes it on. Only the gist API and raw gist files are allowed, so it is no open proxy.
// The token rides in the Authorization header as it would to GitHub; nothing is logged or stored.
// Replies are never cached: a stale read would let one device write over another's progress.

const PASS = ["accept", "authorization", "content-type", "x-github-api-version"];
const NO_BODY = new Set([101, 204, 205, 304]);

// The GitHub URL to call, or null if it is not one sync uses. Checked after the URL is parsed, so
// tricks like /gists/../repos are already resolved.
export function target(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.origin === "https://api.github.com" && /^\/(user|gists)(\/|$)/.test(u.pathname)) return u.href;
  if (u.origin === "https://gist.githubusercontent.com") return u.href;
  return null;
}

const plain = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

export default {
  async fetch(request) {
    const url = target(new URL(request.url).searchParams.get("url") || "");
    if (!url) return plain(400, "Not a gist sync address");
    const headers = { "user-agent": "n2-grammar-drill-sync" };
    for (const h of PASS) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }
    const init = { method: request.method, headers };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      return plain(502, "GitHub unreachable");
    }
    const body = NO_BODY.has(res.status) ? null : await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
  },
};
