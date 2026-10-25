// Content checks that go beyond the validator: every point and set is usable, answers are spread.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadCatalog, questionFiles, readJSON, validateItems } from "../tools/lib.mjs";

const catalog = loadCatalog();
const files = questionFiles();
const all = files.flatMap((f) => readJSON(f).map((q) => ({ ...q, file: path.basename(f) })));
const web = all.filter((q) => !q.file.startsWith("anki_"));

test("catalog: ids unique, sets reference real points, every member has a rule", () => {
  const ids = catalog.points.points.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of catalog.sets.sets) {
    assert.ok(s.members.length >= 2, `${s.id} needs 2+ members`);
    for (const m of s.members) {
      assert.ok(catalog.pointIds.has(m), `${s.id}: unknown member ${m}`);
      assert.ok(s.rules[m], `${s.id}: no rule for ${m}`);
    }
  }
  for (const p of catalog.points.points) {
    assert.ok(catalog.points.lessons[p.l], `${p.id}: unknown lesson ${p.l}`);
    for (const t of p.tags) assert.ok(catalog.points.tagNames[t], `${p.id}: unknown tag ${t}`);
    for (const r of p.reg) assert.ok(catalog.points.regNames[r], `${p.id}: unknown register ${r}`);
  }
});

test("every question file validates", () => {
  const seen = new Set();
  const errors = files.flatMap((f) => validateItems(readJSON(f), f, catalog, seen).errors);
  assert.deepEqual(errors, []);
});

test("every grammar point is tested by at least one web question", { skip: web.length === 0 && "no questions yet" }, () => {
  const tested = new Set(web.flatMap((q) => (q.type === "p9" ? q.qs.map((b) => b.point) : [q.point])));
  const missing = catalog.points.points.map((p) => p.id).filter((id) => !tested.has(id));
  assert.deepEqual(missing, []);
});

test("every confusable set can be drilled, and most have questions that contrast members", { skip: web.length === 0 && "no questions yet" }, () => {
  const contrasting = (s) => {
    const m = new Set(s.members);
    return web.filter((q) => q.type !== "p9" && (q.set === s.id || (q.type === "p7" && m.has(q.point) && q.cp.slice(1).some((id) => m.has(id))))).length;
  };
  const thin = catalog.sets.sets.filter((s) => web.filter((q) => q.type !== "p9" && s.members.includes(q.point)).length < 4).map((s) => s.id);
  assert.deepEqual(thin, [], "sets with fewer than 4 questions on their members");
  const none = catalog.sets.sets.filter((s) => contrasting(s) === 0).map((s) => s.id);
  assert.ok(none.length <= 3, `sets with no contrasting question: ${none}`);
});

test("問題7 has easy, medium and phrase-level questions", { skip: web.length === 0 && "no questions yet" }, () => {
  const p7 = web.filter((q) => q.type === "p7");
  for (const lv of [1, 2, 3]) assert.ok(p7.filter((q) => q.lv === lv).length >= 12, `need 12+ level ${lv} questions for a mock`);
});

test("問題8 star slots are spread out", { skip: !web.some((q) => q.type === "p8") && "no 問題8 yet" }, () => {
  const p8 = web.filter((q) => q.type === "p8");
  const counts = [0, 1, 2, 3].map((k) => p8.filter((q) => q.star === k).length);
  assert.ok(Math.max(...counts) <= p8.length * 0.6, `star positions too uneven: ${counts}`);
});
