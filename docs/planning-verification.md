# Vérification du plan — 6 octobre 2026

Audit de la version locale à partir de `d4e3de6`, puis des corrections de cet audit. Les six commits initiaux sont présents.

| Demande                               | Comportement vérifié                                                                                                                                                                                                                               | Couverture                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Masquer « Planifier » à 100 %         | Les listes, détails et sélecteurs utilisent `canPlanTask`, avec tolérance aux arrondis. Les réservations existantes restent modifiables.                                                                                                           | Calculs unitaires, `planning-improvements`, `planning-percentages`    |
| Tâches sans estimation                | Création/modification acceptent un champ vide. L'API exige une part explicite pour les séances. Durées inconnues, totaux et backlog sont distincts des durées connues. Une estimation ajoutée ou retirée ne change pas les parts réservées.        | Contrats, calculs, mutations PostgreSQL, `planning-improvements`      |
| Glisser-déposer sans estimation       | Le dépôt propose 30 minutes ajustables et demande le pourcentage avant l'enregistrement.                                                                                                                                                           | `planning-improvements`                                               |
| Lieux des calendriers externes        | `LOCATION` est lu dans l'ICS, avec héritage et remplacement pour les exceptions récurrentes. Le détail conserve le lieu même pour une carte courte.                                                                                                | Tests ICS, `imported-locations`                                       |
| Bilans avant la séance                | Les séances futures sans bilan sont proposées. Les horaires prévus restent intacts et le travail réel est placé dans le passé. Une séance future non effectuée doit être annulée.                                                                  | Mutations PostgreSQL, `planning-improvements`, `task-search-and-logs` |
| Fluidité des bilans                   | Le choix de séance et « Continuer sans réservation » restent disponibles. Durée et avancement sont préremplis ; les corrections reprennent les valeurs enregistrées. Réestimations, protection des saisies et doubles soumissions sont conservées. | Mutations PostgreSQL, parcours de bilan, responsive et tactile        |
| « Faire le bilan » dans le calendrier | Le menu contextuel ouvre le bilan d'une séance future avec ses valeurs prévues.                                                                                                                                                                    | `calendar-filters-actions`                                            |
| Calendrier à gauche, liste à droite   | L'ordre du DOM est calendrier puis backlog ; le mobile conserve cet ordre vertical. Vues jour/semaine/mois et filtres restent utilisables.                                                                                                         | `planning-improvements`, interactions calendrier et responsive        |
| Création depuis le calendrier         | « Nouvelle tâche » est dans l'en-tête, disponible dans toutes les vues et filtres, et absent du backlog.                                                                                                                                           | `planning-improvements`                                               |
| Sidebar simplifiée                    | Tags, bouton de création et résumé de planification sont retirés.                                                                                                                                                                                  | `planning-improvements`                                               |
| Compte PC/mobile                      | Le profil PC regroupe identité, compte, paramètres et déconnexion. Le mobile utilise le panneau « Compte », sans profil redondant dans le menu latéral. Navigation clavier et formulaires non enregistrés sont protégés.                           | `planning-improvements`, authentification et parcours tactile         |

## Écarts corrigés pendant l'audit

- Aujourd'hui conservait « Ajouter » actif sans aucune tâche encore planifiable : le bouton est maintenant désactivé dans ce cas.
- Le menu latéral mobile affichait également le profil PC : cet accès redondant est maintenant masqué.
- Une tâche non estimée affichait « Non estimée restantes » sur mobile : le suffixe est désormais réservé aux durées connues.
- Le bilan arrondissait une part réservée au dixième : une part de 12,25 % est maintenant préremplie à 12,25 % et conservée lors d'une correction.
- Un callback de survol retardé pouvait recréer l'aperçu après l'annulation d'un déplacement : les callbacks sont maintenant ignorés quand le glisser-déposer est terminé. Le contrôle clavier répète trois fois le déplacement puis Échap sans modifier la réservation.

## Vérifications complémentaires

Le test PostgreSQL applique la migration `0006_stiff_sabra.sql` sur une table temporaire contenant une estimation de 90 minutes : la valeur est préservée et une nouvelle valeur `NULL` est acceptée. Les données applicatives ne sont pas modifiées par ce test.

Le parcours des lieux utilise un véritable flux ICS passé dans le parseur de l'application, puis une réponse de calendrier simulée pour l'interface. Il vérifie une carte longue, un événement court, les détails PC/mobile et un événement de journée entière dans Aujourd'hui, sans contacter de calendrier externe.

Validation finale : 77 tests unitaires, 27 tests d'intégration PostgreSQL et 24 parcours fonctionnels Chromium PC/Android validés. Les contrôles corrigés ont été rejoués ; l'annulation au clavier a passé six cycles répartis sur deux exécutions. Le contrôle responsive couvre 320, 390, 768, 1024 et 1440 px dans les thèmes clair et sombre. TypeScript, lint et les builds API/frontend passent également.

L'audit concerne la version locale du dépôt. Il ne prouve pas qu'une installation distante a été reconstruite ou redéployée.
