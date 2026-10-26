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
  const TARGET = { p7: 25, p8: 50, p9: 60, kr: 12, kw: 12, km: 12 };

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

  // Grammar lives in `points` and `days`; kanji in `kanji` and `kdays`, same shape.
  function emptyState() {
    return { v: 2, points: {}, qs: {}, conf: {}, days: {}, kanji: {}, kdays: {} };
  }
  function pointState(state, id, store = "points") {
    const box = state[store] || (state[store] = {});
    return box[id] || (box[id] = { box: 0, due: null, seen: 0, right: 0, streak: 0, times: [] });
  }

  // Record one answer. Only the first answer of the day for a point can move it up a box;
  // later answers the same day (re-asks, extra practice, set drills) can still drop it.
  // `chosenPoint` is the point behind the wrong choice, if any: that pair is logged as a
  // mix-up and the confused point comes back tomorrow too. `slow` (a hint was used) stops promotion.
  // `store` is "points" for grammar or "kanji". `firstBox` is where a fast right answer on first
  // sight lands: 3 (already known) unless the item was just taught, when 1 is the honest box.
  function record(state, { qid, point, ok, secs, type, chosenPoint, slow = false, today, store = "points", firstBox = 3 }) {
    const p = pointState(state, point, store);
    const fast = !slow && secs <= TARGET[type] * 1.2;
    const first = p.seen === 0;
    const again = p.last === today;
    p.seen++;
    p.last = today;
    if (first) p.first = today;
    if (type === "p7" || store === "kanji") p.times = [...p.times, Math.round(secs)].slice(-5);
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
    const days = store === "kanji" ? state.kdays || (state.kdays = {}) : state.days;
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

  return {
    INTERVALS, TARGET, dayStr, addDays, daysBetween, mulberry32, shuffle, median,
    emptyState, record, newToday, status, mixups, interleave, indexByPoint,
    buildDaily, buildMock, buildSetDrill, buildPointDrill, buildPairDrill, buildCustom, nextExam,
    kanjiQuestion, pickKanjiQuestion, buildKanjiDaily, buildKanjiDrill,
  };
});
