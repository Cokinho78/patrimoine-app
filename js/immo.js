// Onglet Immo : Cockpit › Annonces › Fiche (simulateur) · Marché · Veille.
// Lecture seule : statuts, notes de visite et hypothèses vérifiées sont écrits par /immo dans immo/suivi.json.
import { esc, eur, pct, dShort } from "./util.js";
import { panel, kpi, head, tabs } from "./ui.js";
import { columns, line, drawLines, meter } from "./charts.js";
import { SRC, STATUTS, analyse, loyerRef } from "./immo-model.js";
import { enhanceTables } from "./tables.js";

const ST = { commune: "", exclus: false, simu: {}, vente: "78146" };
const pct1 = (x) => pct(x, 1);
const m2fmt = (x) => (x == null ? "—" : `${Math.round(x).toLocaleString("fr-FR")} €/m²`);
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (d) => Math.round((new Date(d) - new Date(today())) / 864e5);
const href = (id) => `#/immo/bien/${encodeURIComponent(id)}`;
const ext = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="ext">${label} ↗</a>`;

const noteCls = (n) => (n == null ? "n-na" : n >= 15 ? "n-top" : n >= 11 ? "n-ok" : n >= 7 ? "n-mid" : "n-low");
const noteBadge = (n) => `<span class="note ${noteCls(n)}">${n == null ? "–" : n.toFixed(1).replace(".", ",")}</span>`;
const dpeChip = (d) => {
  const ok = /^[A-G]$/.test(d || "");
  return `<span class="dpe ${ok ? `dpe-${d}` : "dpe-na"}">${ok ? d : "?"}</span>`;
};
const srcBadge = (s) => `<span class="src ${SRC[s]?.cls || ""}">${SRC[s]?.lbl || s}</span>`;
const verdictTag = (v) => `<span class="verdict ${v.cls}">${v.lbl}</span>`;

function immoTabs(active) {
  return tabs([["", "Cockpit", "#/immo"], ["annonces", "Annonces", "#/immo/annonces"],
    ["marche", "Marché", "#/immo/marche"], ["veille", "Veille", "#/immo/veille"]], active);
}

export function viewImmo(I, sub, arg) {
  if (!I) {
    return `${head([["Immo"]], "Projet immo")}<p class="empty">Aucune donnée immo dans patrimoine-data (dossier immo/). Lance <code>/immo</code> dans Claude.</p>`;
  }
  if (sub === "bien") return viewBien(I, decodeURIComponent(arg || ""));
  if (sub === "annonces") return viewAnnonces(I);
  if (sub === "marche") return viewMarche(I);
  if (sub === "veille") return viewVeille(I);
  return viewCockpit(I);
}

// ------------------------------------------------------------ cockpit

function ranked(I, { exclus = false } = {}) {
  return I.annonces.filter((a) => a.actif)
    .map((a) => ({ a, x: I.analyses.get(a.id) }))
    .filter(({ a, x }) => exclus || (!x.exclus.length && I.statut(a) !== "ecarte"))
    .sort((p, q) => q.x.note - p.x.note);
}

function viewCockpit(I) {
  const C = I.cfg;
  const etapes = C.etapes;
  const cur = etapes.find((e) => e.statut !== "fait") || etapes.at(-1);
  const curIdx = etapes.indexOf(cur);
  const reste = cur.taches.filter((t) => !t.fait);
  const dl = cur.echeance ? daysTo(cur.echeance) : null;
  const actives = I.annonces.filter((a) => a.actif);
  const semaine = actives.filter((a) => daysTo(a.premiere_vue) >= -7);
  const bons = ranked(I);
  const go = bons.filter(({ x }) => x.verdict.cls !== "v-low");
  const suivis = Object.values(I.suivi);
  const visites = suivis.filter((s) => ["visite", "offre"].includes(s.statut)).length;
  const point = I.journal.find((j) => j.type === "point");
  const chatou = I.commune("78146");

  const steps = etapes.map((e, i) => {
    const done = e.taches.filter((t) => t.fait).length;
    const st = e.statut === "fait" ? "done" : e === cur ? "cur" : "todo";
    return `<details class="step st-${st}" ${e === cur ? "open" : ""}>
      <summary>
        <span class="step-n">${e.statut === "fait" ? "✓" : i + 1}</span>
        <span class="step-t"><b>${esc(e.titre)}</b><small>${e.echeance ? `${e.statut === "fait" ? "Fait le" : "Échéance"} ${dShort(e.echeance)} ${e.echeance.slice(2, 4)}` : "Après l'étape précédente"}</small></span>
        <span class="step-p">${meter(done, null, st === "done" ? "var(--accent)" : st === "cur" ? "var(--warn)" : "var(--muted)", e.taches.length)}<small>${done}/${e.taches.length}</small></span>
      </summary>
      <div class="step-b"><p>${esc(e.pourquoi)}</p>
        <ul class="checks">${e.taches.map((t) => `<li class="${t.fait ? "ok" : ""}">${esc(t.t)}</li>`).join("")}</ul>
      </div>
    </details>`;
  }).join("");

  const top = bons.slice(0, 6).map(({ a, x }) => rowAnnonce(I, a, x, true)).join("");

  const marche = I.marche.communes.map((c) => {
    const med = c.prix.petites_surfaces.mediane;
    const L = c.loyer_t1t2;
    const n = actives.filter((a) => a.insee === c.insee).length;
    return `<a class="trow mrow" href="#/immo/marche">
      <span class="tname">${esc(c.nom)}<small>${c.rang === "coeur" ? "Cœur de cible" : c.rang === "voisine" ? "Voisine" : "Secondaire"} · ${n} annonce${n > 1 ? "s" : ""}</small></span>
      <span class="num">${m2fmt(med)}</span>
      <span class="num">${L ? `${L.m2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €/m²` : "—"}</span>
      <span class="num"><b>${L && med ? pct1((L.m2 * 12) / med) : "—"}</b></span>
    </a>`;
  }).join("");

  return `${head([["Immo"]], "Projet immo", { sub: `Chatou · Le Vésinet — LMNP meublé · ${eur(C.criteres.budget_total_max)} tout compris · veille du ${I.annoncesMaj ? dShort(I.annoncesMaj) : "—"}` })}
    ${immoTabs("")}
    <div class="grid g-hero">
      <div class="hero hero-step">
        <div class="lbl">Étape ${curIdx + 1}/${etapes.length} · en cours</div>
        <div class="hero-v hv-sm">${esc(cur.titre)}</div>
        <div class="hero-d">${dl == null ? "" : dl < 0 ? `<span class="down">En retard de ${-dl} j</span>` : `<span class="warn">J-${dl}</span>`}<span class="sep"></span><span class="muted">${esc(cur.pourquoi)}</span></div>
        ${reste.length ? `<ol class="next">${reste.map((t) => `<li>${esc(t.t)}</li>`).join("")}</ol>` : ""}
      </div>
      ${kpi("Annonces actives", `${actives.length}`, `${semaine.length} nouvelle${semaine.length > 1 ? "s" : ""} en 7 jours<a href="#/immo/annonces">Toutes les annonces →</a>`)}
      ${kpi("Qui passent les filtres", `${go.length}`, `${bons.length - go.length} trop chères · ${actives.length - bons.length} écartées<a href="#/immo/annonces">Voir le classement →</a>`, go.length ? "k-ok" : "")}
      ${kpi("Visites faites", `${visites}`, `${chatou ? `Prix FAI max ≈ ${Math.round(C.criteres.prix_fai_max / chatou.prix.petites_surfaces.mediane)} m² à Chatou (médiane)` : ""}<a href="#/immo/veille">Veille et alertes →</a>`)}
    </div>
    <div class="grid g-12">
      ${panel("Feuille de route", `<div class="steps-l">${steps}</div>`, { right: `<span class="muted xs">Mise à jour par /immo point</span>` })}
      <div class="col-stack-v">
        ${point ? panel(`Cette semaine · ${dShort(point.date)}`, `<p class="soft">${esc(point.texte || "")}</p><ol class="next">${(point.actions || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`) : ""}
        ${panel("Marché · petites surfaces", `<div class="trow mrow mhead"><span class="lbl">Commune</span><span class="lbl r">Prix DVF</span><span class="lbl r">Loyer nu CC</span><span class="lbl r">Brut théo.</span></div><div class="tlist">${marche}</div>
          <p class="note">Prix médian des ventes réelles ≤ ${I.marche.petite_surface_max} m² (DVF 2023-2025) · loyer T1-T2 nu charges comprises (ANIL 2025). Le brut théorique ne compte ni frais de notaire ni charges.</p>`, { right: `<a href="#/immo/marche">Détail →</a>` })}
      </div>
    </div>
    ${panel("Meilleures opportunités du moment", tableAnnonces(top, "ann-top"), { right: `<a href="#/immo/annonces">Classement complet →</a>` })}`;
}

// ------------------------------------------------------------ annonces

const ATTRS = [["Rendement", "Rdt"], ["Prix", "Prix"], ["Énergie", "Éner."], ["Copro", "Copro"], ["Secteur", "Sect."], ["Trésorerie", "Tréso"]];

// Clic sur un en-tête = tri ; menus sous Ville / DPE / Verdict = filtres. `tid` garde l'état par tableau.
function tableAnnonces(rows, tid = "ann") {
  if (!rows) return `<p class="empty">Aucune annonce.</p>`;
  return `<div class="scroll-x"><table class="grid-t ann sortable" data-tid="${tid}">
    <thead><tr><th data-dir="desc">Note</th><th data-filter>Bien</th><th class="r" data-dir="desc">Surface</th><th class="r">Prix FAI</th><th class="r">€/m² vs médiane</th><th data-filter>DPE</th>
      ${ATTRS.map(([k, l]) => `<th class="r att" data-dir="desc" title="Note ${k} /20">${l}</th>`).join("")}
      <th class="r" data-dir="desc">Loyer HC est.</th><th class="r" data-dir="desc">Brut</th><th class="r" data-dir="desc">Cash-flow</th><th data-filter>Verdict</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function rowAnnonce(I, a, x) {
  const ecart = x.m2 && x.med ? x.m2 / x.med - 1 : null;
  const st = I.statut(a);
  const nouveau = daysTo(a.premiere_vue) >= -7;
  const baisse = a.historique_prix?.length > 1 && a.historique_prix.at(-1).prix < a.historique_prix[0].prix;
  return `<tr class="clk ${x.exclus.length ? "out" : ""}" data-href="${href(a.id)}">
    <td data-v="${x.note}">${noteBadge(x.note)}</td>
    <td class="bien" data-v="${esc(a.ville)}" data-f="${esc(a.ville)}"><a href="${href(a.id)}"><b>${esc(a.ville)}</b>${a.quartier ? ` <span class="muted">· ${esc(a.quartier)}</span>` : ""}
      ${nouveau ? `<span class="flag f-new">Nouveau</span>` : ""}${baisse ? `<span class="flag f-down">Prix en baisse</span>` : ""}${st !== "nouveau" ? `<span class="flag f-st">${STATUTS[st]}</span>` : ""}
      <small>${esc(a.titre).slice(0, 70)}</small></a></td>
    <td class="r num" data-v="${a.surface ?? ""}">${a.surface ? `${String(a.surface).replace(".", ",")} m²` : "—"}<small class="muted">${a.pieces ? ` · ${a.pieces}p` : ""}</small></td>
    <td class="r num" data-v="${a.prix}"><b>${eur(a.prix)}</b></td>
    <td class="r num" data-v="${x.m2 ?? ""}">${m2fmt(x.m2)} ${ecart == null ? "" : `<small class="${ecart > 0.1 ? "down" : ecart < 0 ? "up" : "muted"}">${ecart > 0 ? "+" : "−"}${Math.round(Math.abs(ecart) * 100)} %</small>`}</td>
    <td data-v="${/^[A-G]$/.test(a.dpe || "") ? a.dpe : "Z"}" data-f="${/^[A-G]$/.test(a.dpe || "") ? a.dpe : "?"}">${dpeChip(a.dpe)}</td>
    ${ATTRS.map(([k]) => `<td class="r num att" data-v="${x.attrs[k] ?? ""}"><b class="${noteCls(x.attrs[k])}">${x.attrs[k] == null ? "–" : Math.round(x.attrs[k])}</b></td>`).join("")}
    <td class="r num" data-v="${x.h.loyer_hc.v || ""}">${x.h.loyer_hc.v ? eur(x.h.loyer_hc.v) : "—"}</td>
    <td class="r num" data-v="${x.sim.rdtBrut}"><b>${pct1(x.sim.rdtBrut)}</b></td>
    <td data-v="${x.sim.cfApres}" class="r num ${x.sim.cfApres < 0 ? "down" : "up"}">${x.sim.cfApres < 0 ? "−" : "+"}${eur(Math.abs(x.sim.cfApres))}<small class="muted">/mois</small></td>
    <td data-f="${esc(x.verdict.lbl)}">${verdictTag(x.verdict)}</td>
  </tr>`;
}

function viewAnnonces(I) {
  const communes = I.cfg.criteres.communes;
  const list = ranked(I, { exclus: ST.exclus }).filter(({ a }) => !ST.commune || a.insee === ST.commune);
  const retirees = I.annonces.filter((a) => !a.actif);
  const nbEx = I.annonces.filter((a) => a.actif && I.analyses.get(a.id).exclus.length).length;

  return `${head([["Immo", "#/immo"], ["Annonces"]], "Annonces", { sub: `${list.length} affichées · ${nbEx} écartées automatiquement · clic = fiche et simulateur` })}
    ${immoTabs("annonces")}
    <div class="filters">
      <div class="seg">${[["", "Toutes"], ...communes.map((c) => [c.insee, c.nom.replace("-sur-Seine", "")])].map(([k, l]) => `<button type="button" data-icommune="${k}" aria-pressed="${ST.commune === k}">${esc(l)}</button>`).join("")}</div>
      <label class="tgl"><input type="checkbox" id="i-exclus" ${ST.exclus ? "checked" : ""}> Afficher les écartées</label>
    </div>
    ${panel("Classement", tableAnnonces(list.map(({ a, x }) => rowAnnonce(I, a, x)).join("")), { right: `<span class="muted xs">Clic sur une colonne = tri · Note /20 = rendement ×3, prix vs marché ×2, DPE ×2, secteur ×2, copro, trésorerie</span>` })}
    ${retirees.length ? panel(`Retirées du marché · ${retirees.length}`, `<div class="tlist">${retirees.map((a) => `<a class="trow" href="${href(a.id)}"><span class="tname">${esc(a.ville)} · ${a.surface} m²<small>${esc(a.titre).slice(0, 60)}</small></span><span class="num">${eur(a.prix)}</span><span class="num muted xs">vue du ${dShort(a.premiere_vue)} au ${dShort(a.retrait || a.derniere_vue)}</span></a>`).join("")}</div>
      <p class="note">Une annonce retirée vite = un prix juste. Ça calibre tes offres.</p>`) : ""}`;
}

// ------------------------------------------------------------ fiche bien

function attrBars(attrs) {
  return `<div class="attrs">${Object.entries(attrs).map(([k, v]) => `
    <div class="attr"><span>${k}</span><b class="${noteCls(v)}">${v ?? "–"}</b>
      <i><em class="${noteCls(v)}" style="width:${v ? (v / 20) * 100 : 0}%"></em></i></div>`).join("")}</div>`;
}

function simControls(a, x) {
  const o = ST.simu[a.id] || {};
  const h = x.h;
  const base = Math.round(h.loyer_hc.v || 0);
  const s = (key, label, val, min, max, step, fmt) => `
    <label class="sl"><span>${label}<b id="sl-${key}">${fmt(val)}</b></span>
      <input type="range" data-simu="${key}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
  return `<div class="sliders">
    ${s("prix", "Prix négocié", o.prix ?? h.prix.v, Math.round(a.prix * 0.8 / 500) * 500, a.prix, 500, eur)}
    ${s("loyer_hc", "Loyer meublé HC / mois", o.loyer_hc ?? base, Math.round(base * 0.7 / 5) * 5, Math.round(base * 1.3 / 5) * 5, 5, eur)}
    ${s("taux", "Taux du crédit", o.taux ?? h.taux.v, 0.025, 0.045, 0.0005, (v) => pct(v, 2))}
    ${s("apport", "Apport", o.apport ?? h.apport.v, 0, 60000, 1000, eur)}
    ${s("travaux", "Travaux", o.travaux ?? h.travaux.v, 0, 30000, 500, eur)}
    ${s("duree", "Durée (ans)", o.duree ?? h.duree.v, 15, 25, 5, (v) => `${v} ans`)}
    <button type="button" class="btn ghost" data-simu-reset>Revenir aux hypothèses</button>
  </div>`;
}

function simOut(I, a, x) {
  const S = x.sim;
  const C = I.cfg.cible;
  const yrs = [1, 2, 3, 5, 10, 15, 20, 25].map((y) => S.annees[y - 1]).filter(Boolean);
  const proj = line(S.annees.map((y) => ({ label: `${y.an}`, v: Math.round(y.patrimoine), tip: `Année ${y.an}\nValeur ${eur(y.valeur)} − capital restant dû ${eur(y.crd)}\n= ${eur(y.patrimoine)}\nCash-flow après impôt ${eur(y.cfApres)}` })), { height: 200 });
  return `<div class="grid g-4 simk">
      ${kpi("Rendement brut", pct1(S.rdtBrut), `${meter(S.rdtBrut * 100, C.rendement_brut * 100, S.rdtBrut >= C.rendement_brut ? "var(--accent)" : S.rdtBrut >= C.rendement_brut_min ? "var(--warn)" : "var(--down)", 8)}cible ${pct1(C.rendement_brut)} · net ${pct1(S.rdtNet)} · net-net ${pct1(S.rdtNetNet)}`, S.rdtBrut >= C.rendement_brut_min ? "k-ok" : "k-bad")}
      ${kpi("Effort mensuel", `${S.cfApres < 0 ? "−" : "+"}${eur(Math.abs(S.cfApres))}<small>/mois</small>`, `avant impôt ${S.cfAvant < 0 ? "−" : "+"}${eur(Math.abs(S.cfAvant))} · impôt moyen ${eur(S.impot10 / 12)}/mois sur 10 ans`, S.cfApres < -300 ? "k-bad" : "")}
      ${kpi("Crédit", `${eur(S.mensualite + S.assurance)}<small>/mois</small>`, `${eur(S.emprunt)} empruntés · endettement ${pct(S.endettement)} (max 35 %)`, S.endettement > 0.35 ? "k-bad" : "")}
      ${kpi("Coût total", eur(S.cout), `notaire ${eur(S.notaire)} · ${S.budgetOk ? `<span class="up">dans le budget</span>` : `<span class="down">hors budget</span>`}`, S.budgetOk ? "" : "k-bad")}
    </div>
    <div class="grid g-11">
      <div class="callout"><div class="lbl">Prix maximum à payer</div>
        <p><b>${eur(Math.min(S.prixCibleMin, S.prixMaxBudget))}</b>
        <span class="muted">= le plus bas entre ${eur(S.prixCibleMin)} (${pct1(C.rendement_brut_min)} brut) et ${eur(S.prixMaxBudget)} (budget tout compris).</span>
        Prix idéal pour ${pct1(C.rendement_brut)} brut : <b>${eur(Math.min(S.prixCible, S.prixMaxBudget))}</b>.
        ${a.prix > Math.min(S.prixCibleMin, S.prixMaxBudget) ? `<span class="warn">Le prix affiché est ${pct(a.prix / Math.min(S.prixCibleMin, S.prixMaxBudget) - 1)} au-dessus.</span>` : `<span class="up">Le prix affiché passe déjà.</span>`}</p></div>
      <div class="callout"><div class="lbl">Patrimoine constitué</div>
        <p><b>${eur(S.patrimoine10)}</b> à 10 ans · <b>${eur(S.patrimoine20)}</b> à 20 ans, pour un effort cumulé de ${eur(-S.effortTotal)} sur la durée du prêt.
        <span class="muted">Valorisation +${pct(I.cfg.exploitation.valorisation)}/an : hypothèse, pas une prévision.</span></p></div>
    </div>
    ${panel("Patrimoine net (valeur − capital restant dû)", proj, { cls: "flat" })}
    <div class="scroll-x"><table class="grid-t proj">
      <thead><tr><th>Année</th><th class="r">Loyers</th><th class="r">Charges</th><th class="r">Intérêts</th><th class="r">Amort. utilisé</th><th class="r">Imposable</th><th class="r">Impôt</th><th class="r">Cash-flow / an après impôt</th><th class="r">Capital dû</th></tr></thead>
      <tbody>${yrs.map((y) => `<tr><td>${y.an}</td><td class="r num">${eur(y.loyer)}</td><td class="r num">${eur(y.charges)}</td><td class="r num">${eur(y.interets)}</td><td class="r num muted">${eur(y.amort)}</td><td class="r num">${eur(y.imposable)}</td><td class="r num">${eur(y.impot)}</td><td class="r num ${y.cfApres < 0 ? "down" : "up"}">${eur(y.cfApres)}</td><td class="r num muted">${eur(y.crd)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="note">LMNP au réel : l'amortissement efface l'impôt tant qu'il reste du stock, d'où un impôt nul les premières années. Comparaison micro-BIC (abattement 50 %) : environ ${eur(S.microImpot)} d'impôt dès l'an 1. ${esc(I.cfg.fiscalite.plus_value_note)}</p>`;
}

function loyerPanel(I, a, x) {
  const h = x.h;
  const E = I.cfg.exploitation;
  const L = loyerRef(I.commune(a.insee), a);
  const s = I.suivi[a.id]?.hypotheses?.loyer_hc;
  if (!L) return panel("D'où vient le loyer", `<p class="empty">Commune hors carte des loyers : loyer à établir avec des comparables.</p>`);
  const base = Math.round(h.loyer_ref.v);
  const calc = Math.round(base * (1 + h.meuble_prime.v) - h.provision.v);
  return panel("D'où vient le loyer", `
    <ol class="calc">
      <li><span>Loyer de marché ${L.typo} <b>nu, charges comprises</b> à ${esc(a.ville)} : ${L.m2.toLocaleString("fr-FR")} €/m² × ${a.surface} m²</span><b>${eur(base)}</b>${srcBadge("officiel")}</li>
      <li class="sub"><span>Fourchette à 95 % (${L.bas.toLocaleString("fr-FR")} – ${L.haut.toLocaleString("fr-FR")} €/m²) · ${L.nb_annonces} annonces · R² ${L.r2.toLocaleString("fr-FR")}</span><b>${eur(h.loyer_ref_bas)} – ${eur(h.loyer_ref_haut)}</b></li>
      <li><span>+ prime meublé ${pct(h.meuble_prime.v)}</span><b>+${eur(base * h.meuble_prime.v)}</b>${srcBadge("hypothese")}</li>
      <li><span>− provision de charges refacturées (${pct(E.charges_recuperables_part)} de ${eur(h.charges_copro_an.v)}/an)</span><b>−${eur(h.provision.v)}</b>${srcBadge(h.charges_copro_an.src)}</li>
      <li class="tot"><span>Loyer meublé hors charges estimé</span><b>${eur(calc)}</b>${srcBadge("calcul")}</li>
      ${s ? `<li class="tot ret"><span>Loyer retenu après vérification : ${esc(s.src)}</span><b>${eur(s.v)}</b>${srcBadge("suivi")}</li>` : ""}
    </ol>
    <p class="note">Source : carte des loyers 2025, estimations ANIL à partir des données du Groupe SeLoger et de leboncoin. Un bien plus petit que la référence se loue un peu plus cher au m² : l'estimation est donc prudente pour les studios. Pour fiabiliser, donne à /immo 3 annonces meublées comparables ou l'avis de l'agent : la source sera tracée ici.</p>`);
}

function hypoTable(x) {
  const L = {
    prix: "Prix", prix_net_vendeur: "Prix hors honoraires (base notaire)", surface: "Surface", charges_copro_an: "Charges de copro / an",
    taxe_fonciere: "Taxe foncière / an", travaux: "Travaux", meubles: "Meubles", taux: "Taux du crédit", apport: "Apport", duree: "Durée",
  };
  const fmt = (k, v) => (k === "taux" ? pct(v, 2) : k === "surface" ? `${v} m²` : k === "duree" ? `${v} ans` : eur(v));
  return `<div class="scroll-x"><table class="grid-t hyp"><thead><tr><th>Paramètre</th><th class="r">Valeur</th><th>Source</th><th>Détail</th></tr></thead>
    <tbody>${Object.entries(L).map(([k, l]) => `<tr><td>${l}</td><td class="r num"><b>${fmt(k, x.h[k].v)}</b></td><td>${srcBadge(x.h[k].src)}</td><td class="xs muted">${esc(x.h[k].note)}</td></tr>`).join("")}</tbody></table></div>`;
}

const CHECK_VISITE = [
  "Parties communes : entretien, ravalement, toiture, cage d'escalier",
  "Travaux votés ou à venir : demander les 3 derniers PV d'AG",
  "Charges de copro détaillées et avis de taxe foncière",
  "Humidité, fenêtres (simple / double vitrage), mode de chauffage",
  "Luminosité, exposition, vis-à-vis, bruit (rue, voisins, RER)",
  "Temps à pied jusqu'à la gare RER A (Chatou-Croissy / Le Vésinet)",
  "Tableau électrique, eau chaude, état de la salle d'eau",
  "Pourquoi le vendeur vend, depuis quand c'est en vente, offres déjà reçues",
  "Locataire en place ? bail, loyer, date de fin",
];

function viewBien(I, id) {
  const a = I.byId(id);
  if (!a) return `${head([["Immo", "#/immo"], ["Annonce"]], "Annonce introuvable")}<p class="empty"><a href="#/immo/annonces">← Retour aux annonces</a></p>`;
  const x = analyse(I, a, ST.simu[a.id] || {});
  const base = I.analyses.get(a.id);
  const s = I.suivi[a.id];
  const st = I.statut(a);
  const hist = a.historique_prix || [];
  const infos = [
    ["Prix hors honoraires", a.prix_net_vendeur ? `${eur(a.prix_net_vendeur)} (${a.honoraires_pct ?? "?"} % d'honoraires)` : "n.c."],
    ["Étage", a.etage != null ? `${a.etage === 0 ? "RDC" : `${a.etage}e`}${a.etages_immeuble ? ` / ${a.etages_immeuble}` : ""}${a.ascenseur ? " · ascenseur" : a.ascenseur === false ? " · sans ascenseur" : ""}` : "n.c."],
    ["Construction", a.annee_construction || "n.c."],
    ["DPE / GES", `${a.dpe || "n.c."} / ${a.ges || "n.c."}${a.dpe_date ? ` · diag. ${a.dpe_date.slice(0, 10)}` : ""}`],
    ["Chauffage", a.chauffage || "n.c."],
    ["Copropriété", `${a.lots_copro ? `${a.lots_copro} lots` : "n.c."}${typeof a.procedure_copro === "string" ? ` · ${a.procedure_copro}` : ""}`],
    ["Charges de copro", a.charges_copro_an ? `${eur(a.charges_copro_an)}/an (${eur(a.charges_copro_an / 12)}/mois)` : "n.c."],
    ["Agence", a.agence || a.source],
    ["En ligne depuis", a.publication ? dShort(a.publication) + " " + a.publication.slice(0, 4) : `vue le ${dShort(a.premiere_vue)}`],
    ["Historique prix", hist.map((p) => `${dShort(p.date)} : ${eur(p.prix)}`).join(" → ")],
  ];

  return `${head([["Immo", "#/immo"], ["Annonces", "#/immo/annonces"], [`${a.ville} · ${String(a.surface).replace(".", ",")} m²`]],
    `${esc(a.ville)} · ${String(a.surface).replace(".", ",")} m²${a.pieces ? ` · ${a.pieces} p.` : ""} · ${eur(a.prix)}`,
    { sub: esc(a.titre), right: `${st !== "nouveau" ? `<span class="flag f-st">${STATUTS[st]}</span>` : ""}${ext(a.url, "Voir l'annonce")}` })}
    ${a.photos?.length ? `<div class="photos">${a.photos.map((p) => `<img src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join("")}</div>` : ""}
    <div class="grid g-12">
      ${panel("Profil du bien", `<div class="profil"><div class="big-note ${noteCls(base.note)}"><b>${base.note.toFixed(1).replace(".", ",")}</b><small>/20</small></div>${attrBars(base.attrs)}</div>
        <p class="note">Note aux hypothèses par défaut (prix affiché). Un attribut « – » = information manquante, non noté.</p>`)}
      ${panel("Verdict", `<div class="vbox ${base.verdict.cls}"><b>${base.verdict.lbl}</b><span>${esc(base.verdict.txt)}</span></div>
        ${base.exclus.length ? `<ul class="pts p-out">${base.exclus.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${base.alertes.length ? `<ul class="pts p-warn">${base.alertes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${base.atouts.length ? `<ul class="pts p-ok">${base.atouts.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${s?.verdict ? `<div class="callout"><div class="lbl">Avis après analyse · ${esc(s.maj || "")}</div><p>${esc(s.verdict)}</p></div>` : ""}`)}
    </div>
    ${panel("Simulateur", `${simControls(a, x)}<div id="simu-out">${simOut(I, a, x)}</div>`, { right: `<span class="muted xs">Bouge les curseurs : tout se recalcule</span>`, cls: "simu" })}
    <div class="grid g-11">
      ${loyerPanel(I, a, x)}
      ${panel("Hypothèses utilisées", hypoTable(x), { right: `<span class="muted xs">Hypothèse = à remplacer par un document</span>` })}
    </div>
    <div class="grid g-11">
      ${panel(s?.visite ? `Visite · ${esc(s.visite.date || "")}` : "Préparer la visite", `${s?.visite ? `<ul class="pts">${(s.visite.constats || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${s?.notes ? `<p class="soft">${esc(s.notes)}</p>` : ""}
        <div class="lbl">À vérifier sur place</div><ul class="checks">${CHECK_VISITE.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p class="note">Après la visite, raconte-la à /immo : notes, statut et hypothèses corrigées s'afficheront ici.</p>`)}
      ${panel("Fiche annonce", `<table class="grid-t kv"><tbody>${infos.map(([k, v]) => `<tr><td class="muted">${k}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
        <details class="desc"><summary>Description de l'annonce</summary><p>${esc(a.description || "—").replace(/\n/g, "<br>")}</p></details>`)}
    </div>`;
}

// ------------------------------------------------------------ marché

function viewMarche(I) {
  const M = I.marche;
  const c = M.communes.find((x) => x.insee === ST.vente) || M.communes[0];
  const tiles = M.communes.map((k) => {
    const p = k.prix.petites_surfaces;
    const L = k.loyer_t1t2;
    return `<button type="button" class="tile mtile ${k.insee === c.insee ? "on" : ""}" data-ivente="${k.insee}">
      <div class="lbl">${esc(k.nom)}</div><div class="kpi-v">${m2fmt(p.mediane)}</div>
      <div class="kpi-s">${p.n} ventes ≤ ${M.petite_surface_max} m² · 50 % entre ${m2fmt(p.p25)} et ${m2fmt(p.p75)}<span>Loyer nu CC ${L ? `${L.m2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €/m²` : "—"} · brut théo. <b>${L ? pct1((L.m2 * 12) / p.mediane) : "—"}</b></span></div>
    </button>`;
  }).join("");
  const years = Object.entries(c.prix.petites_par_an);
  const chart = columns(years.map(([y, q]) => ({
    label: y, top: q.mediane ? `<b>${(q.mediane / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k</b>` : "",
    segs: [{ v: q.mediane || 0, color: "#3b7bff", tip: `${y} · ${q.n} ventes\nmédiane ${m2fmt(q.mediane)}\n${m2fmt(q.p25)} – ${m2fmt(q.p75)}` }],
  })), { height: 180 });
  const ventes = c.prix.dernieres_ventes.map((v) => `<tr><td class="num">${dShort(v.date)} ${v.date.slice(2, 4)}</td><td class="r num">${String(v.surface).replace(".", ",")} m²</td><td class="r num">${v.pieces || "—"}</td><td class="r num">${eur(v.prix)}</td><td class="r num"><b>${m2fmt(v.m2)}</b></td></tr>`).join("");
  return `${head([["Immo", "#/immo"], ["Marché"]], "Marché", { sub: `Ventes réelles et loyers de référence · mis à jour le ${dShort(M.maj)} ${M.maj.slice(0, 4)}` })}
    ${immoTabs("marche")}
    <div class="grid g-tiles mt">${tiles}</div>
    <div class="grid g-12">
      ${panel(`${esc(c.nom)} · médiane €/m² par an (≤ ${M.petite_surface_max} m²)`, `<div class="cols-sm">${chart}</div><p class="note">Sur la période ${c.prix.periode?.map((d) => d.slice(0, 7)).join(" → ")}. Tous appartements confondus : médiane ${m2fmt(c.prix.tous_appartements.mediane)} (${c.prix.tous_appartements.n} ventes).</p>`)}
      ${panel(`${esc(c.nom)} · 12 dernières ventes de petites surfaces`, `<div class="scroll-x"><table class="grid-t"><thead><tr><th>Date</th><th class="r">Surface</th><th class="r">Pièces</th><th class="r">Prix</th><th class="r">€/m²</th></tr></thead><tbody>${ventes}</tbody></table></div>`)}
    </div>
    ${panel("Sources et méthode", `<div class="grid g-11">
      <div><div class="lbl">Prix · ${esc(M.sources.prix.nom)}</div><p class="soft">${esc(M.sources.prix.methode)}</p>${ext(M.sources.prix.url, "Données")}</div>
      <div><div class="lbl">Loyers · ${esc(M.sources.loyers.nom)}</div><p class="soft">${esc(M.sources.loyers.methode)}</p>${ext(M.sources.loyers.url, "Données")}</div>
    </div><p class="note">Rafraîchir : <code>python3 immo_marche.py</code>. Aucune valeur n'est saisie à la main.</p>`)}`;
}

// ------------------------------------------------------------ veille

function viewVeille(I) {
  const al = I.cfg.alertes.map((x) => `<tr>
    <td><b>${esc(x.site)}</b></td>
    <td><span class="flag ${x.statut === "a_creer" ? "f-todo" : "f-ok"}">${x.statut === "a_creer" ? "À créer" : x.statut === "automatique" ? "Automatique" : "Active"}</span></td>
    <td class="soft xs">${esc(x.reglage)}</td><td>${ext(x.url, "Ouvrir")}</td></tr>`).join("");
  const jr = I.journal.map((j) => `<article class="jr j-${j.type}"><div class="jr-h"><span class="tag">${j.type === "veille" ? "Veille" : j.type === "point" ? "Point hebdo" : "Note"}</span><b>${esc(j.titre)}</b><span class="muted xs">${dShort(j.date)} ${j.date.slice(0, 4)}</span></div>
    ${j.texte ? `<p>${esc(j.texte)}</p>` : ""}${j.actions?.length ? `<ol class="next">${j.actions.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}</article>`).join("");
  return `${head([["Immo", "#/immo"], ["Veille"]], "Veille", { sub: `Dernier passage : ${I.annoncesMaj ? dShort(I.annoncesMaj) : "—"} · ${I.annonces.filter((a) => a.actif).length} annonces suivies` })}
    ${immoTabs("veille")}
    <div class="grid g-12">
      ${panel("Comment ça tourne", `<ol class="steps">
        <li><b>Lundi et jeudi, 8 h</b> : la tâche planifiée lance la veille Bien'ici (annonces d'agences des 5 communes) et lit tes alertes e-mail SeLoger, Leboncoin et PAP.</li>
        <li>Les nouvelles annonces sont notées, filtrées (DPE, budget, viager, résidences gérées) et poussées ici.</li>
        <li>Le lundi, un <b>point hebdo</b> : 3 actions pour la semaine, affichées sur le cockpit.</li>
        <li>Tu reçois une notification avec les meilleures nouveautés.</li>
      </ol>
      <p class="note">Leboncoin et SeLoger bloquent les robots : on passe par leurs alertes e-mail, sans contourner aucune protection.</p>`)}
      ${panel("Alertes e-mail à créer (15 min, une fois)", `<div class="scroll-x"><table class="grid-t"><tbody>${al}</tbody></table></div>
        <p class="note">Utilise ton adresse Gmail habituelle : la veille cherche ces e-mails automatiquement. Dis à /immo quand c'est fait.</p>`)}
    </div>
    ${panel("Journal", jr || `<p class="empty">Rien pour l'instant.</p>`)}`;
}

// ------------------------------------------------------------ interactions

export function bindImmo($view, I) {
  $view.onclick = (e) => {
    const c = e.target.closest("[data-icommune]");
    if (c) { ST.commune = c.dataset.icommune; rerender($view, I); return; }
    const v = e.target.closest("[data-ivente]");
    if (v) { ST.vente = v.dataset.ivente; rerender($view, I); return; }
    if (e.target.closest("[data-simu-reset]")) { delete ST.simu[currentId()]; rerender($view, I); return; }
    const row = e.target.closest("tr[data-href]");
    if (row && !e.target.closest("a")) location.hash = row.dataset.href;
  };
  $view.onchange = (e) => {
    if (e.target.id === "i-exclus") { ST.exclus = e.target.checked; rerender($view, I); }
  };
  $view.oninput = (e) => {
    const k = e.target.dataset?.simu;
    if (!k) return;
    const id = currentId();
    const a = I.byId(id);
    ST.simu[id] = { ...(ST.simu[id] || {}), [k]: Number(e.target.value) };
    const x = analyse(I, a, ST.simu[id]);
    const lab = document.getElementById(`sl-${k}`);
    const val = Number(e.target.value);
    if (lab) lab.textContent = k === "taux" ? pct(val, 2) : k === "duree" ? `${val} ans` : eur(val);
    const out = document.getElementById("simu-out");
    out.innerHTML = simOut(I, a, x);
    drawLines(out);
  };
}

const currentId = () => decodeURIComponent(location.hash.split("/")[3] || "");

function rerender($view, I) {
  const [, , sub = "", arg = ""] = location.hash.split("/");
  $view.innerHTML = viewImmo(I, sub, arg);
  drawLines($view);
  enhanceTables($view);
}
