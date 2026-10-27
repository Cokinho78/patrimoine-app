// Écrans Prévisionnel : Trésorerie (compte BNP) › mois › catégorie, Envies, Patrimoine 15 mois, Long terme.
// Calculs : prev-model.js. Données : config/previsionnel.json (repo privé).
import { esc, eur, signed, pct, mShort, mYear, mLong } from "./util.js";
import { panel, kpi, head, tabs } from "./ui.js";
import { line, columns } from "./charts.js";
import { ENVELOPES, slugOf, catColor, catIcon, catName } from "./model.js";
import { buildPrev, calerEnvies, marges, longTerme, VOYAGES } from "./prev-model.js";

const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
const IMMO_COLOR = "#ec4899";
const cell = (v, cls = "") => `<td class="r num ${cls}">${Math.round(v) ? Math.round(v).toLocaleString("fr-FR") : "·"}</td>`;
const statutTag = (s) => (s ? `<span class="tag st-${{ "estimé": "est", "à définir": "def", "hypothèse": "hyp" }[s] || "ok"}">${esc(s)}</span>` : "");

// ctx = { M, I, P, st: { dep, vers, immo } }
export function viewPrev(ctx, sub, arg) {
  const { M, I, P, st } = ctx;
  if (!P) return `${head([], "Prévisionnel")}<p class="empty">Fichier config/previsionnel.json absent du repo de données.</p>`;
  const pv = buildPrev(M, I, P, st);
  if (!pv) return `${head([], "Prévisionnel")}<p class="empty">Pas encore de relevé de patrimoine : point de départ inconnu.</p>`;
  const c = { ...ctx, pv, mg: marges(M, I, P, st), env: calerEnvies(M, I, P, st) };
  if (sub === "mois") return viewMoisPrev(c, arg);
  if (sub === "envies") return viewEnvies(c);
  if (sub === "patrimoine") return viewPatriPrev(c);
  if (sub === "long-terme") return viewLongTerme(c);
  return viewTreso(c);
}

const prevTabs = (active) => tabs([["", "Trésorerie", "#/previsionnel"], ["envies", "Envies", "#/previsionnel/envies"],
  ["patrimoine", "Patrimoine 15 mois", "#/previsionnel/patrimoine"], ["long-terme", "Long terme", "#/previsionnel/long-terme"]], active);

const seg = (st, key, items) => `<div class="seg">${items.map(([v, l]) =>
  `<button type="button" data-pv="${key}:${v}" aria-pressed="${String(st[key]) === v}">${l}</button>`).join("")}</div>`;
const toggles = (st, P) => `<div class="pv-tg">
  ${seg(st, "dep", [["budget", "Budget"], ["reel", "Rythme réel"]])}
  ${seg(st, "vers", Object.entries(P.versements || {}).map(([k, s]) => [k, k === "actuel" ? "Versements actuels" : `Versements · ${s.nom}`]))}
</div>`;

const head2 = (c, crumbs, title, extra = "") => head(crumbs, title, {
  sub: `Compte courant BNP · départ fin ${mLong(c.pv.depart.mois)} (réel) : ${eur(c.pv.depart.soldes.cc_bnp || 0)} · plancher ${eur(c.pv.plancher)}${extra}`,
  right: toggles(c.st, c.P),
});

const margeTxt = (v) => (v >= 0
  ? `<span class="up">${eur(v)}</span> de marge d'ici la prochaine prime`
  : `<span class="down">${eur(-v)} sous le plancher</span> sans virement LDDS`);

// ------------------------------------------------------------ trésorerie

function viewTreso(c) {
  const { pv, mg, P, M } = c;
  const [r0, r1] = pv.mois;
  const y = r0.m.slice(0, 4);
  const va = pv.voyAn[y];
  const vb = pv.voyAn[String(+y + 1)];
  const bas = pv.pointBas;
  const pts = [{ label: mShort(pv.depart.mois), v: pv.depart.soldes.cc_bnp || 0, tip: `${mLong(pv.depart.mois)} (réel)\n${eur(pv.depart.soldes.cc_bnp || 0)}` },
    ...pv.mois.map((r) => ({ label: mShort(r.m), v: Math.round(r.fin),
      tip: `${mLong(r.m)}${r.enCours ? " (en cours)" : ""}\nFin ${eur(r.fin)}${r.pont ? `\ndont virement LDDS ${eur(r.pont)}` : ""}` }))];

  const lignes = [
    ["Solde début", (r) => r.debut, "muted"],
    ["+ Salaire", (r) => r.salaire, ""],
    ["+ Prime / exceptionnel", (r) => sum(r.exc, (x) => x.montant), "up"],
    ["− Loyer", (r) => r.loyer, ""],
    ["− Dépenses courantes", (r) => r.courant, ""],
    ["− Voyages", (r) => r.voyages.prevu, ""],
    ["− Envies datées", (r) => r.enviesTot, ""],
    ["− Épargne programmée", (r) => r.versTot, ""],
    ["+ Virement LDDS → BNP", (r) => r.pont, "warn"],
  ];
  const table = `<div class="scroll-x"><table class="grid-t matrix pv-t">
    <thead><tr><th></th><th class="r muted">${mYear(pv.depart.mois)}<small>réel</small></th>${pv.mois.map((r) =>
      `<th class="r"><a href="#/previsionnel/mois/${r.m}">${mYear(r.m)}</a>${r.enCours ? "<small>en cours</small>" : ""}</th>`).join("")}</tr></thead>
    <tbody>${lignes.map(([l, f, cls]) => `<tr><td>${l}</td><td class="r muted">·</td>${pv.mois.map((r) => cell(f(r), cls)).join("")}</tr>`).join("")}</tbody>
    <tfoot>
      <tr><td>= Solde fin</td><td class="r num muted">${eur(pv.depart.soldes.cc_bnp || 0)}</td>${pv.mois.map((r) =>
        `<td class="r num ${r.alerte ? "down" : ""}"><a href="#/previsionnel/mois/${r.m}">${eur(r.fin)}</a></td>`).join("")}</tr>
      <tr class="pv-marge"><td>Marge d'ici la prime</td><td></td>${pv.mois.map((r) => {
        const v = c.mg.get(r.m);
        return `<td class="r num ${v < 0 ? "down" : "up"}">${eur(v)}</td>`;
      }).join("")}</tr>
    </tfoot></table></div>`;

  const hyp = [...(P.revenus_exceptionnels || []).map((x) => ({ ...x, cat: "💰 Revenus", plus: true })), ...(P.evenements || [])]
    .filter((x) => pv.row(x.mois)).sort((a, b) => a.mois.localeCompare(b.mois));

  return `
  ${head2(c, [], "Prévisionnel")}
  ${prevTabs("")}
  <div class="grid g-4">
    ${kpi(`Fin ${mLong(r0.m)}${r0.enCours ? " · en cours" : ""}`, eur(r0.fin), `${margeTxt(c.mg.get(r0.m))}<a href="#/previsionnel/mois/${r0.m}">Détail du mois →</a>`, r0.alerte ? "k-bad" : "k-ok")}
    ${r1 ? kpi(`Fin ${mLong(r1.m)}`, eur(r1.fin), `${margeTxt(c.mg.get(r1.m))}<a href="#/previsionnel/mois/${r1.m}">Détail du mois →</a>`, r1.alerte ? "k-bad" : "k-ok") : ""}
    ${kpi("Point bas · avant virement", eur(bas.avant), `${mLong(bas.m)}${pv.pontTotal ? `<span class="warn">${eur(pv.pontTotal)} à prendre sur le LDDS sur la période</span>` : `<span class="up">Jamais sous le plancher</span>`}`, pv.pontTotal ? "k-bad" : "")}
    ${kpi(`Voyages ${y}`, va.depasse ? `+${eur(va.depasse)}` : eur(va.reste),
      `${va.depasse ? `<span class="down">Enveloppe ${eur(va.enveloppe)} dépassée</span>réel ${eur(va.reel)} + daté ${eur(va.dates)}` : `non datés, ${eur(va.parMois)}/mois`}${vb ? `<span>${+y + 1} : ${eur(vb.reste)} non datés → ${eur(vb.parMois)}/mois</span>` : ""}`, va.depasse ? "k-bad" : "")}
  </div>
  ${panel("Solde BNP en fin de mois", line(pts, { height: 240, ref: { v: pv.plancher, label: `Plancher ${eur(pv.plancher)}` } }),
    { right: `<span class="muted xs">${pv.dep === "reel" ? "Dépenses au rythme des 12 derniers mois" : "Dépenses au budget v2"} · ${esc(pv.scen.nom || "")}</span>` })}
  ${panel("Tableau des flux · clic sur un mois pour le détail", table)}
  <div class="grid g-21">
    ${panel("Ce qui est daté", hyp.length ? `<div class="tlist">${hyp.map((x) => `
      <a class="trow" href="#/previsionnel/mois/${x.mois}">
        <span class="tname"><i class="sw" style="background:${x.plus ? "var(--up)" : catColor(x.cat)}"></i>${esc(x.libelle)}<small>${mYear(x.mois)} · ${esc(catName(x.cat))}${x.note ? ` · ${esc(x.note)}` : ""}</small></span>
        <span>${statutTag(x.statut)}</span>
        <span class="num ${x.plus ? "up" : ""}"><b>${x.plus ? "+" : "−"}${eur(x.montant)}</b></span>
      </a>`).join("")}</div>` : `<p class="empty">Rien de daté.</p>`)}
    ${panel("Règles de calcul", `<div class="callout">
      <p><b>Dépenses :</b> chaque catégorie vaut ${pv.dep === "reel" ? "sa moyenne des 12 derniers mois" : "sa cible du budget v2"}. Un événement daté absorbe le budget de sa catégorie (on retient le plus élevé des deux).</p>
      <p><b>Voyages :</b> enveloppe de ${eur(va.enveloppe)} par an. Ce qui reste après le réel et les voyages datés est réparti sur les mois restants de l'année.</p>
      <p><b>Envies :</b> une envie datée s'ajoute au budget de sa catégorie. Les autres sont calées dans l'onglet Envies.</p>
      <p><b>Plancher :</b> sous ${eur(pv.plancher)}, un virement LDDS → BNP est prévu (arrondi à la centaine).</p>
      <p><b>Marge :</b> ce qui peut encore sortir ce mois-ci sans passer sous le plancher d'ici la prochaine prime, sans toucher au LDDS.</p>
    </div><p class="note">MAJ ${esc(P.maj || "")} · ${esc(P.plancher_note || "")}</p>`)}
  </div>`;
}

// ------------------------------------------------------------ détail d'un mois

function viewMoisPrev(c, m) {
  const { pv, M, env } = c;
  const i = pv.mois.findIndex((r) => r.m === m);
  if (i < 0) return `${head2(c, [["Prévisionnel", "#/previsionnel"]], "Mois hors horizon")}<p class="empty">Ce mois n'est pas dans le prévisionnel.</p>`;
  const r = pv.mois[i];
  const arrow = (k, ch) => (pv.mois[k] ? `<a class="arrow" href="#/previsionnel/mois/${pv.mois[k].m}" aria-label="${mLong(pv.mois[k].m)}">${ch}</a>` : `<span class="arrow off">${ch}</span>`);
  const nav = `<div class="mnav">${arrow(i - 1, "‹")}<select class="dsel" data-goto="#/previsionnel/mois/">${pv.mois.map((x) =>
    `<option value="${x.m}" ${x.m === m ? "selected" : ""}>${mLong(x.m)}</option>`).join("")}</select>${arrow(i + 1, "›")}</div>`;
  const marge = c.mg.get(m);
  const possibles = env.filter((e) => e.suggestion === m);
  const base = pv.dep === "reel" ? "Moy. 12 mois" : "Budget";

  const flux = [
    ["Salaire net", r.salaire, true],
    ...r.exc.map((x) => [`${x.libelle} ${statutTag(x.statut)}`, x.montant, true]),
    ...(r.pont ? [["Virement LDDS → BNP (plancher)", r.pont, true]] : []),
    ["Loyer", r.loyer, false],
    ["Dépenses courantes", r.courant, false],
    ["Voyages", r.voyages.prevu, false],
    ...(r.enviesTot ? [["Envies datées", r.enviesTot, false]] : []),
    ["Épargne programmée", r.versTot, false],
  ].filter(([, v]) => v);

  const cats = Object.entries(r.cats).sort((a, b) => b[1].prevu - a[1].prevu);
  const catRows = cats.map(([cat, x]) => `<tr>
      <td><a class="tname" href="#/depenses/cat/${slugOf(cat)}"><i class="sw" style="background:${catColor(cat)}"></i>${catIcon(cat)} ${esc(catName(cat))}</a></td>
      <td class="r num muted">${eur(x.base)}</td><td class="r num"><b>${eur(x.prevu)}</b></td>
      <td class="xs">${x.evts.map((e) => `${esc(e.libelle)} ${statutTag(e.statut)}`).join(" · ") || `<span class="muted">${base.toLowerCase()}</span>`}</td></tr>`).join("");
  const voy = r.voyages;
  const voyRow = `<tr>
      <td><a class="tname" href="#/depenses/cat/${slugOf(VOYAGES)}"><i class="sw" style="background:${catColor(VOYAGES)}"></i>${catIcon(VOYAGES)} Voyages</a></td>
      <td class="r num muted">${eur(voy.reparti)}</td><td class="r num"><b>${eur(voy.prevu)}</b></td>
      <td class="xs">${[...voy.evts.map((e) => `${esc(e.libelle)} ${statutTag(e.statut)}${e.note ? `<small class="muted"> ${esc(e.note)}</small>` : ""}`),
        voy.reparti ? "reste de l'enveloppe annuelle réparti" : "enveloppe de l'année consommée"].join(" · ")}</td></tr>`;
  const envRows = r.envies.map((e) => `<tr>
      <td><span class="tname"><i class="sw" style="background:${catColor(e.cat)}"></i>${esc(e.nom)}</span></td>
      <td class="r num muted">·</td><td class="r num"><b>${eur(e.prix)}</b></td><td class="xs">envie datée, en plus du budget</td></tr>`).join("");

  return `
  ${head2(c, [["Prévisionnel", "#/previsionnel"], [mLong(m)]], `${mLong(m)}${r.enCours ? " · en cours" : ""}`)}
  <div class="row-r">${nav}</div>
  <div class="grid g-4">
    ${kpi("Solde début", eur(r.debut), i ? `Fin ${mLong(pv.mois[i - 1].m)} prévue` : `Réel fin ${mLong(pv.depart.mois)}`)}
    ${kpi("Solde fin prévu", eur(r.fin), r.pont ? `<span class="warn">dont ${eur(r.pont)} venus du LDDS</span>` : `Plancher ${eur(pv.plancher)}`, r.alerte ? "k-bad" : "k-ok")}
    ${kpi("Marge du mois", eur(marge), marge >= 0 ? "Peut encore sortir sans passer sous le plancher d'ici la prochaine prime" : "Déjà sous le plancher : chaque euro dépensé vient du LDDS", marge >= 0 ? "k-ok" : "k-bad")}
    ${kpi("Épargne programmée", eur(r.versTot), `${r.vers.length} versement${r.vers.length > 1 ? "s" : ""} · ${esc(pv.scen.nom || "")}`)}
  </div>
  <div class="grid g-12">
    ${panel("Flux du mois", `<div class="tlist">${flux.map(([l, v, plus]) => `
      <div class="trow"><span class="tname">${l}</span><span class="num ${plus ? "up" : ""}"><b>${plus ? "+" : "−"}${eur(v)}</b></span></div>`).join("")}
      <div class="trow pv-tot"><span class="tname"><b>Variation du solde</b></span><span class="num ${r.fin - r.debut >= 0 ? "up" : "down"}"><b>${signed(r.fin - r.debut)}</b></span></div></div>`)}
    ${panel("Dépenses prévues par catégorie · clic = historique réel", `<div class="scroll-x"><table class="grid-t">
      <thead><tr><th>Catégorie</th><th class="r">${base}</th><th class="r">Prévu</th><th>Ce qui est daté</th></tr></thead>
      <tbody>${voyRow}${catRows}${envRows}</tbody>
      <tfoot><tr><td>Total</td><td class="r num muted">${eur(sum(cats, ([, x]) => x.base) + voy.reparti)}</td><td class="r num"><b>${eur(r.courant + voy.prevu + r.enviesTot)}</b></td><td></td></tr></tfoot>
    </table></div>`)}
  </div>
  <div class="grid g-11">
    ${panel("Épargne programmée", r.vers.length ? `<div class="tlist">${r.vers.map((l) => `
      <div class="trow"><span class="tname">${esc(l.libelle)}<small>${esc(M.comptes[l.compte]?.nom || l.compte)}${l.note ? ` · ${esc(l.note)}` : ""}</small></span><span class="num"><b>${eur(l.montant)}</b></span></div>`).join("")}</div>`
      : `<p class="empty">Aucun versement ce mois-ci.</p>`, { right: `<a href="#/previsionnel/patrimoine">Patrimoine projeté →</a>` })}
    ${panel("Envies qui passent ce mois-ci", possibles.length ? `<div class="tlist">${possibles.map((e) => `
      <div class="trow"><span class="tname"><i class="sw" style="background:${catColor(e.cat)}"></i>${esc(e.nom)}<small>${esc(e.detail || "")}</small></span><span class="num"><b>${eur(e.prix)}</b></span></div>`).join("")}</div>`
      : `<p class="empty">Aucune envie calée sur ce mois.</p>`, { right: `<a href="#/previsionnel/envies">Toutes les envies →</a>` })}
  </div>`;
}

// ------------------------------------------------------------ envies

function viewEnvies(c) {
  const { env, P } = c;
  const all = P.envies || [];
  const ouvertes = all.filter((e) => e.statut !== "achetée");
  const calees = env.filter((e) => e.suggestion);
  const datees = all.filter((e) => e.mois && e.statut !== "achetée");
  const sansMois = env.filter((e) => !e.suggestion);
  const linkOf = (u, k, n) => `<a class="ext" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${n > 1 ? `Option ${k + 1}` : "Voir"} ↗</a>`;
  const quand = (e) => (e.mois
    ? `<a href="#/previsionnel/mois/${e.mois}">${mYear(e.mois)}</a> <span class="tag">daté</span>`
    : e.suggestion ? `<a href="#/previsionnel/mois/${e.suggestion}" class="up">${mYear(e.suggestion)}</a>` : `<span class="down">pas sans LDDS</span>`);
  const sugg = new Map(env.map((e) => [e.id, e.suggestion]));
  const rows = ouvertes.map((e) => ({ ...e, suggestion: sugg.get(e.id) ?? null })).map((e) => `<tr>
    <td data-v="${e.priorite ?? 9}"><span class="prio p-${e.priorite === 1 ? "haute" : e.priorite === 2 ? "moyenne" : "long_terme"}">P${e.priorite ?? "?"}</span></td>
    <td><span class="tname">${esc(e.nom)}<small>${esc(e.detail || "")}</small></span></td>
    <td data-f="${esc(catName(e.cat))}"><span class="chip"><i style="background:${catColor(e.cat)}"></i>${esc(catName(e.cat))}</span></td>
    <td class="r num" data-v="${e.prix}"><b>${eur(e.prix)}</b></td>
    <td data-v="${e.mois || e.suggestion || "9999"}">${quand(e)}</td>
    <td data-f="${esc(e.statut)}">${statutTag(e.statut)}</td>
    <td>${(e.liens || []).map((u, k, a) => linkOf(u, k, a.length)).join(" ")}</td>
  </tr>`).join("");

  return `
  ${head2(c, [["Prévisionnel", "#/previsionnel"], ["Envies"]], "Envies")}
  ${prevTabs("envies")}
  <div class="grid g-4">
    ${kpi("Liste", eur(sum(ouvertes, (e) => e.prix)), `${ouvertes.length} article${ouvertes.length > 1 ? "s" : ""} · prix à confirmer`)}
    ${kpi("Calées sans toucher au LDDS", `${calees.length + datees.length}`, `${eur(sum(calees, (e) => e.prix) + sum(datees, (e) => e.prix))}`, calees.length + datees.length ? "k-ok" : "")}
    ${kpi("Pas sur l'horizon", `${sansMois.length}`, sansMois.length ? `${eur(sum(sansMois, (e) => e.prix))} : arbitrer (budget, versements ou LDDS)` : "Tout passe d'ici la fin de l'horizon", sansMois.length ? "k-bad" : "")}
    ${kpi("Scénario", c.st.dep === "reel" ? "Rythme réel" : "Budget", `${esc(c.pv.scen.nom || "")} · plancher ${eur(c.pv.plancher)}`)}
  </div>
  ${panel("Quand chaque envie passe · priorité puis ordre de la liste", `<div class="scroll-x"><table class="grid-t sortable" data-tid="envies">
    <thead><tr><th>Prio.</th><th>Article</th><th data-filter>Catégorie</th><th class="r">Prix</th><th>Mois possible</th><th data-filter>Statut</th><th>Liens</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="note">Mois possible = premier mois où l'achat laisse le compte au-dessus du plancher jusqu'à la prochaine prime, sans virement depuis le LDDS. Chaque envie calée réduit la marge des suivantes. Une envie datée (champ « mois ») entre dans le tableau des flux. ${esc(P.envies_note || "")}</p>`)}`;
}

// ------------------------------------------------------------ patrimoine projeté

function viewPatriPrev(c) {
  const { pv, M, P } = c;
  const d = pv.depart;
  const end = pv.mois.at(-1);
  const comptes = Object.keys(M.comptes).filter((k) => (d.soldes[k] || 0) || pv.mois.some((r) => r.soldes[k]));
  const envOf = (k) => ENVELOPES.find((e) => e.key === (M.comptes[k]?.groupe || "cc"));
  const ordre = ENVELOPES.map((e) => e.key);
  comptes.sort((a, b) => ordre.indexOf(envOf(a).key) - ordre.indexOf(envOf(b).key));
  const epargneNette = sum(pv.mois, (r) => r.revenus - r.loyer - r.courant - r.voyages.prevu - r.enviesTot);
  const delta = end.total - d.total;
  const pts = [{ label: mShort(d.mois), v: Math.round(d.total), tip: `${mLong(d.mois)} (réel)\n${eur(d.total)}` },
    ...pv.mois.map((r) => ({ label: mShort(r.m), v: Math.round(r.total), tip: `${mLong(r.m)}\n${eur(r.total)}` }))];
  const R = P.rendements || {};

  return `
  ${head2(c, [["Prévisionnel", "#/previsionnel"], ["Patrimoine"]], "Patrimoine projeté")}
  ${prevTabs("patrimoine")}
  <div class="grid g-4">
    ${kpi(`Fin ${mLong(end.m)}`, eur(end.total), `${signed(delta)} vs fin ${mLong(d.mois)} (${pct(delta / d.total, 1)})`, "k-ok")}
    ${kpi("Épargne nette", signed(epargneNette), "Revenus − loyer − dépenses − voyages − envies")}
    ${kpi("Effet rendement", signed(delta - epargneNette), `UC ${pct(R.uc?.central ?? 0.05, 1)}/an · épargne salariale ${pct(R.salariale?.central ?? 0.04, 1)}/an · livrets à leur taux`)}
    ${kpi("Prise sur le LDDS", eur(pv.pontTotal), pv.pontTotal ? "Virements pour tenir le plancher BNP" : "Aucune", pv.pontTotal ? "k-bad" : "")}
  </div>
  ${panel("Patrimoine total en fin de mois", line(pts, { height: 220 }), { right: `<span class="muted xs">${esc(pv.scen.nom || "")} · hors Loisir – Sorare</span>` })}
  ${panel("Compte par compte", `<div class="scroll-x"><table class="grid-t matrix">
    <thead><tr><th>Compte</th><th class="r muted">${mYear(d.mois)}<small>réel</small></th>${pv.mois.map((r) => `<th class="r"><a href="#/previsionnel/mois/${r.m}">${mYear(r.m)}</a></th>`).join("")}<th class="r">Variation</th></tr></thead>
    <tbody>${comptes.map((k) => `<tr>
      <td><span class="tname"><i class="sw" style="background:${envOf(k).color}"></i>${esc(M.comptes[k].nom)}</span></td>
      ${cell(d.soldes[k] || 0, "muted")}${pv.mois.map((r) => cell(r.soldes[k] || 0)).join("")}
      <td class="r num ${(end.soldes[k] || 0) - (d.soldes[k] || 0) >= 0 ? "up" : "down"}">${signed((end.soldes[k] || 0) - (d.soldes[k] || 0))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="r num muted">${eur(d.total)}</td>${pv.mois.map((r) => `<td class="r num">${eur(r.total)}</td>`).join("")}<td class="r num up">${signed(delta)}</td></tr></tfoot>
  </table></div>
  <p class="note">${esc(R.note || "")} ${esc(pv.scen.note || "")}</p>`)}`;
}

// ------------------------------------------------------------ long terme

function viewLongTerme(c) {
  const { pv, M, I, P, st } = c;
  const lt = longTerme(pv, M, I, P, { immo: st.immo });
  if (!lt) return "";
  const cen = lt.central;
  const last = (sc) => lt[sc].at(-1).total;
  const segs = [...ENVELOPES.map((e) => ({ k: e.key, nom: e.nom, color: e.color })), ...(st.immo ? [{ k: "immoNet", nom: "Immo (valeur − capital dû)", color: IMMO_COLOR }] : [])];
  const chart = columns(cen.map((y) => ({
    label: String(y.an), top: `<b>${Math.round(y.total / 1000)}k</b>`,
    segs: segs.map((s) => ({ v: Math.max(0, y[s.k]), color: s.color, tip: `${y.an} · ${s.nom}\n${eur(y[s.k])}` })),
  })), { height: 260 });
  const Z = lt.immo;
  const R = P.rendements?.uc || {};

  return `
  ${head2(c, [["Prévisionnel", "#/previsionnel"], ["Long terme"]], "Long terme", " · tendance, pas une promesse")}
  ${prevTabs("long-terme")}
  <div class="pv-tg">${seg({ immo: st.immo ? "1" : "0" }, "immo", [["0", "Sans immo"], ["1", "Avec le projet immo"]])}</div>
  <div class="grid g-4">
    ${kpi(`${cen.at(-1).an} · prudent`, eur(last("prudent")), `UC ${pct(R.prudent ?? 0.02, 1)}/an`)}
    ${kpi(`${cen.at(-1).an} · central`, eur(last("central")), `UC ${pct(R.central ?? 0.05, 1)}/an`, "k-ok")}
    ${kpi(`${cen.at(-1).an} · dynamique`, eur(last("dynamique")), `UC ${pct(R.dynamique ?? 0.07, 1)}/an`)}
    ${kpi("Effort d'épargne / an", eur(sum(Object.values(lt.flux)) + Math.max(0, lt.ccDelta)),
      `Repris de ${lt.y0} : versements ${eur(sum(Object.values(lt.flux)))} ${lt.ccDelta >= 0 ? `+ BNP ${eur(lt.ccDelta)}` : `· BNP ${signed(lt.ccDelta)} pris sur le LDDS`}`)}
  </div>
  ${lt.sousPrecaution ? `<div class="alert">Scénario central : livrets + compte courant passent sous l'épargne de précaution (${eur(lt.precaution)}, 3 mois de dépenses et loyer) en ${lt.sousPrecaution}.${cen.at(-1).trou
    ? ` Il manque ${eur(cen.at(-1).trou)} cumulés d'ici ${cen.at(-1).an} : à ce rythme, ${st.immo ? "l'effort immo et " : ""}les versements ne tiennent pas sans baisser les dépenses ou les versements.` : ""}</div>` : ""}
  ${panel("Patrimoine fin d'année · scénario central", `${chart}
    <div class="legend">${segs.map((s) => `<span><i style="background:${s.color}"></i>${s.nom}</span>`).join("")}</div>`)}
  <div class="grid g-21">
    ${panel("Fourchette par année", `<div class="scroll-x"><table class="grid-t">
      <thead><tr><th>Fin</th><th class="r">Prudent</th><th class="r">Central</th><th class="r">Dynamique</th>${st.immo ? `<th class="r">dont immo net</th>` : ""}</tr></thead>
      <tbody>${cen.map((y, k) => `<tr><td>${y.an}${k ? "" : " <small class='muted'>(prévisionnel)</small>"}</td>
        <td class="r num muted">${eur(lt.prudent[k].total)}</td><td class="r num"><b>${eur(y.total)}</b></td><td class="r num muted">${eur(lt.dynamique[k].total)}</td>
        ${st.immo ? `<td class="r num">${eur(y.immoNet)}</td>` : ""}</tr>`).join("")}</tbody>
    </table></div>`)}
    ${panel("Hypothèses", `<div class="callout">
      <p><b>Point de départ :</b> fin ${lt.y0} du prévisionnel mensuel (${esc(pv.scen.nom || "")}, ${pv.dep === "reel" ? "rythme réel" : "budget"}).</p>
      <p><b>Effort constant :</b> chaque année reprend les versements et la variation du compte BNP de ${lt.y0}, sans hausse de salaire.</p>
      <p><b>Rendements :</b> UC ${pct(R.prudent ?? 0.02)} / ${pct(R.central ?? 0.05)} / ${pct(R.dynamique ?? 0.07)} par an. Livrets à leur taux actuel.</p>
      ${st.immo ? `<p><b>Immo :</b> achat ${esc(P.immo?.date_achat || "")} (pris en compte à partir de ${lt.y0 + 1}), apport ${eur(I?.cfg?.financement?.apport || 0)} sorti des livrets, emprunt ${eur(Z.emprunt)}, ${eur(Z.mens)}/mois assurance comprise. Loyer ${eur(Z.loyerAn / 12)}/mois net de vacance, charges ${pct(P.immo?.charges_pct_loyer ?? 0.25)} du loyer : effort ${eur(-Z.effortAn / 12)}/mois pris sur les livrets. Valorisation ${pct(I?.cfg?.exploitation?.valorisation ?? 0.01, 1)}/an, impôt LMNP ignoré.</p>` : ""}
      <p class="muted">${esc(P.immo?.note || "")} Aucune promesse de performance : à lire comme un ordre de grandeur.</p>
    </div>`, { right: st.immo ? `<a href="#/immo">Projet immo →</a>` : "" })}
  </div>`;
}

// Bloc du tableau de bord : 4 chiffres et lien vers l'onglet.
export function prevAccueil(ctx) {
  const { M, I, P, st } = ctx;
  if (!P) return "";
  const pv = buildPrev(M, I, P, st);
  if (!pv?.mois.length) return "";
  const mg = marges(M, I, P, st);
  const env = calerEnvies(M, I, P, st);
  const [r0, r1] = pv.mois;
  const prochaine = env.filter((e) => e.suggestion).sort((a, b) => a.suggestion.localeCompare(b.suggestion) || (a.priorite ?? 9) - (b.priorite ?? 9))[0];
  return `<div class="grid g-4">
    ${kpi(`Prévu fin ${mLong(r0.m)} · BNP`, eur(r0.fin), `${margeTxt(mg.get(r0.m))}<a href="#/previsionnel">Prévisionnel →</a>`, r0.alerte ? "k-bad" : "k-ok")}
    ${r1 ? kpi(`Prévu fin ${mLong(r1.m)}`, eur(r1.fin), `${margeTxt(mg.get(r1.m))}<a href="#/previsionnel/mois/${r1.m}">Détail →</a>`, r1.alerte ? "k-bad" : "k-ok") : ""}
    ${kpi("Point bas · 15 mois", eur(pv.pointBas.avant), `${mLong(pv.pointBas.m)}${pv.pontTotal ? ` · <span class="warn">${eur(pv.pontTotal)} à prendre sur le LDDS</span>` : ""}`, pv.pontTotal ? "k-bad" : "")}
    ${kpi("Prochaine envie possible", prochaine ? esc(prochaine.nom) : "—", prochaine ? `${eur(prochaine.prix)} · ${mLong(prochaine.suggestion)}<a href="#/previsionnel/envies">Toutes les envies →</a>` : `<a href="#/previsionnel/envies">Voir les envies →</a>`, "k-immo")}
  </div>`;
}
