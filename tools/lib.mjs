// Shared loading and validation for the content/ JSON files.
// Used by tools/validate.mjs, tools/bundle.mjs and the tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTENT = path.join(ROOT, "content");
export const BLANK = "（　　）";
const EM_DASH = /[—–]/;

export function readJSON(file) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path.basename(file)}: invalid JSON (${e.message})`);
  }
}

export function loadCatalog() {
  const points = readJSON(path.join(CONTENT, "points.json"));
  const sets = readJSON(path.join(CONTENT, "sets.json"));
  const pointIds = new Set(points.points.map((p) => p.id));
  const setIds = new Set(sets.sets.map((s) => s.id));
  return { points, sets, pointIds, setIds };
}

export function questionFiles() {
  return fs
    .readdirSync(CONTENT)
    .filter((f) => /^(q7|q8|q9|anki)_.*\.json$/.test(f))
    .sort()
    .map((f) => path.join(CONTENT, f));
}

const count = (hay, needle) => hay.split(needle).length - 1;

function checkEnglish(err, where, ...texts) {
  for (const t of texts.flat()) {
    if (typeof t === "string" && EM_DASH.test(t)) err(`${where}: English text contains an em or en dash`);
  }
}

function checkChoices(err, where, q, catalog) {
  if (!Array.isArray(q.c) || q.c.length !== 4) return err(`${where}: c must have 4 choices`);
  if (q.c.some((x) => typeof x !== "string" || !x.trim())) err(`${where}: empty choice`);
  if (new Set(q.c).size !== 4) err(`${where}: duplicate choices`);
  if (!Array.isArray(q.cp) || q.cp.length !== 4) err(`${where}: cp must have 4 entries`);
  else q.cp.forEach((id, i) => { if (id !== null && !catalog.pointIds.has(id)) err(`${where}: cp[${i}] unknown point "${id}"`); });
  if (!Array.isArray(q.why) || q.why.length !== 4 || q.why.some((x) => typeof x !== "string" || !x.trim())) err(`${where}: why must have 4 non-empty notes`);
  if (typeof q.tell !== "string" || !q.tell.trim()) err(`${where}: missing tell`);
  else if (q.tell.length > 160) err(`${where}: tell is ${q.tell.length} chars (keep it under ~110)`);
  checkEnglish(err, where, q.why || [], q.tell || "");
}

function checkCue(err, where, cue, text) {
  if (!Array.isArray(cue) || cue.length < 1 || cue.length > 3) return err(`${where}: cue must list 1 to 3 substrings`);
  for (const c of cue) {
    if (typeof c !== "string" || !c) err(`${where}: empty cue`);
    else if (!text.includes(c)) err(`${where}: cue "${c}" is not in the text`);
    else if (c.includes("（") || c.includes("{")) err(`${where}: cue "${c}" overlaps a blank`);
  }
}

// content/kanji.json: { tiers, glyphs, kanji }. Each kanji has 2 or 3 words; each word has a
// sentence `s` holding the target `t` once, its reading `tr`, three wrong readings `rx` (same
// trailing kana) and three wrong spellings `wx` (only kanji changed).
const HIRA = /^[ぁ-ゖー]+$/;
const KANJI = /[一-鿿々]/;
const POS = new Set(["n", "v", "adj", "na", "adv", "other"]);
const trailingKana = (s) => /[ぁ-ゖー]*$/.exec(s)[0];

export function validateKanji(data) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!data || !Array.isArray(data.kanji) || !Array.isArray(data.tiers) || typeof data.glyphs !== "object") return ["kanji.json: needs tiers, glyphs and kanji"];
  const tiers = new Set(data.tiers.map((t) => t.id));
  const seen = new Set();
  data.kanji.forEach((x, i) => {
    const where = `kanji[${i}] ${x && x.k}`;
    if (!x || typeof x.k !== "string" || [...x.k].length !== 1) return err(`${where}: k must be one kanji`);
    if (seen.has(x.k)) err(`${where}: duplicate kanji`);
    seen.add(x.k);
    if (!tiers.has(x.tier)) err(`${where}: unknown tier ${x.tier}`);
    if (typeof x.mean !== "string" || !x.mean.trim()) err(`${where}: missing mean`);
    if (!Array.isArray(x.on) || !Array.isArray(x.kun)) err(`${where}: on and kun must be lists`);
    if (!Array.isArray(x.look)) err(`${where}: look must be a list`);
    else for (const g of x.look) if (!data.glyphs[g]) err(`${where}: no glyph entry for look-alike ${g}`);
    if (!Array.isArray(x.words) || x.words.length < 2 || x.words.length > 3) return err(`${where}: needs 2 or 3 words`);
    x.words.forEach((w, j) => {
      const at = `${where} word ${j} ${w.w}`;
      for (const f of ["w", "r", "en", "pos", "s", "t", "tr", "se"]) if (typeof w[f] !== "string" || !w[f]) return err(`${at}: missing ${f}`);
      if (!POS.has(w.pos)) err(`${at}: bad pos ${w.pos}`);
      if (!HIRA.test(w.r) || !HIRA.test(w.tr)) err(`${at}: r and tr must be hiragana`);
      if (w.s.split(w.t).length !== 2) err(`${at}: t must appear once in s`);
      if (!w.t.includes(x.k)) err(`${at}: t must contain ${x.k}`);
      if (w.s.replace(w.t, "").includes(x.k)) err(`${at}: ${x.k} leaks outside t`);
      const suf = trailingKana(w.t);
      if (!Array.isArray(w.rx) || w.rx.length !== 3 || new Set([w.tr, ...w.rx]).size !== 4) err(`${at}: rx needs 3 distinct wrong readings`);
      else for (const r of w.rx) if (!HIRA.test(r) || !r.endsWith(suf)) err(`${at}: rx ${r} must be hiragana ending in ${suf}`);
      if (!Array.isArray(w.wx) || w.wx.length !== 3 || new Set([w.t, ...w.wx]).size !== 4) err(`${at}: wx needs 3 distinct wrong spellings`);
      else
        for (const s of w.wx) {
          if ([...s].length !== [...w.t].length) err(`${at}: wx ${s} must match the length of ${w.t}`);
          else if ([...s].some((ch, n) => ch !== [...w.t][n] && !(KANJI.test(ch) && KANJI.test([...w.t][n])))) err(`${at}: wx ${s} may only change kanji`);
          for (const ch of s) if (KANJI.test(ch) && !w.t.includes(ch) && !data.glyphs[ch]) err(`${at}: no glyph entry for ${ch}`);
        }
      checkEnglish(err, at, w.en, w.se, x.mean);
    });
  });
  return errors;
}

export function validateItems(items, file, catalog, seenIds = new Set()) {
  const errors = [];
  const warnings = [];
  const name = path.basename(file);
  if (!Array.isArray(items)) return { errors: [`${name}: top level must be an array`], warnings };
  items.forEach((q, i) => {
    const where = `${name}[${i}] ${q && q.id ? q.id : "(no id)"}`;
    const err = (m) => errors.push(m);
    if (!q || typeof q !== "object") return err(`${where}: not an object`);
    if (!q.id) err(`${where}: missing id`);
    else if (seenIds.has(q.id)) err(`${where}: duplicate id`);
    else seenIds.add(q.id);
    if (q.type === "p7") {
      if (!catalog.pointIds.has(q.point)) err(`${where}: unknown point "${q.point}"`);
      if (q.set !== undefined && !catalog.setIds.has(q.set)) err(`${where}: unknown set "${q.set}"`);
      if (typeof q.s !== "string" || count(q.s, BLANK) !== 1) err(`${where}: s must contain exactly one ${BLANK}`);
      if (typeof q.en !== "string" || !q.en.trim()) err(`${where}: missing en`);
      checkEnglish(err, where, q.en || "");
      checkChoices(err, where, q, catalog);
      if (typeof q.s === "string") checkCue(err, where, q.cue, q.s);
      if (![1, 2, 3].includes(q.lv)) err(`${where}: lv must be 1, 2 or 3`);
      if (Array.isArray(q.cp) && q.cp[0] !== null && q.cp[0] !== q.point) warnings.push(`${where}: cp[0] (${q.cp[0]}) differs from point (${q.point})`);
    } else if (q.type === "p8") {
      if (!catalog.pointIds.has(q.point)) err(`${where}: unknown point "${q.point}"`);
      if (!Array.isArray(q.pieces) || q.pieces.length !== 4) err(`${where}: pieces must have 4 entries`);
      else if (new Set(q.pieces).size !== 4 || q.pieces.some((p) => !p || typeof p !== "string")) err(`${where}: pieces must be 4 distinct non-empty strings`);
      if (![0, 1, 2, 3].includes(q.star)) err(`${where}: star must be 0 to 3`);
      if (typeof q.pre !== "string" || typeof q.post !== "string") err(`${where}: pre and post must be strings`);
      for (const f of ["en", "tell", "why"]) if (typeof q[f] !== "string" || !q[f].trim()) err(`${where}: missing ${f}`);
      checkEnglish(err, where, q.en || "", q.tell || "", q.why || "");
    } else if (q.type === "p9") {
      if (typeof q.text !== "string") return err(`${where}: missing text`);
      if (!Array.isArray(q.qs) || q.qs.length < 3 || q.qs.length > 5) return err(`${where}: qs must have 3 to 5 blanks`);
      const marks = [...q.text.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
      const want = q.qs.map((_, k) => k + 1);
      if (marks.join(",") !== want.join(",")) err(`${where}: text blanks ${marks.join(",")} do not match ${want.join(",")}`);
      if (q.text.length < 250 || q.text.length > 900) warnings.push(`${where}: text is ${q.text.length} chars`);
      for (const f of ["title", "en"]) if (typeof q[f] !== "string" || !q[f].trim()) err(`${where}: missing ${f}`);
      checkEnglish(err, where, q.en || "");
      q.qs.forEach((b, k) => {
        const w = `${where} blank ${k + 1}`;
        if (!catalog.pointIds.has(b.point)) err(`${w}: unknown point "${b.point}"`);
        checkChoices((m) => errors.push(m), w, b, catalog);
        checkCue((m) => errors.push(m), w, b.cue, q.text);
      });
    } else {
      err(`${where}: type must be p7, p8 or p9`);
    }
  });
  return { errors, warnings };
}
