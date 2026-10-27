// Graphiques en HTML/SVG. Le texte reste en HTML (net à toutes les tailles),
// le SVG ne sert qu'aux tracés. Survol : attribut data-tip (texte, \n = retour ligne).
import { esc } from "./util.js";

const niceStep = (max, n = 4) => {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || p * 10;
};
export const niceMax = (max, n = 4) => {
  const s = niceStep(max, n);
  return Math.max(s, Math.ceil(max / s) * s);
};
const kfmt = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k` : `${v}`);

// cols: [{ label, sub?, segs: [{ v, color, tip }], top?, badge?, href?, on?, dim? }]
// opts: { height, max, ref: { v, label } }
export function columns(cols, { height = 240, max, ref } = {}) {
  const vmax = niceMax(max ?? Math.max(1, ...cols.map((c) => c.segs.reduce((s, x) => s + Math.max(0, x.v), 0)), ref?.v || 0));
  const step = niceStep(vmax);
  const ticks = [];
  for (let v = 0; v <= vmax + 1e-6; v += step) ticks.push(v);
  const y = (v) => (v / vmax) * 100;
  return `
  <div class="cols" style="--h:${height}px">
    <div class="cols-axis">${ticks.map((t) => `<span style="bottom:${y(t)}%">${kfmt(t)}</span>`).join("")}</div>
    <div class="cols-plot">
      ${ticks.map((t) => `<i class="cols-grid" style="bottom:${y(t)}%"></i>`).join("")}
      ${ref ? `<i class="cols-ref" style="bottom:${y(ref.v)}%"><b>${esc(ref.label)}</b></i>` : ""}
      <div class="cols-row">
        ${cols.map((c) => {
          const tot = c.segs.reduce((s, x) => s + Math.max(0, x.v), 0);
          const tag = c.href ? "a" : "div";
          return `<${tag} class="col${c.on ? " on" : ""}${c.dim ? " dim" : ""}" ${c.href ? `href="${c.href}"` : ""}>
            <span class="col-top" style="bottom:${y(tot)}%">${c.badge ? `<em>${esc(c.badge)}</em>` : ""}${c.top ?? ""}</span>
            <span class="col-stack" style="height:${y(tot)}%">
              ${c.segs.filter((x) => x.v > 0).map((x) => `<i style="flex:${x.v};background:${x.color}" data-tip="${esc(x.tip || "")}"></i>`).join("")}
            </span>
          </${tag}>`;
        }).join("")}
      </div>
    </div>
    <div></div>
    <div class="cols-labels">${cols.map((c) => `<span class="${c.on ? "on" : ""}">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</span>`).join("")}</div>
  </div>`;
}

// Courbe d'aire, dessinée à la largeur réelle du conteneur (voir drawLines).
// points: [{ label, v|null, tip }]
// ref: { v, label } = ligne horizontale pointillée (seuil, plancher).
export function line(points, { height = 200, color = "var(--accent)", lo, hi, ref } = {}) {
  const data = encodeURIComponent(JSON.stringify({ points, color, lo, hi, ref }));
  return `<div class="line" style="height:${height}px" data-line="${data}"></div>`;
}

export function drawLines(root) {
  root.querySelectorAll("[data-line]").forEach((el) => {
    const { points, color, lo, hi, ref } = JSON.parse(decodeURIComponent(el.dataset.line));
    const W = el.clientWidth, H = el.clientHeight;
    if (!W) return;
    const P = { l: 46, r: 16, t: 18, b: 26 };
    const vals = [...points.map((p) => p.v), ref?.v].filter((v) => v != null);
    let vmin = lo ?? Math.min(...vals), vmax = hi ?? Math.max(...vals);
    const pad = (vmax - vmin) * 0.15 || 1000;
    vmin = lo ?? Math.floor((vmin - pad) / 1000) * 1000;
    vmax = hi ?? Math.ceil((vmax + pad) / 1000) * 1000;
    const cw = W - P.l - P.r, ch = H - P.t - P.b;
    const x = (i) => P.l + (points.length === 1 ? cw / 2 : (i / (points.length - 1)) * cw);
    const yy = (v) => P.t + ch - ((v - vmin) / (vmax - vmin)) * ch;
    const step = niceStep(vmax - vmin, 4);
    let g = "";
    for (let v = Math.ceil(vmin / step) * step; v <= vmax; v += step) {
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy(v)}" y2="${yy(v)}" class="grid"/>
            <text x="${P.l - 8}" y="${yy(v) + 4}" text-anchor="end" class="ax">${kfmt(v)}</text>`;
    }
    const real = points.map((p, i) => ({ ...p, i })).filter((p) => p.v != null);
    const path = real.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${yy(p.v)}`).join("");
    const area = real.length > 1
      ? `${path}L${x(real.at(-1).i)},${P.t + ch}L${x(real[0].i)},${P.t + ch}Z` : "";
    // Segment pointillé quand un mois manque entre deux points.
    let gaps = "";
    real.forEach((p, k) => {
      if (k && p.i - real[k - 1].i > 1) {
        gaps += `<line x1="${x(real[k - 1].i)}" y1="${yy(real[k - 1].v)}" x2="${x(p.i)}" y2="${yy(p.v)}" class="gap"/>`;
      }
    });
    const solid = real.map((p, k) => (k && p.i - real[k - 1].i > 1 ? `M${x(p.i)},${yy(p.v)}` : `${k ? "L" : "M"}${x(p.i)},${yy(p.v)}`)).join("");
    const id = `g${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${g}
      ${area ? `<path d="${area}" fill="url(#${id})"/>` : ""}
      ${ref ? `<line x1="${P.l}" x2="${W - P.r}" y1="${yy(ref.v)}" y2="${yy(ref.v)}" class="ref"/>
        <text x="${W - P.r}" y="${yy(ref.v) - 6}" text-anchor="end" class="ref-t">${esc(ref.label || "")}</text>` : ""}
      ${gaps.replaceAll("<line", `<line stroke="${color}"`)}
      <path d="${solid}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ax${p.v == null ? " off" : ""}">${esc(p.label)}</text>`).join("")}
      ${real.map((p) => {
        // Série longue (cours quotidiens) : pas de rond par point, zone de survol = largeur d'un jour.
        const dense = points.length > 40;
        const w = dense ? Math.max(2, cw / points.length) : 44;
        return `${dense ? "" : `<circle cx="${x(p.i)}" cy="${yy(p.v)}" r="4.5" fill="var(--surface)" stroke="${color}" stroke-width="2.5"/>`}
        <rect x="${x(p.i) - w / 2}" y="${P.t}" width="${w}" height="${ch}" fill="transparent" data-tip="${esc(p.tip || "")}"/>`;
      }).join("")}
      ${points.length > 40 && real.length ? `<circle cx="${x(real.at(-1).i)}" cy="${yy(real.at(-1).v)}" r="4.5" fill="var(--surface)" stroke="${color}" stroke-width="2.5"/>` : ""}
    </svg>`;
  });
}

// Mini-histogramme pour les tuiles (hauteur fixe, sans axe).
export function spark(values, color, { ref } = {}) {
  const max = Math.max(1, ...values.map((v) => Math.max(0, v.v)), ref || 0);
  return `<div class="spark">
    ${ref ? `<i class="spark-ref" style="bottom:${(ref / max) * 100}%"></i>` : ""}
    ${values.map((v) => `<span style="height:${Math.max(0, v.v) / max * 100}%;background:${color}" data-tip="${esc(v.tip || "")}"></span>`).join("")}
  </div>`;
}

// Barre horizontale avec repère de budget.
export function meter(v, ref, color, max) {
  const m = Math.max(v, ref || 0, max || 0, 1);
  return `<div class="meter"><div style="width:${(Math.max(0, v) / m) * 100}%;background:${color}"></div>${
    ref ? `<i style="left:${(ref / m) * 100}%"></i>` : ""}</div>`;
}

export function split(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  return `<div class="split">${parts.map((p) => `<i style="flex:${p.v / tot};background:${p.color}" data-tip="${esc(p.tip || "")}"></i>`).join("")}</div>`;
}
