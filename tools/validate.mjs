// Validate content files. Usage:
//   node tools/validate.mjs                 (every question file)
//   node tools/validate.mjs content/q7_L01-05.json
import path from "node:path";
import { loadCatalog, questionFiles, readJSON, validateItems } from "./lib.mjs";

const catalog = loadCatalog();
const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.resolve(f)) : questionFiles();
const seen = new Set();
let errors = 0;
let total = 0;
for (const file of files) {
  let items;
  try {
    items = readJSON(file);
  } catch (e) {
    console.log(`✗ ${e.message}`);
    errors++;
    continue;
  }
  const res = validateItems(items, file, catalog, seen);
  total += Array.isArray(items) ? items.length : 0;
  for (const w of res.warnings) console.log(`  warn ${w}`);
  for (const e of res.errors) console.log(`✗ ${e}`);
  errors += res.errors.length;
  console.log(`${res.errors.length ? "✗" : "✓"} ${path.basename(file)}: ${Array.isArray(items) ? items.length : 0} items`);
}
console.log(`\n${total} items, ${errors} errors`);
process.exit(errors ? 1 : 0);
