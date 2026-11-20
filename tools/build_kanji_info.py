#!/usr/bin/env python3
"""Build content/kanji_info.json: meaning, readings and WaniKani level for every kanji that
appears in a kanji-gap word but is not itself in the gap list (染 in 汚染, 省 in 反省).

The feedback screen uses it so a compound word shows every kanji in it, not only the one
being drilled. Gap kanji keep their own fuller entries in content/kanji.json.

Source: kanji.json from https://github.com/davidluzgouveia/kanji-data (MIT; built from
KANJIDIC2 and WaniKani). Download it, then:

    python3 tools/build_kanji_info.py path/to/kanji-data/kanji.json

Run it again whenever words are added to content/kanji.json; the bundle refuses a word
with a kanji that has no entry in either file.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAP = ROOT / "content" / "kanji.json"
OUT = ROOT / "content" / "kanji_info.json"


def is_kanji(ch):
    return "一" <= ch <= "鿿"


def kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def kun_form(r):
    # そ.める -> そ(める). Prefix and suffix forms (ひと-, -ぞめ) are left out.
    if r.startswith("-") or r.endswith("-"):
        return None
    head, _, tail = r.partition(".")
    return f"{head}({tail})" if tail else head


def meaning(d):
    wk = [m for m in d.get("wk_meanings") or [] if not m.startswith("^")]
    src = wk or (d.get("meanings") or [])[:2]
    return "; ".join(m.lower() for m in src)


def uniq(xs, n):
    out = []
    for x in xs:
        if x and x not in out:
            out.append(x)
    return out[:n]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    gap = json.loads(GAP.read_text(encoding="utf-8"))
    have = {x["k"] for x in gap["kanji"]}
    need = sorted({ch for x in gap["kanji"] for w in x["words"] for ch in w["w"] if is_kanji(ch) and ch not in have})
    info, missing = {}, []
    for ch in need:
        d = src.get(ch)
        if not d:
            missing.append(ch)
            continue
        info[ch] = {
            "m": meaning(d),
            "on": uniq([kata(r) for r in d.get("readings_on") or []], 3),
            "kun": uniq([kun_form(r) for r in d.get("readings_kun") or []], 3),
            "wk": d.get("wk_level") or 0,
        }
    body = ",\n".join(f" {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for k, v in info.items())
    OUT.write_text("{\n" + body + "\n}\n", encoding="utf-8")
    print(f"{len(info)} kanji written to {OUT.relative_to(ROOT)}")
    if missing:
        sys.exit(f"No source entry for: {''.join(missing)}")


if __name__ == "__main__":
    main()
