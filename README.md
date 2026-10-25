# N2 文法ドリル · JLPT N2 grammar drill

A free drill for the grammar section of the JLPT N2. It follows the syllabus of **新完全マスター N2 文法** (Shin Kanzen Master N2 Grammar): all 26 lessons of 第1部, the Section IV review, 第2部 (sentence building) and 第3部 (text grammar).

**Use it here:** https://daiwa-scholars-two-thousand-twenty-vibe.github.io/n2-grammar-drill/

It works on a phone, a laptop or an e-ink reader. No account. Progress stays in your browser.

## What it trains

The grammar section does not ask what 〜に基づいて means. It gives you a sentence and four forms that all look possible, and you have about 25 seconds to pick the one that fits. Most wrong answers come from two things:

1. **Mixing up look-alikes.** 〜わりに vs 〜にしては, 〜にかかわらず vs 〜にもかかわらず, 〜あげく vs 〜末に.
2. **Being too slow.** Knowing the form but taking a minute to see it.

So the drill is built around those two:

- Every grammar point belongs to one or more **confusable sets**: the forms the exam plays against each other, with a one-line rule that tells them apart.
- Every question highlights its **cue** after you answer (the words that decide it, like 必ずしも, 私は, or a request at the end) and gives a one-line **tell**. The tell is the thing to learn.
- Every wrong choice comes with the rule that kills it.
- Answers are timed. Right but slow counts as not learned yet, and comes back tomorrow.

## The modes

| Mode | What it does |
|---|---|
| **Today** | The main mode. Points due for review plus a few new ones, mixed across lessons so you have to decide which family each question belongs to. A point you get right quickly comes back later and later (1, 2, 4, 8, 16 days). A miss brings it back tomorrow, and the form you confused it with comes back too. |
| **Mock section** | One grammar section in real exam shape: 12 問題7 questions from easy to phrase-level, 5 問題8 ★ questions and one 問題9 passage. Timed (about 15 minutes), no feedback until the end. |
| **Confusable sets** | Read the rules for one look-alike group, then drill only questions that play those forms against each other. |
| **One passage** | A 問題9 text with five blanks: connectives, こそあ, viewpoint, and how the writer ends a claim. |
| **All points** | Every point with its connection, register, restrictions and an example. Search it, see your status, drill one point. |
| **Cheat sheets** | Words that lock the ending (必ずしも → 〜わけではない), connectives, formal vs spoken pairs, the もの・こと・わけ families, and a restriction table built from every point. |
| **Custom drill** | Any range of lessons, any question types. |

Your top mix-ups (for example, "you reached for 〜にしては when it was 〜わりに") show on the home screen. Tap one to drill the pair.

Keys: `1` to `4` to answer, `Enter` for next, `H` to show the cue before answering (it then counts as slow), `Esc` to stop.

問題8 is scored the way the paper scores it: the piece in the ★ slot decides it. The full order is always shown afterwards.

## Using it for a month

A plan for someone who has been through the book once and has about four weeks before the exam.

- **Weeks 1 and 2:** Today, once a day (20 to 30 minutes). At the default of 12 new points a day you meet every point in about two weeks. After each session, open one confusable set and read its rules.
- **Week 3:** Today every day, plus one mock section twice a week. After each mock, drill the sets your misses came from.
- **Week 4:** A mock every other day, at full speed. Today on the other days. Clear your top mix-ups.

Two habits matter more than the schedule:

- **Say the tell.** After each question, say why the answer is right in one line. If you can't, you got lucky.
- **Watch the clock.** If you are right but slow, the problem is reading speed, not grammar. Drill those points until they take under 25 seconds.

Still working through the book? Go to **Settings → I have studied up to** and pick your lesson. Today, mocks and passages then stay inside what you have covered.

## The Anki deck

For practice on the go there is a small deck in the same exam format: **[anki/n2-grammar-exam-style.apkg](anki/n2-grammar-exam-style.apkg)**.

- About 110 cards: 問題7 cards (a sentence with a blank and four numbered choices) and 問題8 ★ cards.
- The back shows the answer, the tell, and why each wrong choice fails.
- It uses different sentences from the web drill, so you are never just remembering a sentence you saw.
- It focuses on the classic traps: look-alike pairs, forms that ban a request or a wish after them, forms only for someone else's action, and register.

Import it with File → Import in Anki. About 15 new cards a day gets you through it in a week. Rebuilding the deck and importing again updates your existing cards instead of duplicating them.

## Progress and privacy

Everything is stored in your browser's local storage. Nothing is sent anywhere. To move to another device, use **Settings → Export progress**, then **Import progress** on the other device. **Download my misses as notes** gives you a markdown file of every question you have missed, grouped by grammar point.

## Running it yourself

There is no build step for the page. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Adding or fixing questions

Questions live in `content/` as JSON. Read **[CONTENT_GUIDE.md](CONTENT_GUIDE.md)** first: it has the schema and the quality bar (one defensible answer, distractors from the confusable set, natural Japanese, original sentences only).

```bash
node tools/validate.mjs            # check every content file
node tools/bundle.mjs --report     # validate, rebuild js/data.js, print coverage per point
node --test tests/*.mjs            # scheduler and content tests
uv run --with genanki python tools/build_anki.py   # rebuild the Anki deck
```

Commit the regenerated `js/data.js` (and the `.apkg` if you changed the Anki questions), since the live page serves them as they are.

| Path | What it is |
|---|---|
| `content/points.json` | Every grammar point: form, meaning, connection, register, restrictions, tell, example |
| `content/sets.json` | Confusable sets and the rule for each member |
| `content/rules.json` | The cheat-sheet tables |
| `content/q7_*.json`, `q8_*.json`, `q9_*.json` | Web drill questions |
| `content/anki_*.json` | Questions used only in the Anki deck |
| `js/srs.js` | Scheduling and session building (pure functions, tested in `tests/`) |
| `js/app.js` | The screens |
| `js/data.js` | Generated by `tools/bundle.mjs`. Do not edit by hand |

## Notes

- All example sentences are original. None are copied from the textbook or from past papers. Lesson numbers and titles follow 新完全マスター N2 文法 so you can use the two side by side. Buy the book; this drill does not replace it and is not affiliated with its publisher or with the JLPT.
- Mistakes happen. If an answer looks wrong or two choices both seem to work, open an issue with the question id (shown in exported notes).
