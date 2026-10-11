> Historique de conception : les descriptions de mise en page et de validation ci-dessous correspondent à des étapes antérieures. Voir `diagnostic-client-v5.md` pour le contrat courant et le bilan complet avant PR.

# Finition client v3

La confirmation visuelle du rang est distincte du rang fournisseur. La case « Rang organique confirmé visuellement (pas une annonce) » et sa date enregistrent `observedData.organicConfirmation`, avec source opérateur, fiabilité certaine et périmètre exact (rang, requête, date de recherche, lieu). Une confirmation sans date valide, antérieure au test, future ou rattachée à une autre recherche n'est pas utilisable. La décocher la révoque. Elle ne change aucun point du score.

Dans le PDF, aucun badge n'est affiché sans cette confirmation. Le rang connu est formulé sobrement, avec sa requête et sa date. Avec confirmation valide, la classification correspond au rang réel : A pour le rang 1, pas A pour tous les rangs. Le fournisseur conserve son contrat organic/observed en interne.

La page 1 n'imprime chaque mesure qu'une fois, avec son repère calculé ; les sources sont regroupées par section. Les mentions méthodologiques supprimées et le vocabulaire de profil indéterminé sont bloqués dans les blocs client et dans la surface finale du rapport. Les détails demeurent accessibles dans le back-office et les JSON internes. La page 2 contient une seule réserve de comparaison, en bas de page, et le détail de ce que mesure le domaine Photos.

Les trois priorités partagent un gabarit typographique. Le constat de réponses aux avis distingue un décompte complet et un échantillon. Une absence certaine autorise « Aucune réponse visible aux avis récents ». Le choix historique « Rarement / jamais » ne permet pas d'affirmer zéro réponse : Sarland affiche « Des avis récents restent sans réponse ». Aucun « ou » ni « contrôlés » n'est accepté dans ce constat par le lint.

Les autres actions proviennent uniquement des contrôles connus à améliorer, hors priorités déjà présentées ; au maximum sept titres sont affichés. Aucun contrôle non vérifiable ne sert à inventer une action.

## Rejeu Sarland

`node scripts/render-diagnostic-evidence-controls.mjs --real-sarland --v3`

Le snapshot `output/sarland-reel/finalisation-reelle.json` est lu sans modification. Toutes les API métier sont interceptées localement. Les deux sorties viennent du vrai `telechargerPDF` (préparation, lint, html2canvas, jsPDF), pas de l'impression navigateur.

- `diagnostic-sarland-v3.pdf` : sans case cochée.
- `diagnostic-sarland-v3-profil-a.pdf` : case cochée par le script de test du parcours. Ce n'est pas une nouvelle vérification publique ni une attestation fournie par l'opérateur réel. L'annexe de contrôle JSON le précise.

La branche reste locale, sans commit, push, déploiement ou envoi.
