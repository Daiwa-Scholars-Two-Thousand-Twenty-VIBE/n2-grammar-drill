// Reading notes: the teaching layer shown after a text's questions (see validateNotes in lib.mjs).
//   node tools/notes.mjs skeleton content/read_r10.json   write content/notes_r10.json with every sentence filled in
//                                                          and the fields to write left empty (keeps notes already there)
//   node tools/notes.mjs check content/notes_r10.json     validate one notes file
import fs from "node:fs";
import path from "node:path";
import { CONTENT, readJSON, textFiles, passageFiles, noteSentences, validateNotes } from "./lib.mjs";

const [cmd, ...files] = process.argv.slice(2);
const allTexts = () => [...textFiles(), ...passageFiles()].flatMap((f) => readJSON(f));
const outName = (f) => path.join(CONTENT, path.basename(f).replace(/^read_/, "notes_").replace(/^r14_main/, "notes_r14"));

if (cmd === "skeleton") {
  for (const file of files) {
    const out = outName(file);
    const have = fs.existsSync(out) ? readJSON(out) : {};
    const notes = {};
    for (const p of readJSON(file)) {
      if (have[p.id]) {
        notes[p.id] = have[p.id];
        continue;
      }
      const qs = p.qs.map((q) => ({ para: [], trap: q.c.map(() => "") }));
      notes[p.id] = p.type === "r14" ? { vocab: [], qs } : { shape: "", sents: noteSentences(p).map((x) => ({ ...x, en: "", role: "" })), hard: [], vocab: [], qs };
    }
    fs.writeFileSync(out, JSON.stringify(notes, null, 1) + "\n");
    console.log(`${path.basename(out)}: ${Object.keys(notes).length} texts`);
  }
} else if (cmd === "check") {
  const texts = allTexts();
  let bad = 0;
  for (const file of files) {
    const notes = readJSON(file);
    const errs = validateNotes(notes, file, texts);
    for (const e of errs) console.log(`✗ ${e}`);
    bad += errs.length;
    console.log(`${path.basename(file)}: ${Object.keys(notes).length} texts`);
  }
  console.log(bad ? `${bad} problems` : "✓ no problems");
  process.exit(bad ? 1 : 0);
} else {
  console.log("usage: node tools/notes.mjs skeleton <read file>… | check <notes file>…");
  process.exit(1);
}
