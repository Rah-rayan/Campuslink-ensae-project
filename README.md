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

 à l'adresse `https://VOTRE-COMPTE.github.io/campuslink/
 
 
 **pour les nouveaux utilisateurs**: prier d'utiliser ce code de validation **6E85681A1A**
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
