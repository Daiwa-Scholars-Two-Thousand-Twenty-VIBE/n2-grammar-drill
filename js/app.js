// N2 文法ドリル: screens, quiz flow and storage.
// Content comes from js/data.js (window.N2, built by tools/bundle.mjs) and scheduling from
// js/srs.js (window.SRS). Classic scripts, no build step, so the page also works from file://.
(function () {
  "use strict";
  const D = window.N2;
  const S = window.SRS;
  const G = window.Sync || null; // gist sync (js/sync.js). Missing means sync stays off.
  const app = document.getElementById("app");
  const KEYS = { state: "n2drill.state.v2", settings: "n2drill.settings.v2", sync: "n2drill.sync.v1" };
  const DEFAULTS = { upto: "all", size: 20, newPerDay: 12, timer: true, eink: false, sound: false, missPause: 1500, examDate: "", wk: 27, kNew: 10, kSize: 30, vNew: 10, vSize: 20 };
  // Seconds the real paper allows, roughly: 問題7 and 問題8 per item, 問題9 per passage, vocab per item.
  const MOCK_SECS = { p7: 25, p8: 50, p9: 360, v3: 20, v5: 25, v6: 45 };
  const TYPE_NAME = {
    p7: "問題7 · 文法形式の判断",
    p8: "問題8 · 文の組み立て",
    p9: "問題9 · 文章の文法",
    kr: "漢字 · 読み (like 問題1)",
    kw: "漢字 · 表記 (like 問題2)",
    km: "漢字 · 意味",
    kn: "漢字 · new",
    v3: "問題3 · 語形成",
    v5: "問題5 · 言い換え類義",
    v6: "問題6 · 用法",
    r14: "問題14 · 情報検索",
  };
  // Vocab types: short name, what it asks, and the instruction shown above the choices.
  const VNAME = {
    v3: ["語形成", "Word formation (問題3)", "Which goes in the blank to make one word?"],
    v5: ["言い換え", "Closest meaning (問題5)", "Which is closest in meaning to the underlined words?"],
    v6: ["用法", "Usage (問題6)", "Which sentence uses this word correctly?"],
  };
  const STATUS = {
    new: ["○", "New"],
    learning: ["◔", "Learning"],
    solid: ["◑", "Solid"],
    auto: ["●", "Automatic"],
    weak: ["✕", "Weak"],
  };
  const REPO = "https://github.com/Daiwa-Scholars-Two-Thousand-Twenty-VIBE/n2-grammar-drill";

  // ---------- storage ----------
  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Private windows can refuse storage. Progress then lasts for this tab only.
    }
  }
  // `state` stays one object for the whole visit (import, reset and sync refill it in place),
  // so nothing that holds it ever goes stale.
  const state = Object.assign(S.emptyState(), load(KEYS.state) || {});
  function replaceState(next) {
    if (next === state) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, S.emptyState(), next);
  }
  let settings = Object.assign({}, DEFAULTS, load(KEYS.settings) || {});
  const saveState = () => save(KEYS.state, state);
  // `_ts` says which device changed settings last, so sync keeps the newer ones.
  const saveSettings = () => {
    settings._ts = Date.now();
    save(KEYS.settings, settings);
  };
  // This device's sync link. It holds the token, so it never goes into the synced file.
  const sync = Object.assign({ token: "", gist: "", login: "", last: 0, reset: 0 }, load(KEYS.sync) || {});
  const saveSync = () => save(KEYS.sync, sync);

  // ---------- indexes ----------
  const pointById = new Map(D.points.map((p) => [p.id, p]));
  const setById = new Map(D.sets.map((s) => [s.id, s]));
  const qById = new Map(D.questions.map((q) => [q.id, q]));
  const lessonKeys = Object.keys(D.lessons);
  const setsOf = new Map();
  for (const s of D.sets) {
    for (const id of s.members) {
      if (!setsOf.has(id)) setsOf.set(id, []);
      setsOf.get(id).push(s);
    }
  }
  const pointsOfQ = (q) => (q.type === "p9" ? q.qs.map((b) => b.point) : [q.point]);
  const K = D.kanji || [];
  const kanjiOf = new Map(K.map((x) => [x.k, x]));
  const SOUND = window.N2_SOUND || {}; // js/sound.js, the sound part of each gap kanji that has one
  const isK = (q) => q.type[0] === "k";
  const V = D.vocab || [];
  const vById = new Map(V.map((q) => [q.id, q]));
  const R = D.passages || [];
  const rById = new Map(R.map((p) => [p.id, p]));
  const isV = (q) => q.type[0] === "v";
  // 問題9 passages and 情報検索 notices both hold several questions, answered one at a time.
  const isMulti = (q) => q.type === "p9" || q.type === "r14";
  const itemById = (id) => qById.get(id) || vById.get(id) || rById.get(id);
  const storeOf = (q) => (isK(q) ? "kanji" : isV(q) ? "vocab" : q.type === "r14" ? "reading" : "points");

  const today = () => S.dayStr(new Date());
  const status = (id) => S.status(state.points[id]);
  const kstatus = (k) => S.status(state.kanji[k], S.TARGET.kr);
  const vstatus = (q) => S.status(state.vocab[q.id], S.TARGET[q.type]);
  // Kanji your WaniKani level already covers are left out of new introductions.
  const inGap = (x) => !(x.wk && x.wk <= settings.wk);

  // Which lessons count, from the "I have studied up to" setting. null means everything.
  function covered() {
    if (settings.upto === "all") return null;
    const i = lessonKeys.indexOf(settings.upto);
    return i < 0 ? null : new Set(lessonKeys.slice(0, i + 1));
  }
  function scopedPoints() {
    const cov = covered();
    return D.points.filter((p) => !cov || cov.has(p.l));
  }
  // Questions for scheduled modes (today, mock, passage): every point they test must be in scope.
  function pool() {
    const cov = covered();
    return D.questions.filter((q) => pointsOfQ(q).every((id) => !cov || cov.has(pointById.get(id).l)));
  }

  // ---------- small helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function fmtDate(ds) {
    const [y, m, d] = ds.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtSecs(secs) {
    const s = Math.round(secs);
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`;
  }
  const lessonLabel = (l) => (/^\d+$/.test(l) ? `Lesson ${l}` : { IV: "Section IV", P2: "第2部", P3: "第3部", X: "敬語" }[l] || l);
  const glyph = (st) => `<span class="st ${st}" title="${STATUS[st][1]}">${STATUS[st][0]}</span>`;
  function chip(id) {
    const p = pointById.get(id);
    return p ? `<button class="chip jp" data-act="point" data-id="${esc(id)}">${esc(p.form)}</button>` : "";
  }
  const seenQ = (id) => (state.qs[id] ? state.qs[id].seen : 0);

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  let audio = null;
  function beep(ok) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = ok ? 880 : 196;
      g.gain.setValueAtTime(0.08, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.2);
    } catch (e) {
      // No audio available; stay silent.
    }
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  // Sentence or passage to HTML: blanks become boxes (or the filled answer) and cue words are marked.
  function rich(text, { cues = [], fill = {}, current = null } = {}) {
    const ranges = [];
    const re = /（　　）|\{(\d+)\}/g;
    let m;
    while ((m = re.exec(text))) ranges.push({ s: m.index, e: m.index + m[0].length, blank: m[1] || "" });
    for (const c of cues) {
      if (!c) continue;
      let from = 0;
      let at;
      while ((at = text.indexOf(c, from)) >= 0) {
        ranges.push({ s: at, e: at + c.length });
        from = at + c.length;
      }
    }
    ranges.sort((a, b) => a.s - b.s);
    let out = "";
    let pos = 0;
    for (const r of ranges) {
      if (r.s < pos) continue;
      out += esc(text.slice(pos, r.s));
      if (r.blank !== undefined) {
        const f = fill[r.blank];
        const cls = r.blank === current ? " current" : "";
        out += f !== undefined
          ? `<span class="blank filled${cls}">${esc(f)}</span>`
          : `<span class="blank${cls}">${r.blank ? `<span class="n">${r.blank}</span>` : "　"}</span>`;
      } else {
        out += `<mark class="cue">${esc(text.slice(r.s, r.e))}</mark>`;
      }
      pos = r.e;
    }
    return out + esc(text.slice(pos));
  }

  // ---------- routing ----------
  let sess = null; // the running quiz
  let last = null; // the finished quiz, for the results screen
  const browse = { q: "", f: "all" };
  const setFilter = { f: "all" };
  const kbrowse = { q: "", f: "all" };

  // The four tabs. A page opened from a tab (sets, custom, settings) goes back to that tab.
  const TAB_NAME = { home: "Today", practice: "Practice", progress: "Progress", library: "Library" };
  let fromTab = "library";

  function screenOf() {
    return location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  }
  function nav(to) {
    const target = "#/" + to;
    if (location.hash === target) render();
    else location.hash = target;
  }
  function paint(html, tabs = false) {
    app.innerHTML = html;
    document.body.classList.toggle("has-tabs", tabs);
  }
  // `keepScroll` is for a background refresh (a sync brought new progress): stay where the reader is.
  function render(keepScroll) {
    closeModal();
    document.body.classList.toggle("eink", !!settings.eink);
    const [screen, arg] = screenOf();
    let html;
    let tab = null;
    switch (screen) {
      case "quiz":
        if (!sess) return nav("home");
        return paintQuiz(true);
      case "results":
        if (!last) return nav("home");
        html = viewResults();
        break;
      case "practice":
        tab = screen;
        html = viewPractice();
        break;
      case "progress":
        tab = screen;
        html = viewProgress();
        break;
      case "library":
        tab = screen;
        html = viewLibrary();
        break;
      case "sets":
        html = viewSets();
        break;
      case "set":
        html = setById.has(arg) ? viewSet(setById.get(arg)) : viewSets();
        break;
      case "browse":
        html = viewBrowse();
        break;
      case "rules":
        html = viewRules(arg);
        break;
      case "custom":
        html = viewCustom();
        break;
      case "kanji":
        html = viewKanji();
        break;
      case "vocab":
        html = viewVocab();
        break;
      case "settings":
        html = viewSettings();
        break;
      default:
        tab = "home";
        html = viewToday();
    }
    if (tab) fromTab = tab;
    paint(html, !!tab);
    if (keepScroll !== true) window.scrollTo(0, 0);
  }

  function header() {
    const exam = settings.examDate || S.nextExam();
    const days = exam ? S.daysBetween(today(), exam) : null;
    return `<header class="top">
      <button class="brand" data-act="nav" data-to="home"><h1>N2 文法ドリル</h1><small>pick the right form, fast</small></button>
      ${exam ? `<div class="exam">JLPT ${esc(fmtDate(exam))}<b>${days >= 0 ? `${days} days` : "passed"}</b></div>` : ""}
    </header>`;
  }
  const back = (to = fromTab, label = TAB_NAME[to] || "Back") => `<p><button class="linkish" data-act="nav" data-to="${to}">← ${label}</button></p>`;

  // ---------- daily counts ----------
  function todayCounts() {
    const t = today();
    const byPoint = S.indexByPoint(pool());
    const pts = scopedPoints().filter((p) => byPoint.has(p.id));
    const ps = (id) => state.points[id];
    const due = pts.filter((p) => ps(p.id) && ps(p.id).seen && ps(p.id).due <= t).length;
    const fresh = pts.filter((p) => !ps(p.id) || !ps(p.id).seen).length;
    const newLeft = Math.min(fresh, Math.max(0, settings.newPerDay - S.newToday(state, t)));
    const tomorrow = pts.filter((p) => ps(p.id) && ps(p.id).seen && ps(p.id).due === S.addDays(t, 1)).length;
    // Due points come first when there is a backlog, but a quarter of the session stays open for new ones.
    const n = Math.min(settings.size, due + newLeft);
    const nNew = Math.min(newLeft, Math.max(n - due, Math.floor(n / 4)));
    return { due, fresh, newLeft, tomorrow, n, nNew };
  }

  function dayStreak() {
    const studied = (d) => state.days[d] || state.kdays[d] || state.vdays[d] || state.rdays[d];
    let d = today();
    if (!studied(d)) d = S.addDays(d, -1);
    let n = 0;
    while (studied(d)) {
      n++;
      d = S.addDays(d, -1);
    }
    return n;
  }

  // The day as three blocks: grammar, then vocab, then kanji. `n` is what each block has left today.
  function dayPlan() {
    const t = today();
    const g = todayCounts();
    const plan = [{ id: "grammar", name: "Grammar", sub: "問題7 and 8: the right form, fast", n: g.n, mins: (g.n * 40) / 60, done: (state.days[t] || {}).n || 0, act: "today", unit: "questions" }];
    if (V.length) {
      const v = vocabCounts();
      plan.push({ id: "vocab", name: "Vocab", sub: "語形成, 言い換え, 用法", n: v.n, mins: (v.n * 35) / 60, done: (state.vdays[t] || {}).n || 0, act: "vocab-today", unit: "items" });
    }
    if (K.length) {
      const k = kanjiCounts();
      plan.push({ id: "kanji", name: "Kanji", sub: `Exam kanji past WaniKani ${settings.wk}`, n: k.n, mins: (k.n * 15 + k.nNew * 20) / 60, done: (state.kdays[t] || {}).n || 0, act: "kanji-today", unit: "kanji" });
    }
    for (const b of plan) b.mins = b.n ? Math.max(1, Math.round(b.mins)) : 0;
    return plan;
  }

  // Today, Practice, Progress and Library. The quiz and the screens under Library have no tab bar.
  function tabbar(active) {
    const tabs = [["home", "今日", "Today"], ["practice", "練習", "Practice"], ["progress", "記録", "Progress"], ["library", "資料", "Library"]];
    return `<nav class="tabbar" aria-label="Sections">${tabs
      .map(([to, jp, en]) => `<button class="${to === active ? "on" : ""}" data-act="nav" data-to="${to}"${to === active ? ' aria-current="page"' : ""}><span class="jp">${jp}</span>${en}</button>`)
      .join("")}</nav>`;
  }

  // One stacked bar for a group of statuses: automatic, solid, learning, weak, then not met.
  function statusBar(label, sts) {
    const k = { auto: 0, solid: 0, learning: 0, weak: 0, new: 0 };
    sts.forEach((s) => k[s]++);
    const w = (x) => ((x / sts.length) * 100).toFixed(1);
    return `<div><div class="lab"><span>${esc(label)}</span><span>${k.auto + k.solid}/${sts.length}</span></div>
      <div class="bar">${["auto", "solid", "learning", "weak", "new"].map((s) => (k[s] ? `<span class="${s}" style="width:${w(k[s])}%"></span>` : "")).join("")}</div></div>`;
  }
  const legend = () =>
    `<div class="legend">${["auto", "solid", "learning", "weak"].map((s) => `<span><i class="st-${s}"></i>${STATUS[s][1]}</span>`).join("")}<span><i style="border:1px solid var(--line)"></i>Not met</span></div>`;

  // ---------- today ----------
  function viewToday() {
    const plan = dayPlan();
    const next = plan.find((b) => b.n > 0);
    const left = plan.reduce((a, b) => a + b.mins, 0);
    const answered = plan.reduce((a, b) => a + b.done, 0);
    const rows = plan
      .map((b) => {
        const done = !b.n;
        const right = done ? (b.done ? `${b.done} done` : "Nothing due") : `${b.n} · ${b.mins} min`;
        const inner = `<span class="tick${done ? " on" : ""}" aria-hidden="true">${done ? "✓" : ""}</span><span><b>${b.name}</b><small>${esc(b.sub)}</small></span><span class="meta">${right}</span>`;
        return done ? `<div class="block done">${inner}</div>` : `<button class="block" data-act="${b.act}">${inner}</button>`;
      })
      .join("");
    const date = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const main = next
      ? `<button class="btn primary wide go" data-act="${next.act}">Start ${next.name.toLowerCase()}: ${next.n} ${next.unit}, about ${next.mins} min</button>`
      : `<button class="btn wide" data-act="nav" data-to="practice">Extra practice</button>`;
    const ever = [state.days, state.kdays, state.vdays, state.rdays].some((l) => Object.keys(l).length);
    const blocks = ["", "one short block", "two short blocks, grammar first", "three short blocks, grammar first"][plan.length];
    const firstTime = ever
      ? ""
      : `<div class="card"><h3>How this works</h3><ul class="small" style="margin:0;padding-left:18px">
          <li>Do <b>Today</b> once a day: ${blocks}. Each item comes back just before you would forget it.</li>
          <li>After each answer, read the one-line <b>tell</b>. That is the thing to learn.</li>
          <li>Right but slow counts as not learned yet, so it comes back tomorrow.</li>
          <li>Mocks${R.length ? ", look-alike sets and 情報検索" : " and look-alike sets"} are in <b>Practice</b>.</li>
          <li>Still working through the book? Set how far you have got in <button class="linkish" data-act="nav" data-to="settings">Settings</button>.</li>
        </ul></div>`;
    const streak = dayStreak();
    return `${header()}
      <div class="card today">
        <div><span class="kicker">Today · ${esc(date)}</span><h2>${next ? `About ${left} min` : "Done for today"}</h2>
        ${next ? "" : `<p class="muted small" style="margin:0">Everything due today is done. Extra drills are in Practice.</p>`}</div>
        <div class="blocks">${rows}</div>
        ${main}
      </div>
      <p class="muted small center" style="margin:0 0 2px">${streak ? `${streak}-day streak · ` : ""}${answered} answered today</p>
      ${syncNote()}
      ${firstTime}
      ${tabbar("home")}`;
  }

  // ---------- practice ----------
  function viewPractice() {
    const row = (act, title, sub, data = "") =>
      `<button class="item two" data-act="${act}" ${data}><span><span class="form">${title}</span><span class="sub">${sub}</span></span><span class="meta">›</span></button>`;
    const section = (title, rows) => (rows ? `<div class="lesson-h">${title}</div>${rows}` : "");
    const has = (t) => V.filter((q) => q.type === t).length;
    const exam = [
      row("mock", "Grammar section", "問題7 ×12, 問題8 ×5 and one 問題9 passage · about 15 min"),
      S.VTYPES.every((t) => has(t) >= 5) ? row("vocab-mock", "Vocab section", "問題3, 5 and 6, five of each · about 8 min") : "",
      R.length ? row("notice", "情報検索 (問題14)", `One notice, two questions · about 7 min · ${R.filter((p) => state.qs[`${p.id}#1`]).length}/${R.length} done`) : "",
      row("passage", "One passage (問題9)", "A short text with five blanks"),
    ].join("");
    const mix = S.mixups(state, 3).filter((x) => pointById.has(x.a) && pointById.has(x.b));
    const weak = [
      ...mix.map((x) => row("pair", `<span class="jp">${esc(pointById.get(x.a).form)}</span> <span class="muted">not</span> <span class="jp">${esc(pointById.get(x.b).form)}</span>`, `Your mix-up, ${x.n}× · drill the pair`, `data-a="${esc(x.a)}" data-b="${esc(x.b)}"`)),
      row("nav", "Confusable sets", `${D.sets.length} look-alike groups and the rule that splits them`, 'data-to="sets"'),
      row("weakest", "Weakest grammar", `Your ${settings.size} weakest points`),
      V.length ? row("vocab-weak", "Weakest vocab", "Items you missed or answered slowly") : "",
      K.length ? row("kanji-weak", "Weakest kanji", "Kanji you missed or answered slowly") : "",
    ].join("");
    const byType = [
      ...S.VTYPES.filter(has).map((t) => row("vocab-type", VNAME[t][1], `Ten ${VNAME[t][0]} items: due, then new, then weakest`, `data-t="${t}"`)),
      row("nav", "Custom grammar drill", "Pick lessons and question types", 'data-to="custom"'),
    ].join("");
    const ahead = [
      row("more-new", "10 new grammar points", "On top of today's plan"),
      V.length ? row("vocab-more", "6 new vocab items", "On top of today's plan") : "",
      K.length ? row("kanji-more", "5 new kanji", "On top of today's plan") : "",
    ].join("");
    return `${header()}
      <h2>Practice</h2>
      <p class="muted small">Extra drills on top of Today. As the exam gets close, do a timed section twice a week.</p>
      <div class="list">${section("Timed exam sections", exam)}${section("Weak spots", weak)}${section("One question type", byType)}${section("Get ahead", ahead)}</div>
      ${tabbar("practice")}`;
  }

  // ---------- progress ----------
  // Answers per day for the last 14 days. One series, so no legend; each bar carries its numbers on hover.
  function activityChart(days) {
    const max = Math.max(10, ...days.map((x) => x.n));
    const peak = days.reduce((a, x) => (x.n > a.n ? x : a), days[0]);
    const label = (x) => `${fmtDate(x.d)}: ${x.n} answered${x.n ? `, ${Math.round((x.right / x.n) * 100)}% right, ${Math.round(x.secs / 60)} min` : ""}`;
    const letter = (ds) => {
      const [y, m, d] = ds.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "narrow" });
    };
    const cols = days
      .map((x, i) => {
        const h = x.n ? Math.max(3, Math.round((x.n / max) * 85)) : 0;
        const show = x.n && (i === days.length - 1 || x === peak);
        return `<div class="col" title="${esc(label(x))}" role="img" aria-label="${esc(label(x))}">${show ? `<span class="v">${x.n}</span>` : ""}<span class="b" style="height:${h}%"></span></div>`;
      })
      .join("");
    const ticks = days.map((x, i) => `<span${i === days.length - 1 ? ' class="today"' : ""}>${letter(x.d)}</span>`).join("");
    const rows = days
      .slice()
      .reverse()
      .map((x) => `<tr><td>${esc(fmtDate(x.d))}</td><td>${x.n}</td><td>${x.n ? `${Math.round((x.right / x.n) * 100)}%` : ""}</td><td>${x.n ? Math.round(x.secs / 60) : ""}</td></tr>`)
      .join("");
    return `<div class="chart">${cols}</div><div class="chart-days">${ticks}</div>
      <details class="small" style="margin-top:8px"><summary>Show as a table</summary>
        <table><thead><tr><th>Day</th><th>Answered</th><th>Right</th><th>Minutes</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  }

  function viewProgress() {
    const t = today();
    const logs = [state.days, state.kdays, state.vdays, state.rdays];
    const dayTotal = (d) =>
      logs.reduce(
        (a, l) => {
          const x = l[d];
          if (x) {
            a.n += x.n;
            a.right += x.right;
            a.secs += x.secs;
          }
          return a;
        },
        { d, n: 0, right: 0, secs: 0 }
      );
    const days14 = Array.from({ length: 14 }, (_, i) => dayTotal(S.addDays(t, i - 13)));
    const week = days14.slice(7).reduce((a, x) => ({ n: a.n + x.n, right: a.right + x.right, secs: a.secs + x.secs }), { n: 0, right: 0, secs: 0 });
    const exam = settings.examDate || S.nextExam();
    const left = exam ? S.daysBetween(t, exam) : null;

    const cov = covered();
    const grammar = D.sections
      .map((sec) => {
        const ids = D.points.filter((p) => sec.lessons.includes(p.l) && (!cov || cov.has(p.l))).map((p) => p.id);
        return ids.length ? statusBar(sec.name, ids.map(status)) : "";
      })
      .join("");
    const vocab = S.VTYPES.filter((ty) => V.some((q) => q.type === ty))
      .map((ty) => statusBar(VNAME[ty][1], V.filter((q) => q.type === ty).map(vstatus)))
      .join("");
    const gap = K.filter(inGap);
    const kanji = (D.kanjiTiers || [])
      .map((tier) => {
        const xs = gap.filter((x) => x.tier === tier.id);
        return xs.length ? statusBar(tier.name, xs.map((x) => kstatus(x.k))) : "";
      })
      .join("");
    const mix = S.mixups(state, 5).filter((x) => pointById.has(x.a) && pointById.has(x.b));
    const mixCard = mix.length
      ? `<div class="card"><h3>Your top mix-ups</h3><p class="muted small">The answer was the first form; you reached for the second. Tap to drill the pair.</p>
          <div class="mix">${mix
            .map((x) => `<button data-act="pair" data-a="${esc(x.a)}" data-b="${esc(x.b)}"><span class="form">${esc(pointById.get(x.a).form)} <span class="muted">not</span> ${esc(pointById.get(x.b).form)}</span><span class="muted small">${x.n}×</span></button>`)
            .join("")}</div></div>`
      : "";
    const pts = scopedPoints();
    const gMet = pts.filter((p) => status(p.id) !== "new").length;
    const vMet = V.filter((q) => vstatus(q) !== "new").length;
    const kMet = gap.filter((x) => kstatus(x.k) !== "new").length;
    return `${header()}
      <h2>Progress</h2>
      <div class="stats">
        <div><b>${dayStreak()}</b>day streak</div>
        <div><b>${week.n}</b>answered this week</div>
        <div><b>${Math.round(week.secs / 60)} min</b>studied this week</div>
        <div><b>${week.n ? `${Math.round((week.right / week.n) * 100)}%` : "–"}</b>right this week</div>
      </div>
      <div class="card"><h3>Answers per day, last 14 days</h3>${activityChart(days14)}</div>
      <div class="card"><h3>Met so far${left !== null && left >= 0 ? `, ${left} days to the exam` : ""}</h3>
        <div class="stats tight">
          <div><b>${gMet}/${pts.length}</b>grammar points</div>
          ${V.length ? `<div><b>${vMet}/${V.length}</b>vocab items</div>` : ""}
          ${K.length ? `<div><b>${kMet}/${gap.length}</b>kanji</div>` : ""}
        </div></div>
      <div class="card"><h3>Grammar by section</h3><div class="bars">${grammar}</div>${legend()}</div>
      ${vocab ? `<div class="card"><h3>Vocab by question type</h3><div class="bars">${vocab}</div>${legend()}</div>` : ""}
      ${kanji ? `<div class="card"><h3>Kanji by tier</h3><div class="bars">${kanji}</div>${legend()}</div>` : ""}
      ${mixCard}
      ${syncNote()}
      ${tabbar("progress")}`;
  }

  // ---------- library ----------
  function viewLibrary() {
    const row = (to, title, sub) =>
      `<button class="item two" data-act="nav" data-to="${to}"><span><span class="form">${title}</span><span class="sub">${sub}</span></span><span class="meta">›</span></button>`;
    return `${header()}
      <h2>Library</h2>
      <p class="muted small">Look things up. Nothing here is scheduled.</p>
      <div class="list">
        ${row("browse", "Grammar points", `${D.points.length} points: connection, register, restrictions and an example`)}
        ${row("sets", "Confusable sets", "Look-alike forms and the one-line rule for each")}
        ${row("rules", "Cheat sheets", "Locked endings, connectives, register, もの・こと・わけ")}
        ${K.length ? row("kanji", "Kanji gap", `${K.length} exam kanji WaniKani teaches after level 27, with words and look-alikes`) : ""}
        ${V.length || R.length ? row("vocab", V.length ? "Vocab and 情報検索" : "情報検索", V.length ? "Word lists by question type, and how to scan a notice" : "How to scan a notice for the answer") : ""}
        ${row("settings", "Settings, sync and backup", "Daily amounts, sync between devices, export")}
      </div>
      <p class="foot">${D.points.length} points · ${D.questions.length} questions${K.length ? ` · ${K.length} kanji` : ""}${V.length ? ` · ${V.length} vocab` : ""}${R.length ? ` · ${R.length} notices` : ""} · data ${esc(D.version)}${settings.upto !== "all" ? ` · studying up to ${esc(lessonLabel(settings.upto))}` : ""}<br>
        <a href="${REPO}" target="_blank" rel="noopener">Source</a></p>
      ${tabbar("library")}`;
  }

  // ---------- starting sessions ----------
  function begin(mode, title, items) {
    if (!items.length) return toast("No questions match that yet.");
    sess = { mode, title, items, i: 0, res: [], requeued: new Set(), mock: mode === "mock" || mode === "vmock", started: Date.now() };
    if (sess.mock) sess.deadline = Date.now() + items.reduce((a, q) => a + MOCK_SECS[q.type], 0) * 1000;
    startItem();
    nav("quiz");
  }

  function startToday(kind) {
    const t = today();
    const args = { state, questions: pool(), points: scopedPoints(), today: t };
    if (kind === "today") {
      const c = todayCounts();
      begin("today", "Today", S.buildDaily({ ...args, size: c.n, newPerDay: c.nNew }).items);
    } else if (kind === "more-new") {
      begin("today", "New points", S.buildDaily({ ...args, size: 10, newPerDay: 10 }).items);
    } else {
      begin("today", "Weakest", S.buildDaily({ ...args, size: settings.size, newPerDay: 0 }).items);
    }
  }

  function kanjiCounts() {
    const t = today();
    const ks = (k) => state.kanji[k];
    const met = K.filter((x) => ks(x.k) && ks(x.k).seen).length;
    const due = K.filter((x) => ks(x.k) && ks(x.k).seen && ks(x.k).due <= t).length;
    const fresh = K.filter((x) => (!ks(x.k) || !ks(x.k).seen) && inGap(x)).length;
    const newLeft = Math.min(fresh, Math.max(0, settings.kNew - S.newToday(state, t, "kanji")));
    const n = Math.min(settings.kSize, due + newLeft);
    const nNew = Math.min(newLeft, Math.max(n - due, Math.floor(n / 4)));
    return { met, due, fresh, newLeft, n, nNew, gap: K.filter(inGap).length };
  }

  function startKanji(kind) {
    const args = { state, kanji: K, today: today(), wkLevel: settings.wk };
    if (kind === "kanji-today") {
      const c = kanjiCounts();
      begin("kanji", "Kanji", S.buildKanjiDaily({ ...args, size: c.n, newPerDay: c.nNew }).items);
    } else if (kind === "kanji-more") {
      begin("kanji", "New kanji", S.buildKanjiDaily({ ...args, size: 5, newPerDay: 5 }).items);
    } else {
      begin("kanji", "Weakest kanji", S.buildKanjiDaily({ ...args, size: settings.kSize, newPerDay: 0, topUp: true }).items);
    }
  }

  function vocabCounts() {
    const t = today();
    const vs = (id) => state.vocab[id];
    const met = V.filter((q) => vs(q.id) && vs(q.id).seen).length;
    const due = V.filter((q) => vs(q.id) && vs(q.id).seen && vs(q.id).due <= t).length;
    const fresh = V.length - met;
    const newLeft = Math.min(fresh, Math.max(0, settings.vNew - S.newToday(state, t, "vocab")));
    const n = Math.min(settings.vSize, due + newLeft);
    const nNew = Math.min(newLeft, Math.max(n - due, Math.floor(n / 4)));
    return { met, due, fresh, newLeft, n, nNew };
  }

  function startVocab(kind, type) {
    const args = { state, items: V, today: today() };
    if (kind === "vocab-today") {
      const c = vocabCounts();
      begin("vocab", "Vocab", S.buildVocabDaily({ ...args, size: c.n, newPerDay: c.nNew }).items);
    } else if (kind === "vocab-more") {
      begin("vocab", "New vocab", S.buildVocabDaily({ ...args, size: 6, newPerDay: 6 }).items);
    } else if (kind === "vocab-weak") {
      begin("vocab", "Weakest vocab", S.buildVocabDaily({ ...args, size: settings.vSize, newPerDay: 0, topUp: true }).items);
    } else if (kind === "vocab-type") {
      // A drill on one type: due ones, then new ones, then the weakest, ten in all.
      begin("vocab", VNAME[type][0], S.buildVocabDaily({ ...args, size: 10, newPerDay: 10, types: new Set([type]), topUp: true }).items);
    } else {
      begin("vmock", "Vocab section", S.buildVocabMock({ state, items: V }));
    }
  }

  function startNotice() {
    const p = S.pickPassage({ state, passages: R });
    if (!p) return toast("No notices yet.");
    begin("reading", "情報検索", [p]);
  }

  function startPassage() {
    const ps = pool().filter((q) => q.type === "p9");
    if (!ps.length) return toast("No passages in your study range yet.");
    const min = Math.min(...ps.map((q) => seenQ(`${q.id}#1`)));
    const fresh = S.shuffle(ps.filter((q) => seenQ(`${q.id}#1`) === min));
    begin("passage", "Passage", [fresh[0]]);
  }

  // ---------- quiz ----------
  const cur = () => sess.items[sess.i];

  function startItem() {
    const q = cur();
    sess.t0 = Date.now();
    // A teaching card has nothing to answer: it is "answered" as soon as it shows, so Next works.
    sess.answered = q.type === "kn" ? { intro: true } : null;
    sess.hint = false;
    sess.order = S.shuffle([0, 1, 2, 3]);
    if (q.type === "p8") sess.built = [];
    if (isMulti(q)) sess.blank = 0;
  }

  function paintQuiz(top) {
    paint(viewQuiz());
    const passage = app.querySelector(".passage");
    const at = passage && passage.querySelector(".blank.current");
    if (at) passage.scrollTop = Math.max(0, at.offsetTop - 60);
    if (top) window.scrollTo(0, 0);
  }

  function clockText() {
    if (sess.mock) {
      const left = Math.max(0, (sess.deadline - Date.now()) / 1000);
      if (settings.eink) return `${Math.ceil(left / 60)} min left`;
      return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    }
    const q = cur();
    if (q.type === "kn") return "new";
    if (sess.answered) return fmtSecs(sess.answered.secs);
    if (!settings.timer || settings.eink) return `aim ${fmtSecs(S.TARGET[q.type])}`;
    return fmtSecs(Math.floor((Date.now() - sess.t0) / 1000));
  }

  setInterval(() => {
    if (!sess || screenOf()[0] !== "quiz") return;
    const el = app.querySelector(".clock");
    if (!el) return;
    if (sess.mock) {
      const left = (sess.deadline - Date.now()) / 1000;
      if (left <= 0) return finishMock();
      el.classList.toggle("over", left < 60);
    } else if (sess.answered || !settings.timer || settings.eink) {
      return;
    } else {
      el.classList.toggle("over", (Date.now() - sess.t0) / 1000 > S.TARGET[cur().type]);
    }
    const txt = clockText();
    if (el.textContent !== txt) el.textContent = txt;
  }, 1000);

  function viewQuiz() {
    const q = cur();
    const n = sess.items.length;
    const pct = Math.round((sess.i / n) * 100);
    const canHint = !sess.mock && !sess.answered && !sess.hint && q.type !== "p8" && !isK(q) && !isV(q);
    const body = isK(q) ? qK(q) : isV(q) ? qV(q) : q.type === "r14" ? qR14(q) : q.type === "p7" ? qP7(q) : q.type === "p8" ? qP8(q) : qP9(q);
    return `<div class="qbar">
        <button class="quit" data-act="quit">✕ ${sess.mock ? "End" : "Stop"}</button>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <span>${sess.i + 1}/${n}</span><span class="clock">${clockText()}</span>
      </div>
      <div class="card">
        <div class="qtype"><span class="tag">${TYPE_NAME[q.type]}${sess.answered && q.type !== "kn" ? ` · ${esc(q.id)}` : ""}</span>${canHint ? `<button class="linkish small" data-act="hint">Show the cue <kbd>H</kbd></button>` : ""}</div>
        ${body}
      </div>`;
  }

  function choiceButtons(b, a) {
    return sess.order
      .map((orig, d) => {
        const cls = !a ? "" : orig === 0 ? "right" : orig === a.orig ? "wrong" : "dim";
        return `<button class="choice ${cls}" data-act="answer" data-i="${d}" ${a ? "disabled" : ""}><span class="num">${d + 1}</span><span>${esc(b.c[orig])}</span></button>`;
      })
      .join("");
  }

  function qP7(q) {
    const a = sess.answered;
    const sentence = rich(q.s, { cues: a || sess.hint ? q.cue : [], fill: a ? { "": q.c[0] } : {} });
    return `<div class="sentence">${sentence}</div>
      <div class="choices">${choiceButtons(q, a)}</div>
      ${a ? feedback(q, a, sess.order, { en: q.en, set: q.set, next: true }) : ""}`;
  }

  function qP9(q) {
    const a = sess.answered;
    const k = sess.blank;
    const b = q.qs[k];
    const fill = {};
    if (!sess.mock) for (let j = 0; j < k; j++) fill[String(j + 1)] = q.qs[j].c[0];
    if (a) fill[String(k + 1)] = b.c[0];
    const text = rich(q.text, { cues: a || sess.hint ? b.cue : [], fill, current: String(k + 1) });
    const lastBlank = k === q.qs.length - 1;
    return `<div class="passage"><b>${esc(q.title)}</b>\n${q.intro ? `<span class="intro">${esc(q.intro)}</span>` : ""}${text}</div>
      <p class="small muted">Blank ${k + 1} of ${q.qs.length}: which fits?</p>
      <div class="choices">${choiceButtons(b, a)}</div>
      ${a ? feedback(b, a, sess.order, { en: lastBlank ? q.en : "", next: true, nextLabel: lastBlank ? "Next" : "Next blank", target: S.TARGET.p9 }) : ""}`;
  }

  function qP8(q) {
    const a = sess.answered;
    const slots = [0, 1, 2, 3]
      .map((pos) => {
        const k = sess.built[pos];
        const filled = k !== undefined;
        let cls = filled ? "filled" : "";
        if (pos === q.star) cls += " star";
        if (a) cls += k === pos ? " right" : " wrong";
        return `<button class="slot ${cls}" data-act="slot" data-k="${pos}" ${a || !filled ? "disabled" : ""}>${filled ? esc(q.pieces[k]) : "　"}</button>`;
      })
      .join("");
    const pieces = sess.order
      .map((k, d) => `<button class="piece" data-act="piece" data-i="${d}" ${a || sess.built.includes(k) ? "disabled" : ""}><span class="num">${d + 1}</span>${esc(q.pieces[k])}</button>`)
      .join("");
    const ready = sess.built.length === 4;
    return `<div class="build jp">${esc(q.pre)}<span class="slots">${slots}</span>${esc(q.post)}</div>
      ${a
        ? feedback8(q, a, true)
        : `<p class="small muted">Tap the pieces in order. Tap a placed piece to take it back.</p>
           <div class="pieces">${pieces}</div>
           <div class="tools"><button class="btn" data-act="undo" ${sess.built.length ? "" : "disabled"}>Undo</button>
           <button class="btn primary" data-act="check" ${ready ? "" : "disabled"}>Check <kbd>Enter</kbd></button></div>`}`;
  }

  function setBlock(b, setId) {
    const set = (setId && setById.get(setId)) || (setsOf.get(b.point) || [])[0];
    if (!set) return "";
    const rows = set.members
      .map((id) => `<tr><td>${glyph(status(id))}</td><td>${chip(id)}</td><td>${esc(set.rules[id] || "")}</td></tr>`)
      .join("");
    return `<details class="setrules"><summary>${esc(set.title)}: the rule for each</summary><table>${rows}</table>
      <p class="small"><button class="linkish" data-act="nav" data-to="set/${esc(set.id)}">Open this set</button></p></details>`;
  }

  // Feedback for one 4-choice item (a 問題7 question, one 問題9 blank, a vocab item or a 情報検索 question).
  // `extra` is shown under the tell (the word card for vocab).
  function feedback(b, a, order, { en = "", set = null, next = false, nextLabel = "Next", target = S.TARGET.p7, extra = "" } = {}) {
    // A whole sentence (問題6, 情報検索) is named by its number; it is already marked green above.
    const answer = b.c[0].length > 12 ? `number ${order.indexOf(0) + 1}` : esc(b.c[0].replace(/[。.]$/, ""));
    const verdict = a.ok
      ? `<div class="verdict good">Right · ${fmtSecs(a.secs)}${a.secs > target * 1.2 ? ` <span class="muted small">(slow, so it comes back tomorrow)</span>` : ""}</div>`
      : a.skipped
        ? `<div class="verdict bad">Not answered. The answer is ${answer}.</div>`
        : `<div class="verdict bad">Not this time. The answer is ${answer}.</div>`;
    const whys = order
      .map((orig, d) => {
        const cls = orig === 0 ? "right" : orig === a.orig ? "chosen" : "";
        const pid = b.cp ? b.cp[orig] : null;
        const showChip = pid && (orig === 0 || pid !== b.point);
        return `<li class="${cls}"><div class="head"><span class="form jp">${d + 1}. ${esc(b.c[orig])}</span>${showChip ? chip(pid) : ""}</div>${esc(b.why[orig])}</li>`;
      })
      .join("");
    return `<div class="feedback">
      ${verdict}
      <div class="tell">${esc(b.tell)}</div>
      ${extra}
      ${en ? `<div class="en">${esc(en)}</div>` : ""}
      <ul class="why">${whys}</ul>
      ${setBlock(b, set)}
      ${next ? nextButton(nextLabel) : ""}
    </div>`;
  }

  // After a miss, Next waits a moment (Settings: none to 3 seconds), so a quick second Enter cannot
  // skip past the tell and the reason each choice fails. A bar fills along the button meanwhile.
  const held = { timer: null, end: 0, ms: 0 };
  function holdNext() {
    clearHold();
    const ms = Number(settings.missPause) || 0;
    if (ms <= 0) return;
    held.ms = ms;
    held.end = Date.now() + ms;
    held.timer = setTimeout(() => {
      clearHold();
      const b = app.querySelector(".btn.held");
      if (b) {
        b.classList.remove("held");
        b.removeAttribute("aria-disabled");
      }
    }, ms);
  }
  function clearHold() {
    clearTimeout(held.timer);
    held.timer = null;
  }
  function nextButton(label = "Next") {
    if (!held.timer) return `<button class="btn primary wide" data-act="next">${label} <kbd>Enter</kbd></button>`;
    const at = held.ms - Math.max(0, held.end - Date.now()); // a repaint carries the bar on from here
    return `<button class="btn primary wide held" data-act="next" aria-disabled="true" style="--hold:${held.ms}ms;--hold-at:-${at}ms">${label} <kbd>Enter</kbd></button>`;
  }

  function feedback8(q, a, next) {
    const built = a.built || sess.built;
    const sentence = `${esc(q.pre)}<u>${q.pieces.map((p, i) => (i === q.star ? `<b>[★${esc(p)}]</b>` : esc(p))).join("")}</u>${esc(q.post)}`;
    const yours = built.map((k) => esc(q.pieces[k])).join(" / ");
    const verdict = a.skipped
      ? `<div class="verdict bad">Not answered.</div>`
      : a.ok
        ? `<div class="verdict good">★ right · ${fmtSecs(a.secs)}${a.orderOk ? "" : ` <span class="muted small">(your order: ${yours}; the usual order is below)</span>`}</div>`
        : `<div class="verdict bad">Not this time. Your order: ${yours}</div>`;
    return `<div class="feedback">
      ${verdict}
      <div class="jp">${sentence}</div>
      <div class="tell">${esc(q.tell)}</div>
      <div class="en">${esc(q.en)}</div>
      <p class="small">${esc(q.why)}</p>
      <div>${chip(q.point)}</div>
      ${setBlock(q, q.set)}
      ${next ? nextButton() : ""}
    </div>`;
  }

  // ---------- kanji items ----------
  // The sentence with the target word underlined, in kanji or (for 表記) in kana.
  function kSentence(w, kana) {
    const i = w.s.indexOf(w.t);
    return `${esc(w.s.slice(0, i))}<u class="tgt">${esc(kana ? w.tr : w.t)}</u>${esc(w.s.slice(i + w.t.length))}`;
  }

  // Name the trap a wrong reading fell into, the way the exam builds them.
  function trapName(right, wrong) {
    const plain = (s) => s.normalize("NFD").replace(/[゙゚]/g, "").normalize("NFC");
    const short = (s) => s.replace(/っ/g, "").replace(/(?<=[おこそとのほもよろごぞどぼぽょ])う|(?<=[えけせてねへめれげぜでべぺ])い|ー/g, "");
    if (short(right) === short(wrong)) return right.replace(/[^っ]/g, "") !== wrong.replace(/[^っ]/g, "") ? "Small っ trap: check the double consonant." : "Long vowel trap: check the length.";
    if (plain(right) === plain(wrong)) {
      const i = [...right].findIndex((ch, n) => ch !== [...wrong][n]);
      return `Voicing trap: ${[...right][i]}, not ${[...wrong][i]}.`;
    }
    if (plain(short(right)) === plain(short(wrong))) return "Voicing and length trap.";
    return "A different reading: this one belongs to another word or another kanji.";
  }

  // One kanji at a glance: meaning, readings, where it shows up, its words and its look-alikes.
  function kanjiStrip(x, { words = true } = {}) {
    const st = kstatus(x.k);
    const looks = (x.look || []).filter((g) => D.glyphs[g]).map((g) => `<span class="jp">${esc(g)}</span> ${esc(D.glyphs[g].m)}`).join(" · ");
    return `<div class="kstrip">
        <button class="kglyph jp" data-act="kanji" data-k="${esc(x.k)}" title="Open the card">${esc(x.k)}</button>
        <div><b>${esc(x.mean)}</b>
          <div class="small muted jp">${esc([...x.on, ...x.kun].join("、"))}</div>
          <div class="small muted">${glyph(st)} ${STATUS[st][1]} · WaniKani ${x.wk ? `level ${x.wk}` : "does not teach it"}${x.papers ? ` · in ${x.papers} of 17 past N2 papers` : ""}</div></div>
      </div>
      ${words ? `<ul class="kwords">${x.words.map((w) => `<li><span class="jp">${esc(w.w)}</span> <span class="jp muted">${esc(w.r)}</span> ${esc(w.en)}</li>`).join("")}</ul>` : ""}
      ${soundLine(x)}
      ${looks ? `<p class="small"><b>Don't confuse:</b> ${looks}</p>` : ""}`;
  }

  // The sound part (音符): 簡 has 門, read カン as in 間 and 関. Kanji you have reached in WaniKani come
  // first; the rest are muted. It helps with an unknown kanji's on'yomi on the reading questions.
  function soundLine(x) {
    const s = SOUND[x.k];
    if (!s) return "";
    const [part, reads, family] = s;
    const known = (f) => f[2] > 0 && f[2] <= settings.wk;
    const many = reads.length > 1; // 緒 shares ショ and チョ with 者, so each kin shows its reading
    const kin = [...family.filter(known), ...family.filter((f) => !known(f))]
      .slice(0, 6)
      .map((f) => `<span class="jp${known(f) ? "" : " muted"}" title="${esc(f[1])}${f[2] ? ` · WaniKani level ${f[2]}` : ""}">${esc(f[0])}${many ? `<small>${esc(f[1])}</small>` : ""}</span>`)
      .join(" ");
    const r = `<span class="jp">${esc(reads.join("・"))}</span>`;
    const lead = part === x.k ? `<span class="jp">${esc(part)}</span> is one itself, read ${r}` : `<span class="jp">${esc(part)}</span> gives ${r}`;
    return `<p class="small sound"><b>Sound part:</b> ${lead}, as in ${kin}</p>`;
  }

  function qK(q) {
    const x = kanjiOf.get(q.k);
    if (q.type === "kn") {
      const w = x.words[0];
      return `<div class="kintro">${kanjiStrip(x)}
          <div class="sentence">${kSentence(w, false)}</div>
          <div class="en">${esc(w.se)}</div>
          <p class="small muted">Say each word aloud once. Its first question comes in a few items.</p>
          <div class="row"><button class="btn primary" data-act="next">Got it <kbd>Enter</kbd></button>
          <button class="btn" data-act="know">I know this: test me now <kbd>K</kbd></button></div></div>`;
    }
    const w = x.words[q.wi];
    const a = sess.answered;
    const prompt =
      q.type === "km"
        ? `<div class="kword jp">${esc(w.w)}</div><p class="small muted">What does it mean?</p>`
        : `<div class="sentence">${kSentence(w, q.type === "kw")}</div>
           <p class="small muted">${q.type === "kr" ? "How is the underlined word read?" : "Which kanji spell the underlined word?"}</p>`;
    return `${prompt}<div class="choices ${q.type === "km" ? "en-choices" : ""}">${choiceButtons(q, a)}</div>${a ? feedbackK(q, a, true) : ""}`;
  }

  function feedbackK(q, a, next) {
    const x = kanjiOf.get(q.k);
    const w = x.words[q.wi];
    const target = S.TARGET[q.type];
    const verdict = a.ok
      ? `<div class="verdict good">Right · ${fmtSecs(a.secs)}${a.secs > target * 1.2 ? ` <span class="muted small">(slow, so it comes back tomorrow)</span>` : ""}</div>`
      : `<div class="verdict bad">Not this time. The answer is ${esc(q.c[0])}.</div>`;
    let why = "";
    if (!a.ok && a.orig > 0) {
      const wrong = q.c[a.orig];
      if (q.type === "kr") why = trapName(q.c[0], wrong);
      else if (q.type === "kw") {
        const odd = [...wrong].filter((ch) => !w.t.includes(ch) && D.glyphs[ch]);
        why = odd.length ? `${odd.map((ch) => `${ch} is “${D.glyphs[ch].m}” (${D.glyphs[ch].r})`).join("; ")}. The word needs ${[...w.t].filter((ch) => !wrong.includes(ch)).join("")}.` : "Same sound, wrong kanji.";
      } else {
        const owner = K.flatMap((y) => y.words).find((v) => v.en === wrong);
        if (owner) why = `That one is ${owner.w} (${owner.r}).`;
      }
    }
    return `<div class="feedback">
      ${verdict}
      ${why ? `<p class="small">${esc(why)}</p>` : ""}
      <div class="kans"><span class="kword jp">${esc(w.w)}</span><span><b class="jp">${esc(w.r)}</b><br>${esc(w.en)}</span></div>
      <div class="sentence small-s">${kSentence(w, false)}</div>
      <div class="en">${esc(w.se)}</div>
      ${kanjiStrip(x)}
      ${next ? nextButton() : ""}
    </div>`;
  }

  // ---------- vocab items ----------
  // 問題3 shows the blank; 問題5 underlines the words to replace; 問題6 shows the word alone.
  function vPrompt(q, answered) {
    if (q.type === "v3") return `<div class="sentence">${rich(q.s, { fill: answered ? { "": q.c[0] } : {} })}</div>`;
    if (q.type === "v5") {
      const i = q.s.indexOf(q.t);
      return `<div class="sentence">${esc(q.s.slice(0, i))}<u class="tgt">${esc(q.t)}</u>${esc(q.s.slice(i + q.t.length))}</div>`;
    }
    return `<div class="kword jp">${esc(q.w)}</div>`;
  }

  function qV(q) {
    const a = sess.answered;
    return `${vPrompt(q, !!a)}<p class="small muted">${VNAME[q.type][2]}</p>
      <div class="choices${q.type === "v6" ? " long-choices" : ""}">${choiceButtons(q, a)}</div>
      ${a ? feedbackV(q, a, sess.order, true) : ""}`;
  }

  function feedbackV(q, a, order, next) {
    const word = `<div class="kans"><span class="kword jp">${esc(q.w)}</span><span><b class="jp">${esc(q.r)}</b><br>${esc(q.m)}</span></div>`;
    return feedback(q, a, order, { en: q.en || "", next, target: S.TARGET[q.type], extra: word });
  }

  // A missed vocab item comes back once, four items later, with the choices in a new order.
  function requeueV(q) {
    if (sess.mock || sess.mode === "review" || sess.requeued.has(q.id)) return;
    sess.requeued.add(q.id);
    sess.items.splice(Math.min(sess.i + 4, sess.items.length), 0, q);
  }

  // ---------- 情報検索 ----------
  // The notice as a document: headings, paragraphs, lists, tables and ※ notes. Cue words are marked.
  function noticeHTML(p, cues = []) {
    const r = (t) => rich(t, { cues });
    const body = p.blocks
      .map((b) => {
        if (b.h) return `<h4>${r(b.h)}</h4>`;
        if (b.p) return `<p>${r(b.p)}</p>`;
        if (b.note) return `<p class="note">${r(b.note)}</p>`;
        // Numbered steps (①②③) carry their own marker, so they get no bullet.
        if (b.ul) return `<ul${b.ul.every((x) => /^[①-⑳]/.test(x)) ? ` class="steps"` : ""}>${b.ul.map((x) => `<li>${r(x)}</li>`).join("")}</ul>`;
        const [head, ...rows] = b.table;
        return `<div class="twrap"><table><thead><tr>${head.map((c) => `<th>${r(c)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${r(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      })
      .join("");
    return `<div class="notice jp">${p.intro ? `<div class="intro">${esc(p.intro)}</div>` : ""}<div class="doc"><div class="title">${esc(p.title)}</div>${body}</div></div>`;
  }

  function qR14(q) {
    const a = sess.answered;
    const k = sess.blank;
    const b = q.qs[k];
    const lastQ = k === q.qs.length - 1;
    return `${noticeHTML(q, a || sess.hint ? b.cue : [])}
      <p class="rq jp"><span class="small muted">Question ${k + 1} of ${q.qs.length}</span><br>${esc(b.q)}</p>
      <div class="choices long-choices">${choiceButtons(b, a)}</div>
      ${a ? feedback(b, a, sess.order, { en: lastQ ? q.en : "", next: true, nextLabel: lastQ ? "Next" : "Next question", target: S.TARGET.r14 }) : ""}`;
  }

  // "I know this": swap the teaching card for its question now, and drop the later copy.
  function knowIt() {
    if (!sess || cur().type !== "kn") return;
    const k = cur().k;
    const j = sess.items.findIndex((it, n) => n > sess.i && it.k === k && it.taught);
    const q = j > 0 ? sess.items.splice(j, 1)[0] : S.pickKanjiQuestion({ state, kanji: K, x: kanjiOf.get(k) });
    sess.items[sess.i] = { ...q, taught: false };
    startItem();
    paintQuiz(false);
  }

  // A missed kanji comes back once later in the session, through another word or shape.
  function requeueK(q) {
    if (sess.mode === "review" || sess.requeued.has(q.k)) return;
    sess.requeued.add(q.k);
    const ahead = new Set(sess.items.slice(sess.i).map((it) => it.id));
    const opts = S.buildKanjiDrill({ kanji: K, x: kanjiOf.get(q.k), max: 99 }).filter((it) => !ahead.has(it.id) && it.type !== "kw");
    const again = opts.find((it) => it.wi !== q.wi) || opts.find((it) => it.id !== q.id) || q;
    sess.items.splice(Math.min(sess.i + 4, sess.items.length), 0, again);
  }

  function record(q, point, ok, secs, chosenPoint, qid) {
    S.record(state, { qid: qid || q.id, point, ok, secs, type: q.type, chosenPoint, slow: sess.hint, today: today(), store: storeOf(q), firstBox: q.taught ? 1 : 3 });
    saveState();
    syncSoon();
    beep(ok);
  }

  function choose(d) {
    if (!sess || sess.answered) return;
    const q = cur();
    if (q.type === "p8") return;
    const orig = sess.order[d];
    if (orig === undefined) return;
    const b = isMulti(q) ? q.qs[sess.blank] : q;
    const ok = orig === 0;
    const secs = (Date.now() - sess.t0) / 1000;
    const qid = isMulti(q) ? `${q.id}#${sess.blank + 1}` : q.id;
    // Vocab items are their own unit of memory; each 情報検索 question is logged on its own.
    const point = isV(q) ? q.id : q.type === "r14" ? qid : b.point;
    record(q, point, ok, secs, ok || !b.cp ? null : b.cp[orig], qid);
    sess.res.push({ qid: q.id, blank: isMulti(q) ? sess.blank : null, ok, secs, orig, order: sess.order.slice(), item: isK(q) ? q : null });
    if (!ok && q.type === "p7") requeue(b.point);
    if (!ok && isK(q)) requeueK(q);
    if (!ok && isV(q)) requeueV(q);
    if (sess.mock) return advance();
    sess.answered = { orig, ok, secs };
    if (!ok) holdNext();
    paintQuiz(false);
  }

  function pick(d) {
    if (!sess || sess.answered) return;
    const k = sess.order[d];
    if (k === undefined || sess.built.includes(k) || sess.built.length >= 4) return;
    sess.built.push(k);
    paintQuiz(false);
  }
  function unslot(pos) {
    if (!sess || sess.answered || sess.built[pos] === undefined) return;
    sess.built.splice(pos, 1);
    paintQuiz(false);
  }
  function check() {
    if (!sess || sess.answered || sess.built.length !== 4) return;
    // Scored like the paper: the ★ piece decides it. The full order is shown either way.
    const q = cur();
    const orderOk = sess.built.every((k, i) => k === i);
    const ok = sess.built[q.star] === q.star;
    const secs = (Date.now() - sess.t0) / 1000;
    record(q, q.point, ok, secs, null);
    sess.res.push({ qid: q.id, blank: null, ok, starOk: ok, orderOk, secs, built: sess.built.slice() });
    if (!ok) requeue(q.point);
    if (sess.mock) return advance();
    sess.answered = { ok, starOk: ok, orderOk, secs };
    if (!ok) holdNext();
    paintQuiz(false);
  }

  // A missed point comes back once later in the same session, with a different sentence when there is one.
  function requeue(point) {
    if (sess.mock || sess.mode === "review" || sess.requeued.has(point)) return;
    sess.requeued.add(point);
    const ahead = new Set(sess.items.slice(sess.i).map((q) => q.id));
    const cands = D.questions.filter((q) => q.type === "p7" && q.point === point && !ahead.has(q.id));
    const q = cands.length ? cands.sort((x, y) => seenQ(x.id) - seenQ(y.id))[0] : cur();
    sess.items.splice(Math.min(sess.i + 4, sess.items.length), 0, q);
  }

  function hint() {
    if (!sess || sess.mock || sess.answered || cur().type === "p8" || isK(cur()) || isV(cur())) return;
    sess.hint = true;
    paintQuiz(false);
  }

  function advance() {
    if (held.timer) return;
    const q = cur();
    if (isMulti(q) && sess.blank < q.qs.length - 1) {
      sess.blank++;
      sess.t0 = Date.now();
      sess.answered = null;
      sess.hint = false;
      sess.order = S.shuffle([0, 1, 2, 3]);
      return paintQuiz(false);
    }
    sess.i++;
    if (sess.i >= sess.items.length) return finish();
    startItem();
    paintQuiz(true);
  }

  function finish() {
    sess.ended = Date.now();
    last = sess;
    sess = null;
    nav("results");
    syncNow("finished");
  }

  // Time is up or the learner ended the mock: everything not answered counts as wrong.
  function finishMock() {
    if (!sess) return;
    for (let i = sess.i; i < sess.items.length; i++) {
      const q = sess.items[i];
      if (q.type === "p9") {
        const from = i === sess.i ? sess.blank : 0;
        for (let k = from; k < q.qs.length; k++) sess.res.push({ qid: q.id, blank: k, ok: false, skipped: true, secs: 0, orig: -1, order: [0, 1, 2, 3] });
      } else if (q.type === "p8") {
        sess.res.push({ qid: q.id, blank: null, ok: false, starOk: false, skipped: true, secs: 0, built: [] });
      } else {
        sess.res.push({ qid: q.id, blank: null, ok: false, skipped: true, secs: 0, orig: -1, order: [0, 1, 2, 3] });
      }
    }
    finish();
  }

  function quit() {
    if (!sess) return;
    clearHold();
    if (sess.mock) {
      if (confirm("End the mock now? Anything unanswered counts as wrong.")) finishMock();
      return;
    }
    if (sess.res.length) finish();
    else {
      sess = null;
      nav(fromTab);
    }
  }

  // ---------- results ----------
  function viewResults() {
    const r = last;
    const res = r.res;
    const itemOf = (x) => x.item || itemById(x.qid);
    const typeOf = (x) => itemOf(x).type;
    const used = (r.ended - r.started) / 1000;
    let top;
    if (r.mode === "vmock") {
      const of = (t) => res.filter((x) => typeOf(x) === t);
      const ok = res.filter((x) => x.ok).length;
      const allowed = r.items.reduce((a, q) => a + MOCK_SECS[q.type], 0);
      top = `<div class="card"><span class="kicker">Vocab section</span>
        <div class="score">${ok}<small> / ${res.length}</small></div>
        <p>${S.VTYPES.map((t) => `${TYPE_NAME[t].split(" · ")[0]} ${VNAME[t][0]} ${of(t).filter((x) => x.ok).length}/${of(t).length}`).join(" · ")}</p>
        <p class="muted small">Time used ${fmtSecs(used)} of ${fmtSecs(allowed)}. Vocab is the part of the paper to do fast, so the time you save goes to reading.</p></div>`;
    } else if (r.mode === "vocab" || r.mode === "reading" || (r.mode === "review" && res.some((x) => isV(itemOf(x))))) {
      const ok = res.filter((x) => x.ok).length;
      const med = res.length ? S.median(res.map((x) => x.secs)) : null;
      const slow = res.filter((x) => x.ok && x.secs > S.TARGET[typeOf(x)] * 1.2).length;
      top = `<div class="card"><span class="kicker">${esc(r.title)}</span>
        <div class="score">${ok}<small> / ${res.length} right</small></div>
        <p class="muted small">${med !== null ? `Typical time: ${fmtSecs(med)}. ` : ""}${slow ? `${slow} right but slow${r.mode === "reading" ? "" : ": those come back tomorrow"}. ` : ""}Time ${fmtSecs(used)}.${r.mode === "reading" ? " On the paper, aim for about 7 minutes for a notice and its two questions." : ""}</p></div>`;
    } else if (r.mode === "kanji") {
      const ok = res.filter((x) => x.ok).length;
      const med = res.length ? S.median(res.map((x) => x.secs)) : null;
      const slow = res.filter((x) => x.ok && x.secs > S.TARGET.kr * 1.2).length;
      const taught = r.items.filter((q) => q.type === "kn").length;
      top = `<div class="card"><span class="kicker">${esc(r.title)}</span>
        <div class="score">${ok}<small> / ${res.length} right</small></div>
        <p class="muted small">${taught ? `${taught} new kanji. ` : ""}${med !== null ? `Typical time: ${fmtSecs(med)} (aim for ${S.TARGET.kr} s). ` : ""}${slow ? `${slow} right but slow: those come back tomorrow. ` : ""}Time ${fmtSecs(used)}.</p></div>`;
    } else if (r.mock) {
      const of = (t) => res.filter((x) => typeOf(x) === t);
      const s7 = of("p7").filter((x) => x.ok).length;
      const s8 = of("p8").filter((x) => x.starOk).length;
      const s9 = of("p9").filter((x) => x.ok).length;
      const total = s7 + s8 + s9;
      const max = of("p7").length + of("p8").length + of("p9").length;
      const allowed = r.items.reduce((a, q) => a + MOCK_SECS[q.type], 0);
      top = `<div class="card"><span class="kicker">Mock section</span>
        <div class="score">${total}<small> / ${max}</small></div>
        <p>問題7 ${s7}/${of("p7").length} · 問題8 ${s8}/${of("p8").length} (★ piece, as the paper scores it) · 問題9 ${s9}/${of("p9").length}</p>
        <p class="muted small">Time used ${fmtSecs(used)} of ${fmtSecs(allowed)}. On the real paper this section has to fit inside the reading time too, so speed matters as much as accuracy.</p></div>`;
    } else {
      const ok = res.filter((x) => x.ok).length;
      const times = res.filter((x) => typeOf(x) === "p7").map((x) => x.secs);
      const med = times.length ? S.median(times) : null;
      const slow = res.filter((x) => x.ok && typeOf(x) === "p7" && x.secs > S.TARGET.p7 * 1.2).length;
      top = `<div class="card"><span class="kicker">${esc(r.title)}</span>
        <div class="score">${ok}<small> / ${res.length} right</small></div>
        <p class="muted small">${med !== null ? `Typical time per 問題7: ${fmtSecs(med)} (aim for 25 s). ` : ""}${slow ? `${slow} right but slow: those come back tomorrow. ` : ""}Time ${fmtSecs(used)}.</p></div>`;
    }
    const missed = [...new Set(res.filter((x) => !x.ok && !isMulti(itemOf(x))).map((x) => x.qid))];
    const rows = res
      .map((x) => {
        const it = itemOf(x);
        if (isV(it)) {
          const short = VNAME[it.type][0];
          return `<details><summary><span class="mark ${x.ok ? "good" : "bad"}">${x.ok ? "✓" : "✕"}</span><span class="form jp">${esc(it.w)} <span class="muted small">${short}</span></span><span class="t">${x.skipped ? "skipped" : fmtSecs(x.secs)}</span></summary>${vPrompt(it, true)}${feedbackV(it, x, x.order, false)}</details>`;
        }
        if (it.type === "r14") {
          const b = it.qs[x.blank];
          return `<details><summary><span class="mark ${x.ok ? "good" : "bad"}">${x.ok ? "✓" : "✕"}</span><span class="form jp">${esc(it.title)} · Q${x.blank + 1}</span><span class="t">${fmtSecs(x.secs)}</span></summary>
            ${noticeHTML(it, b.cue)}<p class="rq jp">${esc(b.q)}</p>${feedback(b, x, x.order, { target: S.TARGET.r14 })}</details>`;
        }
        if (x.item) {
          const q = x.item;
          const w = kanjiOf.get(q.k).words[q.wi];
          const body = `<div class="choices">${q.c.map((c, i) => `<div class="choice ${i === 0 ? "right" : i === x.orig ? "wrong" : "dim"}"><span>${esc(c)}</span></div>`).join("")}</div>${feedbackK(q, x, false)}`;
          return `<details><summary><span class="mark ${x.ok ? "good" : "bad"}">${x.ok ? "✓" : "✕"}</span><span class="form jp">${esc(w.w)} <span class="muted small">${esc(TYPE_NAME[q.type].split(" · ")[1].split(" ")[0])}</span></span><span class="t">${fmtSecs(x.secs)}</span></summary>${body}</details>`;
        }
        const q = qById.get(x.qid);
        const b = q.type === "p9" ? q.qs[x.blank] : q;
        const p = pointById.get(b.point);
        const ok = q.type === "p8" && r.mock ? x.starOk : x.ok;
        const label = q.type === "p9" ? `${esc(q.title)} · blank ${x.blank + 1}` : q.type === "p8" ? `★ ${esc(p.form)}` : esc(p.form);
        let body;
        if (q.type === "p8") body = feedback8(q, x, false);
        else {
          const ctx = q.type === "p7" ? `<div class="sentence">${rich(q.s, { cues: q.cue, fill: { "": q.c[0] } })}</div>` : "";
          body = ctx + feedback(b, x, x.order, { en: q.type === "p7" ? q.en : "", set: q.set, target: S.TARGET[q.type] });
        }
        return `<details><summary><span class="mark ${ok ? "good" : "bad"}">${ok ? "✓" : "✕"}</span><span class="form jp">${label}</span><span class="t">${x.skipped ? "skipped" : fmtSecs(x.secs)}</span></summary>${body}</details>`;
      })
      .join("");
    // The main button carries on with today's plan: the next block not done yet.
    const next = dayPlan().find((b) => b.n > 0);
    const main = next
      ? `<button class="btn primary wide go" data-act="${next.act}">Next: ${esc(next.name)}</button>`
      : `<button class="btn primary wide go" data-act="nav" data-to="home">Back to Today</button>`;
    const more = `${missed.length ? `<button class="btn" data-act="again">Go again on the ${missed.length} I missed</button>` : ""}${next ? `<button class="btn" data-act="nav" data-to="home">Today</button>` : ""}`;
    return `${header()}${top}
      ${main}
      ${more ? `<div class="row" style="margin:10px 0 14px">${more}</div>` : `<div style="height:14px"></div>`}
      <h3>Every question</h3><p class="muted small">${r.mode === "kanji" ? "Tap one to see the word in its sentence, the trap you fell into and the kanji." : r.mode === "reading" ? "Tap one to see where the answer sits in the notice and why each choice fails." : "Tap one to see the tell and why each choice fails."}</p>
      <div class="res">${rows}</div>`;
  }

  // ---------- sets ----------
  function setQuestions(set) {
    return S.buildSetDrill({ set, questions: D.questions, max: 999 });
  }
  function viewSets() {
    const weakIn = (s) => s.members.some((id) => status(id) === "weak");
    const list = D.sets
      .filter((s) => setFilter.f === "all" || weakIn(s))
      .map((s) => {
        const n = setQuestions(s).length;
        return `<button class="item" data-act="nav" data-to="set/${esc(s.id)}">
          <span>${s.members.map((id) => glyph(status(id))).join("")}</span>
          <span><span class="form">${esc(s.title)}</span><span class="sub jp">${s.members.map((id) => esc(pointById.get(id).form)).join(" · ")}</span></span>
          <span class="meta">${n} q</span></button>`;
      })
      .join("");
    return `${header()}${back()}
      <h2>Confusable sets</h2>
      <p class="muted small">The exam plays these against each other. Read the one-line rule for each member, then drill the set until the difference is instant.</p>
      <div class="filters"><button class="${setFilter.f === "all" ? "on" : ""}" data-act="set-filter" data-f="all">All ${D.sets.length}</button><button class="${setFilter.f === "weak" ? "on" : ""}" data-act="set-filter" data-f="weak">Has a weak point</button></div>
      <div class="list">${list || `<p class="muted">Nothing here yet.</p>`}</div>`;
  }

  function viewSet(set) {
    const n = setQuestions(set).length;
    const rows = set.members
      .map((id) => {
        const p = pointById.get(id);
        return `<tr><td>${glyph(status(id))}</td><td>${chip(id)}<div class="small muted">${esc(p.en)}</div></td><td>${esc(set.rules[id])}</td></tr>`;
      })
      .join("");
    return `${header()}${back("sets", "All sets")}
      <div class="card"><span class="kicker">Confusable set</span><h2>${esc(set.title)}</h2>
        <table><thead><tr><th></th><th>Form</th><th>The rule</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="small muted" style="margin-top:10px">Tap a form for its full card: connection, register, restrictions, example.</p>
        <button class="btn primary wide" data-act="set-drill" data-id="${esc(set.id)}" ${n ? "" : "disabled"}>Drill this set (${Math.min(n, 15)} questions)</button>
      </div>`;
  }

  // ---------- browse ----------
  function pointRows() {
    const q = browse.q.trim().toLowerCase();
    let lastL = null;
    let out = "";
    for (const p of D.points) {
      const st = status(p.id);
      if (browse.f !== "all" && st !== browse.f) continue;
      if (q && !`${p.form} ${p.en} ${p.id} ${p.conn}`.toLowerCase().includes(q)) continue;
      if (p.l !== lastL) {
        out += `<div class="lesson-h">${esc(lessonLabel(p.l))} · ${esc(D.lessons[p.l])}</div>`;
        lastL = p.l;
      }
      const ps = state.points[p.id];
      out += `<button class="item" data-act="point" data-id="${esc(p.id)}">${glyph(st)}
        <span><span class="form jp">${esc(p.form)}</span><span class="sub">${esc(p.en)}</span></span>
        <span class="meta">${ps && ps.seen ? `${ps.right}/${ps.seen}` : esc(p.id)}</span></button>`;
    }
    return out || `<p class="muted">No points match.</p>`;
  }
  function viewBrowse() {
    const f = (k, label) => `<button class="${browse.f === k ? "on" : ""}" data-act="browse-filter" data-f="${k}">${label}</button>`;
    return `${header()}${back("library")}
      <h2>All points</h2>
      <input class="search" id="search" type="search" placeholder="Search: ばかりか, regardless, 16-2…" value="${esc(browse.q)}" autocomplete="off">
      <div class="filters">${f("all", "All")}${f("weak", "Weak")}${f("new", "New")}${f("learning", "Learning")}${f("solid", "Solid")}${f("auto", "Automatic")}</div>
      <div class="list" id="plist">${pointRows()}</div>`;
  }

  // ---------- rules ----------
  function restrictionSheet() {
    const formsWith = (pred) => D.points.filter(pred).map((p) => chip(p.id)).join(" ");
    const rows = [
      ...Object.entries(D.tagNames).map(([k, name]) => [name, formsWith((p) => p.tags.includes(k))]),
      ...Object.entries(D.regNames).map(([k, name]) => [`Register: ${name}`, formsWith((p) => p.reg.includes(k))]),
    ].filter(([, forms]) => forms);
    return `<p class="muted small">Built from every point's tags. Use it to eliminate: if the sentence ends in a request, every form in the "No request" row is out.</p>
      <table><thead><tr><th>Restriction</th><th>Forms</th></tr></thead><tbody>${rows.map(([n, f]) => `<tr><td>${esc(n)}</td><td>${f}</td></tr>`).join("")}</tbody></table>`;
  }
  function viewRules(tab) {
    const tabs = [...D.sheets.map((s) => [s.id, s.title]), ["restrictions", "Restrictions"]];
    const id = tabs.some(([k]) => k === tab) ? tab : tabs[0][0];
    let body;
    if (id === "restrictions") body = restrictionSheet();
    else {
      const s = D.sheets.find((x) => x.id === id);
      body = `<p class="muted small">${esc(s.intro)}</p><table><thead><tr>${s.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td class="jp">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return `${header()}${back("library")}
      <h2>Cheat sheets</h2>
      <div class="tabs">${tabs.map(([k, t]) => `<button class="${k === id ? "on" : ""}" data-act="nav" data-to="rules/${k}">${esc(t)}</button>`).join("")}</div>
      <div class="card">${body}</div>`;
  }

  // ---------- custom ----------
  function lessonOptions(sel) {
    return lessonKeys.map((l) => `<option value="${esc(l)}" ${l === sel ? "selected" : ""}>${esc(lessonLabel(l))} · ${esc(D.lessons[l])}</option>`).join("");
  }
  function viewCustom() {
    const lastKey = settings.upto === "all" ? lessonKeys[lessonKeys.length - 1] : settings.upto;
    return `${header()}${back()}
      <h2>Custom drill</h2>
      <div class="card">
        <div class="field"><label for="c-from">From</label><select id="c-from">${lessonOptions(lessonKeys[0])}</select></div>
        <div class="field"><label for="c-to">To</label><select id="c-to">${lessonOptions(lastKey)}</select></div>
        <div class="field"><label>Question types</label><div class="checks">
          <label><input type="checkbox" id="c-p7" checked> 問題7</label>
          <label><input type="checkbox" id="c-p8" checked> 問題8</label>
          <label><input type="checkbox" id="c-p9"> 問題9</label></div></div>
        <div class="field"><label for="c-weak">Only points marked weak<small>Points whose last answer was wrong, or under 60% right.</small></label><input type="checkbox" id="c-weak"></div>
        <div class="field"><label for="c-n">How many</label><select id="c-n"><option>10</option><option selected>20</option><option>40</option></select></div>
        <button class="btn primary wide" data-act="custom-start" style="margin-top:12px">Start</button>
      </div>`;
  }
  function startCustom() {
    const from = lessonKeys.indexOf(document.getElementById("c-from").value);
    const to = lessonKeys.indexOf(document.getElementById("c-to").value);
    const lessons = new Set(lessonKeys.slice(Math.min(from, to), Math.max(from, to) + 1));
    const types = new Set(["p7", "p8", "p9"].filter((t) => document.getElementById(`c-${t}`).checked));
    const weak = document.getElementById("c-weak").checked;
    const max = Number(document.getElementById("c-n").value);
    const qs = weak ? D.questions.filter((q) => pointsOfQ(q).some((id) => status(id) === "weak")) : D.questions;
    begin("custom", "Custom", S.buildCustom({ questions: qs, points: D.points, lessons, types, max }));
  }

  // ---------- kanji ----------
  function kanjiTiles() {
    const q = kbrowse.q.trim().toLowerCase();
    let out = "";
    for (const tier of D.kanjiTiers) {
      const xs = K.filter((x) => x.tier === tier.id).filter((x) => {
        const st = kstatus(x.k);
        if (kbrowse.f === "wk" ? inGap(x) : kbrowse.f !== "all" && (st !== kbrowse.f || !inGap(x))) return false;
        return !q || `${x.k} ${x.mean} ${x.words.map((w) => `${w.w} ${w.r} ${w.en}`).join(" ")}`.toLowerCase().includes(q);
      });
      if (!xs.length) continue;
      out += `<div class="lesson-h">${esc(tier.name)} · ${xs.length}</div><div class="ktiles">${xs
        .map((x) => {
          const st = inGap(x) ? kstatus(x.k) : "wk";
          return `<button class="ktile jp ${st}" data-act="kanji" data-k="${esc(x.k)}" title="${esc(x.mean)}">${esc(x.k)}</button>`;
        })
        .join("")}</div>`;
    }
    return out || `<p class="muted">No kanji match.</p>`;
  }

  function viewKanji() {
    const c = kanjiCounts();
    const gap = K.filter(inGap);
    const counts = { new: 0, learning: 0, solid: 0, auto: 0, weak: 0 };
    for (const x of gap) counts[kstatus(x.k)]++;
    const bars = (D.kanjiTiers || [])
      .map((tier) => {
        const xs = gap.filter((x) => x.tier === tier.id);
        return xs.length ? statusBar(tier.name, xs.map((x) => kstatus(x.k))) : "";
      })
      .join("");
    const f = (key, label) => `<button class="${kbrowse.f === key ? "on" : ""}" data-act="kanji-filter" data-f="${key}">${label}</button>`;
    return `${header()}${back("library")}
      <h2>Kanji gap</h2>
      <p class="muted small">${K.length} kanji that real N2 papers use but WaniKani teaches after level 27, most useful first. Ranked by how many of 17 past N2 papers each one appears in. Kanji at or below your WaniKani level (${settings.wk}, change it in <button class="linkish" data-act="nav" data-to="settings">Settings</button>) are left out.</p>
      <p class="muted small">You drill them in the Kanji block on Today. Each new kanji gets a short teaching card, then a question a few items later. After that it comes back just before you would forget it, through a different word each time.</p>
      <div class="stats">
        <div><b>${c.met}/${gap.length}</b>kanji met</div>
        <div><b>${counts.auto + counts.solid}</b>solid or better</div>
        <div><b>${counts.weak}</b>weak</div>
        <div><b>${c.fresh}</b>still new</div>
      </div>
      <div class="card"><h3>Progress by tier</h3><div class="bars">${bars}</div>${legend()}</div>
      <input class="search" id="ksearch" type="search" placeholder="Search: 驚, surprise, おどろく…" value="${esc(kbrowse.q)}" autocomplete="off">
      <div class="filters">${f("all", "All")}${f("weak", "Weak")}${f("new", "New")}${f("learning", "Learning")}${f("solid", "Solid")}${f("auto", "Automatic")}${f("wk", "Covered by WaniKani")}</div>
      <div id="klist">${kanjiTiles()}</div>
      ${Object.keys(SOUND).length ? `<p class="muted small">Sound parts come from the <a href="https://github.com/mifunetoshiro/kanjium" target="_blank" rel="noopener">Kanjium</a> database by Uros O. (<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>).</p>` : ""}`;
  }

  function openKanji(k) {
    const x = kanjiOf.get(k);
    if (!x) return;
    closeModal();
    const ks = state.kanji[k];
    const rec = ks && ks.seen ? `${ks.right}/${ks.seen} right${ks.due ? ` · next ${esc(fmtDate(ks.due))}` : ""}` : "Not met yet";
    const tier = D.kanjiTiers.find((t) => t.id === x.tier);
    const el = document.createElement("div");
    el.className = "overlay";
    el.dataset.act = "close-modal";
    el.innerHTML = `<div class="card sheet" role="dialog" aria-label="${esc(x.k)}">
      <div class="row" style="justify-content:space-between"><span class="kicker">Kanji gap · #${x.rank}${tier ? ` · ${esc(tier.name)}` : ""}</span><button class="linkish" data-act="close-modal">Close</button></div>
      ${kanjiStrip(x, { words: false })}
      <p class="small muted">${rec}</p>
      ${x.words
        .map((w) => `<div class="kex"><div><span class="jp kw">${esc(w.w)}</span> <span class="jp muted">${esc(w.r)}</span> · ${esc(w.en)}</div>
          <div class="ex jp">${kSentence(w, false)}</div><div class="muted small">${esc(w.se)}</div></div>`)
        .join("")}
      ${!sess ? `<button class="btn primary wide" data-act="kanji-drill" data-k="${esc(x.k)}">Drill this kanji</button>` : ""}
    </div>`;
    document.body.appendChild(el);
  }

  // ---------- vocab ----------
  function viewVocab() {
    const ofType = (t) => V.filter((q) => q.type === t);
    const bars = S.VTYPES.filter((t) => ofType(t).length)
      .map((t) => statusBar(VNAME[t][1], ofType(t).map(vstatus)))
      .join("");
    // Word lists: 語形成 shows the word made, 言い換え the plain paraphrase, 用法 the meaning.
    const gloss = (q) => (q.type === "v5" ? `= ${q.c[0]}` : q.m);
    const lists = S.VTYPES.filter((t) => ofType(t).length)
      .map((t) => `<details class="vgroup"><summary>${VNAME[t][1]} · ${ofType(t).length}</summary><div class="vlist">${ofType(t)
        .map((q) => `<div class="vrow">${glyph(vstatus(q))}<span><span class="jp"><b>${esc(q.w)}</b></span> <span class="jp muted">${esc(q.r)}</span></span><span class="${q.type === "v5" ? "jp" : ""}">${esc(gloss(q))}</span></div>`)
        .join("")}</div></details>`)
      .join("");
    return `${header()}${back("library")}
      <h2>${V.length || !R.length ? "Vocab and 情報検索" : "情報検索"}</h2>
      <p class="muted small">The vocabulary questions grammar drills miss: 問題3 語形成 (prefixes and suffixes), 問題5 言い換え類義 (closest meaning) and 問題6 用法 (usage), plus 問題14 情報検索, the notice you scan for conditions at the end of the reading section. All sentences and notices are original.</p>
      ${V.length || R.length ? `<p class="muted small">You drill vocab in the Vocab block on Today. Timed sections, one type at a time and 情報検索 notices are in Practice.</p>` : `<p class="muted">Nothing here yet. The questions are still being written.</p>`}
      ${V.length ? `<div class="card"><h3>Progress by type</h3><div class="bars">${bars}</div>${legend()}
        ${lists}</div>` : ""}
      ${R.length ? `<div class="card"><h3>How to do 情報検索</h3><ul class="small" style="margin:0;padding-left:18px">
        <li>Read the question first. Write down the person's conditions: when, who, how much, what they already have.</li>
        <li>Find the row or section that matches the first condition, then check the others against it.</li>
        <li>Read every ※ note. The answer usually turns on one.</li>
        <li>About 7 minutes for a notice and its two questions.</li></ul></div>` : ""}`;
  }

  // ---------- settings ----------
  const PAUSES = [[0, "None"], [1000, "1 second"], [1500, "1.5 seconds"], [3000, "3 seconds"]];
  function viewSettings() {
    const upto = [`<option value="all" ${settings.upto === "all" ? "selected" : ""}>Everything (the whole book)</option>`, lessonOptions(settings.upto)].join("");
    const exam = S.nextExam();
    return `${header()}${back()}
      <h2>Settings</h2>
      <div class="card">
        <div class="field"><label for="s-upto">I have studied up to<small>Only points up to here appear in Today, mocks and passages.</small></label><select id="s-upto" data-set="upto">${upto}</select></div>
        <div class="field"><label for="s-size">Questions per review</label><input id="s-size" type="number" min="5" max="60" value="${settings.size}" data-set="size"></div>
        <div class="field"><label for="s-new">New points per day<small>About 12 a day meets every point in roughly two weeks.</small></label><input id="s-new" type="number" min="0" max="40" value="${settings.newPerDay}" data-set="newPerDay"></div>
        <div class="field"><label for="s-timer">Show the timer</label><input id="s-timer" type="checkbox" ${settings.timer ? "checked" : ""} data-set="timer"></div>
        <div class="field"><label for="s-eink">E-ink mode<small>Black on white, no animation, no ticking clock. For Boox and similar screens.</small></label><input id="s-eink" type="checkbox" ${settings.eink ? "checked" : ""} data-set="eink"></div>
        <div class="field"><label for="s-sound">Sound on answer</label><input id="s-sound" type="checkbox" ${settings.sound ? "checked" : ""} data-set="sound"></div>
        <div class="field"><label for="s-pause">Pause after a miss<small>Next waits this long after a wrong answer, so a quick Enter cannot skip the reason.</small></label><select id="s-pause" data-set="missPause" data-num>${PAUSES.map(([ms, label]) => `<option value="${ms}" ${Number(settings.missPause) === ms ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="field"><label for="s-exam">Exam date<small>Empty means the next JLPT${exam ? ` (${esc(fmtDate(exam))})` : ""}.</small></label><input id="s-exam" type="date" value="${esc(settings.examDate)}" data-set="examDate"></div>
      </div>
      ${K.length ? `<div class="card"><h3>Kanji gap</h3>
        <div class="field"><label for="s-wk">My WaniKani level<small>Kanji WaniKani teaches at or below this level are not introduced. The list starts at level 28, so 27 or lower means all of it.</small></label><input id="s-wk" type="number" min="0" max="60" value="${settings.wk}" data-set="wk"></div>
        <div class="field"><label for="s-knew">New kanji per day<small>10 a day meets the first 250 in under four weeks.</small></label><input id="s-knew" type="number" min="0" max="30" value="${settings.kNew}" data-set="kNew"></div>
        <div class="field"><label for="s-ksize">Kanji per review</label><input id="s-ksize" type="number" min="5" max="80" value="${settings.kSize}" data-set="kSize"></div>
      </div>` : ""}
      ${V.length ? `<div class="card"><h3>Vocab</h3>
        <div class="field"><label for="s-vnew">New vocab items per day<small>10 a day meets every item in about ${Math.max(1, Math.ceil(V.length / 10))} days.</small></label><input id="s-vnew" type="number" min="0" max="30" value="${settings.vNew}" data-set="vNew"></div>
        <div class="field"><label for="s-vsize">Vocab items per review</label><input id="s-vsize" type="number" min="5" max="60" value="${settings.vSize}" data-set="vSize"></div>
      </div>` : ""}
      ${syncCard()}
      <div class="card"><h3>Your progress</h3>
        <p class="muted small">Export a backup file to keep, or to move progress to a device without sync.</p>
        <div class="row">
          <button class="btn" data-act="export">Export progress</button>
          <button class="btn" data-act="import">Import progress</button>
          <input type="file" id="import-file" accept="application/json,.json" class="hidden">
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="export-notes">Download my misses as notes (.md)</button>
          <button class="btn" data-act="reset">Reset progress</button>
        </div>
      </div>`;
  }

  function setSetting(key, el) {
    if (el.type === "checkbox") settings[key] = el.checked;
    else if (el.type === "number") {
      const n = Number(el.value);
      if (!Number.isFinite(n)) return;
      settings[key] = Math.max(Number(el.min), Math.min(Number(el.max), Math.round(n)));
    } else if ("num" in el.dataset) settings[key] = Number(el.value);
    else settings[key] = el.value;
    saveSettings();
    document.body.classList.toggle("eink", !!settings.eink);
  }

  function exportProgress() {
    const data = { app: "n2-grammar-drill", exported: new Date().toISOString(), state, settings };
    download(`n2-grammar-progress-${today()}.json`, JSON.stringify(data, null, 1), "application/json");
  }
  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || data.app !== "n2-grammar-drill" || !data.state || !data.state.points) throw new Error("not a progress file");
        if (!confirm("Replace the progress in this browser with the imported file?")) return;
        replaceState(data.state);
        if (data.settings) settings = Object.assign({}, DEFAULTS, data.settings);
        saveState();
        saveSettings();
        toast("Progress imported.");
        render();
        syncNow("import");
      } catch (e) {
        toast("That file is not a progress export from this drill.");
      }
    };
    reader.readAsText(file);
  }

  // Missed questions as markdown, grouped by point, for pasting into study notes.
  function exportNotes() {
    const groups = new Map();
    for (const [qid, rec] of Object.entries(state.qs)) {
      if (!rec.wrong) continue;
      const [id, blank] = qid.split("#");
      const q = qById.get(id);
      if (!q) continue;
      const b = q.type === "p9" ? q.qs[Number(blank) - 1] : q;
      if (!b) continue;
      let line;
      if (q.type === "p7") line = q.s.replace("（　　）", `（${q.c[0]}）`);
      else if (q.type === "p8") line = `${q.pre}${q.pieces.map((p, i) => (i === q.star ? `【${p}】` : p)).join("")}${q.post}`;
      else line = `${q.title}, blank ${blank}: ${b.c[0]}`;
      if (!groups.has(b.point)) groups.set(b.point, []);
      groups.get(b.point).push({ line, tell: b.tell, rec, en: q.en });
    }
    // Kanji misses: one line per word, grouped by kanji.
    const kmiss = new Map();
    for (const [qid, rec] of Object.entries(state.qs)) {
      const m = /^k[rwm]:(.):(\d+)$/u.exec(qid);
      if (!rec.wrong || !m || !kanjiOf.has(m[1])) continue;
      const w = kanjiOf.get(m[1]).words[Number(m[2])];
      if (!w) continue;
      if (!kmiss.has(m[1])) kmiss.set(m[1], new Map());
      kmiss.get(m[1]).set(w.w, `- ${w.w}（${w.r}）${w.en}: ${w.s}`);
    }
    // Vocab misses: the word, its meaning and the sentence with the answer in.
    const vmiss = V.filter((q) => state.qs[q.id] && state.qs[q.id].wrong);
    const vLine = (q) => (q.type === "v3" ? q.s.replace("（　　）", q.c[0]) : q.type === "v5" ? `${q.s} (${q.t} = ${q.c[0]})` : q.c[0]);
    if (!groups.size && !kmiss.size && !vmiss.length) return toast("No misses yet.");
    const order = D.points.map((p) => p.id).filter((id) => groups.has(id));
    let md = `# N2 grammar misses\n\nExported ${today()} from N2 文法ドリル.\n`;
    for (const id of order) {
      const p = pointById.get(id);
      md += `\n## ${p.form} (${p.en})\n\n${p.tell}\n\n`;
      for (const g of groups.get(id)) md += `- ${g.line}\n  - ${g.tell} (right ${g.rec.right} of ${g.rec.seen})\n`;
    }
    if (kmiss.size) {
      md += `\n# Kanji misses\n`;
      for (const x of K.filter((y) => kmiss.has(y.k))) md += `\n## ${x.k} (${x.mean})\n\n${[...kmiss.get(x.k).values()].join("\n")}\n`;
    }
    if (vmiss.length) {
      md += `\n# Vocab misses\n`;
      for (const t of S.VTYPES) {
        const xs = vmiss.filter((q) => q.type === t);
        if (xs.length) md += `\n## ${VNAME[t][1]}\n\n${xs.map((q) => `- ${q.w}（${q.r}）${q.m}: ${vLine(q)}\n  - ${q.tell}`).join("\n")}\n`;
      }
    }
    download(`n2-grammar-misses-${today()}.md`, md, "text/markdown");
  }

  // ---------- sync ----------
  // Progress travels between devices through one secret gist on the learner's own GitHub account.
  // js/sync.js talks to GitHub and merges; this part decides when, applies the result and shows how it went.
  const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=N2%20drill%20sync";
  // Off github.io (the Vercel copy), sync goes through the site's own relay, so it still works on
  // networks that block GitHub. Served locally over http there is no relay: go to GitHub directly.
  const SYNC_PROXY = location.protocol === "https:" && !location.hostname.endsWith(".github.io") ? "api/gh" : undefined;
  const LOCAL_ONLY = ["eink"]; // about this screen, so each device keeps its own
  let syncing = false;
  let syncAgain = false; // asked for while a sync was running: run once more after it
  let syncErr = ""; // the last sync's problem, in plain words
  let syncRefused = false;
  let syncTimer = null;

  function ago(ms) {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
    return `on ${new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }
  const settingsLink = (label) => `<button class="linkish" data-act="nav" data-to="settings">${label}</button>`;
  function syncLine() {
    if (!G || !sync.token) return `Progress is saved on this device only.${G ? ` ${settingsLink("Turn on sync")}` : ""}`;
    if (syncing) return "Syncing…";
    if (syncErr) return `${esc(syncErr)} ${settingsLink("Settings")}`;
    return sync.last ? `Synced ${ago(sync.last)}` : "Sync is on.";
  }
  // One short muted line for Today and Progress.
  function syncNote() {
    return `<p class="muted small center sync-note">${syncLine()}</p>`;
  }
  function syncStatus() {
    if (syncing) return "Syncing…";
    if (syncErr) return esc(syncErr);
    return sync.last ? `Last synced ${ago(sync.last)}.` : "Not synced yet.";
  }
  // Redraw only the sync lines, so nothing typed or scrolled is lost.
  function refreshSyncUI() {
    document.querySelectorAll(".sync-note").forEach((el) => (el.innerHTML = syncLine()));
    document.querySelectorAll(".sync-status").forEach((el) => (el.innerHTML = syncStatus()));
  }

  function syncCard() {
    const steps = `<ol class="steps small">
        <li>Open <a href="${TOKEN_URL}" target="_blank" rel="noopener">this GitHub page</a> to make a classic token. Tick only the <b>gist</b> box and pick an expiry date.</li>
        <li>Press <b>Generate token</b> and copy the token. GitHub shows it only once.</li>
        <li>Paste it here and press Connect. Do the same on each device.</li>
      </ol>
      <p class="warnline small">Only tick the gist box. Pages on github.io share one web address, so a token here should have as little power as possible.</p>`;
    const form = `<div class="token-row">
        <input type="password" id="sync-token" placeholder="Paste your token" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="GitHub token">
        <button class="btn primary" data-act="sync-connect">Connect</button>
      </div>
      <p class="small muted" id="sync-msg" aria-live="polite"></p>`;
    let body;
    if (!G) body = `<p class="small muted">Sync did not load. Check your connection, then reload the page.</p>`;
    else if (!sync.token) body = steps + form;
    else
      body = `<p style="margin-bottom:2px">Connected as <b>${esc(sync.login)}</b>.</p>
        <p class="small muted sync-status" aria-live="polite">${syncStatus()}</p>
        ${syncRefused ? `<p class="small">Paste a new token to fix it.</p>${form}` : ""}
        <div class="row"><button class="btn" data-act="sync-now">Sync now</button><button class="btn" data-act="sync-off">Turn off on this device</button></div>
        <details class="small" style="margin-top:12px"><summary>Set up another device</summary>${steps}</details>`;
    return `<div class="card" id="sync-card"><h3>Sync between devices</h3>
      <p class="muted small">Keeps your progress the same on your phone and laptop. It is stored in a private (secret) gist on your own GitHub account.</p>
      ${body}</div>`;
  }

  async function connectSync() {
    const input = document.getElementById("sync-token");
    const msg = (t) => {
      const el = document.getElementById("sync-msg");
      if (el) el.textContent = t;
    };
    const token = input ? input.value.trim() : "";
    if (!G) return;
    if (!token) return msg("Paste the token first.");
    msg("Checking the token…");
    try {
      const login = await G.gistClient({ token, proxy: SYNC_PROXY }).checkToken();
      Object.assign(sync, { token, login, gist: "", last: 0 });
      saveSync();
      syncErr = "";
      syncRefused = false;
      if (screenOf()[0] === "settings") render(true);
      syncNow("connect");
    } catch (e) {
      msg(e.status === 401 || e.status === 403 ? "GitHub refused that token. Check you copied all of it." : e.status === 0 ? "Could not reach GitHub. Check your connection and try again." : `Could not connect. ${e.message}.`);
    }
  }

  function syncOff() {
    if (!confirm("Turn off sync on this device? Progress here stays. The gist and your other devices are not changed.")) return;
    Object.assign(sync, { token: "", gist: "", login: "", last: 0 });
    saveSync();
    clearTimeout(syncTimer);
    syncErr = "";
    syncRefused = false;
    render(true);
  }

  // What goes into the gist. The sync record (with the token) never does.
  function syncPayload() {
    const s = Object.assign({}, settings);
    for (const k of LOCAL_ONLY) delete s[k];
    return { app: "n2-grammar-drill", v: 1, saved: Date.now(), reset: sync.reset || 0, state, settings: s };
  }
  function applyPayload(p) {
    if (p.state) {
      replaceState(p.state);
      saveState();
    }
    if (p.settings) {
      const keep = Object.fromEntries(LOCAL_ONLY.map((k) => [k, settings[k]]));
      settings = Object.assign({}, DEFAULTS, p.settings, keep);
      save(KEYS.settings, settings); // not saveSettings(): that would stamp these as changed here
      document.body.classList.toggle("eink", !!settings.eink);
    }
  }

  // New progress arrived: redraw a tab or Settings where it is. Never a quiz, an open card or a field being typed in.
  function refreshAfterSync() {
    const screen = screenOf()[0] || "home";
    if (sess || !["home", "practice", "progress", "library", "settings"].includes(screen)) return;
    if (document.querySelector(".overlay")) return;
    const el = document.activeElement;
    if (el && el.matches && el.matches("input, select, textarea")) return;
    render(true);
  }

  // Read the gist, merge it with this device, apply the result here and write it back only if the
  // gist is behind. Quiet and safe to call often: without a token it does nothing.
  async function syncNow(why) {
    if (!G || !sync.token) return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    clearTimeout(syncTimer);
    refreshSyncUI();
    const token = sync.token;
    const stale = () => sync.token !== token; // turned off or reconnected meanwhile
    const wasRefused = syncRefused;
    const gh = G.gistClient({ token, proxy: SYNC_PROXY });
    let changed = false;
    try {
      let id = sync.gist || (await gh.findGist());
      let remote = null;
      if (id) {
        try {
          remote = await gh.read(id);
        } catch (e) {
          if (e.status !== 404) throw e;
          // The stored gist is gone: forget it and look once more.
          sync.gist = "";
          saveSync();
          id = await gh.findGist();
          if (id) remote = await gh.read(id);
        }
      }
      if (stale()) return;
      if (!id) {
        // No gist yet: this device's progress starts it.
        const made = await gh.createGist(syncPayload()).catch((e) => {
          // A token without the gist box ticked gets this far, then GitHub will not make the gist.
          if (e.status === 404 || e.status === 422) e.message = "GitHub would not make the gist. Check the token has the gist box ticked";
          throw e;
        });
        if (stale()) return;
        sync.gist = made;
      } else {
        // Merge and apply in one step, with no wait in between, so no answer given meanwhile is lost.
        const local = syncPayload();
        // The first sync after connecting always merges, so neither side's old reset can wipe the other's progress.
        if (!sync.last && remote) local.reset = remote.reset || 0;
        const merged = G.mergePayload(local, remote, S.mergeStates);
        const key = (p) => G.stableStringify([p.state || null, p.settings || null]);
        const mergedKey = key(merged);
        changed = mergedKey !== key(local);
        if (changed) applyPayload(merged);
        sync.gist = id;
        sync.reset = merged.reset || 0;
        saveSync();
        const behind = !remote || mergedKey !== key(remote) || (remote.reset || 0) !== sync.reset;
        if (behind) await gh.write(id, merged);
        if (stale()) return;
      }
      sync.last = Date.now();
      syncErr = "";
      syncRefused = false;
      saveSync();
    } catch (e) {
      if (!stale()) {
        const status = e && e.status;
        if (status === 404) {
          sync.gist = "";
          saveSync();
        }
        syncRefused = status === 401 || status === 403;
        syncErr = syncRefused ? "GitHub refused the sync token." : status === 0 ? "Not synced. You seem to be offline." : `Not synced. ${(e && e.message) || "Something went wrong"}.`;
      }
    } finally {
      syncing = false;
      refreshSyncUI();
      if (changed || syncRefused !== wasRefused) refreshAfterSync();
      if (syncAgain) {
        syncAgain = false;
        syncNow("again");
      }
    }
  }

  // 30 seconds after the last answer, restarted by each answer.
  function syncSoon() {
    if (!G || !sync.token) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow("answers"), 30000);
  }

  // ---------- point card ----------
  function closeModal() {
    document.querySelectorAll(".overlay").forEach((el) => el.remove());
  }
  function openPoint(id) {
    const p = pointById.get(id);
    if (!p) return;
    closeModal();
    const ps = state.points[id];
    const st = status(id);
    const n = D.questions.filter((q) => q.type !== "p9" && q.point === id).length;
    const sets = (setsOf.get(id) || [])
      .map((s) => `<div style="margin-bottom:10px"><b>${esc(s.title)}</b>: ${esc(s.rules[id])}<div style="margin-top:4px">${s.members.filter((m) => m !== id).map(chip).join(" ")}</div></div>`)
      .join("");
    const record = ps && ps.seen
      ? ` · ${ps.right}/${ps.seen} right${ps.times.length ? ` · usually ${fmtSecs(S.median(ps.times))}` : ""}${ps.due ? ` · next ${esc(fmtDate(ps.due))}` : ""}`
      : "";
    const el = document.createElement("div");
    el.className = "overlay";
    el.dataset.act = "close-modal";
    el.innerHTML = `<div class="card sheet" role="dialog" aria-label="${esc(p.form)}">
      <div class="row" style="justify-content:space-between"><span class="kicker">${esc(lessonLabel(p.l))} · ${esc(p.id)}</span><button class="linkish" data-act="close-modal">Close</button></div>
      <p class="form">${esc(p.form)}</p>
      <p>${esc(p.en)}</p>
      <div class="tell">${esc(p.tell)}</div>
      <dl>
        <dt>Connects</dt><dd class="jp">${esc(p.conn)}</dd>
        ${p.reg.length ? `<dt>Register</dt><dd>${p.reg.map((r) => esc(D.regNames[r])).join(", ")}</dd>` : ""}
        ${p.tags.length ? `<dt>Watch for</dt><dd>${p.tags.map((t) => esc(D.tagNames[t])).join("<br>")}</dd>` : ""}
        <dt>Example</dt><dd><div class="ex">${esc(p.ex[0])}</div><div class="muted small">${esc(p.ex[1])}</div></dd>
        <dt>You</dt><dd>${glyph(st)} ${STATUS[st][1]}${record}</dd>
      </dl>
      ${sets ? `<h3>Look-alikes</h3>${sets}` : ""}
      ${n && !sess ? `<button class="btn primary wide" data-act="point-drill" data-id="${esc(id)}">Drill this point</button>` : ""}
    </div>`;
    document.body.appendChild(el);
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.classList.contains("overlay") && e.target !== el) return;
    const a = el.dataset;
    switch (a.act) {
      case "nav":
        closeModal();
        return nav(a.to);
      case "today":
      case "more-new":
      case "weakest":
        return startToday(a.act);
      case "mock":
        return begin("mock", "Mock", S.buildMock({ state, questions: pool() }));
      case "passage":
        return startPassage();
      case "pair":
        return begin("pair", "Mix-up", S.buildPairDrill({ a: a.a, b: a.b, questions: D.questions }));
      case "set-drill":
        return begin("set", setById.get(a.id).title, S.buildSetDrill({ set: setById.get(a.id), questions: D.questions }));
      case "point-drill":
        closeModal();
        return begin("point", pointById.get(a.id).form, S.buildPointDrill({ pointId: a.id, questions: D.questions }));
      case "custom-start":
        return startCustom();
      case "answer":
        return choose(Number(a.i));
      case "piece":
        return pick(Number(a.i));
      case "slot":
        return unslot(Number(a.k));
      case "undo":
        return sess && sess.built && unslot(sess.built.length - 1);
      case "check":
        return check();
      case "next":
        return sess && sess.answered && advance();
      case "hint":
        return hint();
      case "quit":
        return quit();
      case "again": {
        const misses = last.res.filter((x) => !x.ok && !isMulti(x.item || itemById(x.qid)));
        const byId = new Map(misses.map((x) => [x.qid, x.item || itemById(x.qid)]));
        return begin("review", "Missed ones", S.shuffle([...byId.values()]));
      }
      case "vocab-today":
      case "vocab-more":
      case "vocab-weak":
      case "vocab-type":
      case "vocab-mock":
        return startVocab(a.act, a.t);
      case "notice":
        return startNotice();
      case "kanji-today":
      case "kanji-more":
      case "kanji-weak":
        return startKanji(a.act);
      case "kanji-drill":
        closeModal();
        return begin("kanji", a.k, S.buildKanjiDrill({ kanji: K, x: kanjiOf.get(a.k) }));
      case "kanji":
        return openKanji(a.k);
      case "know":
        return knowIt();
      case "kanji-filter":
        kbrowse.f = a.f;
        return render();
      case "point":
        return openPoint(a.id);
      case "close-modal":
        return closeModal();
      case "browse-filter":
        browse.f = a.f;
        return render();
      case "set-filter":
        setFilter.f = a.f;
        return render();
      case "export":
        return exportProgress();
      case "import":
        return document.getElementById("import-file").click();
      case "export-notes":
        return exportNotes();
      case "reset":
        if (confirm(sync.token
          ? "Delete all progress? This clears it here and on every device you sync with. Export first if you might want it back."
          : "Delete all progress on this device? Export first if you might want it back.")) {
          replaceState(S.emptyState());
          saveState();
          // Stamped only while sync is on, so synced devices take the empty copy instead of merging the old
          // progress back in. A reset with sync off stays on this device.
          if (sync.token) {
            sync.reset = Date.now();
            saveSync();
          }
          toast("Progress reset.");
          render();
          syncNow("reset");
        }
        return;
      case "sync-connect":
        return connectSync();
      case "sync-now":
        return syncNow("button");
      case "sync-off":
        return syncOff();
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "import-file" && el.files && el.files[0]) return importProgress(el.files[0]);
    if (el.dataset && el.dataset.set) setSetting(el.dataset.set, el);
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "ksearch") {
      kbrowse.q = e.target.value;
      const list = document.getElementById("klist");
      if (list) list.innerHTML = kanjiTiles();
      return;
    }
    if (e.target.id !== "search") return;
    browse.q = e.target.value;
    const list = document.getElementById("plist");
    if (list) list.innerHTML = pointRows();
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" && e.target.id === "sync-token") return connectSync();
    if (e.target.matches && e.target.matches("input, select, textarea")) return;
    if (document.querySelector(".overlay")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    const screen = screenOf()[0];
    if (screen === "quiz" && sess) {
      const q = cur();
      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        return q.type === "p8" ? pick(Number(e.key) - 1) : choose(Number(e.key) - 1);
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (e.repeat) return; // a held-down key does not race past the feedback it just opened
        if (sess.answered) return advance();
        if (q.type === "p8") return check();
        return;
      }
      if (e.key === "Backspace" && q.type === "p8") {
        e.preventDefault();
        return unslot(sess.built.length - 1);
      }
      if (e.key === "h" || e.key === "H") return hint();
      if (e.key === "k" || e.key === "K") return knowIt();
      if (e.key === "Escape") return quit();
    } else if (e.key === "Escape" && screen && screen !== "home") {
      nav(TAB_NAME[screen] ? "home" : fromTab);
    }
  });

  window.addEventListener("hashchange", () => render());
  render();

  // Sync quietly: once the first screen is up, when the page is hidden or shown again, and when back online.
  setTimeout(() => syncNow("load"), 0);
  document.addEventListener("visibilitychange", () => syncNow(document.visibilityState));
  window.addEventListener("online", () => syncNow("online"));
  setInterval(refreshSyncUI, 30000); // keeps "Synced 2 min ago" true
  // Ask the browser not to clear stored progress when space runs low.
  try {
    Promise.resolve(navigator.storage?.persist?.()).catch(() => {});
  } catch (e) {
    // Not supported here; progress is still saved.
  }
  // Offline support (sw.js). Browsers allow it on https and localhost only, so file:// skips it.
  if ("serviceWorker" in navigator && window.isSecureContext && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
