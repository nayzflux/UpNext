# Préparation à la production — 5 octobre 2026

La cible vérifiée est la pile Docker, derrière un proxy HTTPS local avec Mailpit. Le déploiement public et le fournisseur SMTP réel restent hors périmètre.

## Corrections livrées

- Recherche des tâches dans le titre, les notes et les tags, avec gestion des accents.
- Choix d'une séance commencée pour un bilan, ou travail sans réservation ; annulation des séances futures lorsque la tâche atteint 100 %, avec conservation des bilans.
- Déplacements du calendrier au clavier corrigés lorsque la page défile ; déplacement et redimensionnement toujours disponibles par formulaire sur mobile.
- Protection des formulaires modifiés, prévention des doubles enregistrements, conservation des saisies après une erreur réseau et indication d'une session expirée.
- Menu mobile modal avec gestion du focus, fermeture accessible des éditeurs, champs mobiles sans zoom automatique et prise en compte des zones sûres.
- Retour à la ligne des titres et tags longs ; cartes de tâches aux largeurs intermédiaires ; lisibilité des séances courtes et contraste des badges de priorité.
- Refus des configurations de production incorrectes, cookies HTTPS, origine publique contrôlée, quotas d'authentification conservés en PostgreSQL et adresse client fournie par le proxy.
- Contrôle de santé PostgreSQL avec réponse 503 ; récupération après fermeture des connexions inactives sans arrêt de l'API.
- Mise à jour de Next.js et esbuild, images de version identifiables pour le retour arrière, CI et guide d'exploitation.
- Déclaration ESM du frontend, avec collecte des tests vérifiée sur Node 24.21 Linux ; contrôle de collecte ajouté à la CI avant le build.

## Vérifications

| Contrôle                                 | Résultat                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Typage et lint                           | Réussis                                                                                                                                   |
| Tests unitaires                          | 65 réussis                                                                                                                                |
| Intégration PostgreSQL                   | 22 réussis                                                                                                                                |
| Build API et frontend                    | Réussi                                                                                                                                    |
| Suite navigateur complète derrière HTTPS | 22 réussis : Chrome desktop, Chrome Android et WebKit iPhone                                                                              |
| Régressions visuelles finales            | Calendrier, responsive et parcours tactiles revérifiés sur les images finales                                                             |
| Responsive                               | 80 captures : quatre écrans, cinq largeurs (320, 390, 768, 1024, 1440), deux thèmes, données vides et renseignées                         |
| Contenu difficile                        | Titres, notes sans espaces, tags longs, plusieurs séances et événement ; colonnes sans empiètement et pas de débordement global           |
| Clavier et tactile                       | Focus, menu, éditeurs, déplacements desktop, planification mobile et bilans                                                               |
| Métier                                   | Isolation des comptes, conflits et écritures concurrentes, bilans tardifs, 100 %, fuseaux et changements d'heure                          |
| Sécurité HTTPS                           | Cookies Secure/HttpOnly/SameSite, refus des origines étrangères, en-têtes de protection et quota résistant aux adresses client falsifiées |
| PWA                                      | Seule la page hors connexion est mise en cache ; aucune donnée privée disponible hors ligne                                               |
| Docker et migrations                     | Construction, démarrage sur base vide, migration du schéma précédent avec compte existant                                                 |
| Exploitation                             | Sauvegarde/restauration comparée, arrêt propre, persistance après redémarrage, coupure PostgreSQL et récupération 503 → 200               |

Les parcours mobiles utilisent l'émulation tactile des moteurs de navigateur ; ils ne remplacent pas une vérification sur des téléphones physiques. Les captures automatiques sont complétées par une revue visuelle des états représentatifs, notamment les textes longs et les cartes courtes.

## Limites restantes

L'avis `GHSA-vfj7-8cjw-p6xm` sur `braces` reste sans correction publiée et concerne uniquement les outils de développement ESLint/shadcn. L'absence de ces outils et de `braces` dans les images d'exécution a été vérifiée. L'exception CI est limitée à cet identifiant et doit être réexaminée lors des mises à jour.

Le domaine public, les certificats publics, le reverse proxy du serveur et la délivrabilité SMTP doivent être vérifiés sur l'infrastructure choisie. Le [guide d'exploitation](production.md) décrit la configuration, les sauvegardes, la restauration et le retour à une version précédente.

La CI GitHub Actions reproduit les vérifications sur Linux. Ses exécutions et leurs artefacts constituent le suivi après publication du commit.
