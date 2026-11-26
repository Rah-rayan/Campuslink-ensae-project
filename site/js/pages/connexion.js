import { sb, q } from '../api.js';
import { h, champ, formulaire, message } from '../ui.js';

const adresseDuSite = () => `${location.origin}${location.pathname}`;

const email = () => champ('Adresse e-mail', h('input', { type: 'email', name: 'email', required: true, autocomplete: 'email' }));
const motDePasse = (nouveau) => champ(nouveau ? 'Mot de passe (8 caractères au minimum)' : 'Mot de passe',
  h('input', {
    type: 'password', name: 'password', required: true, minlength: nouveau ? 8 : undefined,
    autocomplete: nouveau ? 'new-password' : 'current-password',
  }));

function cadre(racine, contenu) {
  racine.replaceChildren(h('div', { class: 'accueil-public' },
    h('div', { class: 'affiche cahier' },
      h('div', { class: 'marque' }, h('img', { src: 'favicon.svg', alt: '', width: 40, height: 40 }), 'CampusLink'),
      h('h1', {}, 'Quelqu’un de ta promo maîtrise ce qui te bloque.'),
      h('p', {}, 'Trouve un tuteur ou des coéquipiers, partage tes fax et annales, et menez vos projets de groupe au même endroit.')),
    h('main', { class: 'porte' }, contenu)));
}

export function pageConnexion(racine, mode = 'connexion') {
  const aller = (m) => pageConnexion(racine, m);
  const lien = (libelle, m) => h('button', { type: 'button', class: 'lien', onclick: () => aller(m) }, libelle);

  if (mode === 'inscription') {
    cadre(racine, formulaire({}, async (d) => {
      history.replaceState(null, '', '#/profil');
      const { session } = await q(sb.auth.signUp({
        email: d.email.trim(),
        password: d.password,
        options: {
          emailRedirectTo: adresseDuSite(),
          data: { nom_complet: d.nom.trim(), code_invitation: d.code.trim() },
        },
      }));
      if (!session) {
        cadre(racine, [h('h2', {}, 'Confirme ton adresse'),
          h('p', {}, 'Un message vient de t’être envoyé. Ouvre le lien qu’il contient, puis connecte-toi.'),
          lien('Aller à la connexion', 'connexion')]);
      }
    },
    h('h2', {}, 'Créer mon compte'),
    champ('Prénom et nom', h('input', { name: 'nom', required: true, minlength: 2, maxlength: 80, autocomplete: 'name' })),
    email(), motDePasse(true),
    champ('Code d’invitation', h('input', { name: 'code', autocomplete: 'off', required: true }), 'Demande-le aux responsables de la plateforme.'),
    h('button', { type: 'submit', class: 'btn large' }, 'Créer mon compte'),
    h('p', {}, 'Déjà inscrit ? ', lien('Se connecter', 'connexion'))));
    return;
  }

  if (mode === 'oubli') {
    cadre(racine, formulaire({}, async (d) => {
      await q(sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: `${adresseDuSite()}?reinit=1` }));
      message('Si un compte existe, un lien vient d’être envoyé. Ouvre-le dans ce même navigateur.');
    },
    h('h2', {}, 'Mot de passe oublié'),
    email(),
    h('button', { type: 'submit', class: 'btn large' }, 'Recevoir un lien'),
    h('p', {}, lien('Revenir à la connexion', 'connexion'))));
    return;
  }

  cadre(racine, formulaire({}, async (d) => {
    await q(sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password }));
  },
  h('h2', {}, 'Connexion'),
  email(), motDePasse(false),
  h('button', { type: 'submit', class: 'btn large' }, 'Se connecter'),
  h('p', {}, lien('Mot de passe oublié', 'oubli')),
  h('p', {}, 'Pas encore de compte ? ', lien('Créer mon compte', 'inscription'))));
}

export function pageNouveauMotDePasse(racine, termine) {
  cadre(racine, formulaire({}, async (d) => {
    await q(sb.auth.updateUser({ password: d.password }));
    message('Mot de passe enregistré.');
    termine();
  },
  h('h2', {}, 'Choisir un nouveau mot de passe'),
  motDePasse(true),
  h('button', { type: 'submit', class: 'btn large' }, 'Enregistrer')));
}
