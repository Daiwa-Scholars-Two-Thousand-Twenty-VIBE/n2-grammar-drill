// Offline support: sw.js keeps every file the page loads, leaves sync alone, and never deletes
// another app's cache on the shared github.io address.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Run sw.js against a fake worker scope and capture its handlers and cached file list.
function loadWorker({ keys = [] } = {}) {
  const handlers = {};
  const deleted = [];
  const scope = {
    location: new URL("https://example.github.io/n2-grammar-drill/sw.js"),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    caches: {
      keys: async () => keys,
      delete: async (k) => deleted.push(k),
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      match: async () => undefined,
    },
    fetch: async () => new Response("ok"),
    URL,
    Response,
    Promise,
  };
  scope.self = scope;
  const ctx = vm.createContext(scope);
  vm.runInContext(`${read("sw.js")}\nthis.FILES = FILES;`, ctx);
  return { handlers, deleted, files: ctx.FILES };
}

test("sw.js caches every file the page loads, and each one exists", () => {
  const { files } = loadWorker();
  for (const f of files.filter((f) => f !== "./")) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in sw.js but missing`);
  const html = read("index.html");
  const loaded = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(loaded.length >= 6, "found the page's files");
  for (const f of loaded) assert.ok(files.includes(f), `index.html loads ${f}, but sw.js does not keep it for offline use`);
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons) assert.ok(files.includes(icon.src), `manifest icon ${icon.src} is not kept offline`);
});

test("sw.js only deletes its own old caches", async () => {
  const { handlers, deleted } = loadWorker({ keys: ["kanji-desk-shell-v4", "kanji-desk-media-v1", "n2-drill-shell-v0", "n2-drill-shell-v1"] });
  let done;
  handlers.activate({ waitUntil: (p) => (done = p) });
  await done;
  assert.deepEqual(deleted, ["n2-drill-shell-v0"]);
});

test("sw.js leaves the sync relay, other sites and non-GET calls to the network", () => {
  const { handlers } = loadWorker();
  const answered = (url, method = "GET") => {
    let hit = false;
    handlers.fetch({ request: new Request(url, { method }), respondWith: () => (hit = true) });
    return hit;
  };
  assert.equal(answered("https://example.github.io/n2-grammar-drill/js/app.js"), true);
  assert.equal(answered("https://example.github.io/api/gh?path=/gists"), false);
  assert.equal(answered("https://example.github.io/n2-grammar-drill/api/gh?path=/user"), false);
  assert.equal(answered("https://api.github.com/gists"), false);
  assert.equal(answered("https://example.github.io/n2-grammar-drill/js/app.js", "POST"), false);
});
