/* ---------- Constants ---------- */
const POLICIES = ["LRU", "FIFO", "LFU", "Optimal"];
const META = {
  LRU: { color: "#E3B341", full: "Least recently used", order: "Most recent on the left" },
  FIFO: { color: "#E07A4F", full: "First in, first out", order: "Newest on the left" },
  LFU: { color: "#5FC9D6", full: "Least frequently used", order: "Badge shows use count" },
  Optimal: { color: "#CFCBBE", full: "Bélády's optimal", order: "Knows the future" },
};
const WORKLOAD_INFO = {
  "Uniform Random": "Every key is equally likely. There is no pattern to exploit.",
  "Zipf (Popular Items)": "A handful of keys get most requests, like trending videos.",
  "Looping Scan": "Cycles through 25 keys in order. The classic trap for LRU.",
  "Temporal Locality": "Works on a small group of keys that shifts over time.",
};
const PRESETS = {
  belady: { cap: 3, seq: "1 2 3 4 1 2 5 1 2 3 4 5" },
  loop: { cap: 3, seq: "1 2 3 4 1 2 3 4 1 2 3 4" },
  locality: { cap: 3, seq: "1 2 1 3 1 2 4 2 1 5 1 2 5 2 1 5" },
  popular: { cap: 3, seq: "1 1 2 1 3 1 2 4 1 5 2 1 6 1 2 7" },
};
const SPEEDS = [1400, 1000, 650, 380, 180];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mono = (s) => `<b class="mono">${esc(s)}</b>`;
const ordinal = (n) => ["1st", "2nd", "3rd", "4th"][n - 1];
const parseLfu = (entry) => {
  const m = /^(.*)\(f=(\d+)\)$/.exec(entry);
  return m ? { key: m[1], freq: Number(m[2]) } : { key: entry, freq: null };
};

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data.error || `The server returned an error (${res.status}). Try again.`);
  return data;
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === tab.dataset.tab));
    if (tab.dataset.tab !== "simulate") stop();
    if (tab.dataset.tab === "compare" && !chart) $("compareBtn").click();
  })
);

/* ---------- Steppers (− / +) ---------- */
document.querySelectorAll(".stepper button").forEach((btn) =>
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    const next = (parseInt(input.value, 10) || 0) + Number(btn.dataset.step);
    input.value = Math.min(Number(input.max), Math.max(Number(input.min), next));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })
);

/* =========================================================
   SIMULATE
   ========================================================= */
let sim = null;
let current = 0;
let timer = null;
let hitsUpTo = {};

$("preset").addEventListener("change", (e) => {
  const p = PRESETS[e.target.value];
  if (!p) return;
  $("capacity").value = p.cap;
  $("sequence").value = p.seq;
  runSimulation();
});

$("randomBtn").addEventListener("click", () => {
  const len = 14 + Math.floor(Math.random() * 7);
  const range = 5 + Math.floor(Math.random() * 3);
  $("sequence").value = Array.from({ length: len }, () => 1 + Math.floor(Math.random() * range)).join(" ");
  $("preset").value = "";
  runSimulation();
});

$("simForm").addEventListener("submit", (e) => {
  e.preventDefault();
  runSimulation();
});

async function runSimulation() {
  stop();
  $("simError").textContent = "";
  let data;
  try {
    data = await post("/api/simulate", { capacity: $("capacity").value, sequence: $("sequence").value });
  } catch (err) {
    $("simError").textContent = err.message;
    return;
  }
  sim = data;
  hitsUpTo = {};
  for (const name of POLICIES) {
    let h = 0;
    hitsUpTo[name] = sim.steps.map((s) => (h += s.policies[name].hit ? 1 : 0));
  }
  $("simEmpty").hidden = true;
  $("simView").hidden = false;
  go(0, true);
}

function go(i, animate = false) {
  if (!sim) return;
  current = Math.max(0, Math.min(sim.steps.length - 1, i));
  render(animate && !reduceMotion);
}

function render(animate) {
  const step = sim.steps[current];
  $("stepLabel").innerHTML = `Request ${current + 1} of ${sim.steps.length}: key ${mono(step.key)}`;
  renderBanks(animate);
  renderAnalyzer();
  renderResults();
}

function rankAt(i) {
  const sorted = [...POLICIES].sort((a, b) => hitsUpTo[b][i] - hitsUpTo[a][i]);
  const ranks = {};
  sorted.forEach((name, idx) => {
    const prev = sorted[idx - 1];
    ranks[name] = idx > 0 && hitsUpTo[name][i] === hitsUpTo[prev][i] ? ranks[prev] : idx + 1;
  });
  return ranks;
}

function explain(name, i) {
  const step = sim.steps[i];
  const p = step.policies[name];
  if (p.hit) {
    if (name === "LRU") return `Hit. ${mono(step.key)} moves to the front.`;
    if (name === "FIFO") return `Hit. Arrival order stays the same.`;
    if (name === "LFU") {
      const e = p.contents.map(parseLfu).find((x) => x.key === step.key);
      return `Hit. ${mono(step.key)} has now been used ${e ? e.freq : "several"} times.`;
    }
    return `Hit. Nothing changes.`;
  }
  if (p.evicted === null) return `Miss. ${mono(step.key)} goes into an empty slot.`;
  const ev = mono(p.evicted);
  if (name === "LRU") return `Miss. Evicted ${ev}, the least recently used.`;
  if (name === "FIFO") return `Miss. Evicted ${ev}, the oldest arrival.`;
  if (name === "LFU") {
    const before = sim.steps[i - 1].policies.LFU.contents.map(parseLfu).find((x) => x.key === p.evicted);
    const f = before ? before.freq : 1;
    return `Miss. Evicted ${ev}, used only ${f === 1 ? "once" : f + " times"}.`;
  }
  const next = sim.steps.findIndex((s, j) => j > i && s.key === p.evicted);
  return next === -1
    ? `Miss. Evicted ${ev}, which is never needed again.`
    : `Miss. Evicted ${ev}, not needed until request ${next + 1}.`;
}

function renderBanks(animate) {
  const step = sim.steps[current];
  const ranks = rankAt(current);

  $("banks").innerHTML = POLICIES.map((name) => {
    const p = step.policies[name];
    const m = META[name];
    const hits = hitsUpTo[name][current];
    const pct = Math.round((hits / (current + 1)) * 100);
    const entries = name === "LFU" ? p.contents.map(parseLfu) : p.contents.map((k) => ({ key: k, freq: null }));

    let pads = entries
      .map((e) => {
        const isKey = e.key === step.key;
        const anim = isKey && animate ? (p.hit ? "flash" : "enter") : "";
        const badge = e.freq !== null ? `<span class="freq">×${e.freq}</span>` : "";
        return `<div class="pad filled ${isKey ? "active" : ""} ${anim}">${esc(e.key)}${badge}</div>`;
      })
      .join("");
    for (let i = entries.length; i < sim.capacity; i++) pads += `<div class="pad"></div>`;
    if (animate && p.evicted !== null) pads += `<div class="pad ghost" aria-hidden="true">${esc(p.evicted)}</div>`;

    return `
      <article class="bank" style="--c:${m.color}">
        <header class="bank-head">
          <div>
            <h3>${name}</h3>
            <p class="bank-sub">${m.full}</p>
          </div>
          <div class="status ${p.hit ? "is-hit" : "is-miss"}"><span class="led"></span>${p.hit ? "Hit" : "Miss"}</div>
        </header>
        <p class="order">${m.order}</p>
        <div class="pads">${pads}</div>
        <p class="why">${explain(name, current)}</p>
        <div class="meter"><span style="width:${pct}%"></span></div>
        <p class="score"><span>${hits} of ${current + 1} hits</span><span class="rank">${ordinal(ranks[name])}</span></p>
      </article>`;
  }).join("");
}

function renderAnalyzer() {
  const n = sim.steps.length;
  const state = (i) => (i < current ? "past" : i === current ? "cur" : "future");

  let html =
    `<div class="a-label">Key</div>` +
    sim.steps
      .map((s, i) => `<button type="button" class="a-key ${state(i)}" data-i="${i}" aria-label="Go to request ${i + 1}">${esc(s.key)}</button>`)
      .join("");

  for (const name of POLICIES) {
    const color = META[name].color;
    html += `<div class="a-label" style="--c:${color}"><span class="dot"></span>${name}</div>`;
    html += sim.steps
      .map((s, i) => {
        const hit = s.policies[name].hit;
        const edge = i > 0 && hit !== sim.steps[i - 1].policies[name].hit;
        return `<div class="a-cell ${hit ? "hi" : "lo"} ${edge ? "edge" : ""} ${state(i)}" data-i="${i}" style="--c:${color}"></div>`;
      })
      .join("");
  }

  const grid = $("analyzer");
  grid.style.gridTemplateColumns = `84px repeat(${n}, minmax(24px, 1fr))`;
  grid.innerHTML = html;

  const wrap = grid.parentElement;
  const cur = grid.querySelector(".a-key.cur");
  if (cur && wrap.scrollWidth > wrap.clientWidth) {
    wrap.scrollLeft = cur.offsetLeft - wrap.clientWidth / 2;
  }
}

$("analyzer").addEventListener("click", (e) => {
  const cell = e.target.closest("[data-i]");
  if (!cell) return;
  stop();
  go(Number(cell.dataset.i));
});

function renderResults() {
  const box = $("results");
  const done = current === sim.steps.length - 1;
  box.hidden = !done;
  if (!done) return;

  const rows = POLICIES.map((n) => ({ n, ...sim.summary[n] })).sort((a, b) => b.ratio - a.ratio);
  const real = rows.filter((r) => r.n !== "Optimal");
  const best = real.filter((r) => r.ratio === real[0].ratio).map((r) => r.n);

  $("resultBars").innerHTML =
    rows
      .map(
        (r) => `
      <div class="rrow" style="--c:${META[r.n].color}">
        <span class="rname">${r.n}</span>
        <span class="rtrack"><span class="rfill" data-w="${r.ratio}"></span></span>
        <span class="rval">${r.ratio}%</span>
      </div>`
      )
      .join("") +
    `<p class="verdict">${best.join(" and ")} came closest to Optimal on this sequence, with ${real[0].hits} hits out of ${sim.steps.length} requests.</p>`;

  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.querySelectorAll(".rfill").forEach((el) => (el.style.width = el.dataset.w + "%"))
    )
  );
}

/* ---------- Playback ---------- */
const delay = () => SPEEDS[Number($("speed").value) - 1];

function setPlayIcon(playing) {
  const b = $("playBtn");
  b.textContent = playing ? "❚❚" : "▶";
  b.setAttribute("aria-label", playing ? "Pause" : "Play");
}

function play() {
  if (!sim) return;
  if (current >= sim.steps.length - 1) go(0);
  setPlayIcon(true);
  timer = setTimeout(tick, delay());
}

function tick() {
  if (current >= sim.steps.length - 1) return stop();
  go(current + 1, true);
  timer = setTimeout(tick, delay());
}

function stop() {
  clearTimeout(timer);
  timer = null;
  setPlayIcon(false);
}

$("playBtn").addEventListener("click", () => (timer ? stop() : play()));
$("firstBtn").addEventListener("click", () => { stop(); go(0); });
$("prevBtn").addEventListener("click", () => { stop(); go(current - 1); });
$("nextBtn").addEventListener("click", () => { stop(); go(current + 1, true); });
$("lastBtn").addEventListener("click", () => { stop(); go(Infinity); });

document.addEventListener("keydown", (e) => {
  if (!sim || !$("simulate").classList.contains("active")) return;
  const tag = e.target.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

  if (e.key === " ") {
    if (tag === "BUTTON") return;
    e.preventDefault();
    timer ? stop() : play();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    stop();
    go(current + 1, true);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    stop();
    go(current - 1);
  } else if (e.key === "Home") {
    stop();
    go(0);
  } else if (e.key === "End") {
    stop();
    go(Infinity);
  }
});

/* =========================================================
   COMPARE
   ========================================================= */
let chart = null;

document.querySelectorAll("[data-desc]").forEach((el) => (el.textContent = WORKLOAD_INFO[el.dataset.desc] || ""));

if (window.Chart) {
  Chart.defaults.color = "#A9B8AC";
  Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
  Chart.defaults.borderColor = "rgba(44, 122, 92, 0.35)";
}

document.querySelectorAll('input[name="workload"]').forEach((r) =>
  r.addEventListener("change", () => $("compareBtn").click())
);

$("compareBtn").addEventListener("click", async () => {
  const btn = $("compareBtn");
  const workload = document.querySelector('input[name="workload"]:checked')?.value;
  if (!workload) return;
  if (!window.Chart) {
    setInsights(["The chart library didn't load. Check your internet connection and refresh the page."]);
    return;
  }
  btn.disabled = true;
  btn.textContent = "Running…";
  try {
    const data = await post("/api/compare", { workload });
    drawChart(workload, data);
    setInsights(buildInsights(data));
    $("chartEmpty").hidden = true;
  } catch (err) {
    setInsights([err.message]);
  } finally {
    btn.disabled = false;
    btn.textContent = "Run comparison";
  }
});

function drawChart(workload, data) {
  if (chart) chart.destroy();
  chart = new Chart($("chart"), {
    type: "line",
    data: {
      labels: data.capacities.map(String),
      datasets: POLICIES.filter((n) => data.results[n]).map((name) => ({
        label: name,
        data: data.results[name],
        borderColor: META[name].color,
        backgroundColor: META[name].color,
        borderWidth: name === "Optimal" ? 2 : 2.5,
        borderDash: name === "Optimal" ? [6, 5] : [],
        pointRadius: 4,
        pointHoverRadius: 7,
        tension: 0.25,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        title: { display: true, text: workload, color: "#EEEBDD", font: { size: 16, weight: "500" } },
        legend: { position: "bottom", labels: { usePointStyle: true, padding: 18 } },
        tooltip: {
          callbacks: {
            title: (items) => `Cache size ${items[0].label}`,
            label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "Cache size (slots)" } },
        y: { min: 0, max: 100, title: { display: true, text: "Hit ratio" }, ticks: { callback: (v) => v + "%" } },
      },
    },
  });
}

function buildInsights({ capacities, results }) {
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const f = (x) => x.toFixed(1);
  const avgs = Object.fromEntries(POLICIES.map((n) => [n, avg(results[n])]));
  const real = ["LRU", "FIFO", "LFU"].sort((a, b) => avgs[b] - avgs[a]);
  const lru = results.LRU;

  const out = [
    `${real[0]} does best among the real policies, averaging ${f(avgs[real[0]])}% hits across all cache sizes.`,
    `${real[2]} does worst, averaging ${f(avgs[real[2]])}%.`,
  ];
  if (avgs.Optimal > 0) {
    out.push(`LRU gets ${Math.round((avgs.LRU / avgs.Optimal) * 100)}% of the hits a perfect, future-knowing cache would get.`);
  }
  out.push(
    `Growing the cache from ${capacities[0]} to ${capacities[capacities.length - 1]} slots takes LRU from ${lru[0]}% to ${lru[lru.length - 1]}%.`
  );
  return out;
}

function setInsights(items) {
  $("insights").innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join("");
}

/* =========================================================
   LRU LAB
   ========================================================= */
let labHistory = [];
const labCap = () => Number($("labCap").value);

$("quickKeys").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8]
  .map((k) => `<button type="button" data-key="${k}" aria-label="Access key ${k}">${k}</button>`)
  .join("");

$("quickKeys").addEventListener("click", (e) => {
  const b = e.target.closest("[data-key]");
  if (b) labAccess(b.dataset.key);
});

$("labForm").addEventListener("submit", (e) => {
  e.preventDefault();
  labAccess($("labKey").value);
  $("labKey").value = "";
});

$("labKey").addEventListener("input", () => ($("labError").textContent = ""));
$("labReset").addEventListener("click", () => labReset("Cache cleared. Access a key to start."));
$("labCap").addEventListener("change", () => labReset(`Cache size set to ${labCap()}. Access a key to start.`));

function labReset(message) {
  labHistory = [];
  $("labError").textContent = "";
  $("labLog").innerHTML = "";
  renderLab(null, null);
  logLab(esc(message));
}

async function labAccess(raw) {
  const key = String(raw).trim();
  const err = $("labError");
  if (!key) { err.textContent = "Type a key first."; return; }
  if (/[\s,]/.test(key)) { err.textContent = "Use a single key without spaces or commas."; return; }
  if (labHistory.length >= 200) { err.textContent = "That's 200 requests. Reset to keep going."; return; }
  err.textContent = "";

  labHistory.push(key);
  try {
    const data = await post("/api/simulate", { capacity: labCap(), sequence: labHistory.join(" ") });
    const p = data.steps[data.steps.length - 1].policies.LRU;
    renderLab(p, key);
    if (p.hit) {
      logLab(`Accessed ${mono(key)}: hit. Found through the hash map, then moved to the front of the list.`);
    } else if (p.evicted !== null) {
      logLab(`Accessed ${mono(key)}: miss. Removed ${mono(p.evicted)} from the back and from the map, then inserted ${mono(key)} at the front.`);
    } else {
      logLab(`Accessed ${mono(key)}: miss. Inserted at the front and added to the map.`);
    }
  } catch (e) {
    labHistory.pop();
    err.textContent = e.message;
  }
}

function renderLab(p, key) {
  const contents = p ? p.contents : [];
  const animate = Boolean(p) && !reduceMotion;

  const sorted = [...contents].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $("labMap").innerHTML = sorted.length
    ? `<tr><th>Key</th><th>Points to</th></tr>` +
      sorted.map((k) => `<tr class="${k === key ? "touched" : ""}"><td class="mono">${esc(k)}</td><td>node ${esc(k)}</td></tr>`).join("")
    : `<tr><td class="muted">Empty. Access a key to start.</td></tr>`;

  let list = `<span class="sentinel">head</span>`;
  contents.forEach((k) => {
    const anim = k === key && animate ? (p.hit ? "flash" : "enter") : "";
    list += `<span class="link" aria-hidden="true">⇄</span><span class="pad filled ${k === key ? "active" : ""} ${anim}">${esc(k)}</span>`;
  });
  list += `<span class="link" aria-hidden="true">⇄</span><span class="sentinel">tail</span>`;
  if (animate && p.evicted !== null) list += `<span class="pad ghost" aria-hidden="true">${esc(p.evicted)}</span>`;

  const box = $("labList");
  box.style.setProperty("--c", META.LRU.color);
  box.innerHTML = list;
}

function logLab(html) {
  const log = $("labLog");
  log.insertAdjacentHTML("afterbegin", `<li>${html}</li>`);
  while (log.children.length > 6) log.lastElementChild.remove();
}

/* ---------- Start ---------- */
labReset("Cache is empty. Access a key to start.");
runSimulation();