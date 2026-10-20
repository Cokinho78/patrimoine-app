// Projet locatif : hypothèses sourcées, simulation LMNP réel, note façon Football Manager.
// Règle d'or : chaque valeur porte sa provenance (annonce, officiel, suivi, hypothèse).
// Aucun chiffre n'est inventé : une valeur absente reste « hypothèse » et s'affiche comme telle.

export const SRC = {
  annonce: { lbl: "Annonce", cls: "s-annonce" },
  officiel: { lbl: "Source officielle", cls: "s-officiel" },
  suivi: { lbl: "Vérifié", cls: "s-suivi" },
  hypothese: { lbl: "Hypothèse", cls: "s-hyp" },
  calcul: { lbl: "Calcul", cls: "s-calcul" },
};

export const STATUTS = {
  nouveau: "Nouveau", a_visiter: "À visiter", visite: "Visité", offre: "Offre", ecarte: "Écarté",
};

const DPE_NOTE = { A: 20, B: 18, C: 15, D: 12, E: 7, F: 2, G: 1 };

export function buildImmo(files) {
  const cfg = files.get("immo/config.json");
  if (!cfg) return null;
  const marche = files.get("immo/marche.json") || { communes: [] };
  const I = {
    cfg,
    marche,
    annonces: files.get("immo/annonces.json")?.annonces || [],
    annoncesMaj: files.get("immo/annonces.json")?.maj,
    suivi: files.get("immo/suivi.json")?.biens || {},
    journal: (files.get("immo/journal.json")?.entrees || []).slice().sort((a, b) => b.date.localeCompare(a.date)),
  };
  I.commune = (insee) => marche.communes.find((c) => c.insee === insee) || null;
  I.rang = (insee) => cfg.criteres.communes.find((c) => c.insee === insee)?.rang || "hors";
  I.byId = (id) => I.annonces.find((a) => a.id === id) || null;
  I.statut = (a) => I.suivi[a.id]?.statut || "nouveau";
  I.analyses = new Map(I.annonces.map((a) => [a.id, analyse(I, a)]));
  return I;
}

// ------------------------------------------------------------ hypothèses

// Indicateur ANIL adapté à la typologie : T1-T2 pour 1-2 pièces, T3+ au-delà.
export function loyerRef(com, a) {
  const t3 = (a.pieces || 1) >= 3 && com?.loyer_t3plus;
  const L = t3 ? com.loyer_t3plus : com?.loyer_t1t2;
  return L ? { ...L, typo: t3 ? "T3 et plus (réf. 72 m²)" : "T1-T2 (réf. 37 m²)" } : null;
}

const v = (val, src, note = "") => ({ v: val, src, note });

// Construit toutes les entrées de la simulation, chacune avec sa source.
// `over` = réglages du simulateur (curseurs), prioritaires sur tout le reste.
export function hypotheses(I, a, over = {}) {
  const { financement: F, exploitation: E } = I.cfg;
  const notes = I.cfg.hypotheses_notes || {};
  const s = I.suivi[a.id]?.hypotheses || {};
  const pick = (key, fallback) => (s[key] ? v(s[key].v, "suivi", s[key].src) : fallback);
  const h = {};

  h.prix = over.prix != null ? v(over.prix, "calcul", "Prix négocié (simulateur)")
    : pick("prix_negocie", v(a.prix, "annonce", "Prix affiché, honoraires inclus (FAI)"));
  h.surface = v(a.surface, "annonce");
  const net = a.prix_net_vendeur && a.prix ? a.prix_net_vendeur / a.prix : null;
  h.prix_net_vendeur = net
    ? v(Math.round(h.prix.v * net), "annonce", `Hors honoraires d'agence (${a.honoraires_pct ?? "?"} % à la charge de l'acquéreur)`)
    : v(h.prix.v, "hypothese", "Prix hors honoraires inconnu : frais de notaire calculés sur le prix FAI (prudent)");

  // Loyer : carte des loyers ANIL (nu, charges comprises) → meublé hors charges.
  const com = I.commune(a.insee);
  const L = loyerRef(com, a);
  h.loyer_ref = L
    ? v(L.m2 * a.surface, "officiel", `${L.m2.toLocaleString("fr-FR")} €/m² × ${a.surface} m² · ${L.typo} nu, charges comprises (ANIL 2025, ${L.nb_annonces} annonces)`)
    : v(null, "hypothese", "Commune hors carte des loyers");
  h.loyer_ref_bas = L ? L.bas * a.surface : null;
  h.loyer_ref_haut = L ? L.haut * a.surface : null;

  h.charges_copro_an = pick("charges_copro_an", a.charges_copro_an
    ? v(a.charges_copro_an, "annonce", "Charges de copropriété annuelles")
    : v(Math.round((E.charges_loc_m2_mois_defaut * 12 * a.surface) / E.charges_recuperables_part), "hypothese", "Charges de copro absentes de l'annonce : à demander"));
  h.provision = v(Math.round((h.charges_copro_an.v * E.charges_recuperables_part) / 12), "hypothese",
    `${Math.round(E.charges_recuperables_part * 100)} % des charges de copro refacturées au locataire. ${notes.charges_recuperables_part || ""}`);
  h.meuble_prime = v(over.meuble_prime ?? E.meuble_prime, over.meuble_prime != null ? "calcul" : "hypothese", notes.meuble_prime || "");

  const loyerCalc = h.loyer_ref.v != null ? Math.round(h.loyer_ref.v * (1 + h.meuble_prime.v) - h.provision.v) : null;
  h.loyer_hc = over.loyer_hc != null ? v(over.loyer_hc, "calcul", "Loyer saisi dans le simulateur")
    : pick("loyer_hc", v(loyerCalc, "calcul", "Référence ANIL × (1 + prime meublé) − provision de charges"));

  h.taxe_fonciere = pick("taxe_fonciere", v(Math.round(E.taxe_fonciere_m2_defaut * a.surface), "hypothese", notes.taxe_fonciere_m2_defaut || ""));
  h.travaux = over.travaux != null ? v(over.travaux, "calcul", "Saisi dans le simulateur")
    : pick("travaux", v(0, "hypothese", "Aucun travaux supposé : à estimer pendant la visite"));
  h.meubles = pick("meubles", v(E.meubles, "hypothese", notes.meubles || ""));
  h.taux = v(over.taux ?? F.taux, over.taux != null ? "calcul" : "hypothese", F.taux_source);
  h.apport = v(over.apport ?? F.apport, "suivi", "Apport prévu");
  h.duree = v(over.duree ?? F.duree_ans, "hypothese", "Durée du prêt");
  return h;
}

// ------------------------------------------------------------ simulation

function mensualite(capital, tauxAn, ans) {
  const r = tauxAn / 12;
  const n = ans * 12;
  return r ? (capital * r) / (1 - (1 + r) ** -n) : capital / n;
}

export function simuler(I, h) {
  const { financement: F, exploitation: E, fiscalite: T } = I.cfg;
  const prix = h.prix.v;
  const notaire = Math.round(h.prix_net_vendeur.v * F.frais_notaire_pct);
  const cout = prix + notaire + F.frais_garantie + h.travaux.v + h.meubles.v;
  const emprunt = Math.max(0, cout - h.apport.v);
  const mens = mensualite(emprunt, h.taux.v, h.duree.v);
  const assur = (emprunt * F.assurance_taux) / 12;
  const loyerM = h.loyer_hc.v || 0;
  const vac = E.vacance_mois / 12;

  const r = h.taux.v / 12;
  let crd = emprunt;
  let reportDeficit = 0;
  let reportAmort = 0;
  const annees = [];
  for (let y = 1; y <= Math.max(25, h.duree.v); y++) {
    const idx = (1 + E.indexation_loyer) ** (y - 1);
    const inf = (1 + E.inflation_charges) ** (y - 1);
    const loyer = loyerM * 12 * (1 - vac) * idx;
    const coproNonRecup = h.charges_copro_an.v * (1 - E.charges_recuperables_part);
    const charges = (h.taxe_fonciere.v + coproNonRecup + E.pno + E.cfe + E.comptable) * inf
      + loyer * (E.entretien_pct_loyer + E.gestion_pct);
    let interets = 0;
    let principal = 0;
    const enCours = y <= h.duree.v;
    if (enCours) {
      for (let m = 0; m < 12; m++) {
        const i = crd * r;
        interets += i;
        principal += mens - i;
        crd -= mens - i;
      }
    }
    const assurAn = enCours ? assur * 12 : 0;
    const fraisAn1 = y === 1 ? notaire + F.frais_garantie : 0;
    const amort = (prix * (1 - E.part_terrain)) / E.bati_amort_ans
      + (y <= E.meubles_amort_ans ? h.meubles.v / E.meubles_amort_ans : 0)
      + (y <= E.travaux_amort_ans ? h.travaux.v / E.travaux_amort_ans : 0);

    // LMNP réel : les charges peuvent créer un déficit reportable, l'amortissement non (il se reporte).
    let res = loyer - charges - interets - assurAn - fraisAn1;
    if (res < 0) { reportDeficit -= res; res = 0; } else {
      const u = Math.min(res, reportDeficit); res -= u; reportDeficit -= u;
    }
    const dispo = amort + reportAmort;
    const used = Math.min(res, dispo);
    reportAmort = dispo - used;
    const imposable = res - used;
    const impot = imposable * (T.tmi + T.ps);
    const credit = enCours ? (mens + assur) * 12 : 0;
    const cf = loyer - charges - credit;
    const valeur = prix * (1 + E.valorisation) ** y;
    annees.push({
      an: y, loyer, charges, interets, assurance: assurAn, amort: used, imposable, impot,
      cf, cfApres: cf - impot, crd: Math.max(0, crd), valeur, patrimoine: valeur - Math.max(0, crd),
    });
  }

  const a1 = annees[0];
  const loyerAn = loyerM * 12;
  const impot10 = annees.slice(0, 10).reduce((s, x) => s + x.impot, 0) / 10;
  const microImpot = loyerAn * (1 - vac) * (1 - T.micro_abattement) * (T.tmi + T.ps);
  const endettement = ((mens + assur) + F.loyer_rp) / (F.revenus_banque + F.part_loyer_retenue * loyerM);
  const cible = I.cfg.cible.rendement_brut;

  return {
    notaire, cout, emprunt, mensualite: mens, assurance: assur,
    rdtBrut: prix ? loyerAn / prix : 0,
    rdtNet: cout ? (a1.loyer - a1.charges) / cout : 0,
    rdtNetNet: cout ? (a1.loyer - a1.charges - impot10) / cout : 0,
    cfAvant: a1.cf / 12,
    cfApres: (a1.cf - impot10) / 12,
    impot10,
    microImpot,
    endettement,
    budgetOk: cout <= I.cfg.criteres.budget_total_max,
    // Prix FAI qui fait tenir le tout dans le budget (notaire au prorata du prix hors honoraires).
    prixMaxBudget: Math.floor((I.cfg.criteres.budget_total_max - F.frais_garantie - h.travaux.v - h.meubles.v)
      / (1 + F.frais_notaire_pct * (h.prix_net_vendeur.v / prix)) / 500) * 500,
    prixCible: Math.round(loyerAn / cible / 1000) * 1000,
    prixCibleMin: Math.round(loyerAn / I.cfg.cible.rendement_brut_min / 1000) * 1000,
    annees,
    patrimoine10: annees[9].patrimoine,
    patrimoine20: annees[19].patrimoine,
    effortTotal: annees.slice(0, h.duree.v).reduce((s, x) => s + Math.min(0, x.cfApres), 0),
  };
}

// ------------------------------------------------------------ verdict & note

const clamp = (x, a = 1, b = 20) => Math.max(a, Math.min(b, Math.round(x)));
const lerp = (x, x0, x1) => 1 + ((x - x0) / (x1 - x0)) * 19;

export function analyse(I, a, over = {}) {
  const h = hypotheses(I, a, over);
  const sim = simuler(I, h);
  const crit = I.cfg.criteres;
  const com = I.commune(a.insee);
  const med = com?.prix?.petites_surfaces?.mediane;
  const p75 = com?.prix?.petites_surfaces?.p75;
  const m2 = a.prix && a.surface ? a.prix / a.surface : null;
  const txt = `${a.titre} ${a.description}`.toLowerCase();
  const mot = crit.mots_exclus.find((x) => txt.includes(x));
  const dpe = /^[A-G]$/.test(a.dpe || "") ? a.dpe : null;
  const proc = typeof a.procedure_copro === "string" ? !/pas de proc/i.test(a.procedure_copro) : a.procedure_copro === true;
  const coproM2 = a.charges_copro_an && a.surface ? a.charges_copro_an / a.surface : null;

  const exclus = [];
  if (dpe && crit.dpe_exclus.includes(dpe)) exclus.push(`DPE ${dpe} : ${dpe === "G" ? "interdit à la location depuis 2025" : "interdit à la location en 2028"}`);
  if (a.residence_senior || mot) exclus.push(`Produit géré / atypique${mot ? ` (« ${mot} »)` : ""} : pas un appartement à louer librement`);
  if (a.surface && a.surface < crit.surface_min) exclus.push(`Surface ${a.surface} m² < ${crit.surface_min} m²`);
  if (proc) exclus.push("Copropriété en procédure");

  const alertes = [];
  if (!sim.budgetOk) alertes.push(`Budget dépassé : ${eur0(sim.cout)} tout compris. Prix plafond pour tenir ${eur0(crit.budget_total_max)} : ${eur0(sim.prixMaxBudget)}`);
  if (!dpe) alertes.push("DPE non communiqué : à exiger avant la visite");
  if (dpe === "E") alertes.push("DPE E : location interdite à partir de 2034 ; prévoir des travaux");
  if (m2 && p75 && m2 > p75) alertes.push(`Prix au m² au-dessus de 75 % des ventes récentes de la commune (${Math.round(p75).toLocaleString("fr-FR")} €/m²)`);
  if (!a.charges_copro_an) alertes.push("Charges de copropriété inconnues");
  if (a.etage === 0) alertes.push("Rez-de-chaussée : moins demandé, vérifier sécurité et luminosité");
  if (/(^|[^a-zà-ÿ])lou[ée]e?([^a-zà-ÿ]|$)|locataire (déjà )?en place|vendu lou|bail en cours/.test(txt)) alertes.push("Vendu loué : demander le bail (nu ou meublé), le loyer réel et la date de fin. En bail nu, pas de passage en meublé avant la fin du bail");

  const atouts = [];
  if (m2 && med && m2 < med) atouts.push(`Prix au m² sous la médiane de la commune (−${Math.round((1 - m2 / med) * 100)} %)`);
  if (a.exterieur) atouts.push("Extérieur (terrasse / balcon)");
  if (a.ascenseur) atouts.push("Ascenseur");
  if (dpe && "ABC".includes(dpe)) atouts.push(`Bon DPE (${dpe})`);
  if (I.rang(a.insee) === "coeur") atouts.push("Secteur cœur (Chatou / Le Vésinet)");

  const attrs = {
    Rendement: clamp(lerp(sim.rdtBrut, 0.03, 0.06)),
    Prix: m2 && med ? clamp(lerp(-(m2 / med), -1.3, -0.75)) : null,
    Énergie: dpe ? DPE_NOTE[dpe] : null,
    Copro: proc ? 1 : coproM2 == null ? null : clamp(lerp(-coproM2, -60, -15)),
    Secteur: { coeur: 18, voisine: 15, secondaire: 11 }[I.rang(a.insee)] || 6,
    Trésorerie: clamp(lerp(sim.cfApres, -450, 50)),
  };
  const W = { Rendement: 3, Prix: 2, Énergie: 2, Copro: 1, Secteur: 2, Trésorerie: 1 };
  let num = 0;
  let den = 0;
  for (const [k, val] of Object.entries(attrs)) if (val != null) { num += val * W[k]; den += W[k]; }
  const note = exclus.length ? Math.min(5, num / den) : num / den;

  const C = I.cfg.cible;
  let verdict;
  if (exclus.length) verdict = { cls: "v-out", lbl: "À écarter", txt: exclus[0] };
  else if (!sim.budgetOk) verdict = { cls: "v-nego", lbl: "Visiter et négocier", txt: `Hors budget au prix affiché : viser ${eur0(Math.min(sim.prixMaxBudget, sim.prixCible))} maximum` };
  else if (sim.rdtBrut >= C.rendement_brut) verdict = { cls: "v-go", lbl: "À visiter", txt: `Rendement brut ${pct1(sim.rdtBrut)} ≥ cible ${pct1(C.rendement_brut)}` };
  else if (sim.rdtBrut >= C.rendement_brut_min) verdict = { cls: "v-nego", lbl: "Visiter et négocier", txt: `Viser ${eur0(sim.prixCible)} pour ${pct1(C.rendement_brut)} brut` };
  else verdict = { cls: "v-low", lbl: "Trop cher", txt: `Il faudrait ${eur0(sim.prixCibleMin)} pour atteindre ${pct1(C.rendement_brut_min)} brut` };

  return { h, sim, m2, med, p75, exclus, alertes, atouts, attrs, note, verdict };
}

const pct1 = (x) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const eur0 = (x) => `${Math.round(x).toLocaleString("fr-FR")} €`;
