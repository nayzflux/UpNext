# Exploiter UpNext avec Docker

## Configuration et HTTPS

Utiliser Node 24, Bun 1.4.0 et Docker Compose. Copier `.env.production.example` vers `.env.production`, puis remplacer tous les exemples. L'API lit les variables au démarrage avec `@t3-oss/env-core`. `DATABASE_URL` et `APP_URL` sont des chaînes non vides : leur format URL, leur protocole, leur domaine et le mot de passe PostgreSQL ne sont pas validés par le parseur. Le secret d'authentification doit contenir au moins 32 caractères et ne pas être une valeur d'exemple en production. Configurer `APP_URL` avec l'origine publique exacte, sans chemin. Encoder le mot de passe dans `DATABASE_URL_DOCKER` lorsqu'il contient des caractères réservés.

Placer le frontend derrière un reverse proxy HTTPS. Conserver son port sur `127.0.0.1` si le proxy tourne sur le même hôte. Ne publier ni l'API ni PostgreSQL. Le proxy doit **remplacer** `X-Real-IP` par l'adresse du client : Better Auth utilise cet en-tête pour ses quotas, conservés dans PostgreSQL. Un en-tête fourni par le navigateur ne doit jamais être relayé tel quel. Pour un proxy dans un autre réseau, adapter l'adresse d'écoute et le pare-feu. Les cookies de session sont Secure, HttpOnly et SameSite=Lax.

Configurer un SMTP transactionnel avec `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` et les deux identifiants `SMTP_USER`/`SMTP_PASSWORD` ensemble. Utiliser `SMTP_SECURE=true` pour TLS immédiat, généralement sur 465 ; utiliser `false` pour STARTTLS, généralement sur 587. Vérifier la configuration demandée par le fournisseur, ainsi que SPF, DKIM et DMARC pour le domaine expéditeur. Les confirmations et récupérations de mot de passe dépendent de ce service.

## Construire et démarrer

Choisir un identifiant de version unique pour `UPNEXT_IMAGE_TAG`, par exemple le SHA du commit. Garder les images de la version précédente.

```powershell
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d --wait
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail 100 api web
```

L'API applique les migrations avant de démarrer. Le frontend attend l'API. Le contrôle `/health` renvoie 200 lorsque PostgreSQL répond, 503 sinon, et interdit la mise en cache. Il reste interne au réseau Docker ; son état est visible dans `compose ps`. Une migration en échec empêche le démarrage : examiner les logs avant toute autre opération. Ne pas modifier une migration déjà appliquée.

Avant une mise à jour, sauvegarder la base et vérifier la restauration sur une base séparée. Cette version ajoute seulement la table des quotas d'authentification. Elle ne retire aucune colonne ni donnée métier.

## Sauvegarder et restaurer

Exemple pour les noms de base et d'utilisateur `upnext` ; adapter ces valeurs à la configuration. Écrire le dump dans le conteneur puis le copier évite de corrompre le fichier binaire avec une redirection PowerShell.

```powershell
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_dump -U upnext -d upnext -Fc -f /tmp/upnext.dump
docker compose --env-file .env.production -f compose.production.yaml cp postgres:/tmp/upnext.dump ./upnext.dump
```

Conserver les sauvegardes chiffrées hors de l'hôte, avec une rétention et des tests de restauration réguliers. Elles contiennent les données privées des comptes.

Restaurer d'abord dans une **nouvelle base**, jamais par-dessus la base active :

```powershell
docker compose --env-file .env.production -f compose.production.yaml cp ./upnext.dump postgres:/tmp/upnext.dump
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres createdb -U upnext upnext_restore
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres pg_restore -U upnext -d upnext_restore --no-owner --exit-on-error /tmp/upnext.dump
```

Vérifier les comptes, tâches, séances, bilans et migrations dans cette base. Pour une reprise réelle, arrêter les écritures en arrêtant `web` et `api`, puis faire pointer `DATABASE_URL_DOCKER` vers la base restaurée et redémarrer. Préserver l'ancienne base pendant la vérification. Arrêter avec `compose stop` ou `compose down` ; ne pas utiliser `down --volumes` sur des données à conserver.

## Revenir à une version précédente

Remettre l'ancien `UPNEXT_IMAGE_TAG` dans `.env.production`, puis exécuter :

```powershell
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build --wait
```

Cette commande utilise les anciennes images locales sans les reconstruire. Une migration additive compatible peut rester en place. Pour une future migration incompatible, restaurer la sauvegarde préalable dans une base séparée ; cette opération perd les écritures réalisées depuis la sauvegarde. Ne pas improviser de migration inverse. Vérifier l'authentification, les emails et le planning après tout retour de version.

## Validation reproductible

```powershell
bun install --frozen-lockfile
bunx playwright install chromium webkit
bun run validate:production
```

Le script construit les deux images, démarre le projet isolé `upnext-validation` derrière Caddy HTTPS (`https://localhost:3443`), utilise Mailpit sur `http://localhost:8026` et lance Chrome desktop, Chrome Android et WebKit iPhone. Il vérifie les cookies, les origines, les quotas derrière proxy et les caches de la PWA, puis sauvegarde/restaure une base séparée, redémarre les services et coupe PostgreSQL pour tester le 503 et la récupération. Le certificat local est accepté uniquement par ces tests. Aucun fournisseur SMTP public n'est contacté.

Le script arrête son propre projet à la fin et conserve son volume isolé pour inspection et validation des migrations sur une base existante. Les données locales de développement restent dans leur volume initial. Les captures responsive sont dans `.artifacts/qa`, le bilan machine dans `.artifacts/production-validation.json` et les traces dans `test-results`. Ces fichiers et les identifiants de test ne sont pas versionnés.

GitHub Actions exécute le typage, le lint, les tests unitaires et PostgreSQL, le build, puis cette validation Docker sur une base vide. `E2E_BASE_URL`, `E2E_MAILPIT_URL`, `E2E_EXTERNAL_SERVER` et `E2E_HTTPS_IGNORE_ERRORS` permettent aussi d'utiliser les mêmes parcours avec une pile externe de test.

## Dépendances

Next.js est corrigé en 16.3.6 et esbuild en 0.28.2. L'avis [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerne `braces` dans les outils de développement ESLint/shadcn ; aucune version corrigée n'est publiée au moment de cette préparation. Ces outils ne font pas partie des images d'exécution. La CI ignore uniquement cet identifiant, toutes les autres vulnérabilités restent bloquantes. Réexaminer cette exception à chaque mise à jour des outils et retirer l'exception dès qu'une correction est disponible.

Le déploiement sur un serveur public, les certificats publics et l'envoi par un fournisseur SMTP réel restent à vérifier sur l'infrastructure choisie.
