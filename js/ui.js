// Blocs d'écran partagés (panneaux façon FM, KPI, en-têtes, sous-onglets).
import { esc, eur } from "./util.js";

export const panel = (title, body, { right = "", cls = "" } = {}) => `
  <section class="panel ${cls}">
    <header class="panel-h"><h3>${title}</h3>${right ? `<div class="panel-r">${right}</div>` : ""}</header>
    <div class="panel-b">${body}</div>
  </section>`;

export const kpi = (label, value, sub = "", cls = "") => `
  <div class="kpi ${cls}"><div class="lbl">${label}</div><div class="kpi-v">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ""}</div>`;

export const delta = (v, inverse = false) => {
  const good = inverse ? v < 0 : v > 0;
  return `<span class="${v === 0 ? "muted" : good ? "up" : "down"}">${v > 0 ? "▲" : v < 0 ? "▼" : "•"} ${eur(Math.abs(v))}</span>`;
};

export const head = (crumbs, title, { sub = "", right = "" } = {}) => `
  <div class="screen-h">
    <div>
      ${crumbs.length ? `<div class="crumb">${crumbs.map(([l, h]) => (h ? `<a href="${h}">${esc(l)}</a>` : esc(l))).join(" <span>›</span> ")}</div>` : ""}
      <h1>${title}</h1>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
    </div>
    ${right ? `<div class="screen-r">${right}</div>` : ""}
  </div>`;

export const tabs = (items, active) => `<nav class="subtabs">${items.map(([k, l, h]) => `<a href="${h}" class="${k === active ? "on" : ""}">${l}</a>`).join("")}</nav>`;
