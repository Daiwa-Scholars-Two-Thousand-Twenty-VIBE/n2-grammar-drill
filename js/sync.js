// Sync progress between devices through one secret GitHub gist. No DOM here: the app holds the
// token and decides when to sync, so this runs in node tests too.
//
// A sync is: read the gist, merge it with local progress (mergePayload), write the result back.
// Merging keeps, per item, the copy that has seen more, so the order devices sync in loses nothing.
// A "reset progress" stamps the payload with `reset` (ms); a newer reset beats any older copy whole.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Sync = api;
})(typeof self !== "undefined" ? self : this, function () {
  const FILE = "n2-drill-progress.json";
  const APP = "n2-grammar-drill";
  const API = "https://api.github.com";

  // An Error the app can show as it is. Messages never include the token.
  function fail(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }
  function httpError(status) {
    if (status === 401 || status === 403) return fail(status, "GitHub refused the token");
    if (status === 404) return fail(status, "Gist not found");
    return fail(status, `GitHub error ${status}`);
  }

  function gistClient({ token, fetch = globalThis.fetch } = {}) {
    // Fetch, check the status and read the body as text: `{ status, text }`. `no-store` so a read
    // never comes from the browser cache (GitHub lets browsers keep API replies for 60 s).
    async function send(url, init) {
      let res, text;
      try {
        res = await fetch(url, { cache: "no-store", ...init });
        if (res.ok) text = await res.text();
      } catch (e) {
        throw fail(0, "Offline or GitHub unreachable");
      }
      if (!res.ok) throw httpError(res.status);
      return { status: res.status, text };
    }
    // Damaged JSON is an error, never quietly read as "no progress".
    function parse({ status, text }, message = `GitHub error ${status}`) {
      try {
        return text ? JSON.parse(text) : null;
      } catch (e) {
        throw fail(status, message);
      }
    }
    // One call to the GitHub API, with the token. Returns the parsed reply.
    async function api(method, path, body) {
      const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
      const init = { method, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      return parse(await send(API + path, init));
    }
    const asText = (content) => (typeof content === "string" ? content : JSON.stringify(content));
    const DAMAGED = "The synced progress file is damaged";

    return {
      // The GitHub login the token belongs to.
      async checkToken() {
        return (await api("GET", "/user")).login;
      },
      // The id of the user's gist that holds FILE, or null. Looks at up to 10 pages of 100.
      async findGist() {
        for (let page = 1; page <= 10; page++) {
          const list = await api("GET", `/gists?per_page=100&page=${page}`);
          const gists = Array.isArray(list) ? list : [];
          const hit = gists.find((g) => g && g.files && g.files[FILE]);
          if (hit) return hit.id;
          if (gists.length < 100) break;
        }
        return null;
      },
      // A new secret gist holding FILE. Returns its id.
      async createGist(content) {
        const body = { public: false, description: "N2 drill progress (synced by the N2 drill app)", files: { [FILE]: { content: asText(content) } } };
        return (await api("POST", "/gists", body)).id;
      },
      // The parsed contents of FILE, or null if the gist has no such file. The API cuts files over
      // about 1 MB short and marks them `truncated`; the raw URL (no token needed) has the whole file.
      async read(id) {
        const gist = await api("GET", `/gists/${encodeURIComponent(id)}`);
        const f = gist && gist.files && gist.files[FILE];
        if (!f) return null;
        const file = f.truncated && f.raw_url ? await send(f.raw_url, { method: "GET" }) : { status: 200, text: f.content };
        return parse(file, DAMAGED);
      },
      // Replace FILE with `content`.
      async write(id, content) {
        await api("PATCH", `/gists/${encodeURIComponent(id)}`, { files: { [FILE]: { content: asText(content) } } });
      },
    };
  }

  // JSON with object keys sorted at every level, so two payloads compare equal whatever the key order.
  function stableStringify(value) {
    return JSON.stringify(value, (k, v) =>
      v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v
    );
  }

  // Local payload combined with the gist's. A missing or foreign remote leaves local as it is.
  // The side with the newer `reset` wins whole (an old copy must not undo a reset); with equal
  // resets the progress is merged item by item. Settings go to whichever side changed them last.
  function mergePayload(local, remote, mergeStates) {
    const l = local || {};
    const reset = (p) => (p && p.reset) || 0;
    if (!remote || remote.app !== APP || !remote.state) return { ...l, reset: reset(l) };
    const ts = (s) => (s && s._ts) || 0;
    const settings = ts(remote.settings) > ts(l.settings) ? remote.settings : l.settings;
    let state;
    if (reset(remote) > reset(l)) state = JSON.parse(JSON.stringify(remote.state));
    else if (reset(l) > reset(remote)) state = l.state;
    else state = mergeStates(l.state, remote.state);
    return { app: APP, v: 1, saved: Date.now(), reset: Math.max(reset(l), reset(remote)), state, settings };
  }

  return { FILE, gistClient, stableStringify, mergePayload };
});
