// Point d'entrée : session, menu et navigation (adresses du type #/entraide).
import { sb, problemeConfig, etat, chargerMoi, chargerReferences, estModerateur } from './api.js';
import { h, signalerErreur, message, vide } from './ui.js';
import { pageConnexion, pageNouveauMotDePasse } from './pages/connexion.js';
import accueil from './pages/accueil.js';
import entraide from './pages/entraide.js';
import etudiant from './pages/etudiant.js';
import demandes from './pages/demandes.js';
import groupes from './pages/groupes.js';
import groupe from './pages/groupe.js';
import bibliotheque from './pages/bibliotheque.js';
import classement from './pages/classement.js';
import profil from './pages/profil.js';
import moderation from './pages/moderation.js';

const PAGES = {
  accueil, entraide, etudiant, demandes, groupes, groupe, bibliotheque, classement, profil, moderation,
};

// [page, libellé, libellé court, dans la barre du bas sur téléphone]
const MENU = [
  ['accueil', 'Accueil', 'Accueil', true],
  ['entraide', 'Entraide', 'Entraide', true],
  ['demandes', 'Demandes', 'Demandes', true],
  ['groupes', 'Groupes et projets', 'Groupes', true],
  ['bibliotheque', 'Bibliothèque', 'Fax', true],
  ['classement', 'Classement', 'Classement', false],
  ['profil', 'Mon profil', 'Profil', false],
  ['moderation', 'Modération', 'Modérer', false],
];
const PARENT = { etudiant: 'entraide', groupe: 'groupes' };

const racine = document.getElementById('app');
let zone = null;          // emplacement de la page courante
let utilisateur;          // undefined tant que la session n'est pas connue

function lireRoute() {
  const [chemin, parametres = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [nom, arg] = chemin.split('/');
  return { nom: Object.hasOwn(PAGES, nom) ? nom : 'accueil', arg, query: new URLSearchParams(parametres) };
}

function construireCadre() {
  const liens = MENU
    .filter(([nom]) => nom !== 'moderation' || estModerateur())
    .map(([nom, long, court, bas]) => h('a', { href: `#/${nom}`, 'data-page': nom, class: bas ? 'principal' : 'secondaire' },
      h('span', { class: 'long' }, long), h('span', { class: 'court' }, court),
      nom === 'demandes' && h('span', { class: 'pastille', hidden: true })));
  zone = h('main', { id: 'contenu' });
  racine.replaceChildren(h('div', { class: 'cadre' },
    h('header', { class: 'entete' },
      h('a', { class: 'marque', href: '#/accueil' }, h('img', { src: 'favicon.svg', alt: '', width: 32, height: 32 }), 'CampusLink'),
      h('nav', { 'aria-label': 'Menu principal' }, liens)),
    zone));
}

async function majPastille() {
  const { count } = await sb.from('demandes').select('id', { count: 'exact', head: true })
    .eq('aidant_id', etat.moi.id).eq('statut', 'en_attente');
  const pastille = document.querySelector('.pastille');
  if (!pastille) return;
  pastille.hidden = !count;
  pastille.textContent = count || '';
  pastille.setAttribute('aria-label', `${count} en attente`);
}

async function afficher() {
  if (!etat.moi || !zone) return;
  document.querySelectorAll('dialog').forEach((d) => d.close());
  const route = lireRoute();
  document.querySelectorAll('[data-page]').forEach((a) => {
    if (a.dataset.page === (PARENT[route.nom] || route.nom)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // Un conteneur neuf par page : une réponse tardive ne peut pas écraser la page suivante.
  const vue = h('div', { class: 'vue' }, h('p', { class: 'chargement' }, 'Chargement…'));
  zone.replaceChildren(vue);
  window.scrollTo(0, 0);
  const dessiner = () => PAGES[route.nom](vue, { ...route, recharger: () => dessiner().catch(signalerErreur), majPastille });
  try {
    await dessiner();
  } catch (e) {
    console.error(e);
    vue.replaceChildren(vide(`La page n’a pas pu être chargée. ${e.message}`,
      h('button', { type: 'button', class: 'btn', onclick: afficher }, 'Réessayer')));
  }
  majPastille().catch(() => {});
}

async function demarrer(id) {
  try {
    await Promise.all([chargerMoi(id), chargerReferences()]);
    if (!etat.moi) throw new Error('Profil introuvable pour ce compte.');
    construireCadre();
    await afficher();
  } catch (e) {
    console.error(e);
    utilisateur = undefined;
    racine.replaceChildren(vide(`Connexion impossible. ${e.message}`,
      h('button', { type: 'button', class: 'btn', onclick: () => sb.auth.signOut().then(() => location.reload()) }, 'Se déconnecter')));
  }
}

const enRecuperation = () => new URLSearchParams(location.search).has('reinit');

let choixMotDePasse = false;   // formulaire « nouveau mot de passe » ouvert

function suivreSession(evenement, session) {
  const id = session?.user?.id ?? null;
  if (id && (evenement === 'PASSWORD_RECOVERY' || enRecuperation())) {
    if (choixMotDePasse) return;
    choixMotDePasse = true;
    utilisateur = id;
    etat.moi = null;
    pageNouveauMotDePasse(racine, () => {
      history.replaceState(null, '', `${location.pathname}#/accueil`);
      choixMotDePasse = false;
      demarrer(id);
    });
    return;
  }
  if (id === utilisateur) return;
  utilisateur = id;
  if (id) {
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    demarrer(id);
  } else {
    choixMotDePasse = false;
    etat.moi = null;
    zone = null;
    document.querySelectorAll('dialog').forEach((d) => d.close());
    pageConnexion(racine);
  }
}

function pageInstallation() {
  racine.replaceChildren(h('div', { class: 'installation' },
    h('h1', {}, problemeConfig === 'secrete' ? 'Clé secrète détectée' : 'Il reste à brancher la base de données'),
    problemeConfig === 'secrete'
      ? h('p', {}, 'site/config.js contient une clé secrète. Remplacez-la par la clé « publishable », puis désactivez la clé secrète exposée dans Supabase.')
      : h('p', {}, 'Ouvrez le fichier site/config.js et renseignez l’adresse et la clé « publishable » de votre projet Supabase. La marche à suivre complète est dans le fichier README.md du dépôt.')));
}

if (problemeConfig) {
  pageInstallation();
} else {
  const erreurRetour = new URLSearchParams(location.search).get('error_description');
  if (erreurRetour) message(`Le lien n’est plus valable : ${erreurRetour}`, 'erreur');
  // setTimeout : Supabase déconseille d'appeler la base directement dans ce rappel.
  sb.auth.onAuthStateChange((evenement, session) => setTimeout(() => suivreSession(evenement, session), 0));
  window.addEventListener('hashchange', afficher);
}
