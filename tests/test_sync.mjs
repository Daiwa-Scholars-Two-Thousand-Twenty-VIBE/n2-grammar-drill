// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const S = require("../js/srs.js");
const Sync = require("../js/sync.js");
const { FILE, gistClient, stableStringify, mergePayload } = Sync;
const TOKEN = "fake-test-token-never-shown-123";
const API = "https://api.github.com";

// A canned reply in the shape fetch gives.
const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});
// A fake fetch: `handle(url, init)` returns a reply (or throws). Every call is kept in `.calls`.
function fakeFetch(handle) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return handle(url, init);
  };
  f.calls = calls;
  return f;
}
const gist = (id, files = ["notes.md"]) => ({ id, files: Object.fromEntries(files.map((n) => [n, { filename: n }])) });
const others = (n, from = 0) => Array.from({ length: n }, (_, i) => gist(`other${from + i}`));

// ---------- the gist client ----------

test("findGist finds the progress gist on page 2, with the right headers", async () => {
  const fetch = fakeFetch((url) => {
    if (url.endsWith("page=1")) return reply(others(100));
    if (url.endsWith("page=2")) return reply([...others(3, 100), gist("mine", ["x.txt", FILE])]);
    throw new Error("unexpected " + url);
  });
  assert.equal(await gistClient({ token: TOKEN, fetch }).findGist(), "mine");
  assert.deepEqual(fetch.calls.map((c) => c.url), [`${API}/gists?per_page=100&page=1`, `${API}/gists?per_page=100&page=2`]);
  const h = fetch.calls[0].headers;
  assert.equal(h.Accept, "application/vnd.github+json");
  assert.equal(h.Authorization, `Bearer ${TOKEN}`);
  assert.equal(h["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(h["Content-Type"], undefined, "no body, no content type");
});

test("findGist returns null when no gist has the file, and stops after a short page or 10 pages", async () => {
  const short = fakeFetch((url) => reply(url.endsWith("page=1") ? others(100) : others(7)));
  assert.equal(await gistClient({ token: TOKEN, fetch: short }).findGist(), null);
  assert.equal(short.calls.length, 2);
  const endless = fakeFetch(() => reply(others(100)));
  assert.equal(await gistClient({ token: TOKEN, fetch: endless }).findGist(), null);
  assert.equal(endless.calls.length, 10);
});

test("checkToken returns the GitHub login", async () => {
  const fetch = fakeFetch(() => reply({ login: "learner" }));
  assert.equal(await gistClient({ token: TOKEN, fetch }).checkToken(), "learner");
  assert.equal(fetch.calls[0].url, `${API}/user`);
});

test("createGist makes a secret gist holding the progress file", async () => {
  const fetch = fakeFetch(() => reply({ id: "new123" }, 201));
  const content = JSON.stringify({ app: "n2-grammar-drill", v: 1 });
  assert.equal(await gistClient({ token: TOKEN, fetch }).createGist(content), "new123");
  const c = fetch.calls[0];
  assert.equal(c.method, "POST");
  assert.equal(c.url, `${API}/gists`);
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.equal(c.body.public, false);
  assert.equal(c.body.description, "N2 drill progress (synced by the N2 drill app)");
  assert.deepEqual(c.body.files, { [FILE]: { content } });
});

test("read parses the file, or returns null when the gist has none", async () => {
  const data = { app: "n2-grammar-drill", v: 1, state: S.emptyState() };
  const fetch = fakeFetch((url) =>
    reply(url.endsWith("/with") ? { id: "with", files: { [FILE]: { content: JSON.stringify(data), truncated: false } } } : gist("without"))
  );
  const c = gistClient({ token: TOKEN, fetch });
  assert.deepEqual(await c.read("with"), data);
  assert.equal(await c.read("without"), null);
});

test("read follows raw_url, without the token, when the file is truncated", async () => {
  const data = { app: "n2-grammar-drill", v: 1, state: { ...S.emptyState(), qs: { q1: { seen: 1, right: 1, last: "2026-11-01" } } } };
  const raw = "https://gist.githubusercontent.com/learner/abc/raw/def/" + FILE;
  const fetch = fakeFetch((url) => {
    if (url === `${API}/gists/abc`) return reply({ id: "abc", files: { [FILE]: { content: '{"app":"n2-gr', truncated: true, raw_url: raw } } });
    if (url === raw) return reply(JSON.stringify(data));
    throw new Error("unexpected " + url);
  });
  assert.deepEqual(await gistClient({ token: TOKEN, fetch }).read("abc"), data);
  assert.equal(fetch.calls[1].url, raw);
  assert.equal(fetch.calls[1].headers.Authorization, undefined);
});

test("read reports a damaged file instead of treating it as empty", async () => {
  const fetch = fakeFetch(() => reply({ id: "abc", files: { [FILE]: { content: "{not json" } } }));
  await assert.rejects(gistClient({ token: TOKEN, fetch }).read("abc"), (e) => e.status === 200 && /damaged/.test(e.message));
});

test("write sends a PATCH with the content", async () => {
  const fetch = fakeFetch(() => reply({ id: "abc" }));
  const content = stableStringify({ app: "n2-grammar-drill", v: 1, state: S.emptyState() });
  await gistClient({ token: TOKEN, fetch }).write("abc", content);
  const c = fetch.calls[0];
  assert.equal(c.method, "PATCH");
  assert.equal(c.url, `${API}/gists/abc`);
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.deepEqual(c.body, { files: { [FILE]: { content } } });
});

test("HTTP errors carry the status and a plain message without the token", async () => {
  const cases = [
    [401, "GitHub refused the token"],
    [403, "GitHub refused the token"],
    [404, "Gist not found"],
    [500, "GitHub error 500"],
  ];
  for (const [status, message] of cases) {
    const fetch = fakeFetch(() => reply({ message: `Bad credentials ${TOKEN}` }, status));
    await assert.rejects(gistClient({ token: TOKEN, fetch }).checkToken(), (e) => {
      assert.ok(e instanceof Error);
      assert.equal(e.status, status);
      assert.equal(e.message, message);
      assert.ok(!e.message.includes(TOKEN));
      assert.ok(!String(e.stack).includes(TOKEN));
      return true;
    });
  }
});

test("a fetch that rejects means offline: status 0", async () => {
  const fetch = fakeFetch(() => {
    throw new TypeError(`Failed to fetch with ${TOKEN}`);
  });
  await assert.rejects(gistClient({ token: TOKEN, fetch }).findGist(), (e) => {
    assert.equal(e.status, 0);
    assert.equal(e.message, "Offline or GitHub unreachable");
    assert.ok(!e.message.includes(TOKEN));
    return true;
  });
});

test("with a proxy, every call (raw_url too) goes through it with the GitHub URL as ?url=", async () => {
  const data = { app: "n2-grammar-drill", v: 1, state: S.emptyState() };
  const raw = "https://gist.githubusercontent.com/learner/abc/raw/def/" + FILE;
  const via = (u) => "api/gh?url=" + encodeURIComponent(u);
  const fetch = fakeFetch((url) => {
    if (url === via(`${API}/gists/abc`)) return reply({ id: "abc", files: { [FILE]: { content: "", truncated: true, raw_url: raw } } });
    if (url === via(raw)) return reply(JSON.stringify(data));
    return reply({ id: "abc", login: "learner" });
  });
  const c = gistClient({ token: TOKEN, fetch, proxy: "api/gh" });
  assert.equal(await c.checkToken(), "learner");
  assert.deepEqual(await c.read("abc"), data);
  await c.write("abc", "{}");
  assert.deepEqual(fetch.calls.map((x) => x.url), [via(`${API}/user`), via(`${API}/gists/abc`), via(raw), via(`${API}/gists/abc`)]);
  assert.equal(fetch.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(fetch.calls[3].method, "PATCH");
});

// ---------- mergeStates ----------

const rec = (seen, last, extra = {}) => ({ box: 2, due: "2026-11-05", seen, right: seen, streak: 1, times: [10], last, first: "2026-10-01", ...extra });
const STORES = ["points", "kanji", "vocab", "reading"];
const DAYLOGS = ["days", "kdays", "vdays", "rdays"];

function sample() {
  const a = S.emptyState();
  const b = S.emptyState();
  for (const s of STORES) {
    a[s].x = rec(3, "2026-11-01", { box: 1 });
    b[s].x = rec(5, "2026-10-30", { box: 4 });
    a[s].y = rec(7, "2026-11-02", { box: 5 });
    b[s].y = rec(6, "2026-11-03", { box: 3 });
    a[s].onlyA = rec(1, "2026-11-01");
    b[s].onlyB = rec(1, "2026-11-01");
  }
  a.qs.q1 = { seen: 2, right: 1, wrong: "2026-10-31", last: "2026-10-31" };
  b.qs.q1 = { seen: 4, right: 4, last: "2026-11-01" };
  for (const d of DAYLOGS) {
    a[d]["2026-11-01"] = { n: 10, right: 8, secs: 200 };
    b[d]["2026-11-01"] = { n: 12, right: 9, secs: 260 };
    a[d]["2026-11-02"] = { n: 5, right: 5, secs: 50 };
    b[d]["2026-11-02"] = { n: 3, right: 1, secs: 40 };
    b[d]["2026-11-03"] = { n: 1, right: 1, secs: 9 };
  }
  a.conf["a|b"] = 3;
  b.conf["a|b"] = 1;
  b.conf["c|d"] = 2;
  return { a, b };
}

test("mergeStates: the higher seen wins in every store, and one-sided ids are kept", () => {
  const { a, b } = sample();
  const m = S.mergeStates(a, b);
  for (const s of STORES) {
    assert.deepEqual(m[s].x, b[s].x, `${s}.x from b`);
    assert.deepEqual(m[s].y, a[s].y, `${s}.y from a`);
    assert.deepEqual(m[s].onlyA, a[s].onlyA);
    assert.deepEqual(m[s].onlyB, b[s].onlyB);
  }
  assert.deepEqual(m.qs.q1, b.qs.q1);
  assert.equal(m.v, 2);
});

test("mergeStates: a tie on seen goes to the later last, a full tie to a", () => {
  for (const s of [...STORES, "qs"]) {
    const a = { [s]: { t: rec(4, "2026-11-01", { box: 1 }), u: rec(4, "2026-11-03", { box: 1 }), w: rec(4, "2026-11-02", { box: 1 }) } };
    const b = { [s]: { t: rec(4, "2026-11-02", { box: 5 }), u: rec(4, "2026-11-02", { box: 5 }), w: rec(4, "2026-11-02", { box: 5 }) } };
    const m = S.mergeStates(a, b);
    assert.equal(m[s].t.box, 5, `${s}: b's later last`);
    assert.equal(m[s].u.box, 1, `${s}: a's later last`);
    assert.equal(m[s].w.box, 1, `${s}: full tie keeps a`);
  }
});

test("mergeStates: a tie on seen and last goes to the earlier due, so both devices agree", () => {
  const a = { points: { p: rec(4, "2026-11-02", { due: "2026-11-06", box: 3 }) } };
  const b = { points: { p: rec(4, "2026-11-02", { due: "2026-11-03", box: 3 }) } };
  assert.equal(S.mergeStates(a, b).points.p.due, "2026-11-03");
  assert.equal(S.mergeStates(b, a).points.p.due, "2026-11-03");
});

test("mergeStates: day logs keep the larger n; mix-ups keep the larger count", () => {
  const { a, b } = sample();
  const m = S.mergeStates(a, b);
  for (const d of DAYLOGS) {
    assert.deepEqual(m[d]["2026-11-01"], b[d]["2026-11-01"]);
    assert.deepEqual(m[d]["2026-11-02"], a[d]["2026-11-02"]);
    assert.deepEqual(m[d]["2026-11-03"], b[d]["2026-11-03"]);
  }
  const tie = S.mergeStates({ days: { D: { n: 2, right: 2, secs: 1 } } }, { days: { D: { n: 2, right: 0, secs: 9 } } });
  assert.equal(tie.days.D.right, 2, "tie keeps a");
  assert.deepEqual(m.conf, { "a|b": 3, "c|d": 2 });
});

test("mergeStates: missing stores count as empty", () => {
  const { a } = sample();
  const old = { v: 2, points: { x: rec(9, "2026-11-04") }, qs: {}, conf: {}, days: {} };
  const m = S.mergeStates(old, a);
  assert.equal(m.points.x.seen, 9);
  assert.deepEqual(m.kanji, a.kanji);
  assert.deepEqual(m.rdays, a.rdays);
  assert.deepEqual(S.mergeStates(undefined, {}), S.emptyState());
});

test("mergeStates never mutates its inputs and shares no objects with them", () => {
  const { a, b } = sample();
  const before = [JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))];
  const m = S.mergeStates(a, b);
  assert.deepEqual([a, b], before);
  for (const s of STORES) {
    assert.notEqual(m[s].x, b[s].x);
    assert.notEqual(m[s].x.times, b[s].x.times);
  }
  m.points.y.times.push(99);
  m.days["2026-11-02"].n = 0;
  assert.deepEqual([a, b], before);
});

test("mergeStates is idempotent: merging the result with b again changes nothing", () => {
  const { a, b } = sample();
  const m = S.mergeStates(a, b);
  assert.equal(stableStringify(S.mergeStates(m, b)), stableStringify(m));
  assert.equal(stableStringify(S.mergeStates(m, a)), stableStringify(m));
  assert.equal(stableStringify(S.mergeStates(b, m)), stableStringify(m));
});

// ---------- payloads ----------

test("stableStringify ignores key order at every level", () => {
  assert.equal(stableStringify({ b: 1, a: { d: [{ y: 1, x: 2 }], c: 2 } }), '{"a":{"c":2,"d":[{"x":2,"y":1}]},"b":1}');
  assert.equal(stableStringify({ a: 1, b: { c: 1, d: 2 } }), stableStringify({ b: { d: 2, c: 1 }, a: 1 }));
});

const payload = (state, settings, extra = {}) => ({ app: "n2-grammar-drill", v: 1, saved: 1, state, settings, ...extra });

test("mergePayload merges progress and takes the newer settings by _ts", () => {
  const { a, b } = sample();
  const t0 = Date.now();
  const out = mergePayload(payload(a, { _ts: 100, newPerDay: 12 }), payload(b, { _ts: 200, newPerDay: 20 }), S.mergeStates);
  assert.equal(out.app, "n2-grammar-drill");
  assert.equal(out.v, 1);
  assert.ok(out.saved >= t0);
  assert.equal(out.reset, 0);
  assert.equal(stableStringify(out.state), stableStringify(S.mergeStates(a, b)));
  assert.deepEqual(out.settings, { _ts: 200, newPerDay: 20 });

  const mine = mergePayload(payload(a, { _ts: 300, n: "local" }), payload(b, { _ts: 200, n: "remote" }), S.mergeStates);
  assert.equal(mine.settings.n, "local");
  const tie = mergePayload(payload(a, { _ts: 5, n: "local" }), payload(b, { _ts: 5, n: "remote" }), S.mergeStates);
  assert.equal(tie.settings.n, "local");
  const noTs = mergePayload(payload(a, { n: "local" }), payload(b, { _ts: 1, n: "remote" }), S.mergeStates);
  assert.equal(noTs.settings.n, "remote", "missing _ts counts as 0");
});

test("mergePayload returns local unchanged for a missing, foreign or empty remote", () => {
  const { a } = sample();
  const local = payload(a, { _ts: 1 }, { reset: 7 });
  for (const remote of [null, undefined, { app: "something-else", v: 1, state: S.emptyState() }, { app: "n2-grammar-drill", v: 1 }]) {
    const out = mergePayload(local, remote, S.mergeStates);
    assert.deepEqual(out, local);
    assert.notEqual(out, local);
  }
  assert.equal(mergePayload(payload(a, {}), null, S.mergeStates).reset, 0, "reset is always present");
});

test("mergePayload: a newer remote reset wins whole, no merge", () => {
  const { a, b } = sample();
  const out = mergePayload(payload(a, { _ts: 9, n: "local" }, { reset: 100 }), payload(b, { _ts: 1, n: "remote" }, { reset: 200 }), S.mergeStates);
  assert.equal(out.reset, 200);
  assert.deepEqual(out.state, b);
  assert.notEqual(out.state, b, "a copy of the remote state");
  assert.equal(out.state.points.onlyA, undefined, "local progress from before the reset is dropped");
  assert.equal(out.settings.n, "local", "settings still go by _ts");
});

test("mergePayload: a newer local reset wins whole, no merge", () => {
  const { b } = sample();
  const fresh = S.emptyState();
  fresh.points.z = rec(1, "2026-11-03");
  const after = mergePayload(payload(fresh, { _ts: 1, n: "local" }, { reset: 300 }), payload(b, { _ts: 9, n: "remote" }, { reset: 100 }), S.mergeStates);
  assert.equal(after.reset, 300);
  assert.deepEqual(after.state, fresh);
  assert.equal(after.state.points.x, undefined, "the remote's older progress does not come back");
  assert.equal(after.settings.n, "remote", "settings still go by _ts");
});

test("mergePayload: equal resets merge as usual and keep the reset", () => {
  const { a, b } = sample();
  const out = mergePayload(payload(a, {}, { reset: 400 }), payload(b, {}, { reset: 400 }), S.mergeStates);
  assert.equal(out.reset, 400);
  assert.equal(stableStringify(out.state), stableStringify(S.mergeStates(a, b)));
});

// ---------- loading in the browser ----------

test("both files load as classic scripts and expose window.SRS and window.Sync", () => {
  const ctx = vm.createContext({});
  for (const f of ["../js/srs.js", "../js/sync.js"]) vm.runInContext(readFileSync(new URL(f, import.meta.url), "utf8"), ctx);
  assert.equal(typeof ctx.SRS.mergeStates, "function");
  assert.equal(typeof ctx.Sync.gistClient, "function");
  assert.equal(ctx.Sync.FILE, FILE);
});
