// Petits outils d'interface. Le texte saisi par les utilisateurs est toujours
// inséré comme du texte (jamais comme du HTML), ce qui bloque les injections.
import { etat, traduire } from './api.js';

export function h(balise, props = {}, ...enfants) {
  const el = document.createElement(balise);
  const { value, ...reste } = props || {};
  for (const [cle, val] of Object.entries(reste)) {
    if (val === undefined || val === null || val === false) continue;
    if (cle.startsWith('on') && typeof val === 'function') el.addEventListener(cle.slice(2), val);
    else if (cle === 'class') el.className = val;
    else el.setAttribute(cle, val === true ? '' : val);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === undefined || enfant === null || enfant === false || enfant === '') continue;
    el.append(enfant instanceof Node ? enfant : String(enfant));
  }
  if (value !== undefined && value !== null) el.value = value;
  return el;
}

export function message(texte, genre = 'ok') {
  const el = h('p', { class: `message ${genre}` }, texte);
  document.getElementById('messages').append(el);
  setTimeout(() => el.remove(), genre === 'erreur' ? 7000 : 4000);
}
export const signalerErreur = (e) => message(traduire(e), 'erreur');

export function bouton(libelle, action, classe = '', props = {}) {
  const b = h('button', { type: 'button', class: `btn ${classe}`, ...props }, libelle);
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await action(b); } catch (e) { signalerErreur(e); } finally { b.disabled = false; }
  });
  return b;
}

export function formulaire(props, envoyer, ...enfants) {
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const form = h('form', props, ...enfants, erreur);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erreur.hidden = true;
    const donnees = Object.fromEntries(new FormData(form));
    const boutons = form.querySelectorAll('button[type=submit]');
    boutons.forEach((b) => { b.disabled = true; });
    try {
      await envoyer(donnees, form);
    } catch (e) {
      erreur.textContent = traduire(e);
      erreur.hidden = false;
    } finally {
      boutons.forEach((b) => { b.disabled = false; });
    }
  });
  return form;
}

let compteur = 0;
export function dialogue({ titre, champs, valider = 'Enregistrer', onValider }) {
  const id = `boite-${compteur += 1}`;
  const boite = h('dialog', { class: 'boite', 'aria-labelledby': id });
  boite.append(formulaire({}, async (donnees, form) => {
    await onValider(donnees, form);
    boite.close();
  },
  h('h2', { id }, titre),
  champs,
  h('div', { class: 'actions fin' },
    h('button', { type: 'button', class: 'btn contour', onclick: () => boite.close() }, 'Fermer'),
    h('button', { type: 'submit', class: 'btn' }, valider))));
  boite.addEventListener('close', () => boite.remove());
  document.body.append(boite);
  boite.showModal();
  return boite;
}

export const champ = (libelle, controle, aide) =>
  h('label', { class: 'champ' }, h('span', {}, libelle), controle, aide && h('small', {}, aide));

export const caseACocher = (nom, libelle, coche = false, props = {}) =>
  h('label', { class: 'case' }, h('input', { type: 'checkbox', name: nom, checked: coche, ...props }), libelle);

export const options = (dictionnaire) =>
  Object.entries(dictionnaire).map(([valeur, libelle]) => h('option', { value: valeur }, libelle));

/** Liste déroulante des matières, groupées par classe. */
export function choixMatiere({ value = '', vide = 'Choisir une matière', classeId, ...props } = {}) {
  const groupes = etat.classes
    .filter((c) => !classeId || c.id === Number(classeId))
    .map((c) => {
      const matieres = etat.matieres.filter((m) => m.classe_id === c.id);
      return matieres.length > 0 && h('optgroup', { label: c.nom },
        matieres.map((m) => h('option', { value: m.id }, m.nom)));
    });
  return h('select', { name: 'matiere_id', ...props, value }, h('option', { value: '' }, vide), groupes);
}

export function choixClasse({ value = '', vide = 'Choisir une classe', ...props } = {}) {
  return h('select', { name: 'classe_id', ...props, value: value ?? '' },
    h('option', { value: '' }, vide),
    etat.classes.map((c) => h('option', { value: c.id }, c.nom)));
}

export const TYPES_AIDE = { tutorat: 'Tutorat', relecture: 'Relecture', equipe: 'Équipe' };
export const TYPES_RESSOURCE = {
  fiche: 'Fiche', resume: 'Résumé', annale: 'Annale', video: 'Vidéo', lien: 'Lien', autre: 'Autre',
};
export const NIVEAUX = {
  1: '1 – En difficulté', 2: '2 – Quelques bases', 3: '3 – Correct', 4: '4 – À l’aise', 5: '5 – Point fort',
};

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const fmtNombre = (n) => nombre.format(Number(n));

const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = (d) => dateCourte.format(new Date(d.length === 10 ? `${d}T00:00:00` : d));

export const pluriel = (n, un, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

/** Score de 1 à 5 dessiné comme un trait de surligneur : plein si validé par des pairs. */
export function jauge(score, nbPairs) {
  const trait = h('span', { class: 'trait' });
  trait.style.width = `${(Number(score) / 5) * 100}%`;
  const preuve = nbPairs > 0 ? `Validé par ${pluriel(nbPairs, 'étudiant')}` : 'Auto-évaluation seule';
  return h('div', { class: `jauge ${nbPairs > 0 ? 'validee' : 'declaree'}` },
    h('div', { class: 'piste', 'aria-hidden': 'true' }, trait),
    h('div', { class: 'legende' }, h('strong', {}, `${fmtNombre(score)} / 5`), h('span', {}, preuve)));
}

export function badges(ligne) {
  const liste = [
    ligne?.badge_contributeur && 'Contributeur',
    ligne?.badge_tuteur && 'Tuteur',
    ligne?.badge_pilier && 'Pilier de la promo',
  ].filter(Boolean);
  return liste.map((nom) => h('span', { class: 'badge' }, nom));
}

export const vide = (texte, action) => h('div', { class: 'vide' }, h('p', {}, texte), action);

export const lienExterne = (url, libelle, classe = 'btn contour petit') =>
  /^https?:\/\//i.test(url) && h('a', { class: classe, href: url, target: '_blank', rel: 'noopener noreferrer' }, libelle);

export const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
