// Scheduling and session building. Pure functions, no DOM, so they run in node tests too.
//
// The unit of memory is the grammar POINT, not the question. Each point sits in a box;
// a fast correct answer moves it up a box (longer gap before it comes back), a miss drops
// it to box 1. Questions are just ways of testing a point, picked least-seen first, so the
// same sentence is not repeated while there are others.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Days until a point is due again, indexed by box.
  const INTERVALS = [0, 1, 2, 4, 8, 16];
  // Target seconds per item. 25 s for 問題7 is the usual N2 pace benchmark.
  // Kanji items (kr reading, kw writing, km meaning) should be near-instant: 12 s.
  // Vocab: 語形成 (v3) is one affix, 言い換え (v5) one word, 用法 (v6) four sentences to read.
  // 情報検索 (r14) is per question, and the first one includes reading the notice.
  // Reading (r10 to r13) is per question, with the reading time shared out: a 問題11 text and its three
  // questions should take about 6 minutes. Listening (l1 to l5) is the time to answer after the audio ends.
  const TARGET = {
    p7: 25, p8: 50, p9: 60, kr: 12, kw: 12, km: 12, v3: 20, v4: 25, v5: 25, v6: 45, r14: 240,
    r10: 150, r11: 120, r12: 210, r13: 200, l1: 15, l2: 15, l3: 15, l4: 10, l5: 20,
  };
  // Exam pace for a whole text and its questions, in seconds. Together about 55 minutes for 問題10 to 14.
  const PACE = { r10: 150, r11: 360, r12: 420, r13: 600, r14: 420 };
  // Which day log each store writes to.
  const DAYS = { points: "days", kanji: "kdays", vocab: "vdays", reading: "rdays", listen: "ldays" };

  const pad = (n) => String(n).padStart(2, "0");
  function dayStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(ds, n) {
    const [y, m, d] = ds.split("-").map(Number);
    return dayStr(new Date(y, m - 1, d + n));
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const median = (xs) => {
    if (!xs.length) return Infinity;
    const s = xs.slice().sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };

  // Grammar lives in `points` and `days`; kanji in `kanji` and `kdays`; vocab in `vocab` and
  // `vdays`; reading answers (問題10 to 14) in `reading` and `rdays`; listening in `listen` and `ldays`.
  // Same shape everywhere. Three logs hold entries keyed by a unique id: `rlog` (one per text read:
  // time, length, score), `hours` (time logged by hand) and `mocks` (full mock scores).
  function emptyState() {
    return { v: 2, points: {}, qs: {}, conf: {}, days: {}, kanji: {}, kdays: {}, vocab: {}, vdays: {}, reading: {}, rdays: {}, listen: {}, ldays: {}, rlog: {}, hours: {}, mocks: {} };
  }
  function pointState(state, id, store = "points") {
    const box = state[store] || (state[store] = {});
    return box[id] || (box[id] = { box: 0, due: null, seen: 0, right: 0, streak: 0, times: [] });
  }

  // Record one answer. Only the first answer of the day for a point can move it up a box;
  // later answers the same day (re-asks, extra practice, set drills) can still drop it.
  // `chosenPoint` is the point behind the wrong choice, if any: that pair is logged as a
  // mix-up and the confused point comes back tomorrow too. `slow` (a hint was used) stops promotion.
  // `store` is "points" for grammar, "kanji", "vocab" or "reading". `firstBox` is where a fast right answer on first
  // sight lands: 3 (already known) unless the item was just taught, when 1 is the honest box.
  function record(state, { qid, point, ok, secs, type, chosenPoint, slow = false, today, store = "points", firstBox = 3 }) {
    const p = pointState(state, point, store);
    const fast = !slow && secs <= TARGET[type] * 1.2;
    const first = p.seen === 0;
    const again = p.last === today;
    p.seen++;
    p.last = today;
    if (first) p.first = today;
    if (type === "p7" || store !== "points") p.times = [...p.times, Math.round(secs)].slice(-5);
    if (ok) {
      p.right++;
      p.streak++;
      if (!again) {
        if (!fast) p.box = Math.max(p.box, 1);
        else if (first) p.box = firstBox;
        else p.box = Math.min(p.box + 1, INTERVALS.length - 1);
        p.due = addDays(today, fast ? INTERVALS[p.box] : 1);
      }
    } else {
      p.streak = 0;
      p.box = 1;
      p.due = addDays(today, 1);
      p.lastWrong = today;
      if (chosenPoint && chosenPoint !== point) {
        const key = `${point}|${chosenPoint}`;
        state.conf[key] = (state.conf[key] || 0) + 1;
        const other = state.points[chosenPoint];
        if (other && other.seen && other.due > addDays(today, 1)) other.due = addDays(today, 1);
      }
    }
    if (qid) {
      const q = state.qs[qid] || (state.qs[qid] = { seen: 0, right: 0 });
      q.seen++;
      if (ok) q.right++;
      else q.wrong = today;
      q.last = today;
    }
    const dk = DAYS[store] || "days";
    const days = state[dk] || (state[dk] = {});
    const d = days[today] || (days[today] = { n: 0, right: 0, secs: 0 });
    d.n++;
    if (ok) d.right++;
    d.secs += Math.round(secs);
    return p;
  }

  // How many points (or kanji) were met for the first time today (for the daily new quota).
  function newToday(state, today, store = "points") {
    return Object.values(state[store] || {}).filter((p) => p.first === today).length;
  }

  // new · learning · solid · auto (automatic) · weak
  function status(p, target = TARGET.p7) {
    if (!p || !p.seen) return "new";
    if (p.streak === 0) return "weak";
    if (p.seen >= 3 && p.right / p.seen < 0.6) return "weak";
    if (p.box >= 4 && p.streak >= 2 && (!p.times.length || median(p.times) <= target)) return "auto";
    if (p.box >= 3) return "solid";
    return "learning";
  }

  // Top mix-ups as [{a, b, n}], where a is the right point and b the one reached for.
  function mixups(state, limit = 5) {
    return Object.entries(state.conf || {})
      .map(([k, n]) => {
        const [a, b] = k.split("|");
        return { a, b, n };
      })
      .sort((x, y) => y.n - x.n)
      .slice(0, limit);
  }

  // Order items so neighbours rarely share a set or a lesson. That is the point of
  // interleaving: each question makes you decide which family you are in.
  function interleave(items, keyOf, rng = Math.random) {
    const pool = shuffle(items, rng);
    const out = [];
    while (pool.length) {
      const prev = out.length ? keyOf(out[out.length - 1]) : null;
      let i = pool.findIndex((x) => keyOf(x) !== prev);
      if (i < 0) i = 0;
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  function leastSeen(qs, state, rng) {
    const seen = (q) => (state.qs[q.id] ? state.qs[q.id].seen : 0);
    const min = Math.min(...qs.map(seen));
    const tied = qs.filter((q) => seen(q) === min);
    return tied[Math.floor(rng() * tied.length)];
  }

  // Questions grouped by the point they test (問題7 and 問題8 only).
  function indexByPoint(questions) {
    const map = new Map();
    for (const q of questions) {
      if (q.type === "p9") continue;
      if (!map.has(q.point)) map.set(q.point, []);
      map.get(q.point).push(q);
    }
    return map;
  }

  // Today's review: due points first, then a fixed number of new points, then topped up
  // with more new points or with the weakest points not yet due.
  function buildDaily({ state, questions, points, today, size = 25, newPerDay = 12, lessons = null, rng = Math.random }) {
    const byPoint = indexByPoint(questions);
    const lessonOf = Object.fromEntries(points.map((p) => [p.id, p.l]));
    const cands = points.filter((p) => byPoint.has(p.id) && (!lessons || lessons.has(lessonOf[p.id]))).map((p) => p.id);
    const ps = (id) => state.points[id];
    const seen = cands.filter((id) => ps(id) && ps(id).seen);
    const fresh = cands.filter((id) => !ps(id) || !ps(id).seen);
    const due = seen
      .filter((id) => ps(id).due <= today)
      .sort((a, b) => (ps(a).due < ps(b).due ? -1 : ps(a).due > ps(b).due ? 1 : ps(a).box - ps(b).box));

    const nNew = Math.min(newPerDay, fresh.length, size);
    const pick = due.slice(0, size - nNew);
    pick.push(...fresh.slice(0, size - pick.length));
    if (pick.length < size) {
      const ahead = seen
        .filter((id) => !pick.includes(id))
        .sort((a, b) => ps(a).box - ps(b).box || (ps(a).due < ps(b).due ? -1 : 1));
      pick.push(...ahead.slice(0, size - pick.length));
    }

    // One question per point. Mostly 問題7; roughly one in five is a 問題8 when the point has one.
    const items = pick.map((id) => {
      const qs = byPoint.get(id);
      const p8 = qs.filter((q) => q.type === "p8");
      const p7 = qs.filter((q) => q.type === "p7");
      const useP8 = p8.length && (!p7.length || rng() < 0.2);
      return leastSeen(useP8 ? p8 : p7, state, rng);
    });
    const setOf = (q) => q.set || lessonOf[q.point];
    return {
      items: interleave(items, setOf, rng),
      counts: { due: Math.min(due.length, size - nNew), dueTotal: due.length, fresh: pick.filter((id) => fresh.includes(id)).length },
    };
  }

  // A full grammar section in real exam shape: 問題7 ×12 (easy to hard), 問題8 ×5, 問題9 ×1 passage.
  function buildMock({ state, questions, rng = Math.random }) {
    const fresh = (qs) => {
      const seen = (q) => (state.qs[q.id] ? state.qs[q.id].seen : 0);
      return shuffle(qs, rng).sort((a, b) => seen(a) - seen(b));
    };
    const p7 = questions.filter((q) => q.type === "p7");
    const take = (lv, n, used) => fresh(p7.filter((q) => q.lv === lv && !used.has(q.id))).slice(0, n);
    const used = new Set();
    const out7 = [];
    for (const [lv, n] of [[1, 5], [2, 4], [3, 3]]) {
      const got = take(lv, n, used);
      got.forEach((q) => used.add(q.id));
      out7.push(...got);
    }
    if (out7.length < 12) out7.push(...fresh(p7.filter((q) => !used.has(q.id))).slice(0, 12 - out7.length));
    // Easy to hard, as on the real paper.
    out7.sort((a, b) => a.lv - b.lv);
    const out8 = fresh(questions.filter((q) => q.type === "p8")).slice(0, 5);
    const out9 = fresh(questions.filter((q) => q.type === "p9")).slice(0, 1);
    return [...out7, ...out8, ...out9];
  }

  // Targeted drill on a confusable set. First the questions that play members against each
  // other (tagged with the set, or a 問題7 whose answer and a distractor are both members),
  // then any other question on a member. Some look-alikes are interchangeable in many
  // sentences, so writers avoid pairing them and those sets lean on the second group.
  function buildSetDrill({ set, questions, rng = Math.random, max = 15 }) {
    const m = new Set(set.members);
    const contrast = questions.filter(
      (q) =>
        q.type !== "p9" &&
        (q.set === set.id || (q.type === "p7" && m.has(q.point) && q.cp.slice(1).some((id) => m.has(id))))
    );
    const rest = questions.filter((q) => q.type !== "p9" && m.has(q.point) && !contrast.includes(q));
    return [...interleave(contrast, (q) => q.point, rng), ...interleave(rest, (q) => q.point, rng)].slice(0, max);
  }

  // Everything that tests a point, as the answer or as a tempting distractor.
  function buildPointDrill({ pointId, questions, rng = Math.random, max = 12 }) {
    const main = questions.filter((q) => q.type !== "p9" && q.point === pointId);
    const rivals = questions.filter((q) => q.type === "p7" && q.point !== pointId && q.cp.includes(pointId));
    return [...shuffle(main, rng), ...shuffle(rivals, rng)].slice(0, max);
  }

  // Drill one mix-up: questions where either point is the answer and the other is a choice.
  function buildPairDrill({ a, b, questions, rng = Math.random, max = 10 }) {
    const hits = questions.filter(
      (q) => q.type === "p7" && ((q.point === a && q.cp.includes(b)) || (q.point === b && q.cp.includes(a)))
    );
    const extra = questions.filter((q) => q.type !== "p9" && (q.point === a || q.point === b) && !hits.includes(q));
    return [...shuffle(hits, rng), ...shuffle(extra, rng)].slice(0, max);
  }

  function buildCustom({ questions, points, lessons, types, rng = Math.random, max = 20 }) {
    const lessonOf = Object.fromEntries(points.map((p) => [p.id, p.l]));
    const inLesson = (q) => {
      const ids = q.type === "p9" ? q.qs.map((b) => b.point) : [q.point];
      return ids.some((id) => lessons.has(lessonOf[id]));
    };
    const hits = questions.filter((q) => types.has(q.type) && inLesson(q));
    return interleave(hits, (q) => q.set || q.point, rng).slice(0, max);
  }

  // ---------- kanji ----------
  // The unit of memory is the KANJI. Each review asks about one of its words, in one of three
  // shapes: kr reading (問題1, pick the reading of the underlined word), kw writing (問題2, pick
  // the kanji for a word written in kana) and km meaning (pick the English for the word alone).
  const KTYPES = ["kr", "kw", "km"];
  const kqid = (type, k, wi) => `${type}:${k}:${wi}`;
  const content = (s) => new Set(String(s).toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 2 && !["the", "and", "for", "something", "someone", "with"].includes(x)));

  // Three English meanings to set against the right one: same part of speech, other kanji,
  // no shared content word (so "to live" never sits beside "to live in").
  const meaningPools = new WeakMap();
  function meaningChoices(kanji, x, word, rng) {
    if (!meaningPools.has(kanji)) meaningPools.set(kanji, kanji.flatMap((y) => y.words.map((w) => ({ k: y.k, en: w.en, pos: w.pos }))));
    const mine = content(word.en);
    const cands = meaningPools.get(kanji).filter((m) => m.pos === word.pos && m.k !== x.k && m.en !== word.en && ![...content(m.en)].some((t) => mine.has(t)));
    const out = [];
    for (const m of shuffle(cands, rng)) {
      if (out.length === 3) break;
      if (!out.includes(m.en)) out.push(m.en);
    }
    return out.length === 3 ? out : null;
  }

  // One question on kanji `x`, word `wi`. c[0] is always right; the app shuffles.
  function kanjiQuestion({ kanji, x, wi, type, rng = Math.random }) {
    const w = x.words[wi];
    const base = { id: kqid(type, x.k, wi), type, point: x.k, k: x.k, wi };
    if (type === "kr") return { ...base, c: [w.tr, ...w.rx] };
    if (type === "kw") return { ...base, c: [w.t, ...w.wx] };
    const others = meaningChoices(kanji, x, w, rng);
    return others ? { ...base, c: [w.en, ...others] } : { ...base, type: "kr", id: kqid("kr", x.k, wi), c: [w.tr, ...w.rx] };
  }

  // Pick the shape this kanji has seen least, then its least-seen word for that shape.
  // Writing (問題2) waits until the kanji reaches box 2: telling 暮 from 墓 needs the kanji first.
  function pickKanjiQuestion({ state, kanji, x, box = 0, rng = Math.random }) {
    const seen = (t, wi) => (state.qs[kqid(t, x.k, wi)] || { seen: 0 }).seen;
    const words = x.words.map((_, wi) => wi);
    const types = box >= 2 ? KTYPES : ["kr", "km"];
    const byType = (t) => words.reduce((a, wi) => a + seen(t, wi), 0);
    const minT = Math.min(...types.map(byType));
    const ts = types.filter((t) => byType(t) === minT);
    const type = ts[Math.floor(rng() * ts.length)];
    const minW = Math.min(...words.map((wi) => seen(type, wi)));
    const ws = words.filter((wi) => seen(type, wi) === minW);
    return kanjiQuestion({ kanji, x, wi: ws[Math.floor(rng() * ws.length)], type, rng });
  }

  // Today's kanji: due kanji first, then up to `newPerDay` new ones in list order (the list is
  // sorted most useful first). Kanji at or below `wkLevel` are never introduced: WaniKani has
  // them. Each new kanji gets a teaching card, then its first question a few items later.
  // `topUp` fills spare places with the weakest kanji not yet due (for extra practice).
  function buildKanjiDaily({ state, kanji, today, size = 25, newPerDay = 8, wkLevel = 0, topUp = false, rng = Math.random }) {
    const ks = (k) => (state.kanji || {})[k];
    const seen = kanji.filter((x) => ks(x.k) && ks(x.k).seen);
    const fresh = kanji.filter((x) => (!ks(x.k) || !ks(x.k).seen) && !(x.wk && x.wk <= wkLevel));
    const due = seen
      .filter((x) => ks(x.k).due <= today)
      .sort((a, b) => (ks(a.k).due < ks(b.k).due ? -1 : ks(a.k).due > ks(b.k).due ? 1 : ks(a.k).box - ks(b.k).box));
    const nNew = Math.min(newPerDay, fresh.length, size);
    const rev = due.slice(0, size - nNew);
    if (topUp && rev.length + nNew < size) {
      const ahead = seen.filter((x) => !rev.includes(x)).sort((a, b) => ks(a.k).box - ks(b.k).box || (ks(a.k).due < ks(b.k).due ? -1 : 1));
      rev.push(...ahead.slice(0, size - nNew - rev.length));
    }
    const news = fresh.slice(0, nNew);

    const reviews = shuffle(rev.map((x) => pickKanjiQuestion({ state, kanji, x, box: ks(x.k).box, rng })), rng);
    const pending = [];
    const out = [];
    let ni = 0;
    while (ni < news.length || reviews.length || pending.length) {
      if (pending.length && (out.length >= pending[0].at || (ni >= news.length && !reviews.length))) {
        out.push(pending.shift().item);
      } else if (ni < news.length && (!reviews.length || rng() < (news.length - ni) / (news.length - ni + reviews.length))) {
        const x = news[ni++];
        out.push({ id: `kn:${x.k}`, type: "kn", point: x.k, k: x.k });
        pending.push({ at: out.length + 3, item: { ...pickKanjiQuestion({ state, kanji, x, box: 0, rng }), taught: true } });
      } else {
        out.push(reviews.shift());
      }
    }
    return { items: out, counts: { due: Math.min(due.length, size - nNew), dueTotal: due.length, fresh: news.length } };
  }

  // Every word of one kanji in every shape, for drilling a single kanji.
  function buildKanjiDrill({ kanji, x, rng = Math.random, max = 9 }) {
    const qs = [];
    x.words.forEach((_, wi) => KTYPES.forEach((type) => qs.push(kanjiQuestion({ kanji, x, wi, type, rng }))));
    const uniq = [...new Map(qs.map((q) => [q.id, q])).values()];
    return shuffle(uniq, rng).slice(0, max);
  }

  // ---------- vocabulary (問題3, 5, 6) and 情報検索 (問題14) ----------
  // Each vocab item is its own unit of memory: one stem and affix, one word in a sentence, or one
  // word in four sentences. Same boxes as grammar, kept in the `vocab` store.
  const VTYPES = ["v3", "v4", "v5", "v6"];

  // Take the groups in turn (one of each type, then the next of each), keeping order inside a group.
  function roundRobin(items, keyOf) {
    const groups = new Map();
    for (const x of items) {
      const k = keyOf(x);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const out = [];
    for (let i = 0; out.length < items.length; i++) for (const g of groups.values()) if (i < g.length) out.push(g[i]);
    return out;
  }

  // Today's vocab: due items first, then up to `newPerDay` new ones, easiest first and taking the
  // three types in turn. `types` narrows it to some types (a 語形成-only drill). `topUp` fills spare
  // places with the weakest items not yet due.
  function buildVocabDaily({ state, items, today, size = 20, newPerDay = 10, types = null, topUp = false, rng = Math.random }) {
    const vs = (id) => (state.vocab || {})[id];
    const mine = items.filter((x) => !types || types.has(x.type));
    const seen = mine.filter((x) => vs(x.id) && vs(x.id).seen);
    const fresh = roundRobin(mine.filter((x) => !vs(x.id) || !vs(x.id).seen).sort((a, b) => (a.lv || 1) - (b.lv || 1)), (x) => x.type);
    const due = seen
      .filter((x) => vs(x.id).due <= today)
      .sort((a, b) => (vs(a.id).due < vs(b.id).due ? -1 : vs(a.id).due > vs(b.id).due ? 1 : vs(a.id).box - vs(b.id).box));
    const nNew = Math.min(newPerDay, fresh.length, size);
    const pick = due.slice(0, size - nNew);
    pick.push(...fresh.slice(0, nNew));
    if (topUp && pick.length < size) {
      const ahead = seen.filter((x) => !pick.includes(x)).sort((a, b) => vs(a.id).box - vs(b.id).box || (vs(a.id).due < vs(b.id).due ? -1 : 1));
      pick.push(...ahead.slice(0, size - pick.length));
    }
    return {
      items: interleave(pick, (x) => x.type, rng),
      counts: { due: Math.min(due.length, size - nNew), dueTotal: due.length, fresh: nNew },
    };
  }

  // A vocabulary section in paper order: 問題3, then 問題5, then 問題6, `n` of each, least-seen first.
  function buildVocabMock({ state, items, n = 5, rng = Math.random }) {
    const seen = (q) => (state.qs[q.id] ? state.qs[q.id].seen : 0);
    return VTYPES.flatMap((t) => shuffle(items.filter((x) => x.type === t), rng).sort((a, b) => seen(a) - seen(b)).slice(0, n));
  }

  // The 情報検索 notice met least often (by its first question), ties broken at random.
  function pickPassage({ state, passages, rng = Math.random }) {
    return leastRead({ state, texts: passages, n: 1, rng })[0] || null;
  }

  // ---------- reading texts (問題10 to 14) ----------
  // A text is not a unit of memory (you would remember the answers), so texts are served least-read
  // first, and the oldest read first among those. `n` texts of whatever list is passed in.
  const readCount = (state, p) => (state.qs[`${p.id}#1`] ? state.qs[`${p.id}#1`].seen : 0);
  function leastRead({ state, texts, n = 1, rng = Math.random }) {
    const last = (p) => (state.qs[`${p.id}#1`] && state.qs[`${p.id}#1`].last) || "";
    return shuffle(texts, rng)
      .sort((a, b) => readCount(state, a) - readCount(state, b) || (last(a) < last(b) ? -1 : last(a) > last(b) ? 1 : 0))
      .slice(0, n);
  }
  // Today's reading: one set, the type taken in turn so a week covers the whole section.
  // A 問題10 day is two short texts.
  const READ_CYCLE = ["r10", "r11", "r12", "r10", "r13", "r11", "r14"];
  function buildReadingDaily({ state, texts, today, rng = Math.random }) {
    const daysRead = new Set(Object.values(state.rlog || {}).filter((e) => !e.del && e.d < today).map((e) => e.d)).size;
    for (let k = 0; k < READ_CYCLE.length; k++) {
      const type = READ_CYCLE[(daysRead + k) % READ_CYCLE.length];
      const of = texts.filter((p) => p.type === type);
      if (of.length) return leastRead({ state, texts: of, n: type === "r10" ? 2 : 1, rng });
    }
    return [];
  }
  // The reading part of the paper: 問題10 ×5, 11 ×3, 12, 13 and 14 ×1 each. About 55 minutes.
  // `half` is a 25-minute version: 問題10 ×2, 11 ×1, 13 ×1.
  function buildReadingMock({ state, texts, half = false, rng = Math.random }) {
    const plan = half ? [["r10", 2], ["r11", 1], ["r13", 1]] : [["r10", 5], ["r11", 3], ["r12", 1], ["r13", 1], ["r14", 1]];
    return plan.flatMap(([t, n]) => leastRead({ state, texts: texts.filter((p) => p.type === t), n, rng }));
  }

  // ---------- listening (聴解 問題1 to 5) ----------
  // Spoken choices are read in a fixed order, made once when the audio is made: the right one (c[0])
  // goes to position idHash % n. tools/build_audio.py uses the same rule.
  const idHash = (s) => [...String(s)].reduce((a, ch, i) => a + ch.charCodeAt(0) * (i + 1), 0);
  function spokenOrder(id, n) {
    const p = idHash(id) % n;
    const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
    return [...rest.slice(0, p), 0, ...rest.slice(p)];
  }
  // Items heard least, then longest ago. Items you got wrong come back first once three days have passed.
  function leastHeard({ state, items, n, today = "", rng = Math.random }) {
    // 問題5 items keep one record per question; the first stands for the item.
    const rec = (it) => (state.listen || {})[it.id] || (state.listen || {})[`${it.id}#1`] || null;
    const heard = (it) => (rec(it) ? rec(it).seen : 0);
    const last = (it) => (rec(it) && rec(it).last) || "";
    const retry = (it) => rec(it) && rec(it).streak === 0 && today && rec(it).last <= addDays(today, -3);
    return shuffle(items, rng)
      .sort((a, b) => (retry(b) ? 1 : 0) - (retry(a) ? 1 : 0) || heard(a) - heard(b) || (last(a) < last(b) ? -1 : last(a) > last(b) ? 1 : 0))
      .slice(0, n);
  }
  // Today's listening: `size` items, mostly 問題1, 2 and 4, with one 問題3 or 問題5 in turn.
  function buildListenDaily({ state, items, today, size = 8, rng = Math.random }) {
    const days = Object.keys(state.ldays || {}).filter((d) => d < today).length;
    const share = { l1: 2, l2: 2, l4: 3, [days % 2 ? "l5" : "l3"]: 1 };
    const scale = size / 8;
    const out = [];
    for (const t of ["l1", "l2", "l3", "l4", "l5"]) {
      const of = items.filter((it) => it.type === t);
      const want = Math.round((share[t] || 0) * scale);
      if (want && of.length) out.push(...leastHeard({ state, items: of, n: want, today, rng }));
    }
    return out;
  }
  // The listening part of the paper, in its order. Full: 問題1 ×5, 2 ×6, 3 ×5, 4 ×12, 5 ×2 (one with
  // spoken choices, one with two questions). About 50 minutes. `half`: roughly half of each.
  function buildListenMock({ state, items, half = false, rng = Math.random }) {
    const plan = half ? [["l1", 2], ["l2", 3], ["l3", 2], ["l4", 6]] : [["l1", 5], ["l2", 6], ["l3", 5], ["l4", 12]];
    const out = plan.flatMap(([t, n]) => leastHeard({ state, items: items.filter((it) => it.type === t), n, rng }));
    const l5 = items.filter((it) => it.type === "l5");
    const one = leastHeard({ state, items: l5.filter((it) => it.qs.length === 1), n: 1, rng });
    const two = leastHeard({ state, items: l5.filter((it) => it.qs.length === 2), n: 1, rng });
    return [...out, ...(half ? (two.length ? two : one) : [...one, ...two])];
  }

  // The next JLPT: first Sunday of July or December, whichever is next.
  function nextExam(from = new Date()) {
    const firstSunday = (y, m) => {
      const d = new Date(y, m, 1);
      d.setDate(1 + ((7 - d.getDay()) % 7));
      return d;
    };
    const today = dayStr(from);
    for (let y = from.getFullYear(); y < from.getFullYear() + 2; y++) {
      for (const m of [6, 11]) {
        const d = dayStr(firstSunday(y, m));
        if (d >= today) return d;
      }
    }
    return null;
  }

  // Combine two copies of progress (phone and laptop) without losing either. Records only grow, so per id
  // the copy that has seen more is the newer one; day logs and mix-ups keep the larger count. Ties keep a's.
  function mergeStates(a, b) {
    const out = emptyState();
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    // A copy one level deep (arrays like `times` too), so the result shares nothing with the inputs.
    const copy = (r) => (r && typeof r === "object" ? Object.fromEntries(Object.entries(r).map(([k, x]) => [k, Array.isArray(x) ? x.slice() : x])) : r);
    // Every key of either side's map; b's entry replaces a's only when `bWins` says so.
    const join = (store, bWins) => {
      const x = (a && a[store]) || {};
      const y = (b && b[store]) || {};
      for (const [id, r] of Object.entries(x)) out[store][id] = copy(r);
      for (const [id, r] of Object.entries(y)) if (!has(x, id) || bWins(x[id], r)) out[store][id] = copy(r);
    };
    const seen = (r) => (r && r.seen) || 0;
    const last = (r) => (r && r.last) || "";
    const due = (r) => (r && r.due) || "";
    // A full tie on seen and last goes to the earlier due date (a mix-up pulls it forward), so both devices agree.
    const newer = (r, s) =>
      seen(s) > seen(r) || (seen(s) === seen(r) && (last(s) > last(r) || (last(s) === last(r) && due(s) !== "" && due(s) < due(r))));
    for (const store of ["points", "kanji", "vocab", "reading", "listen", "qs"]) join(store, newer);
    const n = (d) => (d && d.n) || 0;
    for (const store of ["days", "kdays", "vdays", "rdays", "ldays"]) join(store, (d, e) => n(e) > n(d));
    join("conf", (c, d) => (d || 0) > (c || 0));
    // Log entries have unique ids; an edited or deleted entry carries a later `ts`.
    const ts = (r) => (r && r.ts) || 0;
    for (const store of ["rlog", "hours", "mocks"]) join(store, (r, s) => ts(s) > ts(r));
    return out;
  }

  return {
    INTERVALS, TARGET, dayStr, addDays, daysBetween, mulberry32, shuffle, median,
    emptyState, record, newToday, status, mixups, interleave, indexByPoint,
    buildDaily, buildMock, buildSetDrill, buildPointDrill, buildPairDrill, buildCustom, nextExam,
    kanjiQuestion, pickKanjiQuestion, buildKanjiDaily, buildKanjiDrill,
    VTYPES, buildVocabDaily, buildVocabMock, pickPassage,
    PACE, leastRead, buildReadingDaily, buildReadingMock,
    idHash, spokenOrder, leastHeard, buildListenDaily, buildListenMock,
    mergeStates,
  };
});
