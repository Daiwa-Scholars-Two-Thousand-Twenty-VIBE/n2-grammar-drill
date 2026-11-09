# N2 文法ドリル · JLPT N2 grammar drill

A free drill for the JLPT N2, built to be the one app for the whole paper. Grammar is the core. Around it sit the vocabulary questions (問題3 to 6), a kanji gap section, the reading section (問題10 to 14, timed, with the method of 新完全マスター読解 N2 summed up technique by technique), the listening section (聴解 問題1 to 5, natural recorded voices, played once) and a log of your weekly hours and mock scores. The grammar follows the syllabus of **新完全マスター N2 文法** (Shin Kanzen Master N2 Grammar): all 26 lessons of 第1部, the Section IV review, 第2部 (sentence building) and 第3部 (text grammar).

**Use it here:** https://daiwa-scholars-two-thousand-twenty-vibe.github.io/n2-grammar-drill/

A copy also runs on Vercel, for networks that block GitHub (see [Hosting on Vercel](#hosting-on-vercel)).

It works on a phone, a laptop or an e-ink reader, and keeps working offline once you have opened it. No account. Progress stays in your browser. Syncing it between devices is optional (see below).

## What it trains

The grammar section does not ask what 〜に基づいて means. It gives you a sentence and four forms that all look possible, and you have about 25 seconds to pick the one that fits. Most wrong answers come from two things:

1. **Mixing up look-alikes.** 〜わりに vs 〜にしては, 〜にかかわらず vs 〜にもかかわらず, 〜あげく vs 〜末に.
2. **Being too slow.** Knowing the form but taking a minute to see it.

So the drill is built around those two:

- Every grammar point belongs to one or more **confusable sets**: the forms the exam plays against each other, with a one-line rule that tells them apart.
- Every question highlights its **cue** after you answer (the words that decide it, like 必ずしも, 私は, or a request at the end) and gives a one-line **tell**. The tell is the thing to learn.
- Every wrong choice comes with the rule that kills it.
- Answers are timed. Right but slow counts as not learned yet, and comes back tomorrow.

The vocabulary and notice questions work the same way: four choices, a one-line tell, and a note on why each wrong choice fails.

## The four tabs

| Tab | What is there |
|---|---|
| **今日 Today** | One plan for the day, in this order: Grammar, Vocab, Kanji, then Reading and Listening. One start button runs the next block that has something due. Reading and listening show as optional (dashed) blocks until the day set in Settings, then join the plan. |
| **練習 Practice** | Extra drills on top of Today: timed sections (grammar, vocab, reading, listening, full or half), reading by type or by technique, listening by type, weak spots, one question type at a time, and get-ahead drills. |
| **記録 Progress** | Your stats, a 14-day activity chart, hours this week against 18, mock scores, reading speed and accuracy by type and technique, listening accuracy and answer time, how much you have met, and your top mix-ups. |
| **資料 Library** | Look-up pages that are never scheduled: grammar points, confusable sets, cheat sheets, the kanji and vocab reference, the reading and listening tips, and Settings (daily amounts, sync, backup). |

## The modes

| Mode | What it does |
|---|---|
| **Today: grammar** | The main block. Points due for review plus a few new ones, mixed across lessons so you have to decide which family each question belongs to. A point you get right quickly comes back later and later (1, 2, 4, 8, 16 days). A miss brings it back tomorrow, and the form you confused it with comes back too. |
| **Today: vocab** | Vocabulary items due for review plus new ones, easiest first, with the three question types taken in turn. Set how many new items a day and how many per session in Settings (defaults 10 and 20). See below. |
| **Today: kanji** | The kanji block, see below. |
| **Mock section** | One grammar section in real exam shape: 12 問題7 questions from easy to phrase-level, 5 問題8 ★ questions and one 問題9 passage. Timed (about 15 minutes), no feedback until the end. |
| **Vocab mock** | A timed vocabulary section in paper order: 問題3, then 問題5, then 問題6, five items of each. |
| **情報検索 (問題14)** | One realistic notice and one to three questions about it. Timed. See below. |
| **Weak and single-type drills** | Your weakest grammar points, vocab words and kanji. Or one vocab type on its own: 語形成, 言い換え or 用法. |
| **Confusable sets** | Read the rules for one look-alike group, then drill only questions that play those forms against each other. |
| **One passage** | A 問題9 text with five blanks: connectives, こそあ, viewpoint, and how the writer ends a claim. |
| **All points** | Every point with its connection, register, restrictions and an example. Search it, see your status, drill one point. |
| **Cheat sheets** | Words that lock the ending (必ずしも → 〜わけではない), connectives, formal vs spoken pairs, the もの・こと・わけ families, and a restriction table built from every point. |
| **Custom drill** | Any range of lessons, any question types. |
| **Kanji gap** | 300 kanji that real N2 papers use but WaniKani teaches after level 27, most useful first. See below. |
| **Reading** | Today's set (the types in turn over a week), the full reading section (55 minutes, no answers until the end), a half section, one type, or one technique. See below. |
| **Listening** | Today's items, the full listening section (about 50 minutes, the paper's answer time per item), a half section, or one type. See below. |

Your top mix-ups (for example, "you reached for 〜にしては when it was 〜わりに") show in 記録 Progress. Tap one to drill the pair.

Keys: `1` to `4` to answer, `Enter` for next, `H` to show the cue before answering (it then counts as slow), `Space` or `P` to play a listening item, `Esc` to stop.

After a wrong answer, Next waits 1.5 seconds while a bar fills along it, so a quick second `Enter` cannot skip the tell and the reasons. Holding `Enter` down never skips it either. **Settings → Pause after a miss** changes the wait (none, 1, 1.5 or 3 seconds).

問題8 is scored the way the paper scores it: the piece in the ★ slot decides it. The full order is always shown afterwards.

## Using it for a month

A plan for someone who has been through the book once and has about four weeks before the exam.

- **Weeks 1 and 2:** Today, once a day. The grammar block takes 20 to 30 minutes; the vocab and kanji blocks come after it. At the default of 12 new points a day you meet every grammar point in about two weeks. After each session, open one confusable set and read its rules.
- **Week 3:** Today every day, plus one timed section (grammar, vocab or 情報検索) twice a week. After each grammar mock, drill the sets your misses came from.
- **Week 4:** A timed section every other day, at full speed. Today on the other days. Clear your top mix-ups.

Two habits matter more than the schedule:

- **Say the tell.** After each question, say why the answer is right in one line. If you can't, you got lucky.
- **Watch the clock.** If you are right but slow, the problem is reading speed, not grammar. Drill those points until they take under 25 seconds.

Still working through the book? Go to **Settings → I have studied up to** (Settings is in the 資料 Library tab) and pick your lesson. Today, mocks and passages then stay inside what you have covered.

## The kanji gap

WaniKani teaches kanji in its own order, so at level 27 you know about 950 kanji well but still meet unknown ones in nearly every N2 passage. In 17 past N2 papers, about 1 kanji in 13 is one WaniKani teaches after level 27. This section drills the 300 that matter most.

- **The list** is ranked by how many of 17 past N2 papers (2010 to 2018) each kanji appears in, with a bonus for the N3/N2 kanji lists and for newspaper frequency. The top 150 cover about 63% of those unknown-kanji appearances; all 300 cover about 84%.
- **Each kanji has 2 or 3 words** in an example sentence. A new kanji gets a teaching card first, then its first question a few items later.
- **Three question shapes:** the reading of an underlined word (like 問題1, with the exam's voicing, long-vowel and small っ traps), the right kanji for a word in kana (like 問題2, with look-alike kanji), and the meaning.
- **Same scheduling as grammar:** the kanji is the unit; each review uses a different word. Aim for 12 seconds a question.
- **Sound parts.** About half the kanji are built on a part that gives their on'yomi: 簡 has 門, read カン as in 間 and 関. The kanji card, the teaching card and the answer show that part and other kanji read the same way, the ones you already know from WaniKani first. It helps you guess the reading of a kanji you have never met.
- **Settings → My WaniKani level** leaves out kanji you have already reached in WaniKani. **New kanji per day** defaults to 10.

## Vocabulary and 情報検索

Three vocabulary question types and one reading type that the grammar drills miss:

- **問題3 語形成 (word formation).** One prefix or suffix goes in the blank to finish a word: 諸外国, 病気がち, 実用化. Target pace is 20 seconds.
- **問題5 言い換え類義 (closest meaning).** A word is underlined in a sentence. Pick the choice that means the same. Target pace is 25 seconds.
- **問題6 用法 (usage).** One word, four sentences. Pick the one that uses the word correctly. Target pace is 45 seconds.
- **問題14 情報検索 (information search).** A realistic notice made of headings, paragraphs, lists, tables and ※ notes, with one to three questions. Each one gives a person's situation and asks what they should do or pay. After you answer, the words that decide it are highlighted in the notice.

How it is scheduled:

- Each vocab item is its own unit of memory, with the same boxes as grammar (1, 2, 4, 8, 16 days). Vocab has its own review store and its own day log, so it never touches your grammar or kanji numbers. 情報検索 answers are kept apart too.
- The vocab block on Today takes due items first, then new ones. **Settings → New vocab items per day** (default 10) and **Vocab items per review** (default 20) set the size.
- The bank is small and still growing. `node tools/bundle.mjs` prints how many items each type has.

## Reading (問題10 to 14)

The reading section is where the July 2026 N3 paper was lost (18 of 60), and the cause was speed, not knowledge. So every text is timed, and the Progress tab tracks speed as well as accuracy.

- **48 original texts** in the paper's shapes: 問題10 short texts (about 200 characters, one question), 問題11 mid-length (about 500, three questions), 問題12 two texts A and B on one topic (two questions), 問題13 a long opinion essay (about 900, three questions), plus the 情報検索 notices. Underlined parts are numbered ①②③ as on the paper.
- **Each question is tagged with the technique it tests**, following 新完全マスター読解 N2: 対比 contrast, 言い換え restatement, 比喩 metaphor, 疑問提示 the writer's question, 主張表現 claim endings, 指示語 pointing words, who or what, underlined meaning, reasons, examples, the purpose of a practical text, and comparing A and B. After you answer, the deciding words are highlighted and the technique links to its tip sheet.
- **Wrong choices are built like the paper's:** true but about another part, half right, cause and effect turned round, the view the writer argues against, too wide or too narrow, sensible but not in the text. Each `why` names its trap.
- **Texts are not scheduled like flashcards** (you would remember the answers). They come least-read first, so the bank lasts. Today's set takes the types in turn: 問題10, 11, 12, 10, 13, 11, 14.
- **Speed:** each text has a paper pace (2:30 for 問題10, 6:00 for 問題11, 7:00 for 問題12, 10:00 for 問題13, 7:00 for 問題14). Results compare your time with it, and Progress shows your last five texts of each type as a multiple of pace, plus characters a minute.
- **Tips:** Library → Reading and listening tips holds the book's method in our own words, part by part, with the book's page numbers: signal words, steps, tips and traps for each technique and each part of the paper, and a drill button for each.

## Listening (聴解 問題1 to 5)

- **92 original scripts** in the paper's five shapes: 課題理解 (what the person does next), ポイント理解 (the one point asked), 概要理解 (the main point, nothing printed), 即時応答 (one line, pick the reply), 統合理解 (comparing options; one-question and two-question kinds).
- **Played once, as in the exam.** Read the printed choices, press play, close your eyes and listen; no pause and no replay until you have answered. Spoken choices (問題3, 4 and one-question 問題5) show as numbers only. Two-question 問題5 prints one list of options for both questions, as the paper does.
- **The answer clock** starts when the audio ends. In a timed section you get the paper's time (12 seconds, 8 for 問題4), then the next item plays by itself; an unanswered item counts as wrong.
- **After you answer:** the script with the deciding words highlighted, why each choice fails, and a button to listen again with the script in front of you.
- **The audio** is made from the scripts with Google's Gemini text-to-speech (natural voices, a different pair per item, a narrator for the paper's framing). There is no synthetic fallback: an item without its recording is not offered until the recording exists.
- **Scheduling:** items come least-heard first; one you missed comes back after three days. Today's items are mostly 問題1, 2 and 4, with one 問題3 or 5 in turn.

## Hours and mocks

- **Hours of Japanese** (Progress): the weekly goal is 18 hours. Time in the drill counts by itself (answer time, plus audio heard). Log the rest by hand: immersion, tutor lessons, the textbook, mock papers. The table shows the last four weeks.
- **Mock papers** (Progress): log each full mock as scaled scores out of 60 for 言語知識, 読解 and 聴解. The table marks a pass (90 of 180 and at least 19 in each section).
- Both sync between devices like everything else. A deleted entry stays as a marked row so the deletion syncs too.

## The Anki deck

For practice on the go there is a small deck in the same exam format: **[anki/n2-grammar-exam-style.apkg](anki/n2-grammar-exam-style.apkg)**.

- About 110 cards: 問題7 cards (a sentence with a blank and four numbered choices) and 問題8 ★ cards.
- The back shows the answer, the tell, and why each wrong choice fails.
- It uses different sentences from the web drill, so you are never just remembering a sentence you saw.
- It focuses on the classic traps: look-alike pairs, forms that ban a request or a wish after them, forms only for someone else's action, and register.

Import it with File → Import in Anki. About 15 new cards a day gets you through it in a week. Rebuilding the deck and importing again updates your existing cards instead of duplicating them.

## Progress and privacy

Everything is stored in your browser's local storage. Nothing is sent anywhere unless you turn on sync (next section). To move to another device by hand, use **Settings → Export progress**, then **Import progress** on the other device. **Download my misses as notes** gives you a markdown file of every question you have missed: grammar grouped by point, then kanji, vocab, reading and listening.

## Offline and on your home screen

Open the drill once while online and it keeps a copy of itself in the browser. After that it opens and runs with no connection: on a plane, on the subway, or on an e-reader with Wi-Fi off. Progress is saved as usual and syncs (if it is on) when you are back online.

To install it like an app, use **Add to Home Screen** (iPhone Safari: Share → Add to Home Screen) or the install button in Chrome's address bar.

- Online, it always loads the newest version from the site. The saved copy is only used when the network fails.
- Sync calls and the sync relay are never saved, so a device never merges with an old copy of your progress.

## Sync between devices

Optional. It keeps your progress the same on your phone and laptop, using one secret GitHub gist on your own GitHub account. There is no server of ours. The progress file is `n2-drill-progress.json`.

Set it up on each device:

1. Open **資料 Library → Settings → Sync between devices**, or go straight to [the token page](https://github.com/settings/tokens/new?scopes=gist&description=N2%20drill%20sync). It makes a **classic** token.
2. Tick **only the `gist` box**, pick an expiry date, press **Generate token** and copy it. GitHub shows it once.
3. Paste it into the sync card in Settings and press **Connect**.
4. Do the same on your other devices. The first device creates the gist; the others find it on your account.

How it behaves:

- It syncs when the page loads, after a session, 30 seconds after your last answer, when the page is hidden, and when the device comes back online.
- Nothing is lost whichever device syncs first. For each item, the copy that has seen it more wins (on a tie, the later last answer, then the earlier due date). Day logs and mix-up counts keep the larger number. Settings go to whichever device changed them last.
- A full reset on one device stamps the progress with a `reset` time. Your other devices adopt the reset instead of merging the old progress back in.
- The token stays in that browser's local storage (key `n2drill.sync.v1`) and is never synced.
- On the Vercel copy, sync calls go through the site's own relay (`api/gh.mjs`) instead of straight to GitHub. See below.

Security: pages on the same github.io address share one browser storage, so any other page you host there could read the token. That is why the token should have **only the `gist` scope**: it can then reach your gists and nothing else. Set an expiry date, and revoke the token at github.com/settings/tokens if you lose a device. A secret gist is not encrypted: anyone who has its link can read it. It holds your study progress, never the token.

## Hosting on Vercel

GitHub Pages is the main home, but some networks (a work laptop, for one) block every GitHub address. The same repo deploys to Vercel as it is, with no build step and no settings to change:

1. In Vercel, **Add New → Project**, import this repo, keep every default and press **Deploy**.
2. Every push to `main` then updates both copies.

Sync needs one extra piece there, because a network that blocks github.com usually blocks the GitHub API too. On any https address that is not github.io, the page sends sync calls to `api/gh` on its own site, and `api/gh.mjs` (a Vercel Function) passes them on to GitHub.

- It only passes on calls to the gist API (`/user`, `/gists`) and raw gist files. Anything else gets a 400.
- It forwards the token in the request header, as GitHub would get it, and keeps nothing.
- Its replies are never cached, so a device never merges with an old copy of the gist.

Your progress lives in each browser, per web address. The Vercel copy starts empty: turn on sync there with the same token, or use Export and Import. You will need to make the token on a device that can reach GitHub and bring it over.

## Running it yourself

There is no build step for the page. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Offline support (`sw.js`) only runs on `http://localhost` or https, not from `file://`. When the page starts loading a new file, add it to `FILES` in `sw.js`; `tests/test_offline.mjs` fails until you do.

## Adding or fixing questions

Questions live in `content/` as JSON. Read **[CONTENT_GUIDE.md](CONTENT_GUIDE.md)** first: it has the schema for every item type (grammar, vocab, 情報検索) and the quality bar (one defensible answer, distractors from the confusable set, natural Japanese, original sentences only). For vocab, a wrong choice must be wrong in every sense of the word. For 情報検索, every `cue` must appear word for word in the notice.

```bash
node tools/validate.mjs            # check the grammar question files (q7, q8, q9, anki) only
node tools/bundle.mjs --report     # validate everything (grammar, kanji, vocab, notices), rebuild js/data.js, print coverage per point
node --test tests/*.mjs            # scheduler, sync, relay and content tests
uv run --with genanki python tools/build_anki.py   # rebuild the Anki deck
python3 -I tools/build_sound_parts.py              # rebuild js/sound.js after changing the kanji list
node tools/check.mjs content/read_r10.json         # check one reading, listening or vocab file while writing it
```

### Listening audio

`tools/build_audio.py` turns every script in `content/listen_*.json` into `audio/<id>.m4a` with Gemini text-to-speech (needs `ffmpeg` and a `GEMINI_API_KEY` in the environment; never commit the key). It records each item's script hash in `content/audio.json` and only remakes items whose script changed, and it caches every voice clip in `tools/.audio_cache/` (ignored by git), so a rerun after a failure costs nothing for the parts already made.

```bash
GEMINI_API_KEY=... python3 tools/build_audio.py            # make what is missing or changed
GEMINI_API_KEY=... python3 tools/build_audio.py --check    # also transcribe each file and flag any below 90% match
node tools/bundle.mjs                                      # then rebuild js/data.js so the app knows about the new audio
```

The free Gemini tier allows only 10 text-to-speech requests a day, and the 92 items need about 355 (counted 9 Nov 2026), so the full build needs a key on a paid tier. Spoken choices are read in a fixed order per item (`spokenOrder` in `js/srs.js`, the same rule in the Python), so the app can show numbers that match the recording.

Use the `tests/*.mjs` glob. On Node 26, `node --test tests/` runs 0 tests and still exits 0, so it looks like a pass.

Commit the regenerated `js/data.js` (and the `.apkg` if you changed the Anki questions), since the live page serves them as they are.

| Path | What it is |
|---|---|
| `content/points.json` | Every grammar point: form, meaning, connection, register, restrictions, tell, example |
| `content/sets.json` | Confusable sets and the rule for each member |
| `content/rules.json` | The cheat-sheet tables |
| `content/q7_*.json`, `q8_*.json`, `q9_*.json` | Web drill questions |
| `content/anki_*.json` | Questions used only in the Anki deck |
| `content/kanji.json` | The kanji gap: tiers, look-alike glyphs, and each kanji with its words, sentences and distractors |
| `content/vocab_*.json` | Vocabulary items: 問題3 語形成 (`v3`), 問題5 言い換え類義 (`v5`), 問題6 用法 (`v6`) |
| `content/r14_*.json` | 問題14 情報検索 notices (`r14`) with their questions |
| `content/vocab_v4.json` | 問題4 文脈規定 (`v4`) items |
| `content/read_*.json` | Reading texts 問題10 to 13 (`r10` to `r13`) with their questions and techniques |
| `content/read_tips.json` | The reading and listening tips: 新完全マスター読解 N2 technique by technique, each part of the paper, each listening type |
| `content/listen_*.json` | Listening scripts 聴解 問題1 to 5 (`l1` to `l5`) |
| `content/audio.json` | Made by `tools/build_audio.py`: each item's length, script hash, voices and spoken order |
| `audio/` | The listening audio, one `.m4a` per item (AAC, about 40 kbps) |
| `js/srs.js` | Scheduling and session building for grammar, kanji, vocab, reading and listening, plus `mergeStates`, which combines two copies of progress (pure functions, tested in `tests/`) |
| `js/sync.js` | Gist sync: the GitHub gist client and `mergePayload` (no screens; tested with a fake `fetch`) |
| `js/app.js` | The screens: the four tabs, quizzes, Settings and the sync card |
| `api/gh.mjs` | The sync relay for the Vercel copy (a Vercel Function; GitHub Pages ignores it) |
| `js/data.js` | Generated by `tools/bundle.mjs`. Do not edit by hand |
| `js/sound.js` | Sound parts for the kanji gap. Generated by `tools/build_sound_parts.py` (CC BY-SA 4.0, see Notes). Do not edit by hand |
| `sw.js`, `manifest.webmanifest` | Offline support and the home screen icon |
| `tools/lib.mjs` | The validators for every content type |
| `tools/bundle.mjs` | Validates everything and writes `js/data.js` |
| `tools/build_sound_parts.py` | Writes `js/sound.js` from Kanjium and WaniKani's public level pages |
| `tools/check.mjs` | Validates one reading, listening or vocab file and prints text lengths |
| `tools/build_audio.py` | Makes the listening audio (see above) |
| `tests/` | `test_srs.mjs`, `test_sync.mjs`, `test_content.mjs`, `test_proxy.mjs`, `test_offline.mjs` |

## Notes

- All example sentences, reading texts and listening scripts are original. None are copied from the textbooks or from past papers. Lesson numbers and titles follow 新完全マスター N2 文法, and the reading tips follow the structure of 新完全マスター読解 N2 in our own words with page numbers, so you can use them side by side. Buy the books; this drill does not replace them and is not affiliated with their publisher or with the JLPT.
- Sound parts in `js/sound.js` are adapted from the [Kanjium](https://github.com/mifunetoshiro/kanjium) database by Uros O., under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); that file keeps the licence. Kanjium draws on KANJIDIC by the Electronic Dictionary Research and Development Group. The WaniKani level next to each kanji comes from WaniKani's public level pages.
- Mistakes happen. If an answer looks wrong or two choices both seem to work, open an issue with the question id (shown in exported notes).
