"""Build the Anki deck from content/anki_*.json.

    uv run --with genanki python tools/build_anki.py

Writes anki/n2-grammar-exam-style.apkg. The deck uses its own sentences (the anki_ files),
never the web drill's, so the two never test you on the same sentence.

Cards look like the paper: a 問題7 card is the sentence with a blank and four numbered
choices; the back shows the answer, the one-line tell and why each wrong choice fails.
A 問題8 card shows the four pieces and asks which one goes in the ★ slot.

Model and deck ids are fixed, and each note's guid comes from its question id, so
re-importing a rebuilt deck updates existing cards instead of duplicating them.
"""
from __future__ import annotations

import hashlib
import html
import json
import sys
from pathlib import Path

import genanki

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
OUT = ROOT / "anki" / "n2-grammar-exam-style.apkg"

# Never change these: Anki matches re-imports on them.
MODEL_ID_P7 = 1761300001
MODEL_ID_P8 = 1761300002
DECK_ID = 1761300100
DECK_NAME = "JLPT N2 文法 (exam style)"
BLANK = "（　　）"

CSS = """
.card { font-family: 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif; font-size: 22px; text-align: center; line-height: 1.7; color: #1d1c19; background: #fff; }
.nightMode.card, .night_mode .card { color: #ecebe7; background: #1b1d22; }
.kind { font-size: 12px; color: #888; letter-spacing: 0.06em; margin-bottom: 10px; }
.q { text-align: left; display: inline-block; max-width: 34em; }
.opts { margin-top: 14px; font-size: 20px; }
.opts span { display: inline-block; margin: 2px 10px; }
.cloze { font-weight: 700; color: #2f5bd3; }
.nightMode .cloze, .night_mode .cloze { color: #7ea2ff; }
.tell { margin: 12px auto 8px; padding: 8px 12px; max-width: 32em; border-left: 4px solid #2f5bd3; background: rgba(47, 91, 211, 0.08); text-align: left; font-size: 17px; font-weight: 600; }
.en { font-size: 16px; color: #777; margin: 6px 0 10px; }
.why { text-align: left; max-width: 32em; margin: 0 auto; font-size: 15px; }
.why li { margin-bottom: 6px; }
.why b { font-size: 17px; }
.slot { display: inline-block; min-width: 3em; border-bottom: 2px solid currentColor; margin: 0 3px; }
.slot.star::before { content: '★'; }
.src { margin-top: 12px; font-size: 11px; color: #888; }
"""

P7_MODEL = genanki.Model(
    MODEL_ID_P7,
    "JLPT N2 Grammar 問題7 (exam style)",
    fields=[
        {"name": "Cloze"},
        {"name": "English"},
        {"name": "Tell"},
        {"name": "Why"},
        {"name": "GrammarTag"},
        {"name": "Source"},
    ],
    templates=[
        {
            "name": "Choose",
            "qfmt": '<div class="kind">問題7 · つぎの文の（　）に入れるのに最もよいもの</div><div class="q">{{cloze:Cloze}}</div>',
            "afmt": '<div class="kind">問題7</div><div class="q">{{cloze:Cloze}}</div><hr id="answer">'
            '<div class="tell">{{Tell}}</div><div class="en">{{English}}</div><div class="why">{{Why}}</div>'
            '<div class="src">{{GrammarTag}} · {{Source}}</div>',
        }
    ],
    model_type=genanki.Model.CLOZE,
    css=CSS,
)

P8_MODEL = genanki.Model(
    MODEL_ID_P8,
    "JLPT N2 Grammar 問題8 (exam style)",
    fields=[
        {"name": "Id"},
        {"name": "Front"},
        {"name": "Answer"},
        {"name": "English"},
        {"name": "Tell"},
        {"name": "Why"},
        {"name": "GrammarTag"},
        {"name": "Source"},
    ],
    templates=[
        {
            "name": "Star",
            "qfmt": '<div class="kind">問題8 · ★に入る最もよいもの</div><div class="q">{{Front}}</div>',
            "afmt": '{{FrontSide}}<hr id="answer"><div class="q">{{Answer}}</div>'
            '<div class="tell">{{Tell}}</div><div class="en">{{English}}</div><div class="why">{{Why}}</div>'
            '<div class="src">{{GrammarTag}} · {{Source}}</div>',
        }
    ],
    css=CSS,
)


def seeded(key: str) -> int:
    return int(hashlib.md5(key.encode("utf-8")).hexdigest()[:8], 16)


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def p7_note(q: dict, points: dict) -> genanki.Note:
    # Put the right answer in a position fixed by the id, so it is spread over 1 to 4.
    pos = seeded(q["id"]) % 4
    order = [1, 2, 3]
    order.insert(pos, 0)
    opts = "".join(f"<span>{n + 1} {esc(q['c'][k])}</span>" for n, k in enumerate(order))
    before, after = q["s"].split(BLANK)
    cloze = f"{esc(before)}（{{{{c1::{esc(q['c'][0])}}}}}）{esc(after)}<div class=\"opts\">{opts}</div>"
    why = "<ol>" + "".join(
        f"<li><b>{esc(q['c'][k])}</b>{' ✓' if k == 0 else ''}: {esc(q['why'][k])}</li>" for k in order
    ) + "</ol>"
    point = points[q["point"]]
    tags = ["N2grammar", "問題7", f"pt::{q['point']}"] + ([f"set::{q['set']}"] if q.get("set") else [])
    return genanki.Note(
        model=P7_MODEL,
        fields=[cloze, esc(q["en"]), esc(q["tell"]), why, f"{esc(point['form'])}（問題7）", f"N2 文法ドリル · {q['id']}"],
        guid=genanki.guid_for(q["id"]),
        tags=tags,
    )


def p8_note(q: dict, points: dict) -> genanki.Note:
    # Pieces in a fixed shuffled order, numbered 1 to 4 like the paper.
    order = sorted(range(4), key=lambda k: seeded(f"{q['id']}:{k}"))
    slots = "".join(f'<span class="slot{" star" if i == q["star"] else ""}">　</span>' for i in range(4))
    pieces = "".join(f"<span>{n + 1} {esc(q['pieces'][k])}</span>" for n, k in enumerate(order))
    front = f"{esc(q['pre'])}{slots}{esc(q['post'])}<div class=\"opts\">{pieces}</div>"
    star_num = order.index(q["star"]) + 1
    built = "".join(
        f"<b class=\"cloze\">[★{esc(p)}]</b>" if i == q["star"] else esc(p) for i, p in enumerate(q["pieces"])
    )
    answer = f"★ = {star_num} {esc(q['pieces'][q['star']])}<br>{esc(q['pre'])}{built}{esc(q['post'])}"
    point = points[q["point"]]
    tags = ["N2grammar", "問題8", f"pt::{q['point']}"]
    return genanki.Note(
        model=P8_MODEL,
        fields=[q["id"], front, answer, esc(q["en"]), esc(q["tell"]), esc(q["why"]), f"{esc(point['form'])}（問題8）", f"N2 文法ドリル · {q['id']}"],
        guid=genanki.guid_for(q["id"]),
        tags=tags,
    )


def main() -> int:
    points = {p["id"]: p for p in json.loads((CONTENT / "points.json").read_text("utf-8"))["points"]}
    items = []
    for f in sorted(CONTENT.glob("anki_*.json")):
        items += json.loads(f.read_text("utf-8"))
    if not items:
        print("No content/anki_*.json files found.")
        return 1
    deck = genanki.Deck(DECK_ID, DECK_NAME, description="Exam-format JLPT N2 grammar: 問題7 choices and 問題8 ★ ordering. From the N2 文法ドリル project.")
    counts = {"p7": 0, "p8": 0}
    for q in items:
        if q["type"] == "p7":
            deck.add_note(p7_note(q, points))
        elif q["type"] == "p8":
            deck.add_note(p8_note(q, points))
        else:
            continue
        counts[q["type"]] += 1
    OUT.parent.mkdir(exist_ok=True)
    genanki.Package(deck).write_to_file(str(OUT))
    print(f"✓ {OUT.relative_to(ROOT)}: {counts['p7']} 問題7 + {counts['p8']} 問題8 = {sum(counts.values())} cards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
