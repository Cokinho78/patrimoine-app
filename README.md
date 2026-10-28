# patrimoine-app

Tableau de bord patrimoine & dépenses (écran ordinateur + mobile) : patrimoine net, enveloppes,
dépenses par mois › catégorie › marchand › transaction, actions chiffrées,
projet immo (cockpit, annonces notées, fiche + simulateur LMNP, marché DVF/ANIL, veille).

Code uniquement — les données vivent dans un repo privé séparé (`patrimoine-data`), lues via l'API
GitHub avec un token fine-grained **Contents : Read-only** stocké dans le navigateur.

- Pas de build : HTML + modules JS, aucune dépendance. Hébergé sur GitHub Pages.
- CSP stricte : le token ne peut partir que vers `api.github.com`.
- Dev local : `python3 dev/mock_github.py <copie de patrimoine-data>` puis
  `http://localhost:8787/?api=http://localhost:8787/api` (n'importe quel token).

Workflow (flux de données, synchro, boucles métier) : `docs/workflow.html`.
