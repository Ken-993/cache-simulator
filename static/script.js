const POLICIES = ["LRU", "FIFO", "LFU", "Optimal"];
const ORDER_HINT = {
  LRU: "most recent → least recent",
  FIFO: "newest → oldest",
  LFU: "key(frequency)",
  Optimal: "evicts farthest future use",
};
const COLORS = { LRU: "#4f8cff", FIFO: "#ff9f43", LFU: "#2ecc71", Optimal: "#9aa0a6" };

let sim = null;
let current = 0;
let timer = null;
let chart = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  })
);

/* ---------- Step-by-step ---------- */
$("runBtn").addEventListener("click", async () => {
  stop();
  $("simError").textContent = "";
  try {
    sim = await post("/api/simulate", {
      capacity: $("capacity").value,
      sequence: $("sequence").value,
    });
    current = 0;
    $("playback").hidden = false;
    render();
  } catch (e) {
    $("simError").textContent = e.message;
  }
});

function render() {
  const step = sim.steps[current];
  $("stepLabel").textContent =
    `Step ${current + 1} / ${sim.steps.length}: accessing "${step.key}"`;

  $("sequenceStrip").innerHTML = sim.steps
    .map((s, i) => {
      const cls = i === current ? "current" : i < current ? "done" : "";
      return `<span class="chip ${cls}">${escapeHtml(s.key)}</span>`;
    })
    .join("");

  $("policyGrid").innerHTML = POLICIES.map((name) => {
    const p = step.policies[name];
    let hits = 0;
    for (let i = 0; i <= current; i++) if (sim.steps[i].policies[name].hit) hits++;

    let slots = "";
    for (let i = 0; i < sim.capacity; i++) {
      slots += p.contents[i] !== undefined
        ? `<div class="slot filled">${escapeHtml(p.contents[i])}</div>`
        : `<div class="slot"></div>`;
    }

    return `
      <div class="card">
        <div class="card-head">
          <h3 style="color:${COLORS[name]}">${name}</h3>
          <span class="badge ${p.hit ? "hit" : "miss"}">${p.hit ? "HIT" : "MISS"}</span>
        </div>
        <p class="muted small">${ORDER_HINT[name]}</p>
        <div class="slots">${slots}</div>
        <p class="muted small">${p.evicted !== null ? `Evicted: <b>${escapeHtml(p.evicted)}</b>` : "&nbsp;"}</p>
        <p class="small">Hits so far: <b>${hits}</b> / ${current + 1}</p>
      </div>`;
  }).join("");

  const table = $("summary");
  const last = current === sim.steps.length - 1;
  table.hidden = !last;
  if (last) {
    table.innerHTML =
      `<tr><th>Policy</th><th>Hits</th><th>Misses</th><th>Hit ratio</th></tr>` +
      POLICIES.map((n) => {
        const s = sim.summary[n];
        return `<tr><td>${n}</td><td>${s.hits}</td><td>${s.misses}</td><td>${s.ratio}%</td></tr>`;
      }).join("");
  }
}

$("nextBtn").addEventListener("click", () => {
  if (sim && current < sim.steps.length - 1) { current++; render(); }
});
$("prevBtn").addEventListener("click", () => {
  if (sim && current > 0) { current--; render(); }
});
$("playBtn").addEventListener("click", () => {
  if (!sim) return;
  if (timer) return stop();
  if (current >= sim.steps.length - 1) { current = 0; render(); }
  $("playBtn").textContent = "⏸ Pause";
  timer = setInterval(() => {
    if (current >= sim.steps.length - 1) return stop();
    current++;
    render();
  }, 700);
});

function stop() {
  clearInterval(timer);
  timer = null;
  $("playBtn").textContent = "▶ Play";
}

/* ---------- Compare ---------- */
$("compareBtn").addEventListener("click", async () => {
  const btn = $("compareBtn");
  const workload = $("workload").value;
  btn.disabled = true;
  $("compareInfo").textContent = "Running simulation…";
  try {
    const data = await post("/api/compare", { workload });
    if (chart) chart.destroy();
    chart = new Chart($("chart"), {
      type: "line",
      data: {
        labels: data.capacities,
        datasets: Object.entries(data.results).map(([name, values]) => ({
          label: name,
          data: values,
          borderColor: COLORS[name],
          backgroundColor: COLORS[name],
          borderDash: name === "Optimal" ? [6, 4] : [],
          tension: 0.2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: `Hit ratio vs capacity: ${workload}`, color: "#e6e6e6" },
                   legend: { labels: { color: "#e6e6e6" } } },
        scales: {
          x: { title: { display: true, text: "Cache capacity", color: "#e6e6e6" }, ticks: { color: "#bbb" } },
          y: { title: { display: true, text: "Hit ratio (%)", color: "#e6e6e6" }, ticks: { color: "#bbb" }, min: 0, max: 100 },
        },
      },
    });
    $("compareInfo").textContent = "5,000 accesses × 6 capacities × 4 policies";
  } catch (e) {
    $("compareInfo").textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});