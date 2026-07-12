/* =========================================================
   Author Compass — your Editor-in-Chief, not a writer.
   Plain HTML/CSS/JS. Free to run. AI features are optional
   and only activate if you add your own Anthropic API key
   in Settings — everything else works with zero cost.
========================================================= */

const STORAGE_KEY = "author-compass-data";
const uid = () => Math.random().toString(36).slice(2, 10);

const STATUSES = ["Draft", "Editing", "Frozen", "Finished", "Published"];
const HEALTH_DIMS = [
  "flow","emotion","clarity","pacing","repetition",
  "characterConsistency","themeConsistency","dialogue","transitions","grammar","originality"
];
const HEALTH_LABELS = {
  flow:"Flow", emotion:"Emotion", clarity:"Clarity", pacing:"Pacing", repetition:"Repetition (low=bad)",
  characterConsistency:"Character Consistency", themeConsistency:"Theme Consistency", dialogue:"Dialogue",
  transitions:"Transitions", grammar:"Grammar", originality:"Originality",
};

const NAV = [
  { key: "dashboard", label: "Dashboard", ic: "🧭" },
  { key: "library", label: "Book Library", ic: "📚" },
  { key: "bookbible", label: "Book Bible", ic: "🌹" },
  { key: "chapters", label: "Chapters", ic: "📖" },
  { key: "editor", label: "AI Editor", ic: "🕯️" },
  { key: "storymap", label: "Story Map", ic: "🗺️" },
  { key: "consistency", label: "Consistency Scanner", ic: "🔎" },
  { key: "readiness", label: "Book Readiness", ic: "🌙" },
  { key: "lessons", label: "Lessons Learned", ic: "✨" },
  { key: "questions", label: "Smart Questions", ic: "💬" },
  { key: "settings", label: "Settings", ic: "⚙️" },
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error(e); }
  return { settings: { apiKey: "" }, books: [], activeBookId: null };
}

let data = loadData();
let view = "dashboard";
let ui = {
  chapterTab: "edit",
  selectedChapterId: null,
  compareA: null,
  compareB: null,
  editorLoading: false,
  editorResult: null,
  consistencyLoading: false,
  consistencyResult: null,
  soulLoading: false,
  questionText: "",
  questionAnswer: null,
  questionLoading: false,
};

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function setData(fn) { fn(data); persist(); render(); }
function setUi(patch) { ui = { ...ui, ...patch }; render(); }

function activeBook() { return data.books.find((b) => b.id === data.activeBookId) || null; }
function activeChapter() {
  const book = activeBook();
  if (!book) return null;
  return book.chapters.find((c) => c.id === ui.selectedChapterId) || null;
}

/* ---------------------- HEURISTIC SCORING (free, local, no AI) ---------------------- */
const EMOTION_WORDS = ["love","fear","grief","joy","rage","hope","longing","dread","tears","heart","trembl","ache","sorrow","desire","terror","wonder","shame","betray","yearn","fury"];
const TRANSITION_WORDS = ["meanwhile","later","after","before","suddenly","then","eventually","afterward","by the time","in the end","that night","the next"];
const STOPWORDS = new Set(["the","a","an","and","or","but","of","to","in","on","at","for","with","is","was","were","it","that","this","as","he","she","they","i","you","we","his","her","their","my","your","be","are","not","so","if","she's","he's"]);

function scoreChapterHeuristic(content) {
  const text = (content || "").trim();
  if (!text) {
    const zero = {}; HEALTH_DIMS.forEach((d) => (zero[d] = 0)); zero.overall = 0;
    return zero;
  }
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const wordCount = words.length;
  const sentCount = Math.max(sentences.length, 1);
  const avgSentLen = wordCount / sentCount;
  const sentLens = sentences.map((s) => (s.match(/[a-zA-Z']+/g) || []).length);
  const mean = sentLens.reduce((a, b) => a + b, 0) / (sentLens.length || 1);
  const variance = sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / (sentLens.length || 1);
  const stdDev = Math.sqrt(variance);

  const freq = {};
  words.forEach((w) => { if (!STOPWORDS.has(w) && w.length > 3) freq[w] = (freq[w] || 0) + 1; });
  const freqVals = Object.values(freq);
  const topFreq = freqVals.length ? Math.max(...freqVals) : 0;
  const repetitionRatio = topFreq / Math.max(wordCount, 1);
  const uniqueWords = Object.keys(freq).length;
  const originalityRatio = uniqueWords / Math.max(wordCount * 0.5, 1);

  const dialogueMatches = (text.match(/["“][^"”]*["”]/g) || []).length;
  const dialogueRatio = dialogueMatches / sentCount;

  const emotionHits = EMOTION_WORDS.reduce((sum, w) => sum + (text.toLowerCase().split(w).length - 1), 0);
  const emotionDensity = emotionHits / (wordCount / 100 || 1);

  const transitionHits = TRANSITION_WORDS.reduce((sum, w) => sum + (text.toLowerCase().includes(w) ? 1 : 0), 0);

  const longSentences = sentLens.filter((l) => l > 35).length;
  const clarityPenalty = (longSentences / sentCount) * 100;

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  const health = {
    flow: clamp(100 - Math.abs(avgSentLen - 17) * 3.5),
    emotion: clamp(emotionDensity * 30),
    clarity: clamp(100 - clarityPenalty * 1.8),
    pacing: clamp(stdDev * 6),
    repetition: clamp(100 - repetitionRatio * 900),
    characterConsistency: 72,
    themeConsistency: 72,
    dialogue: clamp(dialogueRatio * 140),
    transitions: clamp(40 + transitionHits * 12),
    grammar: clamp(100 - (text.split("  ").length - 1) * 5),
    originality: clamp(originalityRatio * 60),
  };
  const overall = Math.round(HEALTH_DIMS.reduce((s, d) => s + health[d], 0) / HEALTH_DIMS.length);
  health.overall = overall;
  return health;
}

function wordCount(content) { return ((content || "").trim().match(/[a-zA-Z']+/g) || []).length; }

/* ---------------------- BOOK BIBLE ---------------------- */
const BIBLE_TEXT_FIELDS = ["vision", "themes", "intent", "storyRules", "tone", "worldNotes", "avoid", "ideaGarden"];
const BIBLE_FIELD_LABELS = {
  vision: "Book Vision",
  themes: "Core Themes",
  intent: "Author Intent",
  storyRules: "Story Rules",
  tone: "Tone and Style",
  worldNotes: "World and Mythology Notes",
  avoid: "Things to Avoid",
  ideaGarden: "Idea Garden / Loose Thoughts",
};
const BIBLE_PLACEHOLDERS = {
  vision: "What is this book truly about beneath the plot?",
  themes: "One theme per line — e.g. feminine wholeness, remembrance, forbidden knowledge…",
  intent: "Why are you writing this book?",
  storyRules: "Facts the editor must never violate. One per line.",
  tone: "mythic, intimate, sacred, emotionally intelligent, sensual but not graphic…",
  worldNotes: "How the world works, timeline details, mythology notes…",
  avoid: "Things the AI editor should never do to this book. One per line.",
  ideaGarden: "Random lines, possible scenes, dreams, dialogue, symbols, alternate endings — anything not ready yet.",
};

function defaultBible() {
  return {
    vision: "", themes: "", intent: "", storyRules: "", tone: "",
    characters: [], symbols: [], worldNotes: "", avoid: "", ideaGarden: "",
  };
}

function ensureBookBible(book) {
  if (!book) return null;
  if (!book.bible) book.bible = defaultBible();
  BIBLE_TEXT_FIELDS.forEach((f) => { if (typeof book.bible[f] !== "string") book.bible[f] = ""; });
  if (!Array.isArray(book.bible.characters)) book.bible.characters = [];
  if (!Array.isArray(book.bible.symbols)) book.bible.symbols = [];
  return book.bible;
}

function bibleFieldFilled(book, f) { return !!(book.bible && book.bible[f] && book.bible[f].trim()); }
function bibleCharactersFilled(book) {
  return !!(book.bible && book.bible.characters.some((c) => (c.name || "").trim() || (c.traits || "").trim()));
}
function bibleSymbolsFilled(book) {
  return !!(book.bible && book.bible.symbols.some((s) => (s.symbol || "").trim() || (s.meaning || "").trim()));
}

function computeBibleCompletion(book) {
  ensureBookBible(book);
  const checks = [
    bibleFieldFilled(book, "vision"),
    bibleFieldFilled(book, "themes"),
    bibleFieldFilled(book, "intent"),
    bibleFieldFilled(book, "storyRules"),
    bibleFieldFilled(book, "tone"),
    bibleCharactersFilled(book),
    bibleSymbolsFilled(book),
    bibleFieldFilled(book, "worldNotes"),
    bibleFieldFilled(book, "avoid"),
    bibleFieldFilled(book, "ideaGarden"),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

function bibleContextString(book) {
  if (!book) return "";
  ensureBookBible(book);
  const b = book.bible;
  const parts = [];
  if (b.vision) parts.push(`Book Vision (the creative north star): ${b.vision}`);
  if (b.themes) parts.push(`Core Themes: ${b.themes}`);
  if (b.intent) parts.push(`Author Intent: ${b.intent}`);
  if (b.storyRules) parts.push(`Story Rules (must never be violated): ${b.storyRules}`);
  if (b.tone) parts.push(`Tone and Style: ${b.tone}`);
  if (b.characters.length) {
    const chars = b.characters.filter((c) => (c.name || "").trim() || (c.traits || "").trim())
      .map((c) => `${c.name || "Unnamed"}: ${c.traits || ""}`).join(" | ");
    if (chars) parts.push(`Character Truths: ${chars}`);
  }
  if (b.symbols.length) {
    const syms = b.symbols.filter((s) => (s.symbol || "").trim() || (s.meaning || "").trim())
      .map((s) => `${s.symbol || "?"} = ${s.meaning || ""}`).join(", ");
    if (syms) parts.push(`Symbols and Meanings: ${syms}`);
  }
  if (b.worldNotes) parts.push(`World and Mythology Notes: ${b.worldNotes}`);
  if (b.avoid) parts.push(`Things to Avoid: ${b.avoid}`);
  if (!parts.length) return "";
  return `\n\nBOOK BIBLE — the book's creative north star. Check every suggestion against this before offering it:\n${parts.join("\n")}`;
}

function lilithEveStarterTemplate() {
  const t = defaultBible();
  t.vision = "Lilith and Eve were never rivals. They were lovers, and their reunion represents the healing of the divided feminine.";
  t.themes = "feminine wholeness\nsacred lesbian love\nremembrance\nspiritual awakening\nrebellion against false authority\nbody wisdom\nforbidden knowledge\nerasure and restoration";
  t.intent = "I am rewriting the inherited story of Lilith and Eve so women can see themselves as whole rather than divided into obedient and dangerous halves.";
  t.storyRules = "Lilith and Eve are lovers, not rivals.\nLilith is not evil.\nEve is not foolish.\nThe serpent represents wisdom and awakening.\nThe fruit gives consciousness, not corruption.\nTheir relationship must remain central.\nThe story should not become centered on Adam.\nThe ending must restore wholeness.";
  t.tone = "mythic\nintimate\nsacred\nemotionally intelligent\nsensual but not graphic\npoetic without becoming confusing\nfeminine-centered\ndirect and readable";
  t.characters = [
    { id: uid(), name: "Lilith", traits: "sovereign, instinctive, refuses hierarchy, powerful but capable of loneliness, does not need Eve to complete her" },
    { id: uid(), name: "Eve", traits: "curious, emotionally perceptive, awakening from obedience, chooses Lilith freely, not passive or naive" },
  ];
  t.symbols = [
    { id: uid(), symbol: "Serpent", meaning: "Wisdom, life force, awakening" },
    { id: uid(), symbol: "Fruit", meaning: "Conscious choice and knowledge" },
    { id: uid(), symbol: "Garden", meaning: "Beauty controlled by authority" },
    { id: uid(), symbol: "Gate", meaning: "Boundary between obedience and freedom" },
    { id: uid(), symbol: "Fire", meaning: "Truth that cannot be erased" },
    { id: uid(), symbol: "Ash", meaning: "Destroyed history" },
    { id: uid(), symbol: "Red thread", meaning: "Connection between Lilith and Eve" },
  ];
  t.worldNotes = "How Eden works, who authority is, how Lilith leaves, how Eve is created, how the gospel is recorded, how the truth survives, timeline details.";
  t.avoid = "Do not make Lilith cruel for no reason.\nDo not make Eve helpless.\nDo not turn the story into a sermon.\nDo not repeat the same message in every chapter.\nDo not make Adam the emotional center.\nDo not use modern slang inside the ancient story.\nDo not overuse words like sacred, whole, remembered, or awakening.";
  t.ideaGarden = "";
  return t;
}

/* ---------------------- CLAUDE API ---------------------- */
async function callClaude(prompt, { json = false } = {}) {
  const key = data.settings.apiKey;
  if (!key) throw new Error("NO_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error("API_ERROR_" + res.status);
  const resData = await res.json();
  const text = (resData.content || []).map((b) => b.text || "").join("\n");
  if (json) return JSON.parse(text.replace(/```json|```/g, "").trim());
  return text;
}

function hasKey() { return !!data.settings.apiKey; }

/* ---------------------- WORD DIFF (for Compare Versions) ---------------------- */
function wordDiff(a, b) {
  const wa = (a || "").split(/(\s+)/);
  const wb = (b || "").split(/(\s+)/);
  const n = wa.length, m = wb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = wa[i] === wb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (wa[i] === wb[j]) { out.push({ t: "eq", v: wa[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", v: wa[i] }); i++; }
    else { out.push({ t: "add", v: wb[j] }); j++; }
  }
  while (i < n) { out.push({ t: "del", v: wa[i] }); i++; }
  while (j < m) { out.push({ t: "add", v: wb[j] }); j++; }
  return out;
}

/* ---------------------- HELPERS ---------------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function scoreColor(score) { return score >= 80 ? "var(--green)" : score >= 55 ? "var(--gold)" : "var(--red)"; }

function ring(score, size = 76) {
  const r = size / 2 - 7, stroke = 7, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
    </svg>
    <div class="ring-num" style="color:${color};font-size:${size/3.6}px">${score}</div>
  </div>`;
}

function spawnFireflies() {
  const el = document.getElementById("fireflies");
  let html = "";
  for (let i = 0; i < 18; i++) {
    const top = Math.random() * 100, left = Math.random() * 100;
    const delay = (Math.random() * 5).toFixed(2), dur = (3.5 + Math.random() * 3).toFixed(2);
    html += `<div class="firefly" style="top:${top}%;left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s;"></div>`;
  }
  el.innerHTML = html;
}

/* ---------------------- RENDER SHELL ---------------------- */
function render() {
  document.getElementById("nav").innerHTML = NAV.map((n) => `
    <button class="nav-item ${view === n.key ? "active" : ""}" data-nav="${n.key}"><span>${n.ic}</span> ${n.label}</button>
  `).join("");

  document.getElementById("bookSwitcher").innerHTML = data.books.length ? `
    <label class="field" style="margin-bottom:0;">
      <span class="field-label">Current Book</span>
      <select id="bookSwitchSelect">
        ${data.books.map((b) => `<option value="${b.id}" ${b.id === data.activeBookId ? "selected" : ""}>${esc(b.title)}</option>`).join("")}
      </select>
    </label>` : `<p style="font-size:13px;color:var(--text-dim);">No books yet</p>`;

  const app = document.getElementById("app");
  const book = activeBook();
  if (view === "dashboard") app.innerHTML = renderDashboard(book);
  else if (view === "library") app.innerHTML = renderLibrary();
  else if (view === "bookbible") app.innerHTML = renderBookBible(book);
  else if (view === "chapters") app.innerHTML = renderChapters(book);
  else if (view === "editor") app.innerHTML = renderEditor(book);
  else if (view === "storymap") app.innerHTML = renderStoryMap(book);
  else if (view === "consistency") app.innerHTML = renderConsistency(book);
  else if (view === "readiness") app.innerHTML = renderReadiness(book);
  else if (view === "lessons") app.innerHTML = renderLessons(book);
  else if (view === "questions") app.innerHTML = renderQuestions(book);
  else if (view === "settings") app.innerHTML = renderSettings();

  attachGlobalListeners();
  attachViewListeners();
}

/* ---------------------- DASHBOARD ---------------------- */
function computeReadiness(book) {
  if (!book || !book.chapters.length) return { score: 0, issues: [] };
  const avgCompletion = book.chapters.reduce((s, c) => s + (c.status === "Published" ? 100 : c.status === "Finished" ? 95 : c.status === "Frozen" ? 85 : c.status === "Editing" ? 55 : 25), 0) / book.chapters.length;
  const avgHealth = book.chapters.reduce((s, c) => s + (c.health?.overall || 0), 0) / book.chapters.length;
  const score = Math.round(avgCompletion * 0.4 + avgHealth * 0.6);
  const issues = [];
  book.chapters.forEach((c) => {
    if (!c.health) return;
    const worst = HEALTH_DIMS.reduce((a, b) => (c.health[a] < c.health[b] ? a : b));
    if (c.health[worst] < 60) issues.push(`${c.title}: weak ${HEALTH_LABELS[worst].toLowerCase()}`);
  });
  const bibleCompletion = computeBibleCompletion(book);
  if (bibleCompletion < 50) issues.push(`Book Bible is only ${bibleCompletion}% filled out — add Vision, Story Rules, and Character Truths so the AI tools can check your book against it.`);
  return { score: Math.max(0, Math.min(100, score)), issues };
}

function dailyMission(book) {
  if (!book || !book.chapters.length) return null;
  const candidates = book.chapters.filter((c) => c.status !== "Frozen" && c.status !== "Published");
  const pool = candidates.length ? candidates : book.chapters;
  let worst = pool[0];
  pool.forEach((c) => { if ((c.health?.overall ?? 100) < (worst.health?.overall ?? 100)) worst = c; });
  if (!worst.health) return null;
  const worstDim = HEALTH_DIMS.reduce((a, b) => (worst.health[a] < worst.health[b] ? a : b));
  const minutes = Math.max(10, Math.min(45, Math.round(wordCount(worst.content) / 60)));
  return { chapter: worst, dim: worstDim, minutes };
}

function renderDashboard(book) {
  let html = `<h1 class="page-title">Dashboard</h1><p class="page-sub">Your editor-in-chief's morning briefing.</p>`;
  if (!book) {
    return html + `<div class="panel empty-state"><p><b>No book open yet.</b><br/>Start one in the Book Library.</p><button class="btn btn-primary" data-nav="library">Go to Library</button></div>`;
  }
  const totalWords = book.chapters.reduce((s, c) => s + wordCount(c.content), 0);
  const avgCompletion = book.chapters.length ? Math.round(book.chapters.reduce((s, c) => s + (c.status === "Published" ? 100 : c.status === "Finished" ? 95 : c.status === "Frozen" ? 85 : c.status === "Editing" ? 55 : 25), 0) / book.chapters.length) : 0;
  const { score: readiness } = computeReadiness(book);
  const mission = dailyMission(book);

  html += `
    <div class="grid-3" style="margin-bottom:18px;">
      <div class="stat-card"><div class="stat-value">${totalWords.toLocaleString()}</div><div class="stat-label">Word Count</div></div>
      <div class="stat-card"><div class="stat-value">${book.chapters.length}</div><div class="stat-label">Chapters</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${scoreColor(readiness)}">${readiness}%</div><div class="stat-label">Readiness</div></div>
    </div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-dim);margin-bottom:4px;">
        <span>Overall completion</span><span>${avgCompletion}%</span>
      </div>
      <div class="health-bar-track"><div class="health-bar-fill" style="width:${avgCompletion}%;background:linear-gradient(90deg,var(--lavender),var(--gold));"></div></div>
    </div>`;

  if (mission) {
    html += `
      <div class="panel mission-card" style="margin-top:18px;">
        <span class="pill" style="background:rgba(244,198,105,0.15);color:var(--gold);border:1px solid rgba(244,198,105,0.4)">Today's Writing Mission</span>
        <h2 style="margin:10px 0 4px 0;">Improve ${esc(mission.chapter.title)} — ${HEALTH_LABELS[mission.dim]}</h2>
        <p style="color:var(--text-dim);font-size:14px;margin:0 0 10px 0;">Estimated time: ${mission.minutes} minutes</p>
        <p style="font-size:14px;">Reasoning: this chapter's ${HEALTH_LABELS[mission.dim].toLowerCase()} score is its weakest dimension, and improving it raises the book's overall readiness more than editing anything else right now.</p>
        <button class="btn btn-primary" data-open-chapter="${mission.chapter.id}">Open This Chapter</button>
      </div>`;
  } else {
    html += `<div class="panel" style="margin-top:18px;"><p style="color:var(--text-dim);font-size:14px;">Add chapter text to get a daily writing mission.</p></div>`;
  }

  const bibleCompletion = computeBibleCompletion(book);
  const bv = bibleFieldFilled(book, "vision"), bt = bibleFieldFilled(book, "themes"),
        bc = bibleCharactersFilled(book), br = bibleFieldFilled(book, "storyRules");
  html += `
    <div class="panel" style="margin-top:18px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">🌹 Book Bible Health</div>
      <div class="reason-row ${bv ? "" : "reason-dim"}"><span>${bv ? "✓" : "○"}</span> Vision ${bv ? "saved" : "missing"}</div>
      <div class="reason-row ${bt ? "" : "reason-dim"}"><span>${bt ? "✓" : "○"}</span> Themes ${bt ? "saved" : "missing"}</div>
      <div class="reason-row ${bc ? "" : "reason-dim"}"><span>${bc ? "✓" : "○"}</span> Character truths ${bc ? "saved" : "incomplete"}</div>
      <div class="reason-row ${br ? "" : "reason-dim"}"><span>${br ? "✓" : "○"}</span> Story rules ${br ? "saved" : "missing"}</div>
      <div style="margin-top:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-dim);margin-bottom:4px;"><span>Overall Bible completion</span><span>${bibleCompletion}%</span></div>
        <div class="health-bar-track"><div class="health-bar-fill" style="width:${bibleCompletion}%;background:linear-gradient(90deg,var(--blush),var(--lavender));"></div></div>
      </div>
      <button class="btn btn-subtle" data-nav="bookbible" style="margin-top:12px;">Open Book Bible</button>
    </div>
    <div class="panel" style="margin-top:18px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Chapters at a glance</div>
      ${book.chapters.map((c) => `
        <div class="chapter-row" data-open-chapter="${c.id}">
          <div><div class="chapter-title">${esc(c.title)}</div><div class="chapter-meta">v${c.versions.length || 1} · ${wordCount(c.content)} words</div></div>
          <span class="status-badge status-${c.status}">${c.status}</span>
        </div>`).join("") || `<p style="color:var(--text-dim);font-size:14px;">No chapters yet.</p>`}
    </div>`;

  return html;
}

/* ---------------------- LIBRARY ---------------------- */
function renderLibrary() {
  let html = `<h1 class="page-title">Book Library</h1><p class="page-sub">Every book keeps its own history.</p>`;
  html += `<div class="panel">
    <form id="newBookForm">
      <label class="field"><span class="field-label">New book title</span><input type="text" id="newBookTitle" placeholder="The Gospel of Lilith and Eve"/></label>
      <button type="submit" class="btn btn-primary">+ Add Book</button>
    </form>
  </div>`;
  if (data.books.length) {
    html += `<div class="panel" style="margin-top:18px;">`;
    data.books.forEach((b) => {
      const { score } = computeReadiness(b);
      html += `
        <div class="chapter-row ${b.id === data.activeBookId ? "active" : ""}" data-set-active-book="${b.id}">
          <div><div class="chapter-title">${esc(b.title)}</div><div class="chapter-meta">${b.chapters.length} chapters · readiness ${score}%</div></div>
          <button class="btn btn-danger" data-delete-book="${b.id}" style="padding:6px 10px;">Delete</button>
        </div>`;
    });
    html += `</div>`;
  }
  return html;
}

/* ---------------------- BOOK BIBLE ---------------------- */
function bibleTextSection(book, field, rows) {
  return `
    <div class="panel">
      <span class="field-label">${BIBLE_FIELD_LABELS[field]}</span>
      <textarea class="bible-textarea" data-bible-field="${field}" rows="${rows || 4}" placeholder="${esc(BIBLE_PLACEHOLDERS[field] || "")}">${esc(book.bible[field])}</textarea>
    </div>`;
}

function renderBookBible(book) {
  let html = `<h1 class="page-title">🌹 Book Bible</h1><p class="page-sub">The book's creative north star — protects the soul of the story from an editor-goblin.</p>`;
  if (!book) return html + `<div class="panel empty-state"><p>Open or create a book in the Library first.</p></div>`;
  ensureBookBible(book);
  const b = book.bible;

  html += `
    <div class="panel" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-subtle" data-action="loadBibleTemplate">📜 Load Starter Template</button>
        <button class="btn btn-subtle" data-action="copyBible">📋 Copy Book Bible</button>
      </div>
      <span id="bibleSavedTag" class="saved-tag">Autosaves as you type</span>
    </div>`;

  html += bibleTextSection(book, "vision", 4);
  html += bibleTextSection(book, "themes", 4);
  html += bibleTextSection(book, "intent", 3);
  html += bibleTextSection(book, "storyRules", 5);
  html += bibleTextSection(book, "tone", 3);

  html += `<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="field-label" style="margin-bottom:0;">Character Truths</span>
      <button class="btn btn-subtle" data-action="addBibleCharacter" style="padding:6px 12px;font-size:12px;">+ Add Character</button>
    </div>
    ${b.characters.length ? b.characters.map((c) => `
      <div class="bible-item">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <input type="text" class="bible-char-name" data-bible-char-id="${c.id}" value="${esc(c.name)}" placeholder="Character name"/>
          <button class="btn btn-danger" data-remove-char="${c.id}" style="padding:6px 10px;flex-shrink:0;">✕</button>
        </div>
        <textarea class="bible-char-traits" data-bible-char-id="${c.id}" rows="3" placeholder="sovereign, instinctive, refuses hierarchy…">${esc(c.traits)}</textarea>
      </div>`).join("") : `<p style="color:var(--text-dim);font-size:14px;">No characters yet — add your major characters and their unshakeable truths.</p>`}
  </div>`;

  html += `<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="field-label" style="margin-bottom:0;">Symbols and Their Meanings</span>
      <button class="btn btn-subtle" data-action="addBibleSymbol" style="padding:6px 12px;font-size:12px;">+ Add Symbol</button>
    </div>
    ${b.symbols.length ? b.symbols.map((s) => `
      <div class="bible-item symbol-row">
        <input type="text" class="bible-symbol-name" data-bible-symbol-id="${s.id}" value="${esc(s.symbol)}" placeholder="Symbol"/>
        <input type="text" class="bible-symbol-meaning" data-bible-symbol-id="${s.id}" value="${esc(s.meaning)}" placeholder="Meaning"/>
        <button class="btn btn-danger" data-remove-symbol="${s.id}" style="padding:6px 10px;flex-shrink:0;">✕</button>
      </div>`).join("") : `<p style="color:var(--text-dim);font-size:14px;">No symbols recorded yet.</p>`}
  </div>`;

  html += bibleTextSection(book, "worldNotes", 5);
  html += bibleTextSection(book, "avoid", 4);
  html += bibleTextSection(book, "ideaGarden", 6);

  return html;
}

/* ---------------------- CHAPTERS ---------------------- */
function renderChapters(book) {
  let html = `<h1 class="page-title">Chapter Manager</h1><p class="page-sub">Freeze a chapter to stop endless editing.</p>`;
  if (!book) return html + `<div class="panel empty-state"><p>Open or create a book in the Library first.</p></div>`;

  html += `<div class="panel">
    <form id="newChapterForm">
      <label class="field"><span class="field-label">New chapter title</span><input type="text" id="newChapterTitle" placeholder="Chapter One"/></label>
      <button type="submit" class="btn btn-primary">+ Add Chapter</button>
    </form>
  </div>`;

  html += `<div class="panel" style="margin-top:18px;">`;
  book.chapters.forEach((c) => {
    html += `
      <div class="chapter-row ${c.id === ui.selectedChapterId ? "active" : ""}" data-select-chapter="${c.id}">
        <div><div class="chapter-title">${esc(c.title)}</div><div class="chapter-meta">${wordCount(c.content)} words · v${c.versions.length || 1}${c.health ? " · overall " + c.health.overall : ""}</div></div>
        <span class="status-badge status-${c.status}">${c.status}</span>
      </div>`;
  });
  if (!book.chapters.length) html += `<p style="color:var(--text-dim);font-size:14px;">No chapters yet — add one above.</p>`;
  html += `</div>`;

  const chapter = book.chapters.find((c) => c.id === ui.selectedChapterId);
  if (chapter) html += renderChapterDetail(book, chapter);

  return html;
}

function renderChapterDetail(book, c) {
  const tabs = ["edit", "health", "versions", "compare"];
  let html = `
    <div class="panel" style="margin-top:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 style="margin:0;">${esc(c.title)}</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="statusSelect">${STATUSES.map((s) => `<option ${s===c.status?"selected":""}>${s}</option>`).join("")}</select>
          <button class="btn ${c.frozen ? "btn-subtle" : "btn-primary"}" data-action="toggleFreeze">${c.frozen ? "🔓 Unlock" : "🧊 Freeze Chapter"}</button>
        </div>
      </div>
      <div class="tab-row">
        ${tabs.map((t) => `<button class="tab-chip ${ui.chapterTab === t ? "active" : ""}" data-chapter-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}
      </div>`;

  if (ui.chapterTab === "edit") {
    html += `
      <form id="chapterEditForm">
        <label class="field">
          <span class="field-label">Title</span>
          <input type="text" id="editTitle" value="${esc(c.title)}" ${c.frozen ? "disabled" : ""}/>
        </label>
        <label class="field">
          <span class="field-label">Manuscript text ${c.frozen ? "(frozen — unlock to edit)" : ""}</span>
          <textarea id="editContent" rows="14" ${c.frozen ? "disabled" : ""}>${esc(c.content)}</textarea>
        </label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <label class="field" style="flex:1;min-width:180px;"><span class="field-label">Version note (what changed / why)</span><input type="text" id="versionNote" placeholder="Tightened the ending"/></label>
        </div>
        ${!c.frozen ? `<button type="submit" class="btn btn-primary">Save New Version</button>` : ""}
      </form>`;
  } else if (ui.chapterTab === "health") {
    if (!c.health) {
      html += `<p style="color:var(--text-dim);font-size:14px;">Save some text first to see health scores.</p>`;
    } else {
      html += `<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">${ring(c.health.overall, 84)}<div><div style="font-family:var(--serif);font-size:18px;">Overall Strength</div><div style="color:var(--text-dim);font-size:13px;">${c.health.overall >= 80 ? "Leave this alone. Move on." : c.health.overall >= 55 ? "Solid, with room to sharpen." : "Needs focused attention."}</div></div></div>`;
      html += `<div class="health-grid">`;
      HEALTH_DIMS.forEach((d) => {
        html += `<div class="health-item"><div style="display:flex;justify-content:space-between;"><span>${HEALTH_LABELS[d]}</span><b style="color:${scoreColor(c.health[d])}">${c.health[d]}</b></div><div class="health-bar-track"><div class="health-bar-fill" style="width:${c.health[d]}%;background:${scoreColor(c.health[d])};"></div></div></div>`;
      });
      html += `</div>`;
      html += `<p class="api-note" style="margin-top:14px;">Scores above are computed locally from your text (free, no AI). Run the AI Editor for deeper, context-aware analysis.</p>`;
    }
  } else if (ui.chapterTab === "versions") {
    if (!c.versions.length) html += `<p style="color:var(--text-dim);font-size:14px;">No versions saved yet.</p>`;
    else c.versions.slice().reverse().forEach((v) => {
      html += `
        <div class="version-item">
          <div class="version-head"><b>v${v.versionNum}</b><span style="color:var(--text-dim)">${v.date}</span></div>
          <div style="font-size:13px;margin:4px 0;">${esc(v.summary || "—")}</div>
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">${esc(v.reason || "")}</div>
          <button class="btn btn-subtle" data-rollback="${v.versionNum}" style="padding:6px 12px;font-size:12px;">Roll back to this version</button>
        </div>`;
    });
  } else if (ui.chapterTab === "compare") {
    const opts = c.versions.map((v) => `<option value="${v.versionNum}">v${v.versionNum} (${v.date})</option>`).join("");
    html += `
      <div class="grid-2">
        <label class="field"><span class="field-label">Version A</span><select id="compareASel">${opts}</select></label>
        <label class="field"><span class="field-label">Version B</span><select id="compareBSel">${opts}</select></label>
      </div>
      <button class="btn btn-primary" data-action="runCompare">Compare</button>
      <div id="compareOutput" style="margin-top:16px;font-family:var(--serif-body);font-size:15px;line-height:1.7;"></div>`;
  }

  html += `</div>`;
  return html;
}

/* ---------------------- AI EDITOR ---------------------- */
function renderEditor(book) {
  let html = `<h1 class="page-title">AI Editor</h1><p class="page-sub">It improves what you wrote. It doesn't rewrite it.</p>`;
  if (!book || !book.chapters.length) return html + `<div class="panel empty-state"><p>Add a chapter first.</p></div>`;

  html += `<div class="panel"><label class="field"><span class="field-label">Chapter</span>
    <select id="editorChapterSelect">${book.chapters.map((c) => `<option value="${c.id}" ${c.id===ui.selectedChapterId?"selected":""}>${esc(c.title)} (${c.status})</option>`).join("")}</select></label>`;

  const chapter = book.chapters.find((c) => c.id === ui.selectedChapterId) || book.chapters[0];

  if (chapter.frozen) {
    html += `<p style="color:var(--text-dim);font-size:14px;">This chapter is frozen. Unlock it in Chapter Manager before running the AI Editor.</p></div>`;
    return html;
  }

  if (!hasKey()) {
    html += `<p class="api-note">Add an Anthropic API key in Settings to unlock deep AI feedback (optional — costs a small amount per use, only if you choose to add one).</p></div>`;
    return html;
  }

  html += `<button class="btn btn-primary" data-action="runEditor" ${ui.editorLoading?"disabled":""}>${ui.editorLoading?"Reading closely…":"🕯️ Analyze This Chapter"}</button></div>`;

  if (book.soul) {
    html += `<div class="panel"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;">Protecting the Soul of This Book</div><div class="soul-box">${esc(book.soul)}</div></div>`;
  }

  if (ui.editorResult) {
    html += `<div class="panel">`;
    if (ui.editorResult.overallNote) html += `<p style="font-family:var(--serif-body);font-size:16px;font-style:italic;margin-top:0;">"${esc(ui.editorResult.overallNote)}"</p>`;
    (ui.editorResult.weakSpots || []).forEach((w) => {
      html += `
        <div class="version-item">
          <div style="font-family:var(--serif-body);font-style:italic;color:var(--text-dim);margin-bottom:6px;">"${esc(w.excerpt)}"</div>
          <div style="font-weight:700;color:var(--amber);margin-bottom:4px;">${esc(w.issue)}</div>
          <div style="font-size:14px;margin-bottom:8px;">${esc(w.why)}</div>
          ${(w.options||[]).map((o) => `<div style="font-size:13px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.03);margin-bottom:6px;">${esc(o)}</div>`).join("")}
        </div>`;
    });
    html += `</div>`;
  }

  return html;
}

/* ---------------------- STORY MAP ---------------------- */
function renderStoryMap(book) {
  let html = `<h1 class="page-title">Story Map</h1><p class="page-sub">Emotional highs, lows, and pacing across your book.</p>`;
  if (!book || !book.chapters.length) return html + `<div class="panel empty-state"><p>Add chapters to see the map.</p></div>`;

  html += `<div class="panel"><div class="story-map-row">
    ${book.chapters.map((c) => {
      const e = c.health?.emotion || 0;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
        <div class="story-map-bar" style="height:${Math.max(6, e)}%;width:100%;" title="${esc(c.title)}: emotion ${e}"></div>
      </div>`;
    }).join("")}
  </div>
  <div style="display:flex;">
    ${book.chapters.map((c) => `<div style="flex:1;text-align:center;"><div class="story-map-label">${esc(c.title.slice(0,10))}</div></div>`).join("")}
  </div>
  <p class="api-note" style="margin-top:14px;">Bar height = emotional intensity score per chapter (from local heuristics).</p>
  </div>`;

  html += `<div class="panel">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Pacing overview</div>
    ${book.chapters.map((c) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;"><span>${esc(c.title)}</span><span style="color:var(--text-dim)">${c.health?.pacing ?? "—"}</span></div>
        <div class="health-bar-track"><div class="health-bar-fill" style="width:${c.health?.pacing||0}%;background:var(--lavender);"></div></div>
      </div>`).join("")}
  </div>`;

  return html;
}

/* ---------------------- CONSISTENCY SCANNER ---------------------- */
function renderConsistency(book) {
  let html = `<h1 class="page-title">Consistency Scanner</h1><p class="page-sub">Catches repeats, contradictions, and loose threads.</p>`;
  if (!book || !book.chapters.length) return html + `<div class="panel empty-state"><p>Add chapters first.</p></div>`;

  // free local pass: find repeated sentences across chapters
  const sentenceMap = {};
  book.chapters.forEach((c) => {
    (c.content || "").split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 25).forEach((s) => {
      const key = s.toLowerCase();
      sentenceMap[key] = sentenceMap[key] || [];
      sentenceMap[key].push(c.title);
    });
  });
  const repeats = Object.entries(sentenceMap).filter(([, chs]) => chs.length > 1);

  html += `<div class="panel">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Free scan: repeated lines across chapters</div>
    ${repeats.length ? repeats.slice(0,10).map(([s, chs]) => `
      <div class="version-item"><div style="font-family:var(--serif-body);font-style:italic;margin-bottom:4px;">"${esc(s)}"</div><div style="font-size:12px;color:var(--text-dim);">Appears in: ${chs.join(", ")}</div></div>
    `).join("") : `<p style="color:var(--text-dim);font-size:14px;">No exact repeated lines found.</p>`}
  </div>`;

  html += `<div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);">Deep scan (contradictions, tone shifts, loose threads)</div>
      <button class="btn btn-primary" data-action="runConsistency" ${ui.consistencyLoading?"disabled":""}>${ui.consistencyLoading?"Scanning…":"🔎 Run Deep Scan"}</button>
    </div>`;
  if (!hasKey()) html += `<p class="api-note">Optional — add an API key in Settings to unlock this.</p>`;
  if (ui.consistencyResult) {
    (ui.consistencyResult.issues || []).forEach((i) => {
      html += `<div class="reason-row"><span>⚠️</span><div><b>${esc(i.type)}:</b> ${esc(i.detail)}</div></div>`;
    });
    if (!ui.consistencyResult.issues?.length) html += `<p style="color:var(--text-dim);font-size:14px;">No major issues found.</p>`;
  }
  html += `</div>`;
  return html;
}

/* ---------------------- READINESS ---------------------- */
function renderReadiness(book) {
  let html = `<h1 class="page-title">Book Readiness</h1><p class="page-sub">The heart of the app.</p>`;
  if (!book || !book.chapters.length) return html + `<div class="panel empty-state"><p>Add chapters first.</p></div>`;

  const { score, issues } = computeReadiness(book);
  html += `<div class="panel" style="text-align:center;">
    <div style="display:flex;justify-content:center;">${ring(score, 120)}</div>
    <h2 style="margin:14px 0 0 0;">Overall Readiness</h2>
  </div>`;
  html += `<div class="panel">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Remaining Issues</div>
    ${issues.length ? issues.map((i) => `<div class="reason-row reason-dim"><span>○</span>${esc(i)}</div>`).join("") : `<p style="font-size:14px;color:var(--green);">No major issues detected — this book may be ready.</p>`}
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-soft);font-size:14px;">
      <b>Recommendation:</b> ${score >= 90 ? "One final editing pass, then publish." : score >= 70 ? "Focus on the chapters listed above, then reassess." : "Several chapters need real attention before this is ready."}
    </div>
  </div>`;
  return html;
}

/* ---------------------- LESSONS LEARNED ---------------------- */
function renderLessons(book) {
  let html = `<h1 class="page-title">Lessons Learned</h1><p class="page-sub">Patterns in how you write and edit.</p>`;
  if (!book || !book.chapters.length) return html + `<div class="panel empty-state"><p>Add chapters first.</p></div>`;

  const lessons = [];
  book.chapters.forEach((c) => {
    if (c.versions.length >= 5) lessons.push(`You over-edit "${c.title}" — it has ${c.versions.length} versions.`);
  });
  const byEmotion = [...book.chapters].filter((c) => c.health).sort((a, b) => b.health.emotion - a.health.emotion);
  if (byEmotion.length) lessons.push(`Your emotional scenes score highest in "${byEmotion[0].title}".`);
  const byDialogue = [...book.chapters].filter((c) => c.health).sort((a, b) => b.health.dialogue - a.health.dialogue);
  if (byDialogue.length) lessons.push(`Your dialogue is strongest in "${byDialogue[0].title}".`);
  const byPacing = [...book.chapters].filter((c) => c.health).sort((a, b) => a.health.pacing - b.health.pacing);
  if (byPacing.length && byPacing[0].health.pacing < 50) lessons.push(`Pacing slows most in "${byPacing[0].title}" — watch for long, uniform sentences there.`);

  html += `<div class="panel">${lessons.length ? lessons.map((l) => `<div class="reason-row"><span>✨</span>${esc(l)}</div>`).join("") : `<p style="color:var(--text-dim);font-size:14px;">Keep writing and saving versions — patterns will appear here.</p>`}</div>`;
  return html;
}

/* ---------------------- SMART QUESTIONS ---------------------- */
function renderQuestions(book) {
  let html = `<h1 class="page-title">Smart Questions</h1><p class="page-sub">Ask your editor-in-chief anything about this book.</p>`;
  if (!book) return html + `<div class="panel empty-state"><p>Open a book first.</p></div>`;
  html += `<div class="panel">
    <label class="field"><span class="field-label">Your question</span><textarea id="questionInput" rows="2" placeholder="Should I publish? Which chapter is strongest?">${esc(ui.questionText)}</textarea></label>
    <button class="btn btn-primary" data-action="askQuestion" ${ui.questionLoading?"disabled":""}>${ui.questionLoading?"Thinking…":"Ask"}</button>
    ${!hasKey() ? `<p class="api-note">Add an API key in Settings to use this.</p>` : ""}
    ${ui.questionAnswer ? `<div style="margin-top:16px;font-family:var(--serif-body);font-size:15px;line-height:1.7;white-space:pre-wrap;">${esc(ui.questionAnswer)}</div>` : ""}
  </div>`;
  return html;
}

/* ---------------------- SETTINGS ---------------------- */
function renderSettings() {
  return `
    <h1 class="page-title">Settings</h1><p class="page-sub">Everything here is optional.</p>
    <div class="panel" style="max-width:520px;">
      <form id="settingsForm">
        <label class="field"><span class="field-label">Anthropic API key (optional)</span><input type="password" id="apiKeyInput" value="${esc(data.settings.apiKey||"")}" placeholder="sk-ant-..."/></label>
        <p class="api-note">Only needed for AI Editor, Consistency deep scan, Smart Questions, and Protect the Soul. Everything else — chapter health, readiness, story map, lessons, versions — works free with no key. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>. Stored only in this browser.</p>
        <button type="submit" class="btn btn-primary btn-block">Save</button>
      </form>
    </div>
    <div class="panel">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Protect the Soul of the Book</div>
      <p style="font-size:14px;color:var(--text-dim);">Summarizes your book's voice, themes, and emotional core, then checks future AI suggestions against it.</p>
      <button class="btn btn-subtle" data-action="protectSoul" ${ui.soulLoading?"disabled":""}>${ui.soulLoading?"Listening to the book…":"🕯️ Protect the Soul of the Book"}</button>
    </div>`;
}

/* ---------------------- LISTENERS ---------------------- */
function attachGlobalListeners() {
  document.querySelectorAll("[data-nav]").forEach((el) => el.onclick = () => { view = el.dataset.nav; render(); });
  const sw = document.getElementById("bookSwitchSelect");
  if (sw) sw.onchange = () => setData((d) => { d.activeBookId = sw.value; });
  document.querySelectorAll("[data-open-chapter]").forEach((el) => el.onclick = () => {
    ui.selectedChapterId = el.dataset.openChapter; view = "chapters"; ui.chapterTab = "edit"; render();
  });
}

function openDrawer() { document.getElementById("sidebar").classList.add("open"); document.getElementById("drawerOverlay").classList.remove("hidden"); }
function closeDrawer() { document.getElementById("sidebar").classList.remove("open"); document.getElementById("drawerOverlay").classList.add("hidden"); }
document.getElementById("hamburgerBtn").onclick = openDrawer;
document.getElementById("closeDrawerBtn").onclick = closeDrawer;
document.getElementById("drawerOverlay").onclick = closeDrawer;

function attachViewListeners() {
  if (view === "library") attachLibraryListeners();
  if (view === "bookbible") attachBookBibleListeners();
  if (view === "chapters") attachChaptersListeners();
  if (view === "editor") attachEditorListeners();
  if (view === "consistency") attachConsistencyListeners();
  if (view === "questions") attachQuestionsListeners();
  if (view === "settings") attachSettingsListeners();
}

function attachLibraryListeners() {
  const form = document.getElementById("newBookForm");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const title = document.getElementById("newBookTitle").value.trim();
    if (!title) return;
    setData((d) => {
      const book = { id: uid(), title, createdAt: Date.now(), soul: null, chapters: [], bible: defaultBible() };
      d.books.push(book);
      d.activeBookId = book.id;
    });
  };
  document.querySelectorAll("[data-set-active-book]").forEach((el) => el.onclick = () => setData((d) => { d.activeBookId = el.dataset.setActiveBook; }));
  document.querySelectorAll("[data-delete-book]").forEach((el) => el.onclick = () => {
    if (!confirm("Delete this book and all its chapters? This can't be undone.")) return;
    setData((d) => {
      d.books = d.books.filter((b) => b.id !== el.dataset.deleteBook);
      if (d.activeBookId === el.dataset.deleteBook) d.activeBookId = d.books[0]?.id || null;
    });
  });
}

const bibleDebounceTimers = {};
function showBibleSaved() {
  const tag = document.getElementById("bibleSavedTag");
  if (!tag) return;
  tag.textContent = "✓ Saved";
  tag.classList.add("visible");
  clearTimeout(showBibleSaved._t);
  showBibleSaved._t = setTimeout(() => {
    if (tag) { tag.textContent = "Autosaves as you type"; tag.classList.remove("visible"); }
  }, 1600);
}

function autosaveBible(key, mutateFn) {
  clearTimeout(bibleDebounceTimers[key]);
  bibleDebounceTimers[key] = setTimeout(() => {
    const book = activeBook();
    if (!book) return;
    ensureBookBible(book);
    mutateFn(book);
    persist();
    showBibleSaved();
  }, 500);
}

function attachBookBibleListeners() {
  document.querySelectorAll("[data-bible-field]").forEach((el) => {
    el.oninput = () => {
      const field = el.dataset.bibleField;
      const value = el.value;
      autosaveBible("field:" + field, (book) => { book.bible[field] = value; });
    };
  });

  document.querySelectorAll(".bible-char-name").forEach((el) => {
    el.oninput = () => {
      const id = el.dataset.bibleCharId, value = el.value;
      autosaveBible("charname:" + id, (book) => {
        const c = book.bible.characters.find((c) => c.id === id);
        if (c) c.name = value;
      });
    };
  });
  document.querySelectorAll(".bible-char-traits").forEach((el) => {
    el.oninput = () => {
      const id = el.dataset.bibleCharId, value = el.value;
      autosaveBible("chartraits:" + id, (book) => {
        const c = book.bible.characters.find((c) => c.id === id);
        if (c) c.traits = value;
      });
    };
  });
  document.querySelectorAll("[data-remove-char]").forEach((el) => el.onclick = () => setData((d) => {
    const book = d.books.find((b) => b.id === d.activeBookId);
    ensureBookBible(book);
    book.bible.characters = book.bible.characters.filter((c) => c.id !== el.dataset.removeChar);
  }));
  const addCharBtn = document.querySelector('[data-action="addBibleCharacter"]');
  if (addCharBtn) addCharBtn.onclick = () => setData((d) => {
    const book = d.books.find((b) => b.id === d.activeBookId);
    ensureBookBible(book);
    book.bible.characters.push({ id: uid(), name: "", traits: "" });
  });

  document.querySelectorAll(".bible-symbol-name").forEach((el) => {
    el.oninput = () => {
      const id = el.dataset.bibleSymbolId, value = el.value;
      autosaveBible("symname:" + id, (book) => {
        const s = book.bible.symbols.find((s) => s.id === id);
        if (s) s.symbol = value;
      });
    };
  });
  document.querySelectorAll(".bible-symbol-meaning").forEach((el) => {
    el.oninput = () => {
      const id = el.dataset.bibleSymbolId, value = el.value;
      autosaveBible("symmeaning:" + id, (book) => {
        const s = book.bible.symbols.find((s) => s.id === id);
        if (s) s.meaning = value;
      });
    };
  });
  document.querySelectorAll("[data-remove-symbol]").forEach((el) => el.onclick = () => setData((d) => {
    const book = d.books.find((b) => b.id === d.activeBookId);
    ensureBookBible(book);
    book.bible.symbols = book.bible.symbols.filter((s) => s.id !== el.dataset.removeSymbol);
  }));
  const addSymBtn = document.querySelector('[data-action="addBibleSymbol"]');
  if (addSymBtn) addSymBtn.onclick = () => setData((d) => {
    const book = d.books.find((b) => b.id === d.activeBookId);
    ensureBookBible(book);
    book.bible.symbols.push({ id: uid(), symbol: "", meaning: "" });
  });

  const templateBtn = document.querySelector('[data-action="loadBibleTemplate"]');
  if (templateBtn) templateBtn.onclick = () => {
    const book = activeBook();
    if (!book) return;
    ensureBookBible(book);
    const hasExisting = computeBibleCompletion(book) > 0;
    if (hasExisting && !confirm("This will replace your existing Book Bible notes for this book with the starter template. Continue?")) return;
    setData((d) => {
      const b = d.books.find((bk) => bk.id === d.activeBookId);
      b.bible = lilithEveStarterTemplate();
    });
  };

  const copyBtn = document.querySelector('[data-action="copyBible"]');
  if (copyBtn) copyBtn.onclick = () => {
    const book = activeBook();
    if (!book) return;
    ensureBookBible(book);
    const b = book.bible;
    const lines = [];
    lines.push(`BOOK BIBLE — ${book.title}`, "");
    lines.push("BOOK VISION", b.vision || "—", "");
    lines.push("CORE THEMES", b.themes || "—", "");
    lines.push("AUTHOR INTENT", b.intent || "—", "");
    lines.push("STORY RULES", b.storyRules || "—", "");
    lines.push("TONE AND STYLE", b.tone || "—", "");
    lines.push("CHARACTER TRUTHS", ...(b.characters.length ? b.characters.map((c) => `${c.name || "Unnamed"}: ${c.traits || ""}`) : ["—"]), "");
    lines.push("SYMBOLS AND MEANINGS", ...(b.symbols.length ? b.symbols.map((s) => `${s.symbol || "?"} — ${s.meaning || ""}`) : ["—"]), "");
    lines.push("WORLD AND MYTHOLOGY NOTES", b.worldNotes || "—", "");
    lines.push("THINGS TO AVOID", b.avoid || "—", "");
    lines.push("IDEA GARDEN", b.ideaGarden || "—", "");
    const text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => alert("Book Bible copied to clipboard.")).catch(() => alert("Couldn't copy — try again."));
    } else {
      alert("Clipboard isn't available in this browser.");
    }
  };
}

function attachChaptersListeners() {
  const form = document.getElementById("newChapterForm");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    const title = document.getElementById("newChapterTitle").value.trim();
    if (!title) return;
    setData((d) => {
      const book = d.books.find((b) => b.id === d.activeBookId);
      const chapter = { id: uid(), title, status: "Draft", frozen: false, content: "", health: null, versions: [] };
      book.chapters.push(chapter);
      ui.selectedChapterId = chapter.id;
    });
  };
  document.querySelectorAll("[data-select-chapter]").forEach((el) => el.onclick = () => setUi({ selectedChapterId: el.dataset.selectChapter, chapterTab: "edit" }));
  document.querySelectorAll("[data-chapter-tab]").forEach((el) => el.onclick = () => setUi({ chapterTab: el.dataset.chapterTab }));

  const statusSel = document.getElementById("statusSelect");
  if (statusSel) statusSel.onchange = () => setData((d) => {
    const c = d.books.find((b) => b.id === d.activeBookId).chapters.find((c) => c.id === ui.selectedChapterId);
    c.status = statusSel.value;
  });

  const freezeBtn = document.querySelector('[data-action="toggleFreeze"]');
  if (freezeBtn) freezeBtn.onclick = () => setData((d) => {
    const c = d.books.find((b) => b.id === d.activeBookId).chapters.find((c) => c.id === ui.selectedChapterId);
    c.frozen = !c.frozen;
    c.status = c.frozen ? "Frozen" : "Editing";
  });

  const editForm = document.getElementById("chapterEditForm");
  if (editForm) editForm.onsubmit = (e) => {
    e.preventDefault();
    const newTitle = document.getElementById("editTitle").value.trim();
    const newContent = document.getElementById("editContent").value;
    const note = document.getElementById("versionNote").value.trim();
    setData((d) => {
      const book = d.books.find((b) => b.id === d.activeBookId);
      const c = book.chapters.find((c) => c.id === ui.selectedChapterId);
      c.title = newTitle || c.title;
      c.content = newContent;
      c.health = scoreChapterHeuristic(newContent);
      const versionNum = (c.versions[c.versions.length - 1]?.versionNum || 0) + 1;
      c.versions.push({ versionNum, date: new Date().toISOString().slice(0, 10), summary: note || "Edited manuscript", reason: note, content: newContent });
      if (c.status === "Draft") c.status = "Editing";
    });
  };

  document.querySelectorAll("[data-rollback]").forEach((el) => el.onclick = () => setData((d) => {
    const book = d.books.find((b) => b.id === d.activeBookId);
    const c = book.chapters.find((c) => c.id === ui.selectedChapterId);
    const target = c.versions.find((v) => v.versionNum === Number(el.dataset.rollback));
    const versionNum = c.versions[c.versions.length - 1].versionNum + 1;
    c.content = target.content;
    c.health = scoreChapterHeuristic(target.content);
    c.versions.push({ versionNum, date: new Date().toISOString().slice(0, 10), summary: `Rolled back to v${target.versionNum}`, reason: "Manual rollback", content: target.content });
  }));

  const compareBtn = document.querySelector('[data-action="runCompare"]');
  if (compareBtn) compareBtn.onclick = () => {
    const c = activeChapter();
    const vA = c.versions.find((v) => v.versionNum === Number(document.getElementById("compareASel").value));
    const vB = c.versions.find((v) => v.versionNum === Number(document.getElementById("compareBSel").value));
    const diff = wordDiff(vA.content, vB.content);
    document.getElementById("compareOutput").innerHTML = diff.map((d) => {
      if (d.t === "eq") return esc(d.v);
      if (d.t === "add") return `<span class="diff-add">${esc(d.v)}</span>`;
      return `<span class="diff-remove">${esc(d.v)}</span>`;
    }).join("");
  };
}

function attachEditorListeners() {
  const sel = document.getElementById("editorChapterSelect");
  if (sel) sel.onchange = () => setUi({ selectedChapterId: sel.value, editorResult: null });
  const btn = document.querySelector('[data-action="runEditor"]');
  if (btn) btn.onclick = async () => {
    const book = activeBook();
    const chapter = book.chapters.find((c) => c.id === ui.selectedChapterId) || book.chapters[0];
    ui.editorLoading = true; render();
    try {
      const soulNote = book.soul ? `\n\nThe soul of this book (preserve this identity in every suggestion): ${book.soul}` : "";
      const bibleNote = bibleContextString(book);
      const prompt = `You are a developmental editor. You never rewrite — you diagnose. Read this chapter and respond with ONLY raw JSON:
{"overallNote":"one sentence, direct","weakSpots":[{"excerpt":"a short quote from the weakest part, under 20 words","issue":"short label","why":"why it's weak, plain language","options":["improvement direction 1","improvement direction 2"]}]}
Only include real weak spots (max 4). If the chapter is strong, say so in overallNote and return an empty weakSpots array — do not invent problems. If anything in the chapter contradicts the Book Bible below (its vision, themes, story rules, character truths, tone, or things to avoid), that always counts as a real weak spot.${soulNote}${bibleNote}

Chapter title: ${chapter.title}
Chapter text:
${chapter.content}`;
      const result = await callClaude(prompt, { json: true });
      ui.editorResult = result;
    } catch (e) {
      ui.editorResult = { overallNote: "Couldn't analyze this chapter — check your API key.", weakSpots: [] };
    }
    ui.editorLoading = false; render();
  };
}

function attachConsistencyListeners() {
  const btn = document.querySelector('[data-action="runConsistency"]');
  if (btn) btn.onclick = async () => {
    const book = activeBook();
    ui.consistencyLoading = true; render();
    try {
      const manuscript = book.chapters.map((c) => `--- ${c.title} ---\n${c.content}`).join("\n\n");
      const bibleNote = bibleContextString(book);
      const prompt = `You are a continuity editor. Scan this manuscript for repeated ideas, repeated dialogue, contradictions, timeline problems, character inconsistencies, tone shifts, missing callbacks, and loose plot threads. Also flag anywhere the manuscript contradicts the Book Bible below — its vision, themes, story rules, character truths, or things to avoid. Respond with ONLY raw JSON: {"issues":[{"type":"short category","detail":"one sentence, specific, plain language"}]}. Max 8 issues, only real ones.${bibleNote}\n\n${manuscript}`;
      const result = await callClaude(prompt, { json: true });
      ui.consistencyResult = result;
    } catch (e) {
      ui.consistencyResult = { issues: [{ type: "Error", detail: "Couldn't run the scan — check your API key." }] };
    }
    ui.consistencyLoading = false; render();
  };
}

function attachQuestionsListeners() {
  const input = document.getElementById("questionInput");
  if (input) input.oninput = () => { ui.questionText = input.value; };
  const btn = document.querySelector('[data-action="askQuestion"]');
  if (btn) btn.onclick = async () => {
    const book = activeBook();
    const q = document.getElementById("questionInput").value.trim();
    if (!q) return;
    ui.questionLoading = true; render();
    try {
      const context = book.chapters.map((c) => `${c.title} (${c.status}, overall health ${c.health?.overall ?? "n/a"}): ${(c.content||"").slice(0, 800)}`).join("\n\n");
      const bibleNote = bibleContextString(book);
      const prompt = `You are this author's editor-in-chief. Answer their question directly and honestly, in a few sentences, based on the book below. Weigh your answer against the Book Bible's vision, themes, and story rules where relevant.\n\nQuestion: ${q}\n\nBook chapters:\n${context}${bibleNote}`;
      ui.questionAnswer = await callClaude(prompt);
    } catch (e) {
      ui.questionAnswer = "Couldn't reach the editor — check your API key in Settings.";
    }
    ui.questionLoading = false; render();
  };
}

function attachSettingsListeners() {
  const form = document.getElementById("settingsForm");
  form.onsubmit = (e) => {
    e.preventDefault();
    setData((d) => { d.settings.apiKey = document.getElementById("apiKeyInput").value.trim(); });
  };
  const soulBtn = document.querySelector('[data-action="protectSoul"]');
  if (soulBtn) soulBtn.onclick = async () => {
    const book = activeBook();
    if (!book) return;
    if (!hasKey()) { alert("Add an API key first — this feature needs it."); return; }
    ui.soulLoading = true; render();
    try {
      const manuscript = book.chapters.map((c) => `--- ${c.title} ---\n${c.content}`).join("\n\n").slice(0, 12000);
      const prompt = `Read this manuscript and write a short, specific paragraph (4-6 sentences) capturing its unique voice, core themes, emotional center, and style — the things that must survive any future edit for this to still feel like the same book.\n\n${manuscript}`;
      const soul = await callClaude(prompt);
      setData((d) => { d.books.find((b) => b.id === d.activeBookId).soul = soul; });
    } catch (e) { alert("Couldn't reach the editor — check your API key."); }
    ui.soulLoading = false; render();
  };
}

/* ---------------------- INIT ---------------------- */
spawnFireflies();
render();
