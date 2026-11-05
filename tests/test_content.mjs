// Content checks that go beyond the validator: every point and set is usable, answers are spread.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { CONTENT, loadCatalog, questionFiles, vocabFiles, passageFiles, readJSON, validateItems, validateKanji, validateVocab, validatePassages } from "../tools/lib.mjs";

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

const kanjiFile = path.join(CONTENT, "kanji.json");
test("kanji.json validates and every tier is used", { skip: !fs.existsSync(kanjiFile) && "no kanji.json" }, () => {
  const data = readJSON(kanjiFile);
  assert.deepEqual(validateKanji(data), []);
  for (const t of data.tiers) assert.ok(data.kanji.some((x) => x.tier === t.id), `tier ${t.id} is empty`);
  const ranks = data.kanji.map((x) => x.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "kanji are stored in rank order");
});

const vocab = vocabFiles().flatMap((f) => readJSON(f));
test("vocab files validate, and each type has enough for a mock section", { skip: !vocab.length && "no vocab yet" }, () => {
  const seen = new Set();
  const errors = vocabFiles().flatMap((f) => validateVocab(readJSON(f), f, seen));
  assert.deepEqual(errors, []);
  for (const t of ["v3", "v5", "v6"]) assert.ok(vocab.filter((q) => q.type === t).length >= 5, `need 5+ ${t} items for a mock`);
  const words = vocab.map((q) => `${q.type}:${q.w}`);
  assert.equal(new Set(words).size, words.length, "the same word is tested twice in one type");
});

test("情報検索 notices validate", { skip: !passageFiles().length && "no notices yet" }, () => {
  const seen = new Set();
  const errors = passageFiles().flatMap((f) => validatePassages(readJSON(f), f, seen));
  assert.deepEqual(errors, []);
});

const soundFile = path.join(CONTENT, "..", "js", "sound.js");
test("sound parts match the kanji gap", { skip: !fs.existsSync(soundFile) && "no js/sound.js" }, () => {
  const window = {};
  new Function("window", fs.readFileSync(soundFile, "utf8"))(window);
  const gap = new Map(readJSON(kanjiFile).kanji.map((x) => [x.k, x]));
  const entries = Object.entries(window.N2_SOUND);
  assert.ok(entries.length >= 100, "most phono-semantic gap kanji have a sound part");
  for (const [k, [part, reads, family]] of entries) {
    assert.ok(gap.has(k), `${k} is not in the kanji gap`);
    assert.ok(part && reads.length && family.length, `${k}: part, readings and family`);
    for (const r of reads) assert.ok(gap.get(k).on.includes(r), `${k}: ${r} is not one of its on'yomi`);
    const kin = family.map((f) => f[0]);
    assert.equal(new Set(kin).size, kin.length, `${k}: a kanji twice in its family`);
    for (const [ch, r, level] of family) {
      assert.notEqual(ch, k, `${k} is in its own family`);
      assert.ok(reads.includes(r), `${k}: ${ch} is listed with ${r}, which ${k} does not share`);
      assert.ok(Number.isInteger(level) && level >= 0 && level <= 60, `${k}: ${ch} has WaniKani level ${level}`);
      if (gap.has(ch)) assert.equal(level, gap.get(ch).wk, `${ch}: WaniKani level differs from kanji.json`);
    }
  }
});
