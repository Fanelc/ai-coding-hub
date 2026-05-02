// ══════════════════════════════════════════════════════════
// AI Coding Hub — 2026 edition
// Runs either against the local Python server OR fully static
// (GitHub Pages, Surge, Netlify) using rss2json for feeds.
// ══════════════════════════════════════════════════════════

const state = {
  learning: null,
  feeds: { fundamentals: null, agents: null, spec_driven: null, tools: null },
  activeTab: "read",
  activeTrack: "all",
  hasBackend: null, // detected at runtime
};

// Feed definitions used in static mode (no backend)
const FEED_DEFS = {
  fundamentals: [
    { name: "Simon Willison",     url: "https://simonwillison.net/atom/everything/" },
    { name: "Andrej Karpathy",    url: "https://karpathy.github.io/feed.xml" },
    { name: "Lilian Weng",        url: "https://lilianweng.github.io/index.xml" },
    { name: "Anthropic News",     url: "https://www.anthropic.com/news/rss.xml" },
    { name: "OpenAI Blog",        url: "https://openai.com/blog/rss.xml" },
  ],
  agents: [
    { name: "Latent Space",       url: "https://www.latent.space/feed" },
    { name: "Every — Chain of Thought", url: "https://every.to/feed.xml" },
    { name: "Sean Goedecke",      url: "https://www.seangoedecke.com/rss.xml" },
    { name: "HN: AI agents",      url: "https://hnrss.org/frontpage?q=agent+OR+agentic+OR+MCP+OR+Claude+Code" },
  ],
  spec_driven: [
    { name: "GitHub Blog",        url: "https://github.blog/feed/" },
    { name: "Martin Fowler",      url: "https://martinfowler.com/feed.atom" },
    { name: "HN: spec-driven",    url: "https://hnrss.org/frontpage?q=spec-driven+OR+%22Spec+Kit%22+OR+%22specification-driven%22" },
  ],
  tools: [
    { name: "HN: Copilot/Cursor", url: "https://hnrss.org/frontpage?q=Copilot+OR+Cursor+OR+Windsurf+OR+Cline+OR+Aider" },
    { name: "HN: Claude Code",    url: "https://hnrss.org/frontpage?q=%22Claude+Code%22+OR+%22Claude+Agent+SDK%22" },
    { name: "GitHub Changelog",   url: "https://github.blog/changelog/feed/" },
  ],
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours in static mode

const TRACK_LABEL = {
  fundamentals: "Fundamentals",
  agents: "Agents",
  spec_driven: "Spec-Driven",
  tools: "Tools",
};

// ══════════ Playground commands ══════════
const PLAYGROUND_COMMANDS = [
  {
    name: "claude-code --help",
    desc: "View help for the Claude Code CLI",
    output: [
      { type: "cmd", text: "claude-code --help" },
      { type: "info", text: "Usage: claude-code [options] [command]" },
      { type: "output", text: "Options:" },
      { type: "output", text: "  -v, --version    output the version number" },
      { type: "output", text: "  --model <name>   specify the model to use (default: sonnet-4.7)" },
      { type: "output", text: "Commands:" },
      { type: "output", text: "  init             Initialize Claude Code in the current directory" },
      { type: "output", text: "  login            Login to Anthropic" },
      { type: "output", text: "  chat             Start an interactive session" }
    ]
  },
  {
    name: "claude-code init",
    desc: "Initialize a new project with Claude Code",
    output: [
      { type: "cmd", text: "claude-code init" },
      { type: "info", text: "🔍 Analyzing project structure..." },
      { type: "output", text: "Detected: JavaScript (Node.js), Vanilla CSS" },
      { type: "output", text: "Creating .claude directory..." },
      { type: "output", text: "Generating CLAUDE.md..." },
      { type: "success", text: "✅ Project initialized. Use 'claude-code chat' to begin." }
    ]
  },
  {
    name: "mcp list",
    desc: "List installed Model Context Protocol servers",
    output: [
      { type: "cmd", text: "mcp list" },
      { type: "output", text: "NAME             STATUS    TRANSPORT" },
      { type: "output", text: "salesforce-org   RUNNING   stdio" },
      { type: "output", text: "google-search    RUNNING   stdio" },
      { type: "output", text: "file-system      RUNNING   stdio" },
      { type: "success", text: "3 servers active." }
    ]
  },
  {
    name: "aider --model sonnet",
    desc: "Start Aider with Claude 3.5 Sonnet",
    output: [
      { type: "cmd", text: "aider --model sonnet" },
      { type: "info", text: "Aider v0.72.0" },
      { type: "output", text: "Model: anthropic/claude-3-5-sonnet-20241022" },
      { type: "output", text: "Git repo: .git" },
      { type: "output", text: "Repo-map: using 1024 tokens" },
      { type: "output", text: "Use /help to see all commands." },
      { type: "info", text: "How can I help you today?" }
    ]
  },
  {
    name: "prompt build-app",
    desc: "Simulate a complex app-building prompt",
    editor: "Act as an expert web architect. \nBuild a responsive 'Liquid Glass' dashboard using:\n- Vanilla CSS variables\n- Grid and Flexbox\n- Subtle backdrop-filter effects\n- 60fps animations\n\nThe dashboard should include a sidebar, a stats row, and a live activity feed.",
    output: [
      { type: "info", text: "System: Processing prompt..." },
      { type: "output", text: "Thought: Creating layout structure..." },
      { type: "output", text: "Thought: Implementing design tokens..." },
      { type: "output", text: "Thought: Generating CSS animations..." },
      { type: "success", text: "✨ Component generated. Previewing in artifacts..." }
    ]
  }
];

let playgroundInitialized = false;

function initPlayground() {
  if (playgroundInitialized) return;
  
  const list = document.getElementById("command-list");
  const terminal = document.getElementById("play-terminal");
  const input = document.getElementById("play-input");
  const editor = document.getElementById("play-editor");
  const clearBtn = document.getElementById("play-clear");

  if (!list || !terminal || !input) return;

  // Render sidebar
  list.innerHTML = PLAYGROUND_COMMANDS.map((cmd, i) => `
    <div class="command-item" data-index="${i}">
      <span class="command-name">${escapeHtml(cmd.name)}</span>
      <span class="command-desc">${escapeHtml(cmd.desc)}</span>
    </div>
  `).join("");

  // Handle sidebar clicks
  list.querySelectorAll(".command-item").forEach(item => {
    item.addEventListener("click", () => {
      const cmd = PLAYGROUND_COMMANDS[item.dataset.index];
      if (cmd.editor) editor.value = cmd.editor;
      runSimulatedCommand(cmd.output);
    });
  });

  // Handle terminal input
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const val = input.value.trim();
      input.value = "";
      
      // Simple exact match or generic output
      const matched = PLAYGROUND_COMMANDS.find(c => c.name === val);
      if (matched) {
        runSimulatedCommand(matched.output);
      } else {
        runSimulatedCommand([
          { type: "cmd", text: val },
          { type: "error", text: `sh: command not found: ${val}` }
        ]);
      }
    }
  });

  clearBtn.addEventListener("click", () => {
    terminal.innerHTML = '<div class="term-line"><span class="term-prompt">❯</span> Terminal cleared.</div>';
  });

  playgroundInitialized = true;
}

function runSimulatedCommand(output) {
  const terminal = document.getElementById("play-terminal");
  if (!terminal) return;

  // Add a small delay for "feeling"
  let delay = 0;
  output.forEach(line => {
    setTimeout(() => {
      const div = document.createElement("div");
      div.className = "term-line";
      
      if (line.type === "cmd") {
        div.innerHTML = `<span class="term-prompt">❯</span> <span class="term-cmd">${escapeHtml(line.text)}</span>`;
      } else {
        div.innerHTML = `<span class="term-${line.type}">${escapeHtml(line.text)}</span>`;
      }
      
      terminal.appendChild(div);
      terminal.scrollTop = terminal.scrollHeight;
    }, delay);
    delay += (line.type === "cmd" ? 100 : 200 + Math.random() * 300);
  });
}


// ══════════ Tab switching ══════════
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".nav-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("hidden", v.id !== `view-${tab}`);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (tab === "feed" && !state.feeds.fundamentals) loadAllFeeds();
  if (tab === "stack" && state.learning) renderStack();
  if (tab === "playground") initPlayground();
  observeReveal();
}

document.querySelectorAll(".nav-tab").forEach((b) => {
  b.addEventListener("click", () => switchTab(b.dataset.tab));
});

// ══════════ Learning content ══════════
async function loadLearning() {
  // Try backend first; fall back to static JSON asset
  let data = null;
  try {
    const res = await fetch("/api/learning");
    if (res.ok) {
      data = await res.json();
      state.hasBackend = true;
    }
  } catch {}
  if (!data) {
    state.hasBackend = false;
    const res = await fetch("data/learning.json");
    data = await res.json();
  }
  state.learning = data;
  renderPath();
  renderModules();
  renderUseCases();
  renderStack();
  renderGlossary();
  observeReveal();
}

function renderPath() {
  const { tracks, modules } = state.learning;
  const path = document.querySelector(".path");
  if (!tracks || !path) return;
  // Build track-shortcut chips that scroll to the matching section
  const counts = {};
  modules.forEach((m) => { counts[m.track] = (counts[m.track] || 0) + 1; });
  path.innerHTML = tracks
    .map((t, i) => `
      ${i > 0 ? '<span class="path-line"></span>' : ""}
      <button class="path-track" data-track="${escapeAttr(t.id)}" title="${escapeAttr(t.blurb)}">
        <span class="path-track-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="path-track-label">${escapeHtml(t.label)}</span>
        <span class="path-track-count">${counts[t.id] || 0}</span>
      </button>
    `)
    .join("");
  path.querySelectorAll(".path-track").forEach((btn) =>
    btn.addEventListener("click", () => {
      const sec = document.querySelector(`[data-track-section="${btn.dataset.track}"]`);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
}

function renderModules() {
  const { tracks, modules } = state.learning;
  const root = document.getElementById("modules-bento");
  if (!root) return;

  // Group modules by track, in track-array order
  const byTrack = {};
  modules.forEach((m, i) => {
    (byTrack[m.track] || (byTrack[m.track] = [])).push({ ...m, _index: i });
  });

  root.innerHTML = tracks
    .map((t, idx) => {
      const items = byTrack[t.id] || [];
      const cards = items
        .map((m) => {
          const short = m.title.replace(/^\d+\s*·\s*/, "");
          const num = String(m._index + 1).padStart(2, "0");
          return `
            <article class="module-card reveal" data-module="${m._index}">
              <div class="module-head">
                <span class="module-num">${num}</span>
                <span class="module-chip">${escapeHtml(m.tag || "")}</span>
              </div>
              <h3 class="module-title">${escapeHtml(short)}</h3>
              <p class="module-why">${escapeHtml(m.why)}</p>
              <div class="module-meta">
                <span>${escapeHtml(m.time || "")}</span>
                <span>${m.resources.length} resources</span>
              </div>
            </article>
          `;
        })
        .join("");

      let phaseHtml = "";
      if (idx === 0) {
        phaseHtml = `
          <div class="phase-header reveal">
            <div class="phase-label">Phase 1</div>
            <div class="phase-title">Foundations: From 0 to 1</div>
          </div>
        `;
      } else if (idx === 3) {
        phaseHtml = `
          <div class="phase-header reveal">
            <div class="phase-label">Phase 2</div>
            <div class="phase-title">Building: Working with Agents</div>
          </div>
        `;
      } else if (idx === 5) {
        phaseHtml = `
          <div class="phase-header reveal">
            <div class="phase-label">Phase 3</div>
            <div class="phase-title">Mastery: Production & Scale</div>
          </div>
        `;
      }

      return `
        ${phaseHtml}
        <section class="track-section reveal" data-track-section="${escapeAttr(t.id)}">
          <header class="track-header">
            <h2 class="track-title">${escapeHtml(t.label)}</h2>
            <p class="track-blurb">${escapeHtml(t.blurb)} · ${items.length} modules</p>
          </header>
          <div class="track-grid">${cards}</div>
        </section>
      `;
    })
    .join("");

  root.querySelectorAll(".module-card").forEach((card) => {
    card.addEventListener("click", () => openModuleSheet(+card.dataset.module));
  });
}

function renderUseCases() {
  const root = document.getElementById("use-cases-section");
  if (!root || !state.learning?.use_cases) return;
  const cases = state.learning.use_cases;

  const cards = cases.map(uc => `
    <article class="module-card use-case-card reveal">
      <div class="module-head">
        <span class="module-chip">${escapeHtml(uc.difficulty)}</span>
        <span class="module-chip">${escapeHtml(uc.time)}</span>
      </div>
      <h3 class="module-title">${escapeHtml(uc.title)}</h3>
      <p class="module-why" style="margin-top: 8px;"><strong>Scenario:</strong> ${escapeHtml(uc.scenario)}</p>
      <p class="module-why" style="margin-top: 8px;"><strong>Outcome:</strong> ${escapeHtml(uc.outcome)}</p>
      <div class="module-meta" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
        <span>${escapeHtml(uc.stack.join(" · "))}</span>
      </div>
    </article>
  `).join("");

  root.innerHTML = `
    <div class="phase-header reveal" style="margin-top: 80px;">
      <div class="phase-label">Phase 4</div>
      <div class="phase-title">Real-Life Use Cases: Putting it into Practice</div>
    </div>
    <section class="track-section reveal" style="margin-top: 20px;">
      <header class="track-header">
        <h2 class="track-title">Expert Solutions</h2>
        <p class="track-blurb">Put the theory into practice with these ${cases.length} actionable recipes to get the most out of these new technologies.</p>
      </header>
      <div class="track-grid">${cards}</div>
    </section>
  `;
}

// ══════════ Stack tab ══════════
function renderStack() {
  const root = document.getElementById("stack-grid");
  if (!root || !state.learning?.stack) return;
  const stack = state.learning.stack;

  // Group by category, preserve first-seen order
  const order = [];
  const groups = {};
  stack.forEach((s) => {
    if (!groups[s.category]) { groups[s.category] = []; order.push(s.category); }
    groups[s.category].push(s);
  });

  root.innerHTML = order
    .map((cat) => {
      const items = groups[cat]
        .map(
          (s) => `
        <a class="stack-card reveal" href="${escapeAttr(s.url)}" target="_blank" rel="noopener">
          <div class="stack-card-head">
            <span class="stack-tag">${escapeHtml(s.tag || "")}</span>
            <span class="stack-license">${escapeHtml(s.license || "")}</span>
          </div>
          <h3 class="stack-name">${escapeHtml(s.name)}</h3>
          <div class="stack-vendor">${escapeHtml(s.vendor || "")}</div>
          <p class="stack-oneliner">${escapeHtml(s.oneliner)}</p>
          ${s.sf ? `<p class="stack-sf"><span class="sf-bridge-label">SF</span> ${escapeHtml(s.sf)}</p>` : ""}
        </a>
      `,
        )
        .join("");
      return `
        <section class="stack-section reveal">
          <header class="track-header">
            <h2 class="track-title">${escapeHtml(cat)}</h2>
            <p class="track-blurb">${groups[cat].length} ${groups[cat].length === 1 ? "entry" : "entries"}</p>
          </header>
          <div class="stack-cards">${items}</div>
        </section>
      `;
    })
    .join("");
}

// ══════════ Module sheet ══════════
const sheet = document.getElementById("sheet");
const sheetBackdrop = document.getElementById("sheet-backdrop");
const sheetBody = document.getElementById("sheet-body");

function openModuleSheet(i) {
  const m = state.learning.modules[i];
  if (!m) return;
  const short = m.title.replace(/^\d+\s*·\s*/, "");
  sheetBody.innerHTML = `
    <div class="sheet-kicker">
      <span class="module-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="module-chip">${escapeHtml(m.tag || "")}</span>
      <span class="module-chip">${escapeHtml(m.time || "")}</span>
    </div>
    <h2 class="sheet-title">${escapeHtml(short)}</h2>
    <p class="sheet-why">${escapeHtml(m.why)}</p>
    <div class="sf-bridge">
      <span class="sf-bridge-label">SF analogy</span>
      ${escapeHtml(m.sf_bridge)}
    </div>
    <div class="sheet-section-label">Read · in order</div>
    <ul class="resources">
      ${m.resources
        .map(
          (r) => `
        <li class="res">
          <div class="res-head">
            <a class="res-title" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
            <span class="res-meta">${escapeHtml(r.author)} · ${escapeHtml(r.duration)}</span>
          </div>
          <p class="res-summary">${escapeHtml(r.summary)}</p>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
  sheet.hidden = false;
  sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add("open");
    sheetBackdrop.classList.add("open");
  });
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  sheet.classList.remove("open");
  sheetBackdrop.classList.remove("open");
  setTimeout(() => {
    sheet.hidden = true;
    sheetBackdrop.hidden = true;
    sheetBody.innerHTML = "";
  }, 400);
  document.body.style.overflow = "";
}

document.getElementById("sheet-close").addEventListener("click", closeSheet);
sheetBackdrop.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sheet.hidden) closeSheet();
});

// ══════════ Glossary ══════════
function renderGlossary() {
  const root = document.getElementById("gloss-grid");
  root.innerHTML = state.learning.glossary
    .map(
      (g) => `
    <div class="gloss-item reveal" data-search="${escapeAttr((g.term + " " + g.definition + " " + g.sf).toLowerCase())}">
      <div class="gloss-term">${escapeHtml(g.term)}</div>
      <p class="gloss-def">${escapeHtml(g.definition)}</p>
      <p class="gloss-sf">${escapeHtml(g.sf)}</p>
    </div>
  `,
    )
    .join("");
}

document.getElementById("gloss-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".gloss-item").forEach((el) => {
    const hay = el.dataset.search || "";
    el.classList.toggle("hidden", q && !hay.includes(q));
  });
});

// ══════════ Static-mode feed fetching (no backend) ══════════
async function fetchTrackStatic(track, forceRefresh) {
  const cacheKey = `feed_cache_${track}`;
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached._t < CACHE_TTL_MS) return cached.data;
    } catch {}
  }

  const feeds = FEED_DEFS[track] || [];
  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`;
      const r = await fetch(api);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.status !== "ok") throw new Error(j.message || "feed error");
      return (j.items || []).map((it) => ({
        id: hashStr(it.link || it.guid || it.title),
        title: stripHtml(it.title || ""),
        url: it.link,
        source: f.name,
        published: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
        summary: stripHtml(it.description || it.content || "").slice(0, 320),
      }));
    }),
  );
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const seen = new Set();
  const unique = all.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  unique.sort((a, b) => (a.published < b.published ? 1 : -1));

  const data = { fetched_at: new Date().toISOString(), articles: unique };
  try { localStorage.setItem(cacheKey, JSON.stringify({ _t: Date.now(), data })); } catch {}
  return data;
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 12);
}

// ══════════ Feed ══════════
async function loadAllFeeds(forceRefresh = false) {
  const grid = document.getElementById("feed-grid");
  grid.innerHTML = `<div class="loading">Loading signal</div>`;
  document.getElementById("feed-updated").textContent = "";

  const tracks = ["fundamentals", "agents", "spec_driven", "tools"];
  try {
    const results = await Promise.all(
      tracks.map(async (t) => {
        let data;
        if (state.hasBackend) {
          const url = forceRefresh ? `/api/feeds/${t}/refresh` : `/api/feeds/${t}`;
          const r = await fetch(url, forceRefresh ? { method: "POST" } : {});
          data = await r.json();
        } else {
          data = await fetchTrackStatic(t, forceRefresh);
        }
        state.feeds[t] = data;
        return { t, data };
      }),
    );

    let mostRecent = null;
    results.forEach(({ data }) => {
      if (data.fetched_at && (!mostRecent || data.fetched_at > mostRecent)) {
        mostRecent = data.fetched_at;
      }
    });
    if (mostRecent) {
      document.getElementById("feed-updated").textContent =
        `Refreshed ${new Date(mostRecent).toLocaleString()}`;
    }

    renderFeed();
  } catch (e) {
    grid.innerHTML = `<div class="empty">Failed to load feeds: ${e.message}</div>`;
  }
}

function renderFeed() {
  const grid = document.getElementById("feed-grid");
  const tracks = state.activeTrack === "all"
    ? ["fundamentals", "agents", "spec_driven", "tools"]
    : [state.activeTrack];

  // merge + dedupe + sort
  const seen = new Set();
  const merged = [];
  tracks.forEach((t) => {
    const data = state.feeds[t];
    if (!data?.articles) return;
    data.articles.forEach((a) => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      merged.push({ ...a, track: t });
    });
  });
  merged.sort((a, b) => (a.published < b.published ? 1 : -1));

  if (merged.length === 0) {
    grid.innerHTML = `<div class="empty">No articles. Try Refresh.</div>`;
    return;
  }

  const items = merged.slice(0, 60);
  grid.innerHTML = items
    .map((a, idx) => {
      const when = a.published ? new Date(a.published).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      const isFeature = idx === 0;
      return `
      <a class="feed-card reveal ${isFeature ? "feature" : ""}" href="${escapeAttr(a.url)}" target="_blank" rel="noopener">
        <span class="feed-tag" data-t="${a.track}">${TRACK_LABEL[a.track] || a.track}</span>
        <h3 class="feed-title">${escapeHtml(a.title)}</h3>
        <div class="feed-meta">${escapeHtml(a.source)} · ${escapeHtml(when)}</div>
        ${a.summary ? `<p class="feed-summary">${escapeHtml(a.summary)}</p>` : ""}
      </a>
    `;
    })
    .join("");

  observeReveal();
}

// chip filter
document.querySelectorAll(".chip[data-track]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-track]").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.activeTrack = chip.dataset.track;
    if (state.feeds.fundamentals) renderFeed();
  });
});

document.getElementById("btn-refresh-all").addEventListener("click", () => loadAllFeeds(true));

// ══════════ Scroll reveal ══════════
let revealObserver;
function observeReveal() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            revealObserver.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
  }
  document.querySelectorAll(".reveal:not(.in)").forEach((el) => revealObserver.observe(el));
}

// ══════════ Utils ══════════
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }

// ══════════ Init ══════════
loadLearning();
