// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const S = createRequire(import.meta.url)("../js/srs.js");
const T = "2026-11-01";

const points = [
  { id: "a", l: "1" },
  { id: "b", l: "1" },
  { id: "c", l: "2" },
  { id: "d", l: "2" },
];
const q7 = (id, point, extra = {}) => ({ id, type: "p7", point, cp: [point, null, null, null], lv: 1, ...extra });
const questions = [q7("qa1", "a"), q7("qa2", "a"), q7("qb1", "b"), q7("qc1", "c"), q7("qd1", "d"), { id: "pb", type: "p8", point: "b" }];

test("dates", () => {
  assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(S.daysBetween("2026-10-25", "2026-12-06"), 42);
  assert.equal(S.nextExam(new Date(2026, 9, 25)), "2026-12-06");
  assert.equal(S.nextExam(new Date(2026, 11, 7)), "2027-07-04");
});

test("fast and right on first sight goes straight to box 3", () => {
  const st = S.emptyState();
  const p = S.record(st, { qid: "qa1", point: "a", ok: true, secs: 10, type: "p7", today: T });
  assert.equal(p.box, 3);
  assert.equal(p.due, S.addDays(T, S.INTERVALS[3]));
  assert.equal(p.first, T);
});

test("right but slow stays near the bottom and returns tomorrow", () => {
  const st = S.emptyState();
  const p = S.record(st, { qid: "qa1", point: "a", ok: true, secs: 60, type: "p7", today: T });
  assert.equal(p.box, 1);
  assert.equal(p.due, S.addDays(T, 1));
});

test("a hint stops promotion", () => {
  const st = S.emptyState();
  const p = S.record(st, { qid: "qa1", point: "a", ok: true, secs: 5, slow: true, type: "p7", today: T });
  assert.equal(p.box, 1);
});

test("a miss drops to box 1, logs the mix-up and pulls the confused point forward", () => {
  const st = S.emptyState();
  S.record(st, { qid: "qb1", point: "b", ok: true, secs: 5, type: "p7", today: T });
  assert.equal(st.points.b.due, S.addDays(T, 4));
  const later = S.addDays(T, 1);
  const p = S.record(st, { qid: "qa1", point: "a", ok: false, secs: 9, type: "p7", chosenPoint: "b", today: later });
  assert.equal(p.box, 1);
  assert.equal(p.streak, 0);
  assert.equal(st.conf["a|b"], 1);
  assert.equal(st.points.b.due, S.addDays(later, 1));
  assert.deepEqual(S.mixups(st), [{ a: "a", b: "b", n: 1 }]);
});

test("a second answer the same day can demote but never promote", () => {
  const st = S.emptyState();
  S.record(st, { qid: "qa1", point: "a", ok: false, secs: 9, type: "p7", today: T });
  const p = S.record(st, { qid: "qa2", point: "a", ok: true, secs: 5, type: "p7", today: T });
  assert.equal(p.box, 1);
  assert.equal(p.due, S.addDays(T, 1));
  const q = S.record(st, { qid: "qa1", point: "a", ok: true, secs: 5, type: "p7", today: S.addDays(T, 1) });
  assert.equal(q.box, 2);
});

test("status moves from new to weak to automatic", () => {
  assert.equal(S.status(undefined), "new");
  const st = S.emptyState();
  S.record(st, { qid: "qa1", point: "a", ok: false, secs: 9, type: "p7", today: T });
  assert.equal(S.status(st.points.a), "weak");
  let d = T;
  for (let i = 0; i < 4; i++) {
    d = S.addDays(d, 20);
    S.record(st, { qid: "qa1", point: "a", ok: true, secs: 8, type: "p7", today: d });
  }
  assert.equal(S.status(st.points.a), "auto");
});

test("daily review: due first, then new, one question per point", () => {
  const st = S.emptyState();
  S.record(st, { qid: "qa1", point: "a", ok: false, secs: 9, type: "p7", today: T });
  const day2 = S.addDays(T, 1);
  const { items, counts } = S.buildDaily({ state: st, questions, points, today: day2, size: 3, newPerDay: 2, rng: S.mulberry32(1) });
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map((q) => q.point)).size, 3);
  assert.ok(items.some((q) => q.point === "a"));
  assert.equal(counts.fresh, 2);
});

test("daily review respects the lesson filter and the new-point quota", () => {
  const st = S.emptyState();
  const { items } = S.buildDaily({ state: st, questions, points: points.filter((p) => p.l === "2"), today: T, size: 10, newPerDay: 1, rng: S.mulberry32(2) });
  assert.ok(items.length >= 1);
  assert.ok(items.every((q) => q.point === "c" || q.point === "d"));
  assert.equal(S.newToday(st, T), 0);
});

test("least-seen question is picked for a point", () => {
  const st = S.emptyState();
  st.qs.qa1 = { seen: 3, right: 3 };
  const { items } = S.buildDaily({ state: st, questions, points: [points[0]], today: T, size: 1, newPerDay: 1, rng: S.mulberry32(3) });
  assert.equal(items[0].id, "qa2");
});

test("interleave avoids neighbours from the same group when it can", () => {
  const xs = [1, 1, 1, 2, 2, 2].map((g, i) => ({ g, i }));
  const out = S.interleave(xs, (x) => x.g, S.mulberry32(4));
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].g, out[i - 1].g);
});

test("mock section has the paper's shape and runs easy to hard", () => {
  const qs = [];
  for (let i = 0; i < 30; i++) qs.push(q7(`m${i}`, "a", { lv: 1 + (i % 3) }));
  for (let i = 0; i < 8; i++) qs.push({ id: `s${i}`, type: "p8", point: "b" });
  qs.push({ id: "t1", type: "p9", qs: [{ point: "c" }] });
  const m = S.buildMock({ state: S.emptyState(), questions: qs, rng: S.mulberry32(5) });
  assert.equal(m.filter((q) => q.type === "p7").length, 12);
  assert.equal(m.filter((q) => q.type === "p8").length, 5);
  assert.equal(m.filter((q) => q.type === "p9").length, 1);
  const lv = m.filter((q) => q.type === "p7").map((q) => q.lv);
  assert.deepEqual(lv, [...lv].sort());
});

test("set drills put contrasting questions first; pair drills lead with the pair", () => {
  const qs = [
    q7("x1", "a", { cp: ["a", "b", null, null] }),
    q7("x2", "a", { cp: ["a", "c", null, null] }),
    q7("x3", "c", { cp: ["c", "d", null, null], set: "s" }),
  ];
  const set = { id: "s", members: ["a", "b"] };
  const ids = S.buildSetDrill({ set, questions: qs, rng: S.mulberry32(6) }).map((q) => q.id);
  assert.deepEqual(ids.slice(0, 2).sort(), ["x1", "x3"]);
  assert.equal(ids[2], "x2");
  const pair = S.buildPairDrill({ a: "a", b: "b", questions: qs, rng: S.mulberry32(7) }).map((q) => q.id);
  assert.equal(pair[0], "x1");
});

// ---------- kanji ----------
const EN = { 驚く: "to be surprised", 驚き: "surprise", 暮らす: "to live", 暮れる: "to get dark", 範囲: "range", 模範: "model", 込む: "to be crowded", 申し込む: "to apply", 省略: "omission", 略す: "to abbreviate" };
const kw = (w, pos = "v") => ({ w, r: "よみ", en: EN[w], pos, s: `文の${w}です。`, t: w, tr: "よみ", rx: ["よに", "よみい", "ようみ"], wx: ["甲", "乙", "丙"], se: "x" });
const kanji = [
  { k: "驚", wk: 31, tier: 1, words: [kw("驚く"), kw("驚き", "n")] },
  { k: "暮", wk: 33, tier: 1, words: [kw("暮らす"), kw("暮れる")] },
  { k: "範", wk: 42, tier: 1, words: [kw("範囲", "n"), kw("模範", "n")] },
  { k: "込", wk: 28, tier: 2, words: [kw("込む"), kw("申し込む")] },
  { k: "略", wk: 29, tier: 2, words: [kw("省略", "n"), kw("略す")] },
];

test("kanji answers go to their own store and never touch the grammar quota", () => {
  const st = S.emptyState();
  S.record(st, { qid: "kr:驚:0", point: "驚", ok: true, secs: 5, type: "kr", today: T, store: "kanji", firstBox: 1 });
  assert.equal(st.kanji["驚"].box, 1);
  assert.equal(st.kanji["驚"].due, S.addDays(T, 1));
  assert.equal(S.newToday(st, T), 0);
  assert.equal(S.newToday(st, T, "kanji"), 1);
  assert.equal(st.days[T], undefined);
  assert.equal(st.kdays[T].n, 1);
});

test("kanji daily: teaching card first, its question at least three items later", () => {
  const st = S.emptyState();
  const { items, counts } = S.buildKanjiDaily({ state: st, kanji, today: T, size: 10, newPerDay: 3, rng: S.mulberry32(8) });
  assert.equal(counts.fresh, 3);
  const intros = items.filter((q) => q.type === "kn").map((q) => q.k);
  assert.deepEqual(intros, ["驚", "暮", "範"]);
  for (const k of intros) {
    const a = items.findIndex((q) => q.type === "kn" && q.k === k);
    const b = items.findIndex((q) => q.type !== "kn" && q.k === k);
    assert.ok(b > a, `${k} question after its card`);
    assert.ok(items[b].taught);
    assert.ok(["kr", "km"].includes(items[b].type), "no writing question before the kanji is known");
  }
});

test("kanji daily skips kanji the WaniKani level covers, and puts due ones first", () => {
  const st = S.emptyState();
  S.record(st, { qid: "kr:略:0", point: "略", ok: false, secs: 5, type: "kr", today: T, store: "kanji" });
  const day2 = S.addDays(T, 1);
  const { items } = S.buildKanjiDaily({ state: st, kanji, today: day2, size: 10, newPerDay: 10, wkLevel: 31, rng: S.mulberry32(9) });
  const intros = items.filter((q) => q.type === "kn").map((q) => q.k);
  assert.deepEqual(intros, ["暮", "範"], "驚 (31) and 込 (28) are WaniKani's");
  assert.ok(items.some((q) => q.type !== "kn" && q.k === "略"), "the due kanji is reviewed");
});

test("kanji questions: right answer first, meaning choices share the part of speech", () => {
  const rng = S.mulberry32(10);
  const r = S.kanjiQuestion({ kanji, x: kanji[0], wi: 0, type: "kr", rng });
  assert.deepEqual(r.c, ["よみ", "よに", "よみい", "ようみ"]);
  const w = S.kanjiQuestion({ kanji, x: kanji[0], wi: 0, type: "kw", rng });
  assert.equal(w.c[0], "驚く");
  const m = S.kanjiQuestion({ kanji, x: kanji[0], wi: 0, type: "km", rng });
  assert.equal(m.c[0], "to be surprised");
  assert.equal(new Set(m.c).size, 4);
  const verbs = new Set(kanji.flatMap((x) => x.words.filter((v) => v.pos === "v").map((v) => v.en)));
  for (const c of m.c) assert.ok(verbs.has(c));
});

test("kanji review rotates shapes: the least-seen shape comes next", () => {
  const st = S.emptyState();
  st.qs["kr:暮:0"] = { seen: 2, right: 2 };
  st.qs["kr:暮:1"] = { seen: 2, right: 2 };
  st.qs["km:暮:0"] = { seen: 1, right: 1 };
  st.qs["km:暮:1"] = { seen: 1, right: 1 };
  const q = S.pickKanjiQuestion({ state: st, kanji, x: kanji[1], box: 3, rng: S.mulberry32(11) });
  assert.equal(q.type, "kw");
});
