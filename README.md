# UpNext

Un dashboard d’organisation étudiante en français : tâches, calendrier, séances de travail et bilans. Chaque compte possède ses données privées. Aucun tag n’est créé à l’inscription.

## Lancer en local

Prérequis : **Node.js 24**, **Bun 1.4.0** et **Docker Compose**.

```powershell
Copy-Item .env.example .env
bun install --frozen-lockfile
docker compose up -d --wait
bun run db:migrate
bun run dev
```

- Application : <http://localhost:3000>
- API Hono : <http://localhost:3001/health>
- Emails de développement : <http://localhost:8025>
- PostgreSQL : `localhost:5433`, base/utilisateur/mot de passe `upnext`.

Créer un compte dans l’application, puis ouvrir son email de confirmation dans Mailpit. Mailpit capture les emails localement ; aucun service externe n’est nécessaire. Le compte démarre avec zéro tâche, zéro tag et zéro disponibilité. Les liens de récupération du mot de passe arrivent également dans Mailpit.

Le fichier `.env` à la racine configure les deux applications. `APP_URL` désigne l’origine du frontend ; `API_URL` est l’adresse interne de Hono. Le navigateur passe toujours par les chemins `/api` du frontend. Ne pas utiliser `127.0.0.1` à la place de `localhost` sans modifier `APP_URL`, car les cookies et les contrôles d’origine suivent cette valeur.

Les données PostgreSQL sont conservées dans un volume Docker. `docker compose stop` arrête les services sans effacer les données.

### Démonstration facultative

Après avoir inscrit un **compte vide** :

```powershell
bun run db:demo ton-adresse@exemple.fr
```

Cette commande ajoute cinq tâches, quatre séances dont un bilan et une séance à confirmer, un événement hebdomadaire et des disponibilités. **Elle ne crée aucun tag.** Elle refuse de s’exécuter sur un compte contenant déjà des tâches, séances ou événements.

### Build et exécution de production

```powershell
bun run build
bun run --filter @upnext/api start
# Dans un second terminal :
bun run --filter @upnext/web start
```

Appliquer les migrations avant le démarrage. Pour utiliser un SMTP externe, renseigner les variables `SMTP_*`. Remplacer le secret Better Auth de développement avant toute utilisation publique. Aucun hébergeur n’est requis.

## Utilisation

- **Aujourd’hui** rassemble les séances, les échéances, les retards, les bilans en attente et la charge à placer.
- **Mes tâches** permet la recherche, le tri et les filtres par tag, priorité, échéance, avancement et couverture du planning. « Sans tag » est seulement un filtre.
- **Calendrier** propose les vues jour, semaine et mois. Sur mobile, la vue jour remplace la semaine. Cliquer dans la grille ou sur le bouton de planification ouvre le formulaire. Les séances peuvent être déplacées et redimensionnées ; le formulaire permet les mêmes opérations au clavier, avec une précision à la minute.
- **Paramètres** gère les disponibilités, le fuseau IANA, le thème et les tags.

Les formulaires s’ouvrent dans un modal centré. Le calendrier affiche toute sa hauteur dans la page, sans défilement interne. La plage affichée s’adapte aux séances et événements, avec un bouton pour déplier les 24 heures. Les cartes se placent par pas de quinze minutes : l’aperçu occupe exactement la durée choisie et la largeur disponible au point de dépôt. La poignée de redimensionnement ajuste directement la carte, sans la remplacer. Échap annule le déplacement ; les flèches du clavier déplacent d’un quart d’heure ou d’un jour.

Pour créer un tag, saisir un nom dans la tâche puis choisir `Créer « nom »`. Les espaces superflus, la casse et les formes Unicode équivalentes ne créent pas de doublons. Les tags sont réutilisables et propres au compte. Les renommer actualise toutes les associations ; les supprimer conserve les tâches.

Une réservation de 50 % sur une tâche estimée à quatre heures dure deux heures. Le pourcentage réservé est recalculé à partir de la durée ; changer l’estimation ne déplace jamais une séance. Les échéances sans heure sont fixées à 23 h 59 dans le fuseau du compte.

Après une séance, renseigner le début réel, les minutes travaillées et le pourcentage **total** atteint. On peut déclarer une séance manquée, enregistrer du travail sans réservation et corriger le dernier bilan d’une tâche. Une séance passée reste « À confirmer » tant qu’aucun bilan n’est enregistré.

### Calculs

```text
Reste à faire = estimation totale × (1 − avancement / 100)
À planifier = max(0, reste à faire − durée des séances planifiées non terminées)
Estimation proposée = temps réellement travaillé / (avancement / 100)
```

Le reste à faire est arrondi à la minute supérieure. La proposition est arrondie aux cinq minutes supérieures et apparaît uniquement entre 10 % et 99 % d’avancement, après au moins trente minutes de travail, si elle dépasse l’estimation actuelle d’au moins 25 %. Elle reste modifiable et facultative. À 100 %, les futures séances sont annulées avec conservation de l’historique.

Exemple : quatre heures estimées, 25 % réalisés en 90 minutes et une séance future d’une heure donnent trois heures restantes et deux heures à planifier. Accepter la réévaluation à six heures porte le reste estimé à quatre heures trente, sans modifier la séance réservée.

Les suggestions sont déterministes et calculées à la demande : huit semaines de travail réel, pondération favorisant les semaines récentes, disponibilités libres sur vingt-huit jours au maximum et avant l’échéance. Trois bilans réalisés sont nécessaires pour afficher une habitude ; sinon les créneaux sont présentés comme de simples disponibilités. Aucune modification du planning n’est automatique. Les conflits sont revérifiés lors de l’enregistrement.

Les événements hebdomadaires conservent leur heure locale et leur fuseau d’origine. Les modifications concernent toute la série. Une occurrence dans l’heure inexistante du passage à l’heure d’été est omise ; la saisie directe de cet horaire est refusée. Pendant l’heure répétée en automne, la conversion suit `date-fns-tz` ; les instants enregistrés et les durées restent en UTC.

## Architecture

```text
apps/web                  Next.js App Router, pages SSR et composants interactifs
  src/components/editors  Formulaires et détail des tâches
  src/components/ui       Composants du registre officiel shadcn, base-nova / Base UI
apps/api                  Hono, Better Auth, procédures oRPC, Drizzle
  src/mutations.ts        Transactions et vérification des propriétaires
  src/db                  Schéma, migrations et démonstration facultative
packages/contracts        Contrats oRPC, validations Zod, calculs purs
tests/e2e                 Parcours navigateur Playwright
```

Le backend est constitué de fonctions, sans classes métier ni couche générique de repositories. Les écritures prennent un verrou transactionnel PostgreSQL par utilisateur : les contrôles de chevauchement et les bilans restent cohérents entre deux onglets. Les révisions détectent les modifications périmées ; l’identifiant de requête d’un bilan empêche sa double validation. Les clés étrangères des associations tâche-tag incluent le propriétaire.

Next vérifie la session côté serveur et transmet les cookies à Hono. Chaque rendu serveur crée son propre cache TanStack Query, puis l’hydrate dans le navigateur. TanStack Form gère les formulaires de compte et de tâche, TanStack Table la liste, dnd-kit les déplacements. Les variables sémantiques shadcn définissent les thèmes crème/sauge et sombre. Manrope est servie localement.

## Vérification

```powershell
bun run typecheck
bun run lint
bun run test

# Une fois, créer la base isolée des tests d’intégration :
docker compose exec -T postgres psql -U upnext -d postgres -c "CREATE DATABASE upnext_test"
bun run test:integration

bunx playwright install chromium
bun run test:e2e
bun run build
```

`TEST_DATABASE_URL` doit se terminer par `_test`. Les tests d’intégration appliquent les migrations et suppriment uniquement leurs propres comptes à la fin. Ils couvrent l’isolation, les associations, les révisions, les validations concurrentes, les conflits et l’annulation à 100 %.

Les tests navigateur utilisent PostgreSQL et Mailpit démarrés localement. Ils lancent `bun run dev` si nécessaire et créent des comptes `e2e-…@upnext.local`, sans modifier les autres comptes. Les traces des échecs et le rapport se trouvent dans `test-results` et `playwright-report`. Les tests métier couvrent les calculs, les suggestions et les changements d’heure.

Les versions résolues sont verrouillées dans `bun.lock`. Après une modification du schéma : `bun run db:generate`, relire la migration produite, puis `bun run db:migrate`.

## Périmètre V1

Planification manuelle, comptes privés, tags libres, événements ponctuels/hebdomadaires, bilans et suggestions. Les tâches récurrentes, le partage, les agendas externes, les notifications push, le chronomètre et la replanification automatique sont exclus. Le dashboard charge les données du compte en une réponse pour garder cette première version simple ; une pagination serveur pourra être ajoutée si le volume le justifie.

