# Draft: r/quebec beta announcement

Status: draft only. Confirm the current subreddit rules while logged in and complete the post-deploy smoke check before posting.

## Proposed title

`[Bêta] pannes.ca : explorer les pannes observées près d'une adresse au Québec`

## Proposed post

Bonjour,

J'ai construit [pannes.ca](https://pannes.ca), un prototype indépendant d'intérêt public qui rassemble le flux public Info-pannes de Hydro-Québec et les observations que le site a réussi à conserver au fil du temps.

Le site permet de chercher une adresse ou un lieu au Québec pour voir :

- les pannes en cours et les interruptions planifiées publiées par Hydro-Québec;
- les pannes que pannes.ca a observées et conservées dans un rayon de 5 km;
- certains documents obtenus par demandes d'accès à l'information, lorsqu'ils sont disponibles.

Quelques limites importantes :

- pannes.ca n'est ni officiel ni affilié à Hydro-Québec;
- l'archive est incomplète et commence avec la collecte de pannes.ca; une absence de résultat ne prouve pas qu'il n'y a jamais eu de panne;
- les polygones et les correspondances à proximité sont approximatifs; le résultat n'est pas une preuve pour une adresse exacte;
- les flux publics peuvent changer ou contenir des anomalies.

La page [À propos et confidentialité](https://pannes.ca/about?lang=fr#privacy) explique aussi le traitement des recherches d'adresse, de la position du navigateur, du stockage local et des journaux. Aucun compte n'est requis.

Je cherche surtout des retours sur les points suivants :

- Est-ce que les limites de l'archive sont assez claires?
- Est-ce que la carte et le panneau sont faciles à utiliser sur téléphone?
- Est-ce que les résultats semblent cohérents pour les régions, petites municipalités et adresses rurales?
- Quelles formulations ou données risquent d'être mal interprétées?

Le code source est public : [github.com/dlq/pannes-historiques](https://github.com/dlq/pannes-historiques).

Merci pour les essais et les signalements de résultats étranges.

## Pre-post checklist

- Confirm `r/quebec` self-promotion, title, flair, and source-link rules while logged in.
- Confirm production serves the `v0.4.2` service-worker marker and current static modules.
- Re-run homepage, representative search, privacy page, and private-endpoint smoke checks after deployment.
- Keep the framing as a beta feedback request; do not describe the archive as complete or official.
