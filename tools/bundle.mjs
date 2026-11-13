// Validate content/ and build js/data.js for the browser.
//   node tools/bundle.mjs            build (fails on any error)
//   node tools/bundle.mjs --report   also print per-point coverage
// Anki-only files (content/anki_*.json) are validated but left out of the web bundle,
// so the deck and the drill never show the same sentence.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, CONTENT, loadCatalog, questionFiles, vocabFiles, passageFiles, textFiles, listenFiles, readJSON, validateItems, validateKanji, validateVocab, validatePassages, validateTexts, validateListening, charCount, plainText } from "./lib.mjs";

const report = process.argv.includes("--report");
const catalog = loadCatalog();
const rules = readJSON(path.join(CONTENT, "rules.json"));
const kanjiFile = path.join(CONTENT, "kanji.json");
const kanji = fs.existsSync(kanjiFile) ? readJSON(kanjiFile) : { tiers: [], glyphs: {}, kanji: [] };
const seen = new Set();
const errors = [...validateKanji(kanji)];
const web = [];
const anki = [];

for (const file of questionFiles()) {
  const items = readJSON(file);
  const res = validateItems(items, file, catalog, seen);
  errors.push(...res.errors);
  (path.basename(file).startsWith("anki_") ? anki : web).push(...items);
}

// Vocab (問題3, 5, 6) and 情報検索 notices (問題14) have their own schemas and are not tied to grammar points.
const vocab = [];
for (const file of vocabFiles()) {
  const items = readJSON(file);
  errors.push(...validateVocab(items, file, seen));
  if (Array.isArray(items)) vocab.push(...items);
}
// A notice's length, for reading speed: its title and every block, tables cell by cell.
const noticeChars = (p) =>
  charCount(p.title || "") +
  p.blocks.reduce((a, b) => a + [b.h, b.p, b.note, ...(b.ul || []), ...(b.table || []).flat()].filter(Boolean).reduce((x, t) => x + charCount(t), 0), 0);
const passages = [];
for (const file of passageFiles()) {
  const list = readJSON(file);
  errors.push(...validatePassages(list, file, seen));
  if (Array.isArray(list)) passages.push(...list.map((p) => ({ ...p, chars: noticeChars(p) })));
}

// Reading texts (問題10 to 13) and listening scripts (聴解 問題1 to 5). `chars` is stored for reading speed.
const texts = [];
for (const file of textFiles()) {
  const list = readJSON(file);
  errors.push(...validateTexts(list, file, seen));
  if (Array.isArray(list)) texts.push(...list.map((p) => ({ ...p, chars: p.texts ? p.texts.reduce((a, t) => a + charCount(t.text), 0) : charCount(p.text || "") })));
}
const listen = [];
for (const file of listenFiles()) {
  const list = readJSON(file);
  errors.push(...validateListening(list, file, seen));
  if (Array.isArray(list)) listen.push(...list);
}
// Audio made by tools/build_audio.py, which remakes an item whenever its script changes (rerun it after
// editing a script). `h` is that script's hash: it goes on the audio URL, so a remade file is fetched fresh.
const audioFile = path.join(CONTENT, "audio.json");
const audioAll = fs.existsSync(audioFile) ? readJSON(audioFile) : {};
const audio = {};
for (const it of listen) {
  const a = audioAll[it.id];
  if (a && fs.existsSync(path.join(ROOT, "audio", `${it.id}.m4a`))) audio[it.id] = { secs: a.secs, h: a.h, ...(a.order ? { order: a.order } : {}) };
}
// Lesson videos made by tools/build_videos.py, one per 第2部 and 第3部 point. Only those whose file is
// in video/ are offered. `h` (a hash of the file) goes on the URL, so a remade video is fetched fresh.
const videoFile = path.join(CONTENT, "videos.json");
const videoAll = fs.existsSync(videoFile) ? readJSON(videoFile) : {};
const videos = {};
for (const [id, v] of Object.entries(videoAll)) {
  if (!catalog.pointIds.has(id)) errors.push(`videos.json: ${id} is not a grammar point`);
  else if (!(v.secs > 0 && v.mb > 0 && v.h)) errors.push(`videos.json: ${id} needs secs, mb and h`);
  else if (fs.existsSync(path.join(ROOT, "video", `${id}.mp4`))) videos[id] = { secs: v.secs, mb: v.mb, h: v.h };
}
const tipsFile = path.join(CONTENT, "read_tips.json");
const tips = fs.existsSync(tipsFile) ? readJSON(tipsFile) : null;

// The same sentence must not appear twice anywhere (web or deck).
const norm = (s) => s.replace(/[\s（）()「」『』、。・]/g, "");
const sentenceOf = (q) => (q.type === "p7" ? q.s : q.type === "p8" ? q.pre + q.pieces.join("") + q.post : q.text);
const bySentence = new Map();
for (const q of [...web, ...anki]) {
  const key = norm(sentenceOf(q));
  if (bySentence.has(key)) errors.push(`duplicate sentence: ${bySentence.get(key)} and ${q.id}`);
  else bySentence.set(key, q.id);
}

if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`\n${errors.length} errors; js/data.js not written.`);
  process.exit(1);
}

// Coverage: how many web questions test each point.
const cover = Object.fromEntries(catalog.points.points.map((p) => [p.id, { p7: 0, p8: 0, p9: 0 }]));
for (const q of web) {
  if (q.type === "p9") q.qs.forEach((b) => cover[b.point].p9++);
  else cover[q.point][q.type]++;
}
const thin = Object.entries(cover).filter(([, c]) => c.p7 + c.p8 + c.p9 < 2).map(([id]) => id);

const data = {
  points: catalog.points.points,
  lessons: catalog.points.lessons,
  sections: catalog.points.sections,
  tagNames: catalog.points.tagNames,
  regNames: catalog.points.regNames,
  sets: catalog.sets.sets,
  sheets: rules.sheets,
  questions: web,
  kanji: kanji.kanji,
  kanjiTiers: kanji.tiers,
  glyphs: kanji.glyphs,
  vocab,
  passages,
  texts,
  listen,
  audio,
  videos,
  tips,
};
const json = JSON.stringify(data);
const version = crypto.createHash("sha1").update(json).digest("hex").slice(0, 8);
const out = `// Generated by tools/bundle.mjs from content/. Do not edit by hand.\nwindow.N2 = ${JSON.stringify({ version, ...data })};\n`;
fs.writeFileSync(path.join(ROOT, "js", "data.js"), out);

const byType = (t) => web.filter((q) => q.type === t).length;
console.log(`✓ js/data.js ${version}: ${byType("p7")} 問題7 · ${byType("p8")} 問題8 · ${byType("p9")} 問題9 passages · ${catalog.points.points.length} points · ${catalog.sets.sets.length} sets`);
console.log(`  Anki pool (not in web bundle): ${anki.length} items`);
console.log(`  Kanji gap: ${kanji.kanji.length} kanji · ${kanji.kanji.reduce((a, x) => a + x.words.length, 0)} words`);
const vType = (t) => vocab.filter((q) => q.type === t).length;
console.log(`  Vocab: ${vType("v3")} 問題3 · ${vType("v4")} 問題4 · ${vType("v5")} 問題5 · ${vType("v6")} 問題6 · ${passages.length} 問題14 notices`);
const tType = (t) => texts.filter((p) => p.type === t).length;
const lType = (t) => listen.filter((p) => p.type === t).length;
console.log(`  Reading: ${tType("r10")} 問題10 · ${tType("r11")} 問題11 · ${tType("r12")} 問題12 · ${tType("r13")} 問題13`);
console.log(`  Listening: ${lType("l1")} 問題1 · ${lType("l2")} 問題2 · ${lType("l3")} 問題3 · ${lType("l4")} 問題4 · ${lType("l5")} 問題5 · audio for ${Object.keys(audio).length}`);
console.log(`  Lesson videos: ${Object.keys(videos).length} · ${Math.round(Object.values(videos).reduce((a, v) => a + v.secs, 0) / 60)} min`);
if (thin.length) console.log(`  Points with fewer than 2 web questions: ${thin.join(", ")}`);
if (report) for (const [id, c] of Object.entries(cover)) console.log(`  ${id.padEnd(6)} p7 ${c.p7}  p8 ${c.p8}  p9 ${c.p9}`);
