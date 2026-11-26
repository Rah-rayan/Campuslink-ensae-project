# CampusLink

Plateforme d'entraide entre étudiants.

| Espace | Ce qu'on y fait |
|---|---|
| **Entraide** | Chercher par matière un tuteur, un relecteur ou des coéquipiers ; annuaire ; suggestions d'échanges dans les deux sens |
| **Demandes** | Accepter ou refuser, échanger les contacts, noter la séance |
| **Groupes et projets** | Tâches réparties (à faire, en cours, terminé), avancement, brouillons partagés |
| **Bibliothèque** | Fax, fiches, résumés, annales, vidéos et liens, par classe et matière ; vote « utile » et signalement |
| **Classement** | Points et 3 badges |
| **Modération** | Signalements, code d'invitation, classes et matières |

**Technique :** le site (dossier `site/`, HTML, CSS et JavaScript sans compilation) est hébergé par **GitHub Pages**. Les comptes, la base de données et les fichiers sont chez **Supabase**. GitHub Pages seul ne peut pas stocker de données : les deux sont nécessaires.

---

## Installation (environ 20 minutes)

### 1. Créer la base de données
1. Créez un compte et un projet sur <https://supabase.com> (offre gratuite).
2. Ouvrez **SQL Editor > New query**, collez tout le contenu de `supabase/01_installation.sql`, cliquez sur **Run**.
3. Le résultat affiche le **code d'invitation**. Notez-le.

Ce fichier s'exécute une seule fois, sur un projet neuf.

### 2. Ajouter vos classes et matières
Les classes et matières de `supabase/02_classes_matieres.sql` sont des **exemples**. Adaptez-les, puis exécutez le fichier dans le SQL Editor.

### 3. Régler l'inscription
Dans **Authentication > Sign In / Providers > Email**, désactivez **Confirm email**.

Pourquoi : sans serveur d'envoi à vous, Supabase n'envoie des e-mails qu'aux membres de l'équipe du projet, et très peu par heure. Les étudiants resteraient bloqués. Le code d'invitation protège déjà l'accès.

Conséquence : « Mot de passe oublié » ne fonctionnera qu'après avoir configuré un serveur d'envoi ([guide SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). Vous pourrez alors réactiver la confirmation.

### 4. Relier le site à la base
Dans Supabase, bouton **Connect** (ou **Project Settings > API Keys**), copiez l'adresse du projet et la clé **publishable**, puis remplissez `site/config.js` :

```js
window.CAMPUSLINK_CONFIG = {
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  supabaseKey: 'sb_publishable_...',
};
```

> La clé *publishable* peut être publique. La clé **secrète** (`sb_secret_...` ou `service_role`) ne doit **jamais** aller sur GitHub.

### 5. Envoyer sur GitHub
Créez un dépôt **public** et vide sur GitHub (par exemple `campuslink`). Décompressez l'archive, ouvrez un terminal dans le dossier `campuslink`, puis :

```bash
git init -b main
git add .
git commit -m "Première version de CampusLink"
git remote add origin https://github.com/VOTRE-COMPTE/campuslink.git
git push -u origin main
```

Utilisez Git (ou GitHub Desktop) plutôt que le glisser-déposer du site : le dossier caché `.github` risque d'être oublié.

### 6. Activer la publication
Dans le dépôt : **Settings > Pages > Build and deployment > Source : GitHub Actions**.
Puis onglet **Actions** > « Tester et déployer CampusLink » > **Run workflow** (ou relancez l'exécution qui a échoué).

Le site sera à l'adresse `https://VOTRE-COMPTE.github.io/campuslink/`.

### 7. Déclarer l'adresse du site
Dans Supabase, **Authentication > URL Configuration** :
- **Site URL** : `https://VOTRE-COMPTE.github.io/campuslink/`
- **Redirect URLs** : `https://VOTRE-COMPTE.github.io/campuslink/**`

### 8. Créer le premier modérateur
Inscrivez-vous **depuis le site** avec le code d'invitation (un compte créé depuis le tableau de bord Supabase serait refusé, faute de code). Puis, dans le SQL Editor :

```sql
update public.profils set role = 'moderateur'
where id = (select id from auth.users where email = 'votre-adresse@exemple.com');
```

Rechargez le site : le menu **Modération** apparaît (sur téléphone, en haut).

---

## Règles de fonctionnement

**Score de confiance** (par personne et par matière) :

```
score = (3 × auto-évaluation + somme des notes des pairs) / (3 + nombre de pairs)
```

L'auto-évaluation compte comme 3 avis. Chaque évaluateur ne compte qu'une fois (moyenne de ses notes). Sans avis, le trait est hachuré (« auto-évaluation seule »).

**Points**

| Action | Points | Limite |
|---|---|---|
| Partager un document | +5 | 5 partages récompensés par 24 h |
| Recevoir un vote « utile » | +2 | retiré si le vote est annulé |
| Séance d'aide notée | +10 | une fois par semaine pour la même paire |
| Séance notée 4 ou 5 | +5 | en plus |

**Badges :** Contributeur (5 documents), Tuteur (3 personnes différentes ont noté 4 ou 5), Pilier de la promo (100 points).

Ces limites freinent la triche sans l'empêcher totalement.

## Sécurité et données personnelles
- Un visiteur non connecté ne lit rien.
- Les contacts ne sont visibles qu'entre deux personnes liées par une demande acceptée ou terminée.
- Un groupe, ses tâches et ses fichiers ne sont visibles que par ses membres.
- Chacun peut se retirer de la recherche (son nom reste visible sur ses documents, avis et groupes).
- Les points, avis et rôles ne peuvent pas être modifiés depuis le navigateur.
- Changez le code d'invitation (page Modération) s'il circule hors de l'école.
- Pour supprimer un compte : **Authentication > Users** dans Supabase. Ses fichiers restent dans **Storage** et se suppriment à part.

La plateforme traite des données personnelles d'étudiants. Au Sénégal, la loi n° 2008-12 s'applique : avant l'ouverture à toute l'école, demandez l'accord de l'administration et vérifiez les formalités auprès de la **CDP** (Commission de protection des données personnelles).

## Limites de l'offre gratuite Supabase
- 500 Mo de base, 1 Go de fichiers, 5 Go de trafic.
- Le projet est **mis en pause après une semaine sans activité** (à relancer depuis le tableau de bord).
- CampusLink limite chaque fichier à 10 Mo. Pour les vidéos, partagez un lien.

Voir les [tarifs à jour](https://supabase.com/pricing).

## Travailler à plusieurs

```
site/                      le site publié
  config.js                connexion à Supabase
  js/pages/                une page = un fichier
  css/style.css
supabase/                  base de données et règles de sécurité
tests/                     tests de la base
.github/workflows/         tests puis déploiement automatiques
```

- Travaillez sur une branche, ouvrez une *pull request* : les tests se lancent tout seuls. La fusion dans `main` publie le site.
- Essai en local : `cd site && python3 -m http.server 8000`, puis <http://localhost:8000> (ajoutez cette adresse aux *Redirect URLs* pour les liens reçus par e-mail).
- Tests de la base (PostgreSQL 15 ou plus) : `bash tests/lancer.sh`. N'exécutez jamais `tests/imitation_supabase.sql` sur Supabase.
- Après l'installation, une modification de la base se fait dans un **nouveau** fichier SQL (par exemple `supabase/03_....sql`).
- Si vous utilisez un nom de domaine personnalisé pour Supabase, ajoutez-le à `connect-src` dans `site/index.html`.

## Dépannage

| Problème | Solution |
|---|---|
| « Il reste à brancher la base de données » | Remplir `site/config.js`, puis pousser |
| « Inscription refusée : vérifie le code » | `select code_invitation from private.reglages;` |
| Le déploiement échoue à l'étape Pages | Vérifier l'étape 6, puis relancer |
| Plus rien ne se charge après des vacances | Relancer le projet Supabase mis en pause |
| E-mail jamais reçu | Voir l'étape 3 (serveur d'envoi) |

## Composants inclus
supabase-js (licence MIT, `site/vendor/`) ; polices Atkinson Hyperlegible et Bricolage Grotesque (licences dans `site/fonts/`).
