// Check one or more content files on their own: node tools/check.mjs content/read_r10.json …
// Picks the validator from the file name. Prints character counts for reading and listening items.
import path from "node:path";
import { readJSON, validateTexts, validateListening, validateVocab, charCount, scriptText } from "./lib.mjs";

let bad = 0;
for (const file of process.argv.slice(2)) {
  const base = path.basename(file);
  const data = readJSON(file);
  const errs = base.startsWith("read_") ? validateTexts(data, file) : base.startsWith("listen_") ? validateListening(data, file) : base.startsWith("vocab_") ? validateVocab(data, file) : [`${base}: no validator for this file name`];
  for (const e of errs) console.log(`✗ ${e}`);
  bad += errs.length;
  if (Array.isArray(data)) {
    const sizes = data.map((x) => (x.texts ? x.texts.map((t) => charCount(t.text)).join("+") : x.text ? charCount(x.text) : x.lines ? scriptText(x).replace(/\s/g, "").length : "")).join(" ");
    console.log(`${base}: ${data.length} items${sizes.trim() ? ` · chars ${sizes}` : ""}`);
  }
}
console.log(bad ? `${bad} problems` : "✓ no problems");
process.exit(bad ? 1 : 0);
