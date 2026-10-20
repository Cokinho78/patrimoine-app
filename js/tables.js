// Tri et filtres sur les colonnes de tout tableau <table class="sortable" data-tid="…">.
// En-tête cliquable = tri (re-clic = sens inverse) ; th[data-filter] = menu de filtre sous l'en-tête.
// Valeur de tri : td[data-v] (nombre ou texte) sinon le texte ; valeur de filtre : td[data-f] sinon le texte.
// L'état est gardé par data-tid : il survit aux re-rendus (changement de mois, synchro).
import { esc } from "./util.js";

const state = new Map();
const stOf = (id) => state.get(id) || state.set(id, { col: null, dir: 1, f: {} }).get(id);
const sortVal = (td) => {
  const v = td?.dataset.v ?? td?.textContent.trim() ?? "";
  return v !== "" && !Number.isNaN(Number(v)) ? Number(v) : String(v).toLowerCase();
};
const filtVal = (td) => (td?.dataset.f ?? td?.textContent.trim() ?? "");

function apply(t) {
  const st = stOf(t.dataset.tid);
  const body = t.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
  if (!t._order) t._order = rows.slice();
  const sorted = st.col == null ? t._order.slice() : rows.slice().sort((a, b) => {
    const x = sortVal(a.cells[st.col]);
    const y = sortVal(b.cells[st.col]);
    if (typeof x === "number" && typeof y === "number") return (x - y) * st.dir;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x.localeCompare(y, "fr") * st.dir;
  });
  for (const r of sorted) {
    r.hidden = Object.entries(st.f).some(([c, v]) => v && filtVal(r.cells[c]) !== v);
    body.appendChild(r);
  }
  [...t.tHead.rows[0].cells].forEach((th, i) => {
    if (th.classList.contains("sort-h")) th.setAttribute("aria-sort", st.col === i ? (st.dir > 0 ? "ascending" : "descending") : "none");
  });
  const cnt = t.closest(".panel")?.querySelector("[data-count]");
  if (cnt) cnt.textContent = `${sorted.filter((r) => !r.hidden).length} / ${rows.length} lignes`;
}

export function enhanceTables(root) {
  root.querySelectorAll("table.sortable[data-tid]").forEach((t) => {
    const st = stOf(t.dataset.tid);
    const ths = [...t.tHead.rows[0].cells];
    ths.forEach((th, i) => {
      if (th.hasAttribute("data-nosort")) return;
      th.classList.add("sort-h");
      th.dataset.col = i;
      th.tabIndex = 0;
    });
    if (ths.some((th) => th.hasAttribute("data-filter")) && !t.tHead.querySelector(".frow")) {
      const tr = t.tHead.insertRow();
      tr.className = "frow";
      ths.forEach((th, i) => {
        const cell = document.createElement("th");
        if (th.hasAttribute("data-filter")) {
          const vals = [...new Set([...t.tBodies[0].rows].map((r) => filtVal(r.cells[i])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
          if (st.f[i] && !vals.includes(st.f[i])) delete st.f[i];
          cell.innerHTML = `<select class="fsel" data-fcol="${i}" aria-label="Filtrer ${esc(th.textContent.trim())}"><option value="">Tous</option>${vals.map((v) => `<option ${st.f[i] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
        }
        tr.appendChild(cell);
      });
    }
    apply(t);
  });
}

function sortBy(th) {
  const t = th.closest("table");
  const st = stOf(t.dataset.tid);
  const i = Number(th.dataset.col);
  if (st.col === i) st.dir = -st.dir;
  else { st.col = i; st.dir = th.dataset.dir === "desc" ? -1 : 1; }
  apply(t);
}

document.addEventListener("click", (e) => {
  const th = e.target.closest("th.sort-h");
  if (th) sortBy(th);
});
document.addEventListener("keydown", (e) => {
  const th = e.target.closest?.("th.sort-h");
  if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(th); }
});
document.addEventListener("change", (e) => {
  const s = e.target.closest("select[data-fcol]");
  if (!s) return;
  const t = s.closest("table");
  stOf(t.dataset.tid).f[s.dataset.fcol] = s.value;
  apply(t);
});
