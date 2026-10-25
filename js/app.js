// N2 文法ドリル: screens, quiz flow and storage.
// Content comes from js/data.js (window.N2, built by tools/bundle.mjs) and scheduling from
// js/srs.js (window.SRS). Classic scripts, no build step, so the page also works from file://.
(function () {
  "use strict";
  const D = window.N2;
  const S = window.SRS;
  const app = document.getElementById("app");
  const KEYS = { state: "n2drill.state.v2", settings: "n2drill.settings.v2" };
  const DEFAULTS = { upto: "all", size: 20, newPerDay: 12, timer: true, eink: false, sound: false, examDate: "" };
  // Seconds the real paper allows, roughly: 問題7 and 問題8 per item, 問題9 per passage.
  const MOCK_SECS = { p7: 25, p8: 50, p9: 360 };
  const TYPE_NAME = { p7: "問題7 · 文法形式の判断", p8: "問題8 · 文の組み立て", p9: "問題9 · 文章の文法" };
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
  let state = Object.assign(S.emptyState(), load(KEYS.state) || {});
  let settings = Object.assign({}, DEFAULTS, load(KEYS.settings) || {});
  const saveState = () => save(KEYS.state, state);
  const saveSettings = () => save(KEYS.settings, settings);

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

  const today = () => S.dayStr(new Date());
  const status = (id) => S.status(state.points[id]);

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

  function screenOf() {
    return location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  }
  function nav(to) {
    const target = "#/" + to;
    if (location.hash === target) render();
    else location.hash = target;
  }
  function paint(html) {
    app.innerHTML = html;
  }
  function render() {
    closeModal();
    document.body.classList.toggle("eink", !!settings.eink);
    const [screen, arg] = screenOf();
    let html;
    switch (screen) {
      case "quiz":
        if (!sess) return nav("home");
        return paintQuiz(true);
      case "results":
        if (!last) return nav("home");
        html = viewResults();
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
      case "settings":
        html = viewSettings();
        break;
      default:
        html = viewHome();
    }
    paint(html);
    window.scrollTo(0, 0);
  }

  function header() {
    const exam = settings.examDate || S.nextExam();
    const days = exam ? S.daysBetween(today(), exam) : null;
    return `<header class="top">
      <button class="brand" data-act="nav" data-to="home"><h1>N2 文法ドリル</h1><small>pick the right form, fast</small></button>
      ${exam ? `<div class="exam">JLPT ${esc(fmtDate(exam))}<b>${days >= 0 ? `${days} days` : "passed"}</b></div>` : ""}
    </header>`;
  }
  const back = (to = "home", label = "Home") => `<p><button class="linkish" data-act="nav" data-to="${to}">← ${label}</button></p>`;

  // ---------- home ----------
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
    let d = today();
    if (!state.days[d]) d = S.addDays(d, -1);
    let n = 0;
    while (state.days[d]) {
      n++;
      d = S.addDays(d, -1);
    }
    return n;
  }

  function viewHome() {
    const t = today();
    const c = todayCounts();
    const pts = scopedPoints();
    const counts = { new: 0, learning: 0, solid: 0, auto: 0, weak: 0 };
    for (const p of pts) counts[status(p.id)]++;
    const seen = pts.length - counts.new;
    const doneToday = state.days[t] ? state.days[t].n : 0;
    const n = c.n;
    const mins = Math.max(1, Math.round((n * 40) / 60));

    const todayCard = n
      ? `<div class="card today">
          <div><span class="kicker">Today</span><h2>${seen ? "Your review is ready" : "Start here"}</h2>
          <p class="muted small">${seen ? "Points you are about to forget, mixed so each question makes you decide which family you are in." : "Every point you meet comes back just before you would forget it. Fast and right moves it further out; a miss brings it back tomorrow."}</p></div>
          <div class="counts"><div><b>${n - c.nNew}</b>due</div><div><b>${c.nNew}</b>new</div><div><b>${doneToday}</b>answered today</div></div>
          <button class="btn primary wide go" data-act="today">Start: ${n} questions, about ${mins} min</button>
        </div>`
      : `<div class="card today">
          <div><span class="kicker">Today</span><h2>All caught up</h2>
          <p class="muted small">${doneToday} answered today. ${c.tomorrow} point${c.tomorrow === 1 ? "" : "s"} due tomorrow.${c.fresh ? ` ${c.fresh} points not met yet.` : ""}</p></div>
          <div class="row">
            ${c.fresh ? `<button class="btn" data-act="more-new">10 more new points</button>` : ""}
            ${seen ? `<button class="btn" data-act="weakest">Practise my weakest 20</button>` : ""}
          </div>
        </div>`;

    const mix = S.mixups(state, 5).filter((x) => pointById.has(x.a) && pointById.has(x.b));
    const mixCard = mix.length
      ? `<div class="card"><h3>Your top mix-ups</h3><p class="muted small">The answer was the first form; you reached for the second. Tap to drill the pair.</p>
          <div class="mix">${mix
            .map(
              (x) => `<button data-act="pair" data-a="${esc(x.a)}" data-b="${esc(x.b)}"><span class="form">${esc(pointById.get(x.a).form)} <span class="muted">not</span> ${esc(pointById.get(x.b).form)}</span><span class="muted small">${x.n}×</span></button>`
            )
            .join("")}</div></div>`
      : "";

    const cov = covered();
    const bars = D.sections
      .map((sec) => {
        const ids = D.points.filter((p) => sec.lessons.includes(p.l) && (!cov || cov.has(p.l))).map((p) => p.id);
        if (!ids.length) return "";
        const k = { auto: 0, solid: 0, learning: 0, weak: 0, new: 0 };
        ids.forEach((id) => k[status(id)]++);
        const w = (x) => ((x / ids.length) * 100).toFixed(1);
        return `<div><div class="lab"><span>${esc(sec.name)}</span><span>${k.auto + k.solid}/${ids.length}</span></div>
          <div class="bar">${["auto", "solid", "learning", "weak", "new"].map((s) => (k[s] ? `<span class="${s}" style="width:${w(k[s])}%"></span>` : "")).join("")}</div></div>`;
      })
      .join("");

    const modes = [
      ["mock", "模", "Mock section", "12 + 5 + 1 passage, timed like the paper"],
      ["sets", "対", "Confusable sets", `${D.sets.length} look-alike groups and the rule that splits them`],
      ["passage", "文", "One passage (問題9)", "A short text with five blanks"],
      ["browse", "索", "All points", "Search, check your status, drill one"],
      ["rules", "表", "Cheat sheets", "Locked endings, connectives, register"],
      ["custom", "選", "Custom drill", "Pick lessons and question types"],
    ]
      .map(([act, g, b, s]) => `<button class="mode" data-act="${act === "sets" || act === "browse" || act === "rules" || act === "custom" ? "nav" : act}" data-to="${act}"><span class="glyph">${g}</span><b>${b}</b><small>${s}</small></button>`)
      .join("");

    const firstTime = !seen
      ? `<div class="card"><h3>How this works</h3><ul class="small" style="margin:0;padding-left:18px">
          <li><b>Today</b> is the main mode. Do it once a day. It mixes points that are due with a few new ones.</li>
          <li>After each answer you see the <b>cue</b> (the words that decide it, highlighted) and a one-line <b>tell</b>. Learn the tell.</li>
          <li>Aim for about <b>25 seconds</b> per 問題7 question. Right but slow counts as not yet learned.</li>
          <li>Still working through the book? Set how far you have got in <button class="linkish" data-act="nav" data-to="settings">Settings</button>.</li>
        </ul></div>`
      : "";

    return `${header()}
      ${firstTime}
      ${todayCard}
      <div class="stats">
        <div><b>${seen}/${pts.length}</b>points met</div>
        <div><b>${counts.auto}</b>automatic</div>
        <div><b>${counts.weak}</b>weak</div>
        <div><b>${dayStreak()}</b>day streak</div>
      </div>
      <div class="modes">${modes}</div>
      ${mixCard}
      <div class="card"><h3>Progress by section</h3><div class="bars">${bars}</div>
        <div class="legend">${["auto", "solid", "learning", "weak"].map((s) => `<span><i class="st-${s}"></i>${STATUS[s][1]}</span>`).join("")}<span><i style="border:1px solid var(--line)"></i>Not met</span></div>
      </div>
      <p class="foot">${D.points.length} points · ${D.questions.length} questions · data ${esc(D.version)}${settings.upto !== "all" ? ` · studying up to ${esc(lessonLabel(settings.upto))}` : ""}<br>
        <button class="linkish" data-act="nav" data-to="settings">Settings and backup</button> · <a href="${REPO}" target="_blank" rel="noopener">Source</a></p>`;
  }

  // ---------- starting sessions ----------
  function begin(mode, title, items) {
    if (!items.length) return toast("No questions match that yet.");
    sess = { mode, title, items, i: 0, res: [], requeued: new Set(), mock: mode === "mock", started: Date.now() };
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
    sess.answered = null;
    sess.hint = false;
    sess.order = S.shuffle([0, 1, 2, 3]);
    if (q.type === "p8") sess.built = [];
    if (q.type === "p9") sess.blank = 0;
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
    if (sess.answered) return fmtSecs(sess.answered.secs);
    if (!settings.timer || settings.eink) return `aim ${S.TARGET[q.type]} s`;
    return `${Math.floor((Date.now() - sess.t0) / 1000)} s`;
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
    const canHint = !sess.mock && !sess.answered && !sess.hint && q.type !== "p8";
    const body = q.type === "p7" ? qP7(q) : q.type === "p8" ? qP8(q) : qP9(q);
    return `<div class="qbar">
        <button class="quit" data-act="quit">✕ ${sess.mock ? "End" : "Stop"}</button>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <span>${sess.i + 1}/${n}</span><span class="clock">${clockText()}</span>
      </div>
      <div class="card">
        <div class="qtype"><span class="tag">${TYPE_NAME[q.type]}${sess.answered ? ` · ${esc(q.id)}` : ""}</span>${canHint ? `<button class="linkish small" data-act="hint">Show the cue <kbd>H</kbd></button>` : ""}</div>
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

  // Feedback for one 4-choice item (a 問題7 question or one 問題9 blank).
  function feedback(b, a, order, { en = "", set = null, next = false, nextLabel = "Next", target = S.TARGET.p7 } = {}) {
    const verdict = a.ok
      ? `<div class="verdict good">Right · ${fmtSecs(a.secs)}${a.secs > target * 1.2 ? ` <span class="muted small">(slow, so it comes back tomorrow)</span>` : ""}</div>`
      : a.skipped
        ? `<div class="verdict bad">Not answered. The answer is ${esc(b.c[0])}.</div>`
        : `<div class="verdict bad">Not this time. The answer is ${esc(b.c[0])}.</div>`;
    const whys = order
      .map((orig, d) => {
        const cls = orig === 0 ? "right" : orig === a.orig ? "chosen" : "";
        const pid = b.cp[orig];
        const showChip = pid && (orig === 0 || pid !== b.point);
        return `<li class="${cls}"><div class="head"><span class="form jp">${d + 1}. ${esc(b.c[orig])}</span>${showChip ? chip(pid) : ""}</div>${esc(b.why[orig])}</li>`;
      })
      .join("");
    return `<div class="feedback">
      ${verdict}
      <div class="tell">${esc(b.tell)}</div>
      ${en ? `<div class="en">${esc(en)}</div>` : ""}
      <ul class="why">${whys}</ul>
      ${setBlock(b, set)}
      ${next ? `<button class="btn primary wide" data-act="next">${nextLabel} <kbd>Enter</kbd></button>` : ""}
    </div>`;
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
      ${next ? `<button class="btn primary wide" data-act="next">Next <kbd>Enter</kbd></button>` : ""}
    </div>`;
  }

  function record(q, point, ok, secs, chosenPoint, qid) {
    S.record(state, { qid: qid || q.id, point, ok, secs, type: q.type, chosenPoint, slow: sess.hint, today: today() });
    saveState();
    beep(ok);
  }

  function choose(d) {
    if (!sess || sess.answered) return;
    const q = cur();
    if (q.type === "p8") return;
    const orig = sess.order[d];
    if (orig === undefined) return;
    const b = q.type === "p9" ? q.qs[sess.blank] : q;
    const ok = orig === 0;
    const secs = (Date.now() - sess.t0) / 1000;
    const qid = q.type === "p9" ? `${q.id}#${sess.blank + 1}` : q.id;
    record(q, b.point, ok, secs, ok ? null : b.cp[orig], qid);
    sess.res.push({ qid: q.id, blank: q.type === "p9" ? sess.blank : null, ok, secs, orig, order: sess.order.slice() });
    if (!ok && q.type === "p7") requeue(b.point);
    if (sess.mock) return advance();
    sess.answered = { orig, ok, secs };
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
    if (!sess || sess.mock || sess.answered || cur().type === "p8") return;
    sess.hint = true;
    paintQuiz(false);
  }

  function advance() {
    const q = cur();
    if (q.type === "p9" && sess.blank < q.qs.length - 1) {
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
    if (sess.mock) {
      if (confirm("End the mock now? Anything unanswered counts as wrong.")) finishMock();
      return;
    }
    if (sess.res.length) finish();
    else {
      sess = null;
      nav("home");
    }
  }

  // ---------- results ----------
  function viewResults() {
    const r = last;
    const res = r.res;
    const typeOf = (x) => qById.get(x.qid).type;
    const used = (r.ended - r.started) / 1000;
    let top;
    if (r.mock) {
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
    const missed = [...new Set(res.filter((x) => !x.ok && typeOf(x) !== "p9").map((x) => x.qid))];
    const rows = res
      .map((x) => {
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
    return `${header()}${top}
      <div class="row" style="margin-bottom:14px">
        ${missed.length ? `<button class="btn primary" data-act="again">Go again on the ${missed.length} I missed</button>` : ""}
        <button class="btn" data-act="nav" data-to="home">Home</button>
      </div>
      <h3>Every question</h3><p class="muted small">Tap one to see the cue, the tell and why each choice fails.</p>
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
    return `${header()}${back()}
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
    return `${header()}${back()}
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

  // ---------- settings ----------
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
        <div class="field"><label for="s-exam">Exam date<small>Empty means the next JLPT${exam ? ` (${esc(fmtDate(exam))})` : ""}.</small></label><input id="s-exam" type="date" value="${esc(settings.examDate)}" data-set="examDate"></div>
      </div>
      <div class="card"><h3>Your progress</h3>
        <p class="muted small">Progress lives in this browser only. Export it to move to another device or to keep a backup.</p>
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
    } else settings[key] = el.value;
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
        state = Object.assign(S.emptyState(), data.state);
        if (data.settings) settings = Object.assign({}, DEFAULTS, data.settings);
        saveState();
        saveSettings();
        toast("Progress imported.");
        render();
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
    if (!groups.size) return toast("No misses yet.");
    const order = D.points.map((p) => p.id).filter((id) => groups.has(id));
    let md = `# N2 grammar misses\n\nExported ${today()} from N2 文法ドリル.\n`;
    for (const id of order) {
      const p = pointById.get(id);
      md += `\n## ${p.form} (${p.en})\n\n${p.tell}\n\n`;
      for (const g of groups.get(id)) md += `- ${g.line}\n  - ${g.tell} (right ${g.rec.right} of ${g.rec.seen})\n`;
    }
    download(`n2-grammar-misses-${today()}.md`, md, "text/markdown");
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
        const missed = [...new Set(last.res.filter((x) => !x.ok && qById.get(x.qid).type !== "p9").map((x) => x.qid))].map((id) => qById.get(id));
        return begin("review", "Missed ones", S.shuffle(missed));
      }
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
        if (confirm("Delete all progress in this browser? Export first if you might want it back.")) {
          state = S.emptyState();
          saveState();
          toast("Progress reset.");
          render();
        }
        return;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "import-file" && el.files && el.files[0]) return importProgress(el.files[0]);
    if (el.dataset && el.dataset.set) setSetting(el.dataset.set, el);
  });

  document.addEventListener("input", (e) => {
    if (e.target.id !== "search") return;
    browse.q = e.target.value;
    const list = document.getElementById("plist");
    if (list) list.innerHTML = pointRows();
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
        if (sess.answered) return advance();
        if (q.type === "p8") return check();
        return;
      }
      if (e.key === "Backspace" && q.type === "p8") {
        e.preventDefault();
        return unslot(sess.built.length - 1);
      }
      if (e.key === "h" || e.key === "H") return hint();
      if (e.key === "Escape") return quit();
    } else if (e.key === "Escape" && screen && screen !== "home") {
      nav("home");
    }
  });

  window.addEventListener("hashchange", render);
  render();
})();
