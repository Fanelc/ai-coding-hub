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

const MODULE_TAGS = [
  "Foundation", "Foundation", "Core", "Practice", "Core", "Tools", "Production",
];

const MODULE_LAYOUT = [
  "wide hero-card", "", "", "wide", "", "", "wide",
];

const TIME_ESTIMATES = [
  "≈2h", "≈35 min", "≈1h 15", "≈50 min", "≈1h", "≈40 min", "≈1h",
];

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
  renderGlossary();
  observeReveal();
}

function renderPath() {
  const { modules } = state.learning;
  const path = document.querySelector(".path");
  path.innerHTML = modules
    .map((m, i) => {
      const short = m.title.replace(/^\d+\s*·\s*/, "").split(":")[0];
      return `
        ${i > 0 ? '<span class="path-line"></span>' : ""}
        <div class="path-node">
          <button class="path-dot" data-module="${i}" title="${escapeAttr(m.title)}">${i + 1}</button>
        </div>
      `;
    })
    .join("");
  path.querySelectorAll(".path-dot").forEach((btn) =>
    btn.addEventListener("click", () => openModuleSheet(+btn.dataset.module)),
  );
}

function renderModules() {
  const { modules } = state.learning;
  const root = document.getElementById("modules-bento");
  root.innerHTML = modules
    .map((m, i) => {
      const short = m.title.replace(/^\d+\s*·\s*/, "");
      return `
        <article class="module-card reveal ${MODULE_LAYOUT[i]}" data-module="${i}">
          <div class="module-head">
            <span class="module-num">${String(i + 1).padStart(2, "0")}</span>
            <span class="module-chip">${MODULE_TAGS[i]}</span>
          </div>
          <h3 class="module-title">${escapeHtml(short)}</h3>
          <p class="module-why">${escapeHtml(m.why)}</p>
          <div class="module-meta">
            <span>${TIME_ESTIMATES[i]}</span>
            <span>${m.resources.length} resources</span>
          </div>
        </article>
      `;
    })
    .join("");
  root.querySelectorAll(".module-card").forEach((card) => {
    card.addEventListener("click", () => openModuleSheet(+card.dataset.module));
  });
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
      <span class="module-chip">${MODULE_TAGS[i]}</span>
      <span class="module-chip">${TIME_ESTIMATES[i]}</span>
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
