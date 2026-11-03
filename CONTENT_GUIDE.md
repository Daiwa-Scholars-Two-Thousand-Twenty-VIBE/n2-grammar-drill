# Content guide

How questions are written for this drill. Read this before adding or editing anything in `content/`.

The drill trains one skill: **seeing a sentence and knowing which grammar form to reach for.** The JLPT does not ask "what does 〜に基づいて mean?". It asks you to pick 〜に基づいて over 〜をもとに in a sentence where only one fits. Every question here is built for that choice. The vocabulary questions (問題3, 5, 6) and the 情報検索 notices (問題14) follow the same idea, four choices with a rule that kills each wrong one, but they have their own schemas and rules, further down.

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
| `content/kanji.json` | The kanji gap: tiers, look-alike glyphs and each kanji with its words. |
| `content/vocab_*.json` | Vocabulary items: 問題3 語形成 (`v3`), 問題5 言い換え類義 (`v5`) and 問題6 用法 (`v6`). Not tied to grammar points. Any file may hold any of the three types; today there is one file per type. |
| `content/r14_*.json` | 問題14 情報検索 notices (`r14`): one realistic notice with 1 to 3 questions. |

All content files are **strict JSON** (no comments, no trailing commas). Run `node tools/bundle.mjs` after editing; it validates everything (grammar, kanji, vocab, notices) and rebuilds `js/data.js`. Ids must be unique across all of these files together.

`node tools/validate.mjs` is narrower: it reads only the grammar question files (`q7_`, `q8_`, `q9_`, `anki_`). It does not check vocab or notices. Use `bundle.mjs` or `node --test tests/*.mjs` for those.

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

## Vocabulary schemas (問題3, 5, 6)

Three item types share one file family, `content/vocab_*.json`. Each file is an array. The validator is `validateVocab` in `tools/lib.mjs`. Each item is its own unit of memory in the app (one affix, one word in a sentence, or one word across four sentences), kept in the `vocab` store.

Fields every vocab item has:

| Field | Rule |
|---|---|
| `id` | Unique across all content files. `v3-001`, `v5-001`, `v6-001`. |
| `type` | `v3`, `v5` or `v6`. |
| `w` | The target word. Required. |
| `r` | Its reading, in kana only (hiragana or katakana, `ー` and `・` allowed). Required. |
| `m` | Short English meaning. Required. |
| `c` | Four distinct, non-empty choices. **`c[0]` is always the correct answer.** The app shuffles them. |
| `why` | Four non-empty notes, parallel to `c`. `why[0]` says why the right choice is right. `why[1..3]` each name **the rule that kills that choice**. |
| `tell` | One line, non-empty. The validator fails it at 160 characters; aim for under 110. |
| `lv` | `1` or `2`, nothing else. New items are introduced level 1 first. Roughly: 1 for a common word or affix with a plain contrast, 2 for a rarer one or a closer call. |

`m`, `en`, `why` and `tell` may not contain an em dash or an en dash.

### 問題3 語形成 (`type: "v3"`)

One affix goes in the blank, right before or after a stem. The finished word is the answer. Choices are affixes, so each is **3 characters or fewer** (`不`, `気味`, `だらけ`).

| Field | Rule |
|---|---|
| `w` | The finished word, for example `実用化`. |
| `s` | The sentence. **Exactly one blank, written `（　　）`.** Putting `c[0]` in the blank must make a sentence that contains `w`. |
| `en` | Natural English for the whole sentence. Required. |

```json
{
  "id": "v3-018",
  "type": "v3",
  "w": "実用化",
  "r": "じつようか",
  "m": "putting into practical use",
  "s": "空を飛ぶ車が実用（　　）されるまでには、まだ時間がかかりそうだ。",
  "en": "It will probably be a while yet before flying cars are put into practical use.",
  "c": ["化", "性", "的", "式"],
  "why": [
    "実用化: putting something into real use. 〜化 turns a noun into a change, and takes する or される: 自動化, 高齢化.",
    "実用性 is a real word, 'practicality', but it names a quality. It cannot take される.",
    "実用的 is a real word, 'practical', but it is a な-adjective. 実用的される is not Japanese.",
    "実用式 is not a word. 〜式 means 'type, method': 和式, 自動式."
  ],
  "tell": "Noun + される, 'be made into X': 〜化. 実用化される, 自動化される.",
  "lv": 1
}
```

### 問題5 言い換え類義 (`type: "v5"`)

One word is underlined in a sentence. The answer is the choice that means the same. Every choice **replaces the underlined part as it stands**, ending and all.

| Field | Rule |
|---|---|
| `w` | The target word in its plain form, for example `ぐったり`. |
| `s` | The sentence. Required. |
| `t` | The underlined part of `s`, **exactly once** in `s`. It can be longer than `w` when the word comes with its ending: `ぐったりしていた`, `頑丈な`, `慎重に`. |
| `en` | Natural English for the whole sentence. Required. |

The validator checks that `t` appears once in `s`. It does not check that the choices fit in the sentence grammatically. You do.

```json
{
  "id": "v5-010",
  "type": "v5",
  "w": "ぐったり",
  "r": "ぐったり",
  "m": "exhausted, limp",
  "s": "暑い中、一日中外で作業をしたので、帰るころにはぐったりしていた。",
  "t": "ぐったりしていた",
  "en": "I worked outside all day in the heat, so by the time I went home I was completely worn out.",
  "c": ["とても疲れていた", "いらいらしていた", "お腹がすいていた", "日に焼けていた"],
  "why": [
    "ぐったりする means so tired that your body goes limp: とても疲れていた is the plain version.",
    "いらいらする means irritated. ぐったり is about having no energy, not about mood.",
    "お腹がすく means hungry. A long hot day can cause both, but ぐったり means worn out.",
    "日に焼ける means getting sunburned or tanned. That is about skin, not tiredness."
  ],
  "tell": "ぐったりする = とても疲れて力がない: worn out, limp.",
  "lv": 1
}
```

### 問題6 用法 (`type: "v6"`)

One word, four sentences. Pick the sentence that uses it correctly. There is no `s` and no `en`: the choices are the sentences.

| Field | Rule |
|---|---|
| `w` | The target word. |
| `stem` | The part of `w` that appears, unchanged, in all four sentences. It must be inside `w`. For a word that conjugates it is the fixed part: `取り扱う` has stem `取り扱`, `備える` has `備え`. |
| `c` | Four sentences. **Every one contains `stem`**; the validator fails any that does not. `c[0]` uses the word correctly. In `c[1..3]` the stem is misused, in a spot where a different word was needed. Do not give an English translation. |
| `fix` | Four entries. `fix[0]` is `null`. `fix[1..3]` each name **the word that sentence needed in place of the stem**, written as it would stand in that sentence. The validator fails any `fix` that is not `[null, text, text, text]`. |

```json
{
  "id": "v6-003",
  "type": "v6",
  "w": "余裕",
  "r": "よゆう",
  "m": "room to spare (time, money or mind), leeway",
  "stem": "余裕",
  "c": [
    "電車が遅れることもあるので、時間に余裕を持って家を出た。",
    "昨日作ったカレーの余裕があるので、今日の昼はそれを温めて食べよう。",
    "頼まれてもいないのに余裕なことを言って、友人を怒らせてしまった。",
    "定年後の余裕の過ごし方について、市が講座を開いている。"
  ],
  "fix": [null, "残り", "余計な", "余暇"],
  "why": [
    "Right: 余裕 is spare room, here spare time. 時間に余裕を持つ means leaving early enough.",
    "Food left over is 残り. 余裕 is spare capacity, not leftovers.",
    "Saying something nobody needed is 余計なこと. 余裕 means spare room, which makes no sense here.",
    "Leisure time and how you spend it is 余暇. 余裕の過ごし方 is not said."
  ],
  "tell": "余裕 is spare room in time, money or mind: 余裕がある, 余裕を持って. Not leftovers or leisure.",
  "lv": 1
}
```

### Rules for vocabulary items

The validator cannot check any of these. Rules 1 to 3 were learned in review of the first batches.

1. **A wrong choice must be wrong in every sense of the word.** Look the word up and read every meaning, including the second and the third. 余裕 can mean spare time, spare money or calm of mind, so each wrong sentence above had to fail in all three. If a native speaker could defend a wrong choice in any sense, replace it. This is the most important rule.
2. **v3: a wrong affix must not form a real word that fits.** Read the sentence with each wrong affix in place. If it makes a real word, that word must clearly fail in this sentence, and `why` must say how: 不透明 is real but means the opposite of 半透明 (`v3-012`); 実用性 and 実用的 are real but cannot take される (the example above). Do not write "is not a word" for something that is a word.
3. **Keep the four choices similar in length and shape**, so length does not give the answer away. The right choice should not be the longest, the most detailed, or the only one of its kind (for example the only phrase ending in に, or the only sentence with an extra clause). Spread the right answer's length and style across items.
4. **v5: every choice must be able to replace `t` as it stands**: same part of speech and a matching ending, so a broken fit does not give the answer away. `c[0]` should be a close paraphrase of the word's meaning in this sentence, not just a related word.
5. **v6: the wrong sentences must be natural except for the misused stem.** If a wrong sentence also has another flaw, the learner can reject it for the wrong reason. Name the word that sentence needed in `fix`, and make sure the word really fits there.
6. **Each `why` note names the rule, not just "wrong".** The note for a wrong choice says what that choice really means or does. The English is plain and short, with no em dashes.
7. **One word, once per type.** A test fails if the same `w` appears twice in one type. Each type needs at least 5 items, or its mock section cannot be built.
8. **Original sentences only**, as in the quality bar below.

## 問題14 情報検索 schema (`type: "r14"`)

A realistic notice (a course list, a scholarship call, a job ad, a facility guide, a flat share, a rubbish-collection guide) and one to three questions about it. The skill is reading one person's conditions against the table and the ※ notes. Files: `content/r14_*.json`, each an array of notices, validated by `validatePassages`. Answers go to the `reading` store.

| Field | Rule |
|---|---|
| `id` | Unique across all content files. `r14-001`. |
| `type` | `r14`. |
| `title` | Non-empty. |
| `intro` | One line, such as `右のページは、ある市の粗大ごみの出し方についてのお知らせである。` The app shows it above the notice. The validator does not check it, but every notice has one. |
| `blocks` | A non-empty list. **Each block is an object with exactly one key** (see below). |
| `en` | One or two sentences of English summary. Required, no em dashes. |
| `qs` | **1 to 3** questions. The real notices have two. |

The five block keys:

| Key | Value |
|---|---|
| `h` | A heading, as text. |
| `p` | A paragraph, as text. |
| `ul` | A non-empty list of text items (steps, conditions, dates). |
| `note` | One ※ line, as text. This is where the answer usually turns. |
| `table` | A list of rows, each a list of text cells. The first row is the header. At least two rows, and **every row the same length**. |

Each question:

| Field | Rule |
|---|---|
| `q` | The question, in Japanese. Usually one person's situation, then 〜として正しいものはどれか or 全部でいくらか. Required. |
| `c` | Four distinct, non-empty choices. **`c[0]` is the correct answer.** The app shuffles them. |
| `why` | Four non-empty notes, parallel to `c`. `why[0]` works the answer out step by step. `why[1..3]` each name the slip that leads to that choice (a missed ※, the wrong row, a total counted once). |
| `cue` | 1 to 3 **exact substrings of the notice** that decide the answer. The app highlights them. |
| `tell` | One line (160 characters at most) on how to read this kind of question. |

Questions have no `lv`, `cp` or `point`.

**Every `cue` must be verbatim.** The validator checks each cue against the notice text, which is the blocks joined with line breaks, with every table cell and every list item on its own line. So a cue must sit inside one cell, one list item or one block: it cannot run across two cells or two items. Full-width spaces `　`, brackets and punctuation must match exactly. Copy the text out of the notice; do not retype it.

This is `r14-006`, shortened for the guide: `…` stands for text left out, and the second question is not shown. The real file is complete and has no `…`.

```json
{
  "id": "r14-006",
  "type": "r14",
  "title": "あおば市　粗大ごみの出し方",
  "intro": "右のページは、ある市の粗大ごみの出し方についてのお知らせである。",
  "blocks": [
    { "h": "粗大ごみの出し方" },
    { "p": "家具や自転車など、…" },
    { "ul": ["①　粗大ごみ受付センターに、…", "②　市内のコンビニエンスストアや…", "③　収集日の朝8時30分までに、…"] },
    { "table": [
      ["品目", "手数料（1点）"],
      ["いす（1脚）", "300円"],
      ["布団（1枚）", "300円"],
      ["自転車", "600円"],
      ["ソファー（1人用）", "600円"],
      ["ソファー（2人用以上）", "1,200円"],
      ["タンス（高さ100cm未満）", "600円"],
      ["タンス（高さ100cm以上）", "1,200円"]
    ] },
    { "note": "※処理券は300円券と600円券の2種類です。…" },
    { "note": "※エアコン、テレビ、冷蔵庫、洗濯機は粗大ごみとして出せません。買った店かメーカーに引き取りを依頼してください。" }
  ],
  "en": "A city explains how to throw out large items: apply at least 7 days ahead, buy and attach fee stickers, and put the items out by 8:30 on collection day. Air conditioners, TVs, fridges and washing machines are not accepted, and staff carry items out free for households of people aged 70 or over.",
  "qs": [
    {
      "q": "あおば市に住む山口さんは、引っ越しの前に、いす2脚、高さ120cmのタンス1つ、1人用のソファー1つ、冷蔵庫1台を処分したい。粗大ごみとして出せるものをすべて出す場合、処理券は全部でいくら分必要か。",
      "c": ["2,400円", "1,800円", "2,100円", "3,000円"],
      "why": [
        "The 冷蔵庫 cannot go out as 粗大ごみ, so leave it out. Chairs: 300円 × 2 = 600円. A 120cm chest is 100cm以上: 1,200円. A 1-person sofa: 600円. Total 2,400円.",
        "This prices the chest as under 100cm (600円). At 120cm it is 1,200円.",
        "This counts the chairs once. いす is 300円 per chair, so two cost 600円.",
        "This uses the 2-person sofa price (1,200円). His is a 1-person sofa: 600円."
      ],
      "cue": ["冷蔵庫、洗濯機は粗大ごみとして出せません", "タンス（高さ100cm以上）", "いす（1脚）"],
      "tell": "Strike out what the ※ bans first, then match each item to its exact table row, size and count."
    }
  ]
}
```

### Rules for 情報検索

1. **Work the question from scratch before you write the choices.** Do the sums, check the dates, apply every ※. Then build the three wrong choices from the slips a hurried reader makes: a ※ missed, the wrong table row, an item counted once, a surcharge or discount applied to the wrong part.
2. **One defensible answer.** If a second choice can be made right by another reading of the notice, rewrite the notice or the choice.
3. **The answer turns on something in the small print**, usually a ※ note, a deadline or an exclusion. A question the table alone can answer is too easy.
4. **Every `cue` is verbatim**, inside one cell, item or block (see above). Pick the words the learner should have underlined.
5. **Keep the four choices similar in length and shape**, as for vocabulary, so length does not give the answer away.
6. **Original text only**, as in the quality bar below. Names, places and prices are invented.

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

Written for grammar items. Vocabulary and 情報検索 have their own rules above; points 1, 4, 5 and 7 here apply to them too.

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
