// node --test tests/*.mjs
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import relay, { target } from "../api/gh.mjs";

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

// Swap in a fake GitHub for one test. Every call is kept in `.calls`.
function fakeGitHub(status = 200, body = '{"ok":true}', headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=60, s-maxage=60" }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init });
    return new Response(body, { status, headers });
  };
  return calls;
}
const call = (url, init) => relay.fetch(new Request("https://drill.example/api/gh?url=" + encodeURIComponent(url), init));

test("target allows only the gist API and raw gist files", () => {
  assert.equal(target("https://api.github.com/user"), "https://api.github.com/user");
  assert.equal(target("https://api.github.com/gists?per_page=100&page=2"), "https://api.github.com/gists?per_page=100&page=2");
  assert.equal(target("https://api.github.com/gists/abc"), "https://api.github.com/gists/abc");
  assert.equal(target("https://gist.githubusercontent.com/me/abc/raw/def/x.json"), "https://gist.githubusercontent.com/me/abc/raw/def/x.json");
  for (const bad of ["https://api.github.com/repos/me/x", "https://api.github.com/gists/../repos/me/x", "https://api.github.com/users", "http://api.github.com/user", "https://evil.example/gists", "https://api.github.com.evil.example/user", "not a url", ""])
    assert.equal(target(bad), null, bad);
});

test("a disallowed address gets a 400 and never reaches GitHub", async () => {
  const calls = fakeGitHub();
  const res = await call("https://api.github.com/repos/me/x");
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("a GET passes on the token and API headers, and the reply comes back uncached", async () => {
  const calls = fakeGitHub(200, '{"login":"learner"}');
  const res = await call("https://api.github.com/user", { headers: { Authorization: "Bearer t0k", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Cookie: "x=1" } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"login":"learner"}');
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(calls[0].url, "https://api.github.com/user");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.authorization, "Bearer t0k");
  assert.equal(calls[0].headers["x-github-api-version"], "2022-11-28");
  assert.equal(calls[0].headers.cookie, undefined);
  assert.equal(calls[0].body, undefined);
});

test("a PATCH passes its body through unchanged", async () => {
  const calls = fakeGitHub();
  const body = JSON.stringify({ files: { "n2-drill-progress.json": { content: "{}" } } });
  await call("https://api.github.com/gists/abc", { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].headers["content-type"], "application/json");
});

test("GitHub's error status comes back as it is, so the page shows the right message", async () => {
  fakeGitHub(401, '{"message":"Bad credentials"}');
  assert.equal((await call("https://api.github.com/user")).status, 401);
});

test("an empty 204 reply passes through without a body", async () => {
  fakeGitHub(204, null);
  const res = await call("https://api.github.com/gists/abc", { method: "PATCH", body: "{}" });
  assert.equal(res.status, 204);
});

test("GitHub unreachable from the relay is a 502", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal((await call("https://api.github.com/user")).status, 502);
});
