// Modèle : agrégats dépenses / patrimoine et actions chiffrées.

// Ordre = ordre d'empilement (bas → haut). Couleurs validées pour les segments voisins
// (vision normale + protan/deutan/tritan) sur fond #14161c.
export const GROUPS = [
  { key: "voyages", nom: "Voyages", color: "#3b7bff", cats: ["✈️ Voyages"] },
  { key: "shopping", nom: "Shopping", color: "#ffb35c", cats: ["👗 Shopping"] },
  { key: "loisirs", nom: "Loisirs & sorties", color: "#8b5cf6", cats: ["🎉 Loisirs & Sorties"] },
  { key: "restaurants", nom: "Restaurants", color: "#5eead4", cats: ["🍽️ Restaurants"] },
  { key: "courses", nom: "Courses", color: "#ec4899", cats: ["🛒 Courses"] },
  { key: "sport", nom: "Sport", color: "#fde047", cats: ["💪 Sport"] },
  { key: "repas", nom: "Repas midi", color: "#94a3b8", cats: ["🥗 Repas midi"] },
  {
    key: "autres", nom: "Autres", color: "#69728a",
    cats: ["🚇 Transports", "📱 Abonnements", "✂️ Beauté", "💊 Santé", "🏡 Maison & Divers", "🎁 Cadeaux & Social", "❓ À revoir"],
  },
];
export const EXCEPTIONNEL = "❓ Exceptionnel";

const SLUG = {
  "✈️ Voyages": "voyages", "👗 Shopping": "shopping", "🎉 Loisirs & Sorties": "loisirs",
  "🍽️ Restaurants": "restaurants", "🛒 Courses": "courses", "💪 Sport": "sport", "🥗 Repas midi": "repas-midi",
  "🚇 Transports": "transports", "📱 Abonnements": "abonnements", "✂️ Beauté": "beaute", "💊 Santé": "sante",
  "🏡 Maison & Divers": "maison", "🎁 Cadeaux & Social": "cadeaux", "❓ Exceptionnel": "exceptionnel",
  "❓ À revoir": "a-revoir",
};
export const ALL_CATS = Object.keys(SLUG);
export const slugOf = (cat) => SLUG[cat] || encodeURIComponent(cat);
export const catOfSlug = (s) => ALL_CATS.find((c) => SLUG[c] === s) || decodeURIComponent(s);
export const groupOf = (cat) => GROUPS.find((g) => g.cats.includes(cat)) || null;
export const catColor = (cat) => (cat === EXCEPTIONNEL ? "#ff6b6b" : groupOf(cat)?.color || "#69728a");
export const catIcon = (cat) => (cat.match(/^\S+/) || [""])[0];
export const catName = (cat) => cat.replace(/^\S+\s+/, "");

const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

export function buildModel(files) {
  const months = [...files.keys()].filter((p) => p.startsWith("depenses/")).sort()
    .map((p) => files.get(p)).filter(Boolean);
  const hist = files.get("patrimoine/historique.json") || { comptes: {}, mois: [] };
  const pos = files.get("patrimoine/positions.json") || {};
  const budget = files.get("config/budget.json") || { categories: {} };
  const plan = files.get("config/plan.json") || { actions: [] };

  const M = {
    months: months.map((m) => m.mois),
    byMonth: new Map(months.map((m) => [m.mois, m])),
    hist, pos, budget, plan,
  };

  // net[mois][cat]
  M.net = new Map();
  for (const m of months) {
    const row = {};
    for (const t of m.transactions) row[t.cat] = (row[t.cat] || 0) + t.montant;
    M.net.set(m.mois, row);
  }
  M.catNet = (mois, cat) => M.net.get(mois)?.[cat] || 0;
  M.groupNet = (mois, g) => sum(g.cats, (c) => M.catNet(mois, c));
  M.courant = (mois) => sum(ALL_CATS.filter((c) => c !== EXCEPTIONNEL), (c) => M.catNet(mois, c));
  M.exceptionnel = (mois) => M.catNet(mois, EXCEPTIONNEL);
  M.fixes = (mois) => {
    const f = M.byMonth.get(mois)?.charges_fixes || {};
    return (f.loyer || 0) + (f.av_bnp || 0);
  };
  M.revenus = (mois) => M.byMonth.get(mois)?.revenus || 0;
  // Revenu "incomplet" : salaire pas encore tombé dans l'extrait.
  M.revenusIncomplets = (mois) => M.revenus(mois) < 0.5 * (budget.salaire_net || 3000);
  // Épargne = revenus − dépenses nettes − loyer (le versement AV compte comme de l'épargne).
  M.epargne = (mois) => {
    const f = M.byMonth.get(mois)?.charges_fixes || {};
    return M.revenus(mois) - M.courant(mois) - M.exceptionnel(mois) - (f.loyer || 0);
  };
  M.txs = (mois) => M.byMonth.get(mois)?.transactions || [];
  M.allTxs = () => months.flatMap((m) => m.transactions.map((t) => ({ ...t, mois: m.mois })));
  M.budgetCat = (cat) => budget.categories?.[cat] ?? null;
  M.budgetCourant = sum(Object.entries(budget.categories || {}).filter(([c]) => c !== EXCEPTIONNEL), ([, v]) => v);
  M.budgetGroup = (g) => sum(g.cats, (c) => M.budgetCat(c) || 0);
  M.last = (n) => M.months.slice(-n);

  // Patrimoine
  const comptes = hist.comptes || {};
  M.comptes = comptes;
  M.patri = (hist.mois || []).map((m) => ({
    mois: m.mois, soldes: m.soldes, total: sum(Object.values(m.soldes)),
  }));
  M.patriLast = M.patri.at(-1) || null;
  M.envelopes = (soldes) => {
    const g = { livrets: 0, av: 0, pea: 0, cc: 0 };
    for (const [k, v] of Object.entries(soldes)) g[comptes[k]?.groupe || "cc"] += v;
    return g;
  };
  return M;
}

export const ENVELOPES = [
  { key: "livrets", nom: "Livrets", color: "#3b7bff" },
  { key: "av", nom: "Assurance-vie", color: "#8b5cf6" },
  { key: "pea", nom: "PEA", color: "#ffb35c" },
  { key: "cc", nom: "Comptes courants", color: "#5b6270" },
];

// ---------------------------------------------------------------- actions chiffrées

// Chaque action : niveau (haute|moyenne|info), titre, constat, étapes précises.
export function computeActions(M) {
  const out = [];
  const L = M.patriLast;
  if (!L) return out;
  const s = L.soldes;
  const c = M.comptes;
  const env = M.envelopes(s);
  const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
  const pct = (n, d = 0) => `${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;

  // Livret A au plafond : plus de versement possible.
  if (s.livret_a >= c.livret_a?.plafond) {
    const margeLdds = (c.ldds?.plafond || 0) - (s.ldds || 0);
    out.push({
      niveau: "info", zone: "Livrets",
      titre: "Livret A plein : nouveaux versements livrets → LDDS",
      constat: `Livret A à ${eur(s.livret_a)} pour un plafond de ${eur(c.livret_a.plafond)}. Le dépassement vient des intérêts capitalisés : il continue de rapporter, rien à virer.`,
      etapes: [
        `Ne plus verser sur le Livret A (la banque refuse au-delà du plafond).`,
        `Diriger l'épargne de précaution vers le LDDS : ${eur(margeLdds)} de marge (même taux ${pct(c.ldds?.taux || 0, 1)}).`,
      ],
    });
  }

  // Apport du projet locatif : les livrets en sont la réserve.
  const apport = M.budget.apport_locatif;
  if (apport) {
    const manque = apport - env.livrets;
    const mensuel = M.budget.epargne_livrets_mensuelle || 0;
    out.push({
      niveau: manque > 0 ? "moyenne" : "info", zone: "Projet locatif",
      titre: manque > 0 ? `Apport locatif : il manque ${eur(manque)}` : "Apport locatif atteint",
      constat: `Livrets ${eur(env.livrets)} (${pct(env.livrets / L.total)} du patrimoine) pour un apport cible de ${eur(apport)}.`,
      etapes: manque > 0
        ? [mensuel
          ? `À ${eur(mensuel)}/mois sur le LDDS : apport atteint en ${Math.ceil(manque / mensuel)} mois.`
          : `Programmer un virement mensuel vers le LDDS (ex. 400 €/mois → ${Math.ceil(manque / 400)} mois).`]
        : [`Au-delà de ${eur(apport)}, l'excédent de livrets (${eur(-manque)}) peut rejoindre PEA / AV.`],
    });
  }

  // PEA : concentration Banques.
  const pea = M.pos.pea;
  if (pea?.lignes && s.pea) {
    const banks = pea.lignes.find((l) => /bank/i.test(l.nom));
    const cible = M.budget.cible_pea_banques ?? 0.15;
    if (banks && banks.poids > cible + 0.02) {
      const montant = banks.poids * s.pea;
      const aVendre = montant - cible * s.pea;
      const versement = M.budget.versement_pea_mensuel || 500;
      const flux = montant / cible - s.pea;
      out.push({
        niveau: "haute", zone: "PEA",
        titre: `PEA : Banques à ${pct(banks.poids)} → cible ${pct(cible)}`,
        constat: `${banks.nom} ≈ ${eur(montant)} sur ${eur(s.pea)}. Un seul secteur, sensible aux taux.`,
        etapes: [
          `Option rapide : vendre ${eur(aVendre)} de cet ETF et racheter un ETF Monde éligible PEA (arbitrage dans le PEA = pas d'impôt).`,
          `Option sans vendre : ${eur(flux)} de nouveaux versements hors Banques, soit ${Math.ceil(flux / versement)} mois à ${eur(versement)}/mois.`,
        ],
      });
    }
  }

  // AV BNP : poche thématique Tech.
  const av = M.pos.av_bnp;
  if (av?.lignes && s.av_bnp) {
    const tech = av.lignes.find((l) => /disruptive/i.test(l.nom));
    const cible = 0.05;
    if (tech && tech.poids > cible + 0.02) {
      out.push({
        niveau: "moyenne", zone: "Assurance-vie",
        titre: `AV BNP : Disruptive Technology ${pct(tech.poids)} → ${pct(cible)}`,
        constat: `≈ ${eur(tech.poids * s.av_bnp)} sur un fonds thématique (frais courants ~1,5-2 %).`,
        etapes: [
          `Arbitrer ${eur((tech.poids - cible) * s.av_bnp)} vers BNPP Easy MSCI World SRI (déjà au contrat) depuis l'espace BNP › Assurance-vie › Arbitrage.`,
          `Arbitrage interne à l'AV : pas d'impôt, l'antériorité fiscale est conservée.`,
        ],
      });
    }
  }

  // Budget : catégories au-dessus du budget sur 3 mois.
  const recent = M.last(3);
  const over = Object.entries(M.budget.categories || {})
    .filter(([cat]) => cat !== "❓ Exceptionnel")
    .map(([cat, b]) => ({ cat, b, moy: sum(recent, (m) => Math.max(0, M.catNet(m, cat))) / recent.length }))
    .filter((x) => x.b > 0 && x.moy > x.b * 1.3)
    .sort((a, b) => (b.moy - b.b) - (a.moy - a.b))
    .slice(0, 3);
  if (over.length) {
    out.push({
      niveau: "moyenne", zone: "Budget",
      titre: `${over.length} catégorie${over.length > 1 ? "s" : ""} au-dessus du budget (3 derniers mois)`,
      constat: `Dépassement moyen cumulé : ${eur(sum(over, (x) => x.moy - x.b))}/mois.`,
      etapes: over.map((x) => `${x.cat.replace(/^\S+\s+/, "")} : ${eur(x.moy)}/mois pour ${eur(x.b)} budgétés (+${eur(x.moy - x.b)}).`),
      lien: "#/depenses",
    });
  }

  // Plan d'action : priorités hautes encore ouvertes.
  for (const a of M.plan.actions || []) {
    if (a.priorite === "haute" && !/fait|sans objet/i.test(a.statut || "")) {
      out.push({ niveau: "plan", zone: "Plan d'action", titre: a.action, constat: `${a.statut} · ${a.echeance}`, etapes: a.impact ? [a.impact] : [] });
    }
  }
  const order = { haute: 0, moyenne: 1, plan: 2, info: 3 };
  return out.sort((a, b) => order[a.niveau] - order[b.niveau]);
}
