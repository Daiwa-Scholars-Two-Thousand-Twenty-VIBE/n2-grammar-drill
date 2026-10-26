# Content guide

How questions are written for this drill. Read this before adding or editing anything in `content/`.

The drill trains one skill: **seeing a sentence and knowing which grammar form to reach for.** The JLPT does not ask "what does 〜に基づいて mean?". It asks you to pick 〜に基づいて over 〜をもとに in a sentence where only one fits. Every question here is built for that choice.

## Files

| File | What it holds |
|---|---|
| `content/points.json` | Every grammar point (id, form, meaning, connection, register, tags, the **tell**, one example). The single source of truth for ids. |
| `content/sets.json` | Confusable sets: points the exam plays against each other, with a one-line rule per member. |
| `content/rules.json` | Cheat-sheet tables (locked endings, connectives, register swaps, もの・こと・わけ families). |
| `content/q7_*.json` | 問題7 questions (文法形式の判断): one blank, four choices. |
| `content/q8_*.json` | 問題8 questions (文の組み立て): four pieces, find the ★ piece. |
| `content/q9_*.json` | 問題9 passages (文章の文法): a short text with four or five blanks. |
| `content/anki_*.json` | Questions reserved for the Anki deck. Same schema. Not served in the web drill, so the deck and the drill never show the same sentence. |

All content files are **strict JSON** (no comments, no trailing commas). Run `node tools/bundle.mjs` after editing; it validates everything and rebuilds `js/data.js`.

## 問題7 schema

```json
{
  "id": "7-L01-003",
  "type": "p7",
  "point": "1-3",
  "set": "instant",
  "s": "私は疲れてベッドに（　　）、すぐに深い眠りに落ちてしまった。",
  "en": "Exhausted, the instant I got into bed, I fell fast asleep.",
  "c": ["入ったとたんに", "入ったかと思うと", "入るにあたって", "入る最中に"],
  "cp": ["1-3", "1-4", "1-2", "2-1"],
  "why": [
    "〜たとたん(に): the instant you did something, a surprise followed. It works for your own action.",
    "〜かと思うと is only for watching someone or something else. Here the subject is 私.",
    "〜にあたって marks a one-off milestone (starting a job, opening a shop). Going to bed is not one.",
    "〜最中に means 'in the middle of' an activity, and needs ている形 or a noun: 入っている最中."
  ],
  "cue": ["私は", "すぐに"],
  "tell": "Your own sudden action plus an unexpected result: たとたん, not かと思うと.",
  "lv": 2
}
```

| Field | Rule |
|---|---|
| `id` | Unique. Prefix with the file's scope, e.g. `7-L01-003`, `7-IV-004`, `7-EN-010`, `A7-012` for Anki. |
| `point` | The id (from `points.json`) of the point the correct answer tests. |
| `set` | Optional. A `sets.json` id when the distractors come from that set. |
| `s` | The sentence. **Exactly one blank, written `（　　）`** (full-width brackets, two full-width spaces). |
| `en` | Natural English translation of the whole sentence with the correct answer in. |
| `c` | Four choices. **`c[0]` is always the correct answer.** The app shuffles them. No numbers. |
| `cp` | Four entries, parallel to `c`: the point id each choice represents, or `null`. |
| `why` | Four entries, parallel to `c`. `why[0]` says what the correct form does and why it fits. `why[1..3]` each name **the rule that kills that choice** (connection, meaning, banned ending, register, whose action). One or two sentences each. |
| `cue` | One to three **exact substrings of `s`** (outside the blank) that decide the answer. The app highlights them. Pick the words a fast reader should notice: an adverb (必ずしも, 危うく), the ending (〜ましょう, 〜ない), the subject (私は), the word in front (調べた). |
| `tell` | One line, under about 110 characters: the signal and the form it points to. This is what the learner should take away. |
| `lv` | 1 = the form itself, cleanly cued. 2 = needs a restriction or a trap (banned ending, whose action, register). 3 = phrase level, like the later questions in a real paper (the form combined with conjugation, keigo, causative or a sentence-final judgement). |

## 問題8 schema

```json
{
  "id": "8-012",
  "type": "p8",
  "point": "21-4",
  "pre": "引っ越しのとき、古い本は",
  "post": "捨ててしまった。",
  "pieces": ["一冊", "として", "残さず", "すべて"],
  "star": 2,
  "en": "When I moved, I threw out every single old book without keeping one.",
  "tell": "一 + counter + として locks in a negative: 一冊として残さず.",
  "why": "Start from the fixed shape 一冊として, which must be followed by a negative: 残さず. すべて then goes with 捨ててしまった."
}
```

| Field | Rule |
|---|---|
| `pieces` | Four pieces **in the correct order**. The app shuffles them. Each piece is distinct. |
| `star` | 0-based index of the ★ slot among the four blanks. Real papers most often star the third slot (index 2); vary it. |
| `pre` / `post` | Text before and after the four blanks. `pre + pieces.join("") + post` must read as one natural sentence. Dialogue is fine: `pre` may be `A「…」　B「` and `post` may end with `」`. |
| `why` | How to solve it: which piece anchors, then the order. Under about 300 characters. |

**Only one order may be grammatical.** Check every other order. If two orders work, rewrite. The app scores the ★ piece, as the paper does, so as a last resort a floating word (たとえ, なにも, 今から) may have a second natural position as long as the ★ slot holds the same piece in both orders.

## 問題9 schema

```json
{
  "id": "9-003",
  "type": "p9",
  "title": "「便利」の代償",
  "intro": "以下は、新聞のコラムである。",
  "text": "…本文… {1} …本文… {2} …",
  "en": "Two or three sentences of English summary.",
  "qs": [
    {
      "point": "P3-10",
      "c": ["ところが", "そのうえ", "つまり", "なぜなら"],
      "cp": ["P3-10", "P3-10", "P3-10", "P3-10"],
      "why": ["…", "…", "…", "…"],
      "cue": ["exact substring of text"],
      "tell": "…"
    }
  ]
}
```

- `text` is 350 to 650 characters, written in the register of a column, essay, letter or explanation. Blanks are `{1}` to `{5}`, in order.
- Four or five blanks. Across the set, cover: connectives (P3-10), こそあ and rephrasing (P3-8, P3-11), viewpoint and voice (P3-4 to P3-7), sentence-final judgement (〜のではないだろうか, 〜と言わざるを得ない, 〜わけではない), and 第1部 grammar.
- Choices may be long phrases, as in real papers.
- `cue` substrings must appear verbatim in `text`.

## Kanji schema

`content/kanji.json` holds `tiers`, `glyphs` (meaning and one reading for every look-alike and every kanji used in a wrong spelling, so the feedback can say what the wrong kanji means) and `kanji`, stored in rank order.

```json
{
  "k": "暮", "rank": 96, "tier": 1, "mean": "make a living; evening",
  "on": ["ボ"], "kun": ["く(れる)", "く(らす)"], "wk": 33, "papers": 6,
  "look": ["墓", "幕", "募"],
  "words": [
    {
      "w": "暮らす", "r": "くらす", "en": "to live, to get by", "pos": "v",
      "s": "祖父は今も山の小さな村で一人で暮らしている。",
      "t": "暮らして", "tr": "くらして",
      "rx": ["ぐらして", "ぼらして", "こらして"],
      "wx": ["墓らして", "幕らして", "募らして"],
      "se": "My grandfather still lives alone in a small mountain village."
    }
  ]
}
```

| Field | Rule |
|---|---|
| `words` | 2 or 3, the ones an N2 reader meets most. |
| `s`, `t` | `t` is the underlined part of `s`, exactly once. The kanji `k` must not appear in `s` outside `t`, or the 表記 question gives itself away. |
| `tr`, `rx` | The reading of `t` and three wrong ones. Only the kanji part changes: all four end in the same kana. None may be a valid reading of the word. |
| `wx` | Three wrong spellings of `t`: look-alike or same-sound kanji, same kana. None may be a real spelling of the same word (暖かい and 温かい are both real). |
| `pos` | `n`, `v`, `adj`, `na`, `adv` or `other`. Meaning questions draw their wrong answers from other words with the same `pos`. |

## The quality bar

1. **One right answer.** Every distractor must be wrong by a rule you can name. If a native speaker could defend a distractor, change it. This is the most important rule.
2. **Distractors should fit the grammar around the blank.** Where possible, all four choices attach correctly to the words before and after the blank, so the choice is decided by meaning or restriction, not by a broken connection. Exception: level 1 questions that deliberately test the connection.
3. **Distractors come from the confusable set first.** The exam plays look-alikes against each other (〜わりに vs 〜にしては, 〜にかかわらず vs 〜にもかかわらず). Use `sets.json`.
4. **Natural, adult Japanese.** Formal written register by default; dialogue where the point is spoken. Vocabulary at about JLPT N2. Sentences are usually 25 to 60 characters, rarely over 80.
5. **Original sentences only.** Do not copy sentences from 新完全マスター, from the example sentences in `points.json`, or from real JLPT papers. Changing a couple of words does not make a sentence original.
6. **The cue is honest.** It must be the actual signal that decides the answer, and it must be in the sentence.
7. **English:** plain, short sentences. No em dashes; use commas, colons or full stops.
8. **Spread the contexts:** news, notices, workplace email, essays, conversation between friends, a boss and a junior.

## Calibration against the real exam

Real N2 問題7 sets run from easy to hard. The first half asks for a bare form (〜に応じて, 〜うちに, 〜にわたり, 〜一方だ, 〜がたい). The second half is phrase level: the grammar point comes wrapped in conjugation, keigo, causative or a sentence-final judgement, for example choosing between four versions of "would you let me do it" (〜させていただけないでしょうか and three near-misses), or between four ways to end a sentence with an opinion (〜のではないだろうか and near-misses). Level 3 questions copy that second half.

問題8 pieces are short (one to eight characters). The fastest route is to find the piece that carries a fixed shape (たとえ, なにも, 一〜として, といった + noun) and build out from it.

問題9 passages are columns and short essays. The blanks test connectives, what これ／その refers to, viewpoint (〜てくる, passive), and how the writer ends a claim.
