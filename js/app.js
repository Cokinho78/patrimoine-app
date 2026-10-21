// Patrimoine — lecture seule des données du repo privé patrimoine-data.
// Niveaux : Tableau de bord › Patrimoine (enveloppes › lignes) ›
//           Dépenses (période › mois › catégorie › marchand › transaction).
import { Store, StoreError, loadConfig, saveConfig, forgetToken } from "./store.js";
import { esc, eur, eur2, signed, pct, mShort, mYear, mLong, dShort, monthRange } from "./util.js";
import {
  GROUPS, ENVELOPES, EXCEPTIONNEL, ALL_CATS, buildModel, computeActions,
  slugOf, catOfSlug, catColor, catIcon, catName,
} from "./model.js";
import { columns, line, drawLines, spark, meter, split } from "./charts.js";
import { enhanceTables } from "./tables.js";
import { panel, kpi, delta, head, tabs } from "./ui.js";
import { viewImmo, bindImmo } from "./immo.js";
import { buildImmo } from "./immo-model.js";

const S = {
  cfg: loadConfig(),
  M: null,
  I: null,
  error: "",
  period: "12",
  tx: { q: "", cat: "", mois: "" },
  marchand: "",
};
const $view = document.getElementById("view");
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

// ---------------------------------------------------------------- chargement

async function loadAll() {
  if (!S.cfg.token) { setSync("Token requis", ""); render(); return; }
  setSync("Synchronisation…", "");
  try {
    const store = new Store(S.cfg);
    const files = (await store.listFiles()).filter((p) => p.endsWith(".json"));
    const data = await store.readMany(files);
    S.M = buildModel(data);
    S.I = buildImmo(data);
    S.error = "";
    setSync(store.offline ? "Hors ligne : dernières données" : `À jour · ${mYear(S.M.months.at(-1))}`, store.offline ? "" : "ok");
  } catch (e) {
    S.error = e instanceof StoreError ? e.message : `Connexion impossible (${e.message})`;
    setSync("Erreur de synchronisation", "err");
  }
  render();
}

function setSync(msg, cls) {
  document.getElementById("sync-txt").textContent = msg;
  document.getElementById("sync-dot").className = `dot ${cls}`;
}

// ---------------------------------------------------------------- blocs

const catChip = (cat, href) => `<a class="chip" href="${href || `#/depenses/cat/${slugOf(cat)}`}"><i style="background:${catColor(cat)}"></i>${esc(catName(cat))}</a>`;

const legend = () => `<div class="legend">${GROUPS.map((g) => {
  const href = g.cats.length === 1 ? `#/depenses/cat/${slugOf(g.cats[0])}` : "#/depenses/categories";
  return `<a href="${href}"><i style="background:${g.color}"></i>${g.nom}</a>`;
}).join("")}<span><i style="background:#ff6b6b"></i>Exceptionnel (hors barres)</span></div>`;

function periodMonths() {
  const all = S.M.months;
  if (S.period === "2025" || S.period === "2026") return all.filter((m) => m.startsWith(S.period));
  return all.slice(-Number(S.period));
}
const periodLabel = () => ({ 6: "6 derniers mois", 12: "12 derniers mois", 18: "18 mois", 2025: "Année 2025", 2026: "Année 2026" }[S.period]);
const periodToggles = () => `<div class="seg">${[["6", "6M"], ["12", "12M"], ["18", "18M"], ["2025", "2025"], ["2026", "2026"]]
  .map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${S.period === k}">${l}</button>`).join("")}</div>`;

const monthLabelCols = (ms) => ms.map((m, i) => ({ label: mShort(m), sub: i === 0 || m.endsWith("-01") ? m.slice(0, 4) : "" }));

// ---------------------------------------------------------------- tableau de bord

function viewAccueil() {
  const M = S.M;
  const L = M.patriLast;
  const P = M.patri;
  const first = P[0];
  const prev = P.at(-2);
  const last12 = M.last(12);
  const fullRev = last12.filter((m) => !M.revenusIncomplets(m));
  const ep12 = sum(fullRev, (m) => M.epargne(m));
  const rev12 = sum(fullRev, (m) => M.revenus(m));
  const last3 = M.last(3);
  const dep3 = sum(last3, (m) => M.courant(m)) / 3;
  const env = M.envelopes(L.soldes);
  const actions = computeActions(M);
  const lastM = M.months.at(-1);

  const patriLine = line(
    monthRange(first.mois, L.mois).map((m) => {
      const p = P.find((x) => x.mois === m);
      return { label: mShort(m), v: p ? p.total : null, tip: p ? `${mLong(m)}\n${eur(p.total)}` : "" };
    }), { height: 230 });

  const flow = columns(last12.map((m, i) => {
    const f = M.byMonth.get(m).charges_fixes;
    const ep = M.epargne(m);
    const inc = M.revenusIncomplets(m);
    return {
      ...monthLabelCols(last12)[i],
      href: `#/depenses/mois/${m}`,
      dim: inc,
      badge: inc ? "salaire absent" : M.exceptionnel(m) ? `+${eur(M.exceptionnel(m))} exc.` : "",
      top: inc ? "" : `<b class="${ep >= 0 ? "up" : "down"}">${ep >= 0 ? "+" : "−"}${Math.round(Math.abs(ep) / 100) / 10}k</b>`,
      segs: [
        { v: M.courant(m), color: "#3b7bff", tip: `${mLong(m)}\nDépenses courantes ${eur(M.courant(m))}` },
        { v: f.loyer, color: "#5b6270", tip: `Loyer ${eur(f.loyer)}` },
        { v: Math.max(0, ep), color: "#3ddc97", tip: `Épargne ${eur(ep)} (dont AV ${eur(f.av_bnp)})\nRevenus ${eur(M.revenus(m))}` },
      ],
    };
  }), { height: 220 });

  const envRows = ENVELOPES.map((e) => `
    <a class="trow" href="#/patrimoine${e.key === "cc" ? "" : `/${e.key}`}">
      <span class="tname"><i class="sw" style="background:${e.color}"></i>${e.nom}</span>
      <span class="num">${eur(env[e.key])}</span><span class="num muted">${pct(env[e.key] / L.total)}</span>
    </a>`).join("");

  const top = Object.entries(M.net.get(lastM)).filter(([c, v]) => v > 0 && c !== EXCEPTIONNEL)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);

  return `
  ${head([], "Tableau de bord", { sub: `Données au ${mLong(L.mois)} · dépenses jusqu'en ${mLong(lastM)}` })}
  <div class="grid g-hero">
    <div class="hero">
      <div class="lbl">Patrimoine net${M.patriEstime ? ` · estimé au ${dShort(M.patriEstime.date)}` : ""}</div>
      <div class="hero-v">${eur(M.patriEstime ? M.patriEstime.total : L.total)}</div>
      ${M.patriEstime ? `<div class="hero-d"><span class="muted">Relevé de ${mLong(L.mois)} : ${eur(L.total)}, ${M.patriEstime.enveloppes.length > 1 ? "PEA et assurance-vie revalorisés" : "PEA revalorisé"} au cours du jour</span> ${delta(M.patriEstime.total - L.total)}
        <a href="#/patrimoine/pea" class="xs">PEA →</a></div>` : ""}
      <div class="hero-d">${prev ? `${delta(L.total - prev.total)} <span class="muted">${mShort(L.mois)} vs ${mShort(prev.mois)}</span>` : ""}
        <span class="sep"></span>${delta(L.total - first.total)} <span class="muted">depuis ${mYear(first.mois)} (${pct((L.total - first.total) / first.total, 1)})</span></div>
    </div>
    ${kpi(`Épargne · ${fullRev.length} mois complets`, signed(ep12), `Taux ${pct(ep12 / rev12)} des revenus · ${signed(ep12 / fullRev.length)}/mois<span>AV comprise · cible ${eur(M.budget.epargne_cible || 0)}/mois</span>`, ep12 >= 0 ? "k-ok" : "k-bad")}
    ${kpi("Dépenses courantes · 3 mois", `${eur(dep3)}<small>/mois</small>`, `${meter(dep3, M.budgetCourant, dep3 > M.budgetCourant ? "#ff6b6b" : "#3b7bff")}Budget ${eur(M.budgetCourant)} · ${dep3 > M.budgetCourant ? `<span class="down">+${eur(dep3 - M.budgetCourant)}</span>` : `<span class="up">−${eur(M.budgetCourant - dep3)}</span>`}`)}
    ${immoKpi() || kpi("Actions ouvertes", `${actions.filter((a) => a.niveau !== "info").length}`, `<a href="#/actions">Voir le plan →</a>`)}
  </div>
  <div class="grid g-21">
    ${panel("Évolution du patrimoine", patriLine, { right: `<a href="#/patrimoine">Détail par compte →</a>` })}
    ${panel("Répartition", `${split(ENVELOPES.map((e) => ({ v: env[e.key], color: e.color, tip: `${e.nom}\n${eur(env[e.key])}` })))}<div class="tlist">${envRows}</div>`)}
  </div>
  ${panel("Où part le salaire · 12 mois", `${flow}
    <div class="legend"><span><i style="background:#3b7bff"></i>Dépenses courantes</span><span><i style="background:#5b6270"></i>Loyer</span><span><i style="background:#3ddc97"></i>Épargne (AV comprise)</span><span class="muted">Chiffre au-dessus = épargne du mois · clic = détail du mois</span></div>`)}
  <div class="grid g-11">
    ${panel("À faire en priorité", actions.filter((a) => a.niveau !== "info").slice(0, 3).map(actionCard).join("") || `<p class="empty">Rien d'urgent.</p>`, { right: `<a href="#/actions">Toutes les actions →</a>` })}
    ${panel(`Dépenses de ${mLong(lastM)}`, `<div class="bars">${top.map(([c, v]) => barRow(c, v, M.budgetCat(c), `#/depenses/cat/${slugOf(c)}/${lastM}`, Math.max(...top.map(([x, y]) => Math.max(y, M.budgetCat(x) || 0))))).join("")}</div>`, { right: `<a href="#/depenses/mois/${lastM}">Tout le mois →</a>` })}
  </div>`;
}

function immoKpi() {
  const e = S.I?.cfg.etapes.find((x) => x.statut !== "fait");
  if (!e) return "";
  const reste = e.taches.filter((t) => !t.fait);
  return kpi("Projet immo · prochaine étape", esc(e.titre), `${reste[0] ? esc(reste[0].t) : ""}<a href="#/immo">Ouvrir le projet →</a>`, "k-immo");
}

function barRow(cat, v, b, href, scale) {
  const over = b && v > b;
  return `<a class="brow" href="${href}">
    <span class="tname">${catIcon(cat)} ${esc(catName(cat))}</span>
    ${meter(v, b, catColor(cat), scale)}
    <span class="num ${over ? "down" : ""}">${eur(v)}</span>
    <span class="num xs ${over ? "down" : "muted"}">${b ? (over ? `+${eur(v - b)}` : `/ ${eur(b)}`) : ""}</span>
  </a>`;
}

function actionCard(a) {
  return `<article class="action a-${a.niveau}">
    <div class="action-h"><span class="tag">${esc(a.zone)}</span><h4>${esc(a.titre)}</h4></div>
    <p>${esc(a.constat)}</p>
    ${a.etapes?.length ? `<ol>${a.etapes.map((e) => `<li>${esc(e)}</li>`).join("")}</ol>` : ""}
    ${a.lien ? `<a href="${a.lien}" class="xs">Voir le détail →</a>` : ""}
  </article>`;
}

// ---------------------------------------------------------------- patrimoine

function viewPatrimoine(sub) {
  const M = S.M;
  const t = tabs([["", "Synthèse", "#/patrimoine"], ["livrets", "Livrets", "#/patrimoine/livrets"],
    ["av", "Assurance-vie", "#/patrimoine/av"], ["pea", "PEA", "#/patrimoine/pea"],
    ["salariale", "Épargne salariale", "#/patrimoine/salariale"], ["sorare", "Loisir – Sorare", "#/patrimoine/sorare"]], sub || "");
  if (sub === "livrets") return viewLivrets(t);
  if (sub === "sorare") return viewSorare(t);
  if (sub === "salariale") return viewSalariale(t);
  if (sub === "av" || sub === "pea") return viewPositions(sub, t);

  const P = M.patri;
  const L = M.patriLast;
  const months = monthRange(P[0].mois, L.mois);
  const byM = new Map(P.map((p) => [p.mois, p]));
  const env = M.envelopes(L.soldes);
  const prev = P.at(-2);

  const cols = columns(months.map((m) => {
    const p = byM.get(m);
    const e = p ? M.envelopes(p.soldes) : null;
    return {
      label: mShort(m), sub: m.slice(0, 4),
      top: p ? `<b>${Math.round(p.total / 100) / 10}k</b>` : `<b class="muted">n.r.</b>`,
      segs: e ? ENVELOPES.map((x) => ({ v: e[x.key], color: x.color, tip: `${mLong(m)} · ${x.nom}\n${eur(e[x.key])}` })) : [],
    };
  }), { height: 240 });

  const keys = Object.keys(M.comptes);
  const table = `<div class="scroll-x"><table class="grid-t">
    <thead><tr><th>Compte</th>${months.map((m) => `<th class="r">${mYear(m)}</th>`).join("")}<th class="r">Δ ${prev ? mShort(prev.mois) : ""}</th></tr></thead>
    <tbody>${keys.map((k) => {
      const c = M.comptes[k];
      const d = prev ? (L.soldes[k] || 0) - (prev.soldes[k] || 0) : 0;
      return `<tr><td><i class="sw" style="background:${ENVELOPES.find((e) => e.key === c.groupe)?.color}"></i>${esc(c.nom)}</td>
        ${months.map((m) => { const v = byM.get(m)?.soldes[k]; return `<td class="r num${v == null ? " muted" : ""}">${v == null ? (byM.get(m) ? "—" : "") : eur(v)}</td>`; }).join("")}
        <td class="r num">${d ? delta(d) : `<span class="muted">—</span>`}</td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Total</td>${months.map((m) => `<td class="r num">${byM.get(m) ? eur(byM.get(m).total) : `<span class="muted">non renseigné</span>`}</td>`).join("")}
      <td class="r num">${prev ? delta(L.total - prev.total) : ""}</td></tr></tfoot>
  </table></div>`;

  const tiles = ENVELOPES.map((e) => `
    <a class="tile" href="#/patrimoine${e.key === "cc" ? "" : `/${e.key}`}" style="--c:${e.color}">
      <div class="lbl">${e.nom}</div><div class="kpi-v">${eur(env[e.key])}</div>
      <div class="kpi-s">${pct(env[e.key] / L.total)} du patrimoine</div>
    </a>`).join("");

  return `${head([["Patrimoine"]], "Patrimoine", { sub: `${eur(L.total)} au ${mLong(L.mois)}` })}
    ${t}
    <div class="grid g-5">${tiles}</div>
    ${M.sorare ? `<p class="note">Hors total : <a href="#/patrimoine/sorare">Loisir – Sorare ${eur(M.sorare.total_prudent_eur)}</a> (valeur prudente du ${dShort(M.sorare.date)}).</p>` : ""}
    ${panel("Évolution par enveloppe", `${cols}<div class="legend">${ENVELOPES.map((e) => `<span><i style="background:${e.color}"></i>${e.nom}</span>`).join("")}<span class="muted">n.r. = mois non renseigné</span></div>`)}
    ${panel("Soldes de fin de mois", table)}`;
}

function viewLivrets(t) {
  const M = S.M;
  const L = M.patriLast;
  const livrets = Object.entries(M.comptes).filter(([, c]) => c.groupe === "livrets");
  const tot = sum(livrets, ([k]) => L.soldes[k] || 0);
  const interets = sum(livrets, ([k, c]) => (L.soldes[k] || 0) * (c.taux || 0));
  const apport = M.budget.apport_locatif;
  const rows = livrets.map(([k, c]) => {
    const v = L.soldes[k] || 0;
    const marge = c.plafond ? c.plafond - v : null;
    return `<tr>
      <td><b>${esc(c.nom)}</b></td><td class="r num">${eur(v)}</td>
      <td style="min-width:160px">${c.plafond ? meter(v, null, v >= c.plafond ? "#ffb547" : "#3b7bff", c.plafond) : ""}</td>
      <td class="r num muted">${c.plafond ? eur(c.plafond) : "—"}</td>
      <td class="r num">${marge == null ? "—" : marge <= 0 ? `<span class="warn">plein</span>` : eur(marge)}</td>
      <td class="r num">${c.taux ? pct(c.taux, 2) : "—"}</td>
      <td class="r num">${eur(v * (c.taux || 0))}</td></tr>`;
  }).join("");
  return `${head([["Patrimoine", "#/patrimoine"], ["Livrets"]], "Livrets", { sub: `${eur(tot)} · ${pct(tot / L.total)} du patrimoine` })}
    ${t}
    <div class="grid g-4">
      ${kpi("Total livrets", eur(tot))}
      ${kpi("Intérêts annuels estimés", eur(interets), "au taux actuel, avant capitalisation")}
      ${apport ? kpi("Apport locatif", pct(Math.min(1, tot / apport)), `${meter(tot, null, "#3ddc97", apport)}${eur(tot)} / ${eur(apport)}`) : ""}
      ${kpi("Marge LDDS", eur((M.comptes.ldds?.plafond || 0) - (L.soldes.ldds || 0)), "prochain support pour l'épargne liquide")}
    </div>
    ${panel(`Détail au ${mLong(L.mois)}`, `<div class="scroll-x"><table class="grid-t">
      <thead><tr><th>Livret</th><th class="r">Solde</th><th>Remplissage</th><th class="r">Plafond</th><th class="r">Marge</th><th class="r">Taux</th><th class="r">Intérêts/an</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">Livret A au-delà du plafond : ce sont les intérêts capitalisés, ils restent rémunérés. Seuls les nouveaux versements sont bloqués.</p>`)}
    ${actionsFor("Livrets") + actionsFor("Projet locatif")}`;
}

function viewSalariale(t) {
  const M = S.M;
  const L = M.patriLast;
  const S0 = M.esPos;
  const plans = Object.entries(M.comptes).filter(([, c]) => c.groupe === "salariale");
  const tot = sum(plans, ([k]) => L.soldes[k] || 0);
  const lignes = S0 ? plans.flatMap(([k, c]) => (S0[k] || []).map((l) => ({ ...l, plan: c.nom }))) : [];
  const totRel = sum(lignes, (l) => l.montant);
  const parType = {};
  for (const l of lignes) parType[l.type] = (parType[l.type] || 0) + l.montant;
  const TC = { Actions: "#3b7bff", "Diversifié": "#8b5cf6", "Monétaire": "#5b6270", Solidaire: "#3ddc97", "Gestion pilotée": "#2bb8a6" };
  const rows = [...lignes].sort((a, b) => b.montant - a.montant).map((l) => `<tr>
    <td data-v="${esc(l.nom)}"><b>${esc(l.nom)}</b><div class="xs muted">${esc(l.plan)} · ${esc(l.type)}</div></td>
    <td class="r num" data-v="${l.quantite}">${l.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}</td>
    <td class="r num" data-v="${l.vl}">${eur(l.vl, 2)}</td>
    <td class="r num" data-v="${l.montant}"><b>${eur(l.montant)}</b></td>
    <td class="r num" data-v="${l.montant / totRel}">${pct(l.montant / totRel)}</td></tr>`).join("");
  return `${head([["Patrimoine", "#/patrimoine"], ["Épargne salariale"]], "Épargne salariale", { sub: `${eur(tot)} · ${pct(tot / L.total)} du patrimoine · Natixis Interépargne, bloquée` })}
    ${t}
    <div class="grid g-4">
      ${kpi("Total", eur(tot), S0 ? `relevé Natixis du ${dShort(S0.date)} ${S0.date.slice(0, 4)}` : "aucun relevé")}
      ${plans.map(([k, c]) => kpi(c.nom, eur(L.soldes[k] || 0), `bloqué : ${esc(c.blocage || "")}`)).join("")}
      ${kpi("Part monétaire", pct((parType["Monétaire"] || 0) / (totRel || 1)), "quasi sans rendement, à arbitrer ?")}
    </div>
    <div class="grid g-21">
      ${panel(S0 ? `Fonds au ${dShort(S0.date)}` : "Fonds", S0 ? `<div class="scroll-x"><table class="grid-t sortable" data-tid="es">
        <thead><tr><th>Fonds</th><th class="r" data-dir="desc">Parts</th><th class="r" data-dir="desc">Valeur part</th><th class="r" data-dir="desc">Montant</th><th class="r" data-dir="desc">Poids</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : `<p class="muted">Déposer un relevé Natixis pour voir le détail.</p>`)}
      ${panel("Par type de fonds", `${split(Object.entries(parType).map(([k, v]) => ({ v, color: TC[k] || "#5b6270", tip: `${k}\n${eur(v)}` })))}
        <div class="tlist">${Object.entries(parType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="trow"><span class="tname"><i class="sw" style="background:${TC[k] || "#5b6270"}"></i>${esc(k)}</span><span class="num">${pct(v / totRel)}</span><span class="num muted">${eur(v)}</span></div>`).join("")}</div>`)}
    </div>
    <p class="note">FCPE non cotés : montants du dernier relevé, sans revalorisation au jour. Le solde mensuel reprend ce relevé jusqu'au suivant (à faire après chaque versement ou abondement, et au moins tous les 6 mois).
      Non disponible : exclu de l'épargne de précaution et de l'apport locatif. Le PEE se débloque par anticipation pour l'achat de la résidence principale, pas pour un investissement locatif.</p>
    ${actionsFor("Épargne salariale")}`;
}

function viewLive(kind, t) {
  const M = S.M;
  const av = kind === "av";
  const P = av ? M.avLive : M.peaLive;
  const L = M.patriLast;
  const key = av ? "av_bnp" : "pea";
  const nom = av ? "Assurance-vie BNP" : "PEA Boursorama";
  const color = av ? "#8b5cf6" : "#ffb35c";
  const jour = P.valeur - P.veille;
  const pv = P.valeur - P.investi;
  const plafond = M.pos.pea?.versements_estimes || P.investi;
  const rows = P.lignes.map((l) => `<tr>
    <td data-v="${esc(l.nom)}"><b>${esc(l.nom)}</b><div class="xs muted">${l.fige ? `<span class="warn">valeur figée au ${dShort(P.snapDate)}</span>` : esc(l.ticker)} · ${esc(l.isin)}</div></td>
    <td class="r num" data-v="${l.quantite}">${l.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}</td>
    <td class="r num" data-v="${l.pru}">${eur(l.pru, 2)}</td>
    <td class="r num" data-v="${l.cours}">${eur(l.cours, 2)} ${l.fige ? "" : `<small class="${l.jourPct >= 0 ? "up" : "down"}">${l.jourPct >= 0 ? "+" : "−"}${pct(Math.abs(l.jourPct), 1)}</small>`}</td>
    <td class="r num" data-v="${l.valeur}"><b>${eur(l.valeur)}</b></td>
    <td class="r num" data-v="${l.valeur / P.valeur}">${pct(l.valeur / P.valeur)}</td>
    <td class="r num ${l.pv >= 0 ? "up" : "down"}" data-v="${l.pv}">${signed(l.pv)}</td>
    <td class="r num ${l.pvPct >= 0 ? "up" : "down"}" data-v="${l.pvPct}">${l.pvPct >= 0 ? "+" : "−"}${pct(Math.abs(l.pvPct), 1)}</td>
  </tr>`).join("");
  const courbe = line(P.serie.map((p, i) => ({
    label: P.serie.length <= 31 ? dShort(p.date)
      : i === 0 || p.date.slice(8) <= "07" && P.serie[i - 1]?.date.slice(5, 7) !== p.date.slice(5, 7) ? mShort(p.date.slice(0, 7)) : "",
    v: p.v, tip: `${dShort(p.date)} ${p.date.slice(2, 4)}\n${eur(p.v)}`,
  })), { height: 240, color });
  const euros = P.euros ? `<tr><td data-v="Fonds euros"><b>Fonds euros</b><div class="xs muted">capital garanti · montant constant entre deux relevés</div></td><td></td><td></td><td></td>
    <td class="r num" data-v="${P.euros}"><b>${eur(P.euros)}</b></td><td class="r num" data-v="${P.euros / P.valeur}">${pct(P.euros / P.valeur)}</td><td></td><td></td></tr>` : "";
  const nbFige = P.lignes.filter((l) => l.fige).length;
  return `${head([["Patrimoine", "#/patrimoine"], [nom]], nom, { sub: `${eur(P.valeur)} au cours de clôture du ${dShort(P.date)} · positions du ${dShort(P.snapDate)} ${P.snapDate.slice(0, 4)}` })}
    ${t}
    <div class="grid g-4">
      ${kpi(`Valeur au ${dShort(P.date)}`, eur(P.valeur), `Relevé ${mLong(L.mois)} : ${eur(L.soldes[key] || 0)}`)}
      ${kpi("Variation du jour", signed(jour), `${jour >= 0 ? "+" : "−"}${pct(Math.abs(jour / P.veille), 2)} vs clôture précédente`, jour >= 0 ? "k-ok" : "k-bad")}
      ${kpi("Plus-value latente", signed(pv), `${pv >= 0 ? "+" : "−"}${pct(Math.abs(pv / P.investi), 1)} sur ${eur(P.investi)} investis (PRU)`, pv >= 0 ? "k-ok" : "k-bad")}
      ${av ? kpi("Versement programmé", `${eur(M.pos.av_bnp?.versement_mensuel || 0)}<small>/mois</small>`, "Cardif, prélèvement automatique : non compté dans l'estimation avant le relevé")
        : kpi("Plafond de versements", pct(plafond / 150000, 1), `${meter(plafond, null, "#ffb35c", 150000)}${eur(plafond)} versés (estimé) / 150 000 €`)}
    </div>
    ${panel("Valeur quotidienne", courbe, { right: `<span class="muted xs">Parts du dernier relevé × cours de clôture</span>` })}
    ${panel(`Lignes · cours du ${dShort(P.date)}`, `<div class="scroll-x"><table class="grid-t sortable" data-tid="${kind}-live">
      <thead><tr><th>Ligne</th><th class="r" data-dir="desc">Qté</th><th class="r" data-dir="desc">PRU</th><th class="r" data-dir="desc">Cours</th><th class="r" data-dir="desc">Valeur</th><th class="r" data-dir="desc">Poids</th><th class="r" data-dir="desc">+/- value</th><th class="r" data-dir="desc">%</th></tr></thead>
      <tbody>${rows}${euros}</tbody></table></div>
      <p class="note">Estimation : ${av ? `les nouveaux versements et arbitrages ne sont pris en compte qu'au relevé suivant.${nbFige ? ` ${nbFige} support${nbFige > 1 ? "s" : ""} sans cotation automatique fiable : valeur figée au relevé.` : ""}` : "un achat ou une vente non signalé fausse le calcul jusqu'au prochain export des positions (Boursorama › PEA › Positions › Exporter)."}</p>`)}
    ${actionsFor(av ? "Assurance-vie" : "PEA")}`;
}

function viewPositions(kind, t) {
  const M = S.M;
  if ((kind === "pea" && M.peaLive) || (kind === "av" && M.avLive)) return viewLive(kind, t);
  const L = M.patriLast;
  const key = kind === "av" ? "av_bnp" : "pea";
  const p = M.pos[key] || { lignes: [] };
  const total = L.soldes[key] || 0;
  const zones = {};
  for (const l of p.lignes) {
    const z = /USA/.test(l.zone) ? "USA" : /Japon/.test(l.zone) ? "Japon" : /France|Europe/.test(l.zone) ? "Europe" : "Monde";
    zones[z] = (zones[z] || 0) + l.poids;
  }
  const ZC = { USA: "#3b7bff", Monde: "#5eead4", Europe: "#ffb35c", Japon: "#ec4899" };
  const rows = [...p.lignes].sort((a, b) => b.poids - a.poids).map((l) => `<tr>
    <td><b>${esc(l.nom)}</b><div class="xs muted">${esc(l.type)} · ${esc(l.zone)}</div></td>
    <td style="min-width:140px">${meter(l.poids, null, /bank|disruptive/i.test(l.nom) ? "#ffb547" : "#8b5cf6", Math.max(...p.lignes.map((x) => x.poids)))}</td>
    <td class="r num">${pct(l.poids, 1)}</td><td class="r num">≈ ${eur(l.poids * total)}</td></tr>`).join("");
  const nom = kind === "av" ? "Assurance-vie BNP" : "PEA Boursorama";
  const zone = kind === "av" ? "Assurance-vie" : "PEA";
  const extra = kind === "av"
    ? kpi("Versement programmé", `${eur(p.versement_mensuel || 0)}<small>/mois</small>`, "Cardif, prélèvement automatique")
    : kpi("Plafond de versements", pct((p.versements_estimes || 0) / 150000, 1), `${meter(p.versements_estimes || 0, null, "#ffb35c", 150000)}${eur(p.versements_estimes || 0)} versés (estimé) / 150 000 €`);
  return `${head([["Patrimoine", "#/patrimoine"], [nom]], nom, { sub: `${eur(total)} au ${mLong(L.mois)}` })}
    ${t}
    <div class="grid g-4">
      ${kpi("Encours", eur(total))}
      ${kpi("Lignes", `${p.lignes.length}`)}
      ${extra}
      ${kpi("Exposition USA", pct(zones.USA || 0), "part des lignes USA")}
    </div>
    <div class="grid g-21">
      ${panel("Composition", `<div class="scroll-x"><table class="grid-t"><thead><tr><th>Support</th><th>Poids</th><th class="r">%</th><th class="r">Montant</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="note">${esc(M.pos.note || "")}</p>`)}
      ${panel("Exposition géographique", `${split(Object.entries(zones).map(([z, v]) => ({ v, color: ZC[z], tip: `${z}\n${pct(v)}` })))}
        <div class="tlist">${Object.entries(zones).sort((a, b) => b[1] - a[1]).map(([z, v]) => `<div class="trow"><span class="tname"><i class="sw" style="background:${ZC[z]}"></i>${z}</span><span class="num">${pct(v)}</span><span class="num muted">≈ ${eur(v * total)}</span></div>`).join("")}</div>`)}
    </div>
    ${actionsFor(zone)}`;
}

function actionsFor(zone) {
  const list = computeActions(S.M).filter((a) => a.zone === zone);
  return list.length ? panel("Actions", list.map(actionCard).join("")) : "";
}

// ---------------------------------------------------------------- dépenses

function depTabs(active) {
  const last = S.M.months.at(-1);
  return tabs([["", "Vue d'ensemble", "#/depenses"], ["mois", "Mois", `#/depenses/mois/${last}`],
    ["categories", "Catégories", "#/depenses/categories"], ["transactions", "Transactions", "#/depenses/transactions"]], active);
}

function viewDepenses() {
  const M = S.M;
  const ms = periodMonths();
  const tot = sum(ms, (m) => M.courant(m));
  const exc = sum(ms, (m) => M.exceptionnel(m));
  const avg = tot / ms.length;
  const maxM = ms.reduce((a, b) => (M.courant(b) > M.courant(a) ? b : a), ms[0]);
  const catTot = ALL_CATS.filter((c) => c !== EXCEPTIONNEL).map((c) => [c, sum(ms, (m) => M.catNet(m, c))]).sort((a, b) => b[1] - a[1]);

  const chart = columns(ms.map((m, i) => ({
    ...monthLabelCols(ms)[i],
    href: `#/depenses/mois/${m}`,
    badge: M.exceptionnel(m) > 0 ? `+${eur(M.exceptionnel(m))} exc.` : "",
    top: `<b>${(Math.round(M.courant(m) / 100) / 10).toLocaleString("fr-FR")}k</b>`,
    segs: GROUPS.map((g) => ({ v: M.groupNet(m, g), color: g.color, tip: `${mLong(m)} · ${g.nom}\n${eur(M.groupNet(m, g))}${M.budgetGroup(g) ? ` (budget ${eur(M.budgetGroup(g))})` : ""}` })),
  })), { height: 300, ref: { v: M.budgetCourant, label: `Budget ${eur(M.budgetCourant)}` } });

  return `${head([["Dépenses"]], "Dépenses", { sub: `${periodLabel()} · hors loyer et versement AV`, right: periodToggles() })}
    ${depTabs("")}
    <div class="grid g-5">
      ${kpi("Total dépensé", eur(tot), `${ms.length} mois · ${mYear(ms[0])} → ${mYear(ms.at(-1))}`)}
      ${kpi("Moyenne / mois", eur(avg), `Budget ${eur(M.budgetCourant)} · <span class="${avg > M.budgetCourant ? "down" : "up"}">${avg > M.budgetCourant ? "+" : "−"}${eur(Math.abs(avg - M.budgetCourant))}</span>`, avg > M.budgetCourant ? "k-bad" : "k-ok")}
      ${kpi("Mois le plus élevé", eur(M.courant(maxM)), `<a href="#/depenses/mois/${maxM}">${mLong(maxM)} →</a>`)}
      ${kpi("1er poste", eur(catTot[0][1]), `<a href="#/depenses/cat/${slugOf(catTot[0][0])}">${catIcon(catTot[0][0])} ${esc(catName(catTot[0][0]))} · ${pct(catTot[0][1] / tot)} →</a>`)}
      ${kpi("Exceptionnel", eur(exc), exc ? "hors moyenne et hors barres" : "aucun sur la période")}
    </div>
    ${panel("Mois par mois · par catégorie", `${chart}${legend()}`, { right: `<span class="muted xs">Clic sur un mois = détail</span>` })}
    ${panel("Matrice catégories × mois", matrix(ms), { right: `<span class="muted xs">Couleur = écart au budget · clic sur une case = marchands et transactions</span>` })}`;
}

function heat(v, b) {
  if (!v) return "";
  if (!b) return "background:rgba(148,163,184,.10)";
  const r = v / b;
  return r <= 1
    ? `background:rgba(59,123,255,${(0.08 + 0.32 * r).toFixed(2)})`
    : `background:rgba(255,107,107,${Math.min(0.6, 0.18 + 0.22 * (r - 1)).toFixed(2)})`;
}

function matrix(ms) {
  const M = S.M;
  const cats = ALL_CATS.filter((c) => ms.some((m) => M.catNet(m, c)));
  const cell = (c, m) => {
    const v = M.catNet(m, c);
    const b = M.budgetCat(c);
    return `<td class="r num hc" style="${heat(v, b)}"><a href="#/depenses/cat/${slugOf(c)}/${m}" data-tip="${esc(`${catName(c)} · ${mLong(m)}\n${eur2(v)}${b ? ` / budget ${eur(b)}` : ""}`)}">${v ? Math.round(v).toLocaleString("fr-FR") : "·"}</a></td>`;
  };
  const totRow = (m) => M.courant(m);
  return `<div class="scroll-x"><table class="grid-t matrix">
    <thead><tr><th>Catégorie</th>${ms.map((m) => `<th class="r"><a href="#/depenses/mois/${m}">${mYear(m)}</a></th>`).join("")}<th class="r">Total</th><th class="r">Moy.</th><th class="r">Budget</th></tr></thead>
    <tbody>${cats.map((c) => {
      const t = sum(ms, (m) => M.catNet(m, c));
      const b = M.budgetCat(c);
      const avg = t / ms.length;
      return `<tr><td><a href="#/depenses/cat/${slugOf(c)}" class="tname"><i class="sw" style="background:${catColor(c)}"></i>${catIcon(c)} ${esc(catName(c))}</a></td>
        ${ms.map((m) => cell(c, m)).join("")}
        <td class="r num"><b>${eur(t)}</b></td><td class="r num ${b && avg > b ? "down" : ""}">${eur(avg)}</td><td class="r num muted">${b ? eur(b) : "—"}</td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Total courant</td>${ms.map((m) => `<td class="r num">${eur(totRow(m))}</td>`).join("")}
      <td class="r num">${eur(sum(ms, totRow))}</td><td class="r num">${eur(sum(ms, totRow) / ms.length)}</td><td class="r num muted">${eur(M.budgetCourant)}</td></tr></tfoot>
  </table></div>`;
}

function monthNav(base, m, suffix = "") {
  const ms = S.M.months;
  const i = ms.indexOf(m);
  const a = (k, ch) => (ms[k] ? `<a class="arrow" href="${base}${ms[k]}${suffix}" aria-label="${mLong(ms[k])}">${ch}</a>` : `<span class="arrow off">${ch}</span>`);
  return `<div class="mnav">${a(i - 1, "‹")}<select class="dsel" data-goto="${esc(base)}" data-suffix="${esc(suffix)}">${ms.map((x) => `<option value="${x}" ${x === m ? "selected" : ""}>${mLong(x)}</option>`).join("")}</select>${a(i + 1, "›")}</div>`;
}

function viewMois(m) {
  const M = S.M;
  if (!M.byMonth.has(m)) m = M.months.at(-1);
  const prev12 = M.months.filter((x) => x < m).slice(-12);
  const moy = prev12.length ? sum(prev12, (x) => M.courant(x)) / prev12.length : 0;
  const dep = M.courant(m);
  const f = M.byMonth.get(m).charges_fixes;
  const inc = M.revenusIncomplets(m);
  const ep = M.epargne(m);
  const txs = M.txs(m);

  const catRows = ALL_CATS.map((c) => [c, M.catNet(m, c)]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const scale = Math.max(1, ...catRows.map(([c, v]) => Math.max(v, M.budgetCat(c) || 0)));
  const rows = catRows.map(([c, v]) => {
    const avgC = prev12.length ? sum(prev12, (x) => M.catNet(x, c)) / prev12.length : 0;
    const b = M.budgetCat(c);
    return `<a class="brow brow-x" href="#/depenses/cat/${slugOf(c)}/${m}">
      <span class="tname">${catIcon(c)} ${esc(catName(c))}</span>
      ${meter(v, b, catColor(c), scale)}
      <span class="num ${b && v > b ? "down" : ""}"><b>${eur(v)}</b></span>
      <span class="num xs muted">${b ? `budget ${eur(b)}` : ""}</span>
      <span class="num xs ${v > avgC ? "down" : "up"}">${prev12.length ? `${v > avgC ? "+" : "−"}${eur(Math.abs(v - avgC))} vs moy.` : ""}</span>
    </a>`;
  }).join("");

  const big = txs.filter((t) => t.type === "depense").sort((a, b) => b.montant - a.montant).slice(0, 8);

  return `${head([["Dépenses", "#/depenses"], [mLong(m)]], mLong(m), { sub: `${txs.length} lignes · ${eur(dep)} de dépenses courantes`, right: monthNav("#/depenses/mois/", m) })}
    ${depTabs("mois")}
    <div class="grid g-5">
      ${kpi("Dépenses courantes", eur(dep), `Budget ${eur(M.budgetCourant)} · <span class="${dep > M.budgetCourant ? "down" : "up"}">${dep > M.budgetCourant ? "+" : "−"}${eur(Math.abs(dep - M.budgetCourant))}</span>`, dep > M.budgetCourant ? "k-bad" : "k-ok")}
      ${kpi("vs moyenne 12 mois", signed(dep - moy), `Moyenne ${eur(moy)}`)}
      ${kpi("Revenus", eur(M.revenus(m)), inc ? `<span class="warn">Salaire absent de l'extrait</span>` : "salaire, primes, autres")}
      ${kpi("Épargne du mois", inc ? "—" : signed(ep), inc ? "non calculable" : `Taux ${pct(ep / M.revenus(m))} · dont AV ${eur(f.av_bnp)}`, inc ? "" : ep >= 0 ? "k-ok" : "k-bad")}
      ${kpi("Exceptionnel", eur(M.exceptionnel(m)), `Loyer ${eur(f.loyer)} (charges fixes)`)}
    </div>
    <div class="grid g-21">
      ${panel("Par catégorie", `<div class="bars">${rows}</div>`, { right: `<span class="muted xs">Clic = marchands et transactions</span>` })}
      ${panel("Plus grosses dépenses", `<div class="tlist">${big.map((t) => `<a class="trow" href="#/depenses/cat/${slugOf(t.cat)}/${m}"><span class="tname"><i class="sw" style="background:${catColor(t.cat)}"></i>${esc(t.marchand)}<small>${dShort(t.date)} · ${esc(catName(t.cat))}</small></span><span class="num"><b>${eur2(t.montant)}</b></span></a>`).join("")}</div>`)}
    </div>
    ${panel(`Toutes les transactions · ${mLong(m)}`, txTable(txs, { showCat: true, tid: "tx-mois" }))}`;
}

// Tableau triable (clic sur les en-têtes) avec filtres Catégorie / Compte ; `tid` garde le tri entre deux mois.
function txTable(txs, { showCat = false, showMonth = false, tid = "tx" } = {}) {
  if (!txs.length) return `<p class="empty">Aucune transaction.</p>`;
  return `<div class="tx-count xs muted" data-count></div><div class="scroll-x"><table class="grid-t tx sortable" data-tid="${tid}">
    <thead><tr><th>Date</th><th>Libellé</th>${showCat ? "<th data-filter>Catégorie</th>" : ""}<th data-filter>Compte</th><th class="r" data-dir="desc">Montant</th></tr></thead>
    <tbody>${txs.map((t) => `<tr class="${t.type === "remboursement" ? "remb" : ""}">
      <td class="num nowrap" data-v="${t.date}">${dShort(t.date)}${showMonth ? ` ${t.date.slice(2, 4)}` : ""}</td>
      <td data-v="${esc(t.marchand)}"><b>${esc(t.marchand)}</b>${t.libelle && t.libelle !== t.marchand ? `<div class="xs muted">${esc(t.libelle)}</div>` : ""}</td>
      ${showCat ? `<td data-f="${esc(catName(t.cat))}">${catChip(t.cat, `#/depenses/cat/${slugOf(t.cat)}/${t.date.slice(0, 7)}`)}</td>` : ""}
      <td class="xs muted">${esc(t.source)}</td>
      <td class="r num nowrap" data-v="${t.montant}">${t.montant < 0 ? `<span class="remb-v">−${eur2(-t.montant)}</span>` : eur2(t.montant)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function viewCategories() {
  const M = S.M;
  const ms = periodMonths();
  const cats = ALL_CATS.filter((c) => ms.some((m) => M.catNet(m, c)));
  const tiles = cats.map((c) => {
    const vals = ms.map((m) => ({ v: M.catNet(m, c), tip: `${mLong(m)}\n${eur2(M.catNet(m, c))}` }));
    const tot = sum(vals, (v) => v.v);
    const avg = tot / ms.length;
    const b = M.budgetCat(c);
    const r3 = sum(ms.slice(-3), (m) => M.catNet(m, c)) / 3;
    const p3 = ms.length >= 6 ? sum(ms.slice(-6, -3), (m) => M.catNet(m, c)) / 3 : null;
    const trend = p3 == null ? "" : r3 > p3 * 1.15 ? `<span class="down">▲ en hausse</span>` : r3 < p3 * 0.85 ? `<span class="up">▼ en baisse</span>` : `<span class="muted">• stable</span>`;
    return `<a class="tile ctile" href="#/depenses/cat/${slugOf(c)}" style="--c:${catColor(c)}">
      <div class="ctile-h"><span class="lbl">${catIcon(c)} ${esc(catName(c))}</span>${trend}</div>
      <div class="ctile-v"><span class="kpi-v">${eur(avg)}<small>/mois</small></span>
        <span class="xs ${b && avg > b ? "down" : "muted"}">${b ? `budget ${eur(b)}` : ""}</span></div>
      ${spark(vals, catColor(c), { ref: b })}
      <div class="xs muted">${eur(tot)} sur ${ms.length} mois</div>
    </a>`;
  }).join("");
  return `${head([["Dépenses", "#/depenses"], ["Catégories"]], "Catégories", { sub: `${periodLabel()} · trait = budget mensuel`, right: periodToggles() })}
    ${depTabs("categories")}
    <div class="grid g-tiles">${tiles}</div>`;
}

function merchants(txs) {
  const by = new Map();
  for (const t of txs) {
    const k = t.marchand;
    const e = by.get(k) || { nom: k, n: 0, tot: 0, last: "", txs: [] };
    e.n++; e.tot += t.montant; e.last = t.date > e.last ? t.date : e.last; e.txs.push(t);
    by.set(k, e);
  }
  return [...by.values()].sort((a, b) => b.tot - a.tot);
}

function viewCategorie(slug, m) {
  const M = S.M;
  const cat = catOfSlug(slug);
  if (m) return viewCatMois(cat, m);
  const ms = periodMonths();
  const b = M.budgetCat(cat);
  const color = catColor(cat);
  const txs = M.allTxs().filter((t) => t.cat === cat && ms.includes(t.mois));
  const tot = sum(ms, (x) => M.catNet(x, cat));
  const dep = txs.filter((t) => t.type === "depense");
  const remb = -sum(txs.filter((t) => t.type === "remboursement"), (t) => t.montant);

  const chart = columns(ms.map((x, i) => ({
    ...monthLabelCols(ms)[i], href: `#/depenses/cat/${slug}/${x}`,
    top: M.catNet(x, cat) ? `<b>${Math.round(M.catNet(x, cat)).toLocaleString("fr-FR")}</b>` : "",
    segs: [{ v: M.catNet(x, cat), color: b && M.catNet(x, cat) > b ? "#ff6b6b" : color, tip: `${mLong(x)}\n${eur2(M.catNet(x, cat))}` }],
  })), { height: 240, ref: b ? { v: b, label: `Budget ${eur(b)}` } : null });

  const mer = merchants(txs);
  const sel = S.marchand && mer.find((x) => x.nom === S.marchand) ? S.marchand : "";
  const merRows = mer.map((x) => `<tr class="${sel === x.nom ? "sel" : ""}">
    <td><button type="button" class="linkbtn" data-marchand="${esc(x.nom)}"><b>${esc(x.nom)}</b></button></td>
    <td class="r num">${x.n}</td><td class="r num" data-v="${x.tot}"><b>${eur(x.tot)}</b></td><td class="r num muted" data-v="${tot ? x.tot / tot : 0}">${tot ? pct(x.tot / tot) : ""}</td>
    <td class="r num muted" data-v="${x.last}">${dShort(x.last)} ${x.last.slice(2, 4)}</td></tr>`).join("");
  const list = (sel ? txs.filter((t) => t.marchand === sel) : txs).slice().sort((a, z) => z.date.localeCompare(a.date));

  return `${head([["Dépenses", "#/depenses"], ["Catégories", "#/depenses/categories"], [catName(cat)]], `${catIcon(cat)} ${esc(catName(cat))}`, { sub: periodLabel(), right: periodToggles() })}
    ${depTabs("categories")}
    <div class="grid g-5">
      ${kpi("Total net", eur(tot), `${ms.length} mois`)}
      ${kpi("Moyenne / mois", eur(tot / ms.length), b ? `Budget ${eur(b)} · <span class="${tot / ms.length > b ? "down" : "up"}">${tot / ms.length > b ? "+" : "−"}${eur(Math.abs(tot / ms.length - b))}</span>` : "pas de budget", b && tot / ms.length > b ? "k-bad" : "")}
      ${kpi("Transactions", `${dep.length}`, `Ticket moyen ${eur(dep.length ? sum(dep, (t) => t.montant) / dep.length : 0)}`)}
      ${kpi("Remboursements reçus", eur(remb), "NDF, Lydia, rétrocessions")}
      ${kpi("Marchands", `${mer.length}`, mer[0] ? `1er : ${esc(mer[0].nom)}` : "")}
    </div>
    ${panel("Mois par mois", chart, { right: `<span class="muted xs">Clic sur un mois = détail du mois</span>` })}
    <div class="grid g-12">
      ${panel("Marchands", `<div class="scroll-x"><table class="grid-t sortable" data-tid="marchands"><thead><tr><th>Marchand</th><th class="r" data-dir="desc">Nb</th><th class="r" data-dir="desc">Total</th><th class="r" data-dir="desc">Part</th><th class="r" data-dir="desc">Dernier</th></tr></thead><tbody>${merRows}</tbody></table></div>`, { right: `<span class="muted xs">Clic = filtrer</span>` })}
      ${panel(sel ? `Transactions · ${esc(sel)}` : "Transactions", txTable(list, { showMonth: true, tid: "tx-cat" }), { right: sel ? `<button type="button" class="linkbtn" data-marchand="">Tout afficher ✕</button>` : "" })}
    </div>`;
}

function viewCatMois(cat, m) {
  const M = S.M;
  const slug = slugOf(cat);
  const txs = M.txs(m).filter((t) => t.cat === cat);
  const v = M.catNet(m, cat);
  const b = M.budgetCat(cat);
  const prev12 = M.months.filter((x) => x < m).slice(-12);
  const moy = prev12.length ? sum(prev12, (x) => M.catNet(x, cat)) / prev12.length : 0;
  const mer = merchants(txs);
  const max = Math.max(1, ...mer.map((x) => x.tot));
  const groups = mer.map((x, i) => `
    <details class="mgroup" ${i < 3 || mer.length <= 6 ? "open" : ""}>
      <summary>
        <span class="tname"><b>${esc(x.nom)}</b><small>${x.n} ligne${x.n > 1 ? "s" : ""}</small></span>
        ${meter(Math.max(0, x.tot), null, catColor(cat), max)}
        <span class="num"><b>${x.tot < 0 ? `<span class="remb-v">−${eur2(-x.tot)}</span>` : eur2(x.tot)}</b></span>
        <span class="num xs muted">${v ? pct(x.tot / v) : ""}</span>
      </summary>
      ${txTable(x.txs, { tid: "tx-marchand" })}
    </details>`).join("");

  return `${head([["Dépenses", "#/depenses"], [catName(cat), `#/depenses/cat/${slug}`], [mLong(m)]], `${catIcon(cat)} ${esc(catName(cat))} · ${mLong(m)}`, { sub: `${txs.length} lignes · ${mer.length} marchand${mer.length > 1 ? "s" : ""}`, right: monthNav(`#/depenses/cat/${slug}/`, m) })}
    ${depTabs("categories")}
    <div class="grid g-4">
      ${kpi("Total net", eur2(v), b ? `${meter(v, b, b && v > b ? "#ff6b6b" : catColor(cat))}Budget ${eur(b)}` : "", b && v > b ? "k-bad" : "")}
      ${kpi("vs moyenne 12 mois", signed(v - moy), `Moyenne ${eur(moy)}`)}
      ${kpi("Part du mois", pct(M.courant(m) ? v / M.courant(m) : 0), `sur ${eur(M.courant(m))} dépensés`)}
      ${kpi("Plus grosse ligne", txs.length ? eur2(Math.max(...txs.map((t) => t.montant))) : "—", txs.length ? esc(txs.reduce((a, z) => (z.montant > a.montant ? z : a)).marchand) : "")}
    </div>
    ${panel("Par marchand · clic pour déplier les transactions", groups || `<p class="empty">Aucune dépense ce mois-ci.</p>`, { right: `<a href="#/depenses/mois/${m}">Tout ${mLong(m)} →</a>` })}`;
}

function viewTransactions() {
  const M = S.M;
  const opts = (list, cur, lab) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
  return `${head([["Dépenses", "#/depenses"], ["Transactions"]], "Transactions", { sub: `${M.allTxs().length} lignes sur ${M.months.length} mois` })}
    ${depTabs("transactions")}
    <div class="filters">
      <input id="tx-q" class="dsel grow" type="search" placeholder="Rechercher un marchand, un libellé…" value="${esc(S.tx.q)}" autocomplete="off">
      <select id="tx-cat" class="dsel">${opts([["", "Toutes catégories"], ...ALL_CATS.map((c) => [c, catName(c)])], S.tx.cat)}</select>
      <select id="tx-mois" class="dsel">${opts([["", "Tous les mois"], ...M.months.slice().reverse().map((m) => [m, mLong(m)])], S.tx.mois)}</select>
    </div>
    <div id="tx-out"></div>`;
}

function renderTxOut() {
  const out = document.getElementById("tx-out");
  if (!out) return;
  const q = S.tx.q.trim().toLowerCase();
  const list = S.M.allTxs()
    .filter((t) => (!S.tx.cat || t.cat === S.tx.cat) && (!S.tx.mois || t.mois === S.tx.mois)
      && (!q || `${t.marchand} ${t.libelle}`.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  out.innerHTML = panel(`${list.length} lignes · ${eur2(sum(list, (t) => t.montant))} net`, txTable(list, { showCat: true, showMonth: true, tid: "tx-all" }));
  enhanceTables(out);
}

// ---------------------------------------------------------------- actions & réglages

function viewActions() {
  const M = S.M;
  const acts = computeActions(M);
  const P ={ haute: "Haute", moyenne: "Moyenne", long_terme: "Long terme" };
  const plan = (M.plan.actions || []).map((a) => `<tr class="${/sans objet|fait/i.test(a.statut) ? "done" : ""}">
    <td><span class="prio p-${a.priorite}">${P[a.priorite]}</span></td><td>${esc(a.action)}</td>
    <td class="xs muted nowrap">${esc(a.echeance || "")}</td><td class="xs nowrap">${esc(a.statut || "")}</td><td class="xs muted">${esc(a.impact || "")}</td></tr>`).join("");
  return `${head([["Actions"]], "Actions", { sub: `Calculées sur les soldes de ${mLong(M.patriLast.mois)} et tes cibles` })}
    ${panel("Actions chiffrées", `<div class="actions">${acts.filter((a) => a.niveau !== "plan").map(actionCard).join("")}</div>
      <p class="note">Calculs mécaniques à partir de tes soldes et des cibles de ton plan (budget, ${pct(M.budget.cible_pea_banques ?? 0.15)} max de Banques dans le PEA, 5 % de Tech dans l'AV${M.budget.apport_locatif ? `, ${eur(M.budget.apport_locatif)} d'apport` : ""}). Ce n'est pas un conseil en investissement personnalisé.</p>`)}
    ${panel(`Plan d'action · mis à jour ${esc(M.plan.maj || "")}`, `<div class="scroll-x"><table class="grid-t"><thead><tr><th>Priorité</th><th>Action</th><th>Échéance</th><th>Statut</th><th>Impact</th></tr></thead><tbody>${plan}</tbody></table></div>`)}`;
}

function viewReglages() {
  const c = S.cfg;
  return `${head([["Réglages"]], "Réglages")}
  ${S.error ? `<div class="alert">${esc(S.error)}</div>` : ""}
  <div class="grid g-11">
    ${panel("Connexion aux données", `<form id="settings" class="form">
      <label>Compte GitHub<input name="owner" value="${esc(c.owner)}" autocomplete="off"></label>
      <label>Repo des données<input name="repo" value="${esc(c.repo)}" autocomplete="off"></label>
      <label>Branche<input name="branch" value="${esc(c.branch)}" autocomplete="off"></label>
      <label>Token GitHub<input name="token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
      <div class="row"><button class="btn" type="submit">Enregistrer et synchroniser</button>
      ${c.token ? `<button class="btn ghost" type="button" id="forget">Oublier le token sur cet appareil</button>` : ""}</div>
    </form>`)}
    ${panel("Créer le token (lecture seule)", `<ol class="steps">
      <li>github.com → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
      <li>Repository access : <b>Only select repositories</b> → patrimoine-data.</li>
      <li>Permissions → Repository → <b>Contents : Read-only</b>. Rien d'autre.</li>
      <li>Expiration : 1 an, puis colle le token ici.</li>
    </ol>
    <p class="note">Le token reste dans ce navigateur. Il ne permet que de lire patrimoine-data. Le code de la page est public ; les données ne le sont pas.</p>`)}
  </div>`;
}

function viewSorare(t) {
  const V = S.M.sorare;
  const crumbs = [["Patrimoine", "#/patrimoine"], ["Loisir – Sorare"]];
  if (!V) return `${head(crumbs, "Loisir – Sorare")}${t}<p class="muted">Lancer <code>python3 sorare_valo.py</code> pour la première valorisation.</p>`;
  const H = S.M.sorareHisto;
  const prev = H.length > 1 ? H.at(-2) : null;
  const vieille = (c) => !c.derniere_vente || (Date.parse(V.date) - Date.parse(c.derniere_vente)) / 864e5 > 90;
  const rows = V.cartes.map((c) => `<tr>
    <td data-v="${esc(c.joueur)}"><b>${esc(c.joueur)}</b><div class="xs muted">${esc(c.club || "sans club")} · ${esc(c.poste || "")}</div></td>
    <td class="r num" data-v="${c.saison}">${c.saison}</td>
    <td class="r num" data-v="${c.score_l15 ?? -1}">${c.score_l15 ?? "—"}</td>
    <td class="r num" data-v="${c.mediane_eur ?? -1}">${c.mediane_eur == null ? "—" : eur(c.mediane_eur, 2)}</td>
    <td class="r num" data-v="${c.plancher_eur ?? -1}">${c.plancher_eur == null ? "—" : eur(c.plancher_eur, 2)}</td>
    <td class="r num" data-v="${c.prudente_eur}"><b>${eur(c.prudente_eur, 2)}</b></td>
    <td class="r num${vieille(c) ? " warn" : " muted"}" data-v="${c.derniere_vente || ""}">${c.derniere_vente ? dShort(c.derniere_vente) : "aucune"}</td></tr>`).join("");
  return `${head(crumbs, "Loisir – Sorare", { sub: `${eur(V.total_prudent_eur)} au ${dShort(V.date)} · club ${esc(V.club)} · ${V.nb_cartes} cartes · hors total du patrimoine` })}
    ${t}
    <div class="grid g-4">
      ${kpi("Valeur prudente", eur(V.total_prudent_eur), `${V.total_prudent_eth.toLocaleString("fr-FR")} ETH · médiane ${eur(V.total_median_eur)}${prev ? `<span>${signed(V.total_prudent_eur - prev.total_prudent_eur)} depuis le ${dShort(prev.date)}</span>` : ""}`)}
      ${kpi("Mise", eur(V.mise_eur), `${V.mise_eth.toLocaleString("fr-FR")} ETH déposés en 2024-2025`)}
      ${kpi("Effet ETH", signed(V.effet_eth_eur), `ETH à ${eur(V.eth_eur)} aujourd'hui`, V.effet_eth_eur >= 0 ? "k-ok" : "k-bad")}
      ${kpi("Effet cartes", signed(V.effet_cartes_eur), "baisse de prix des cartes", V.effet_cartes_eur >= 0 ? "k-ok" : "k-bad")}
    </div>
    ${sorareDecision(S.M.sorareDecision)}
    ${panel("Cartes", `<div class="scroll-x"><table class="grid-t sortable" data-tid="sorare">
      <thead><tr><th>Joueur</th><th class="r" data-dir="desc">Saison</th><th class="r" data-dir="desc">L15</th><th class="r" data-dir="desc">Médiane</th><th class="r" data-dir="desc">Plancher</th><th class="r" data-dir="desc">Prudente</th><th class="r" data-dir="desc">Dernière vente</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`)}
    <p class="note">Valeur prudente = min(médiane des 5 dernières ventes même joueur et même saison, offre la moins chère du joueur) : ce que l'on toucherait en vendant vite. Dernière vente en orange : plus de 90 jours, carte difficile à revendre.
      Sources : API publique Sorare et CoinGecko, via <code>sorare_valo.py</code>. Investissement loisir, exclu du total financier.</p>`;
}

// Aide à la décision écrite par /sorare decision (sorare/decision.json) : la décision reste la sienne.
function sorareDecision(D) {
  if (!D) return "";
  const li = (xs) => `<ul class="note">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const sc = D.scenarios.map((x) => `<div class="kpi"><div class="lbl">${esc(x.titre)}</div>
    <p><b>Argent :</b> ${esc(x.argent)}</p><p><b>Gains :</b> ${esc(x.gains)}</p>
    <p><b>Risque :</b> ${esc(x.risque)}</p><p class="muted"><b>Temps :</b> ${esc(x.temps)}</p></div>`).join("");
  return panel(`Aide à la décision · ${dShort(D.date)} ${D.date.slice(0, 4)}`, `
    <div class="grid g-11"><div><div class="lbl">Faits</div>${li(D.faits)}</div>
      <div><div class="lbl">Ce qui peut faire pencher</div>${li(D.criteres.map((c) => `${c.si} → ${c.alors}`))}</div></div>
    <div class="grid g-tiles">${sc}</div>
    <div class="callout"><div class="lbl">Interprétation · enveloppe ${eur(D.enveloppe_eur)}</div><p>${esc(D.interpretation)}</p></div>
    <p class="note"><b>À vérifier :</b> ${D.a_verifier.map(esc).join(" · ")}<br>
      Sources : ${D.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre)}</a>`).join(" · ")}.
      Aide à la décision chiffrée, pas un conseil en investissement : c'est toi qui tranches.</p>`);
}

// ---------------------------------------------------------------- routeur

function nav(active) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === active));
}

function render() {
  const [, route = "accueil", a = "", b = "", c = ""] = (location.hash || "#/accueil").split("/");
  nav(S.cfg.token ? route : "reglages");
  if (route === "reglages" || !S.cfg.token) {
    $view.innerHTML = viewReglages();
    bindSettings();
    return;
  }
  if (!S.M) {
    $view.innerHTML = S.error ? `<div class="alert">${esc(S.error)} <a href="#/reglages">Réglages →</a></div>` : `<p class="empty">Chargement des données…</p>`;
    return;
  }
  const dep = () => {
    if (a === "mois") return viewMois(b);
    if (a === "categories") return viewCategories();
    if (a === "cat") return viewCategorie(b, c);
    if (a === "transactions") return viewTransactions();
    return viewDepenses();
  };
  const views = {
    accueil: viewAccueil, patrimoine: () => viewPatrimoine(a), depenses: dep, actions: viewActions,
    immo: () => viewImmo(S.I, a, b),
  };
  $view.innerHTML = (views[route] || viewAccueil)();
  drawLines($view);
  renderTxOut();
  enhanceTables($view);
  if (route === "immo") bindImmo($view, S.I);
}

function bindSettings() {
  const f = document.getElementById("settings");
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries([...new FormData(f).entries()].map(([k, v]) => [k, String(v).trim()]));
    S.cfg = { ...S.cfg, ...d };
    saveConfig(S.cfg);
    location.hash = "#/accueil";
    loadAll();
  };
  const fg = document.getElementById("forget");
  if (fg) fg.onclick = () => { forgetToken(); S.cfg = loadConfig(); S.M = null; setSync("Token requis", ""); render(); };
}

$view.addEventListener("click", (e) => {
  const p = e.target.closest("[data-period]");
  if (p) { S.period = p.dataset.period; render(); return; }
  const mk = e.target.closest("[data-marchand]");
  if (mk) { S.marchand = S.marchand === mk.dataset.marchand ? "" : mk.dataset.marchand; render(); }
});
$view.addEventListener("change", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) { location.hash = g.dataset.goto + g.value + (g.dataset.suffix || ""); return; }
  if (e.target.id === "tx-cat") { S.tx.cat = e.target.value; renderTxOut(); }
  if (e.target.id === "tx-mois") { S.tx.mois = e.target.value; renderTxOut(); }
});
$view.addEventListener("input", (e) => {
  if (e.target.id === "tx-q") { S.tx.q = e.target.value; renderTxOut(); }
});

// Infobulle partagée par tous les graphiques.
const tip = document.getElementById("tip");
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el || !el.dataset.tip) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
});
document.addEventListener("mousemove", (e) => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - 12)}px`;
});

window.addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });

let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => drawLines($view), 120); });
window.addEventListener("hashchange", () => {
  const [, r, a] = location.hash.split("/");
  if (r !== "depenses" || a !== "cat") S.marchand = "";
  render();
  window.scrollTo(0, 0);
});
document.getElementById("refresh").onclick = () => loadAll();

render();
loadAll();
