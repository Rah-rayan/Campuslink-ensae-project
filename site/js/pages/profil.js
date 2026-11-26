import { sb, q, etat, chargerMoi } from '../api.js';
import {
  h, champ, caseACocher, formulaire, bouton, choixClasse, choixMatiere, options, message, signalerErreur, NIVEAUX, TYPES_AIDE,
} from '../ui.js';

const casesAide = (valeurs = {}) => h('div', { class: 'cases' },
  h('span', {}, 'Je propose :'),
  Object.entries(TYPES_AIDE).map(([cle, libelle]) => caseACocher(cle, libelle, valeurs[cle])));

const competenceDe = (d, matiereId) => ({
  profil_id: etat.moi.id,
  matiere_id: Number(matiereId),
  niveau: Number(d.niveau),
  tutorat: d.tutorat === 'on',
  relecture: d.relecture === 'on',
  equipe: d.equipe === 'on',
});

export default async function profil(vue, { recharger }) {
  const moi = etat.moi;
  const [competences, contact] = await Promise.all([
    q(sb.from('competences').select('*, matiere:matieres(nom, classe:classes(nom))').eq('profil_id', moi.id)),
    q(sb.from('contacts').select('*').eq('profil_id', moi.id).maybeSingle()),
  ]);
  competences.sort((a, b) => a.matiere.nom.localeCompare(b.matiere.nom, 'fr'));

  const infos = formulaire({ class: 'panneau' }, async (d) => {
    await q(sb.from('profils').update({
      nom_complet: d.nom_complet.trim(),
      classe_id: d.classe_id ? Number(d.classe_id) : null,
      bio: d.bio.trim(),
      visible: d.visible === 'on',
    }).eq('id', moi.id));
    await chargerMoi(moi.id);
    message('Profil enregistré.');
  },
  h('h2', {}, 'Mes informations'),
  champ('Prénom et nom', h('input', { name: 'nom_complet', required: true, minlength: 2, maxlength: 80, value: moi.nom_complet })),
  champ('Classe', choixClasse({ value: moi.classe_id })),
  champ('Présentation', h('textarea', { name: 'bio', maxlength: 500, rows: 3, value: moi.bio, placeholder: 'Tes disponibilités, tes centres d’intérêt…' })),
  caseACocher('visible', 'Apparaître dans la recherche et l’annuaire', moi.visible),
  h('button', { type: 'submit', class: 'btn' }, 'Enregistrer mes informations'));

  // Chaque modification d'une matière est enregistrée immédiatement
  const lignes = competences.map((c) => {
    const form = h('form', { class: 'competence' },
      h('strong', {}, c.matiere.nom, h('span', { class: 'doux' }, ` ${c.matiere.classe.nom}`)),
      h('select', { name: 'niveau', value: c.niveau, 'aria-label': `Mon niveau en ${c.matiere.nom}` }, options(NIVEAUX)),
      casesAide(c),
      bouton('Retirer', async () => {
        await q(sb.from('competences').delete().eq('profil_id', moi.id).eq('matiere_id', c.matiere_id));
        recharger();
      }, 'danger petit'));
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', async () => {
      try {
        await q(sb.from('competences').upsert(competenceDe(Object.fromEntries(new FormData(form)), c.matiere_id)));
        message(`${c.matiere.nom} : enregistré.`);
      } catch (e) { signalerErreur(e); }
    });
    return h('li', {}, form);
  });

  const ajout = formulaire({ class: 'ajout' }, async (d) => {
    if (competences.some((c) => c.matiere_id === Number(d.matiere_id))) throw new Error('Cette matière est déjà dans ta liste.');
    await q(sb.from('competences').insert(competenceDe(d, d.matiere_id)));
    message('Matière ajoutée.');
    recharger();
  },
  h('h3', {}, 'Ajouter une matière'),
  h('div', { class: 'filtres' },
    champ('Matière', choixMatiere({ required: true })),
    champ('Mon niveau', h('select', { name: 'niveau', value: 3 }, options(NIVEAUX)))),
  casesAide(),
  h('button', { type: 'submit', class: 'btn' }, 'Ajouter la matière'));

  const contacts = formulaire({ class: 'panneau' }, async (d) => {
    await q(sb.from('contacts').upsert({
      profil_id: moi.id, telephone: d.telephone.trim(), email: d.email.trim(), autre: d.autre.trim(),
    }));
    message('Contacts enregistrés.');
  },
  h('h2', {}, 'Mes contacts'),
  h('p', { class: 'doux' }, 'Visibles uniquement par les personnes avec qui tu as une demande acceptée.'),
  champ('Téléphone ou WhatsApp', h('input', { type: 'tel', name: 'telephone', maxlength: 30, value: contact?.telephone || '' })),
  champ('E-mail', h('input', { type: 'email', name: 'email', maxlength: 120, value: contact?.email || '' })),
  champ('Autre (Telegram, salle habituelle…)', h('input', { name: 'autre', maxlength: 120, value: contact?.autre || '' })),
  h('button', { type: 'submit', class: 'btn' }, 'Enregistrer mes contacts'));

  const securite = formulaire({ class: 'panneau' }, async (d, form) => {
    await q(sb.auth.updateUser({ password: d.password }));
    form.reset();
    message('Mot de passe modifié.');
  },
  h('h2', {}, 'Mot de passe'),
  champ('Nouveau mot de passe (8 caractères au minimum)', h('input', { type: 'password', name: 'password', required: true, minlength: 8, autocomplete: 'new-password' })),
  h('button', { type: 'submit', class: 'btn contour' }, 'Changer le mot de passe'));

  vue.replaceChildren(
    h('div', { class: 'entre' }, h('h1', {}, 'Mon profil'),
      h('a', { href: `#/etudiant/${moi.id}` }, 'Voir ce que les autres voient')),
    infos,
    h('section', { class: 'panneau' },
      h('h2', {}, 'Mes matières'),
      h('p', { class: 'doux' }, 'Évalue-toi honnêtement : les avis reçus après tes séances ajustent ensuite ton score. Ajoute aussi tes matières difficiles pour recevoir des suggestions.'),
      lignes.length ? h('ul', { class: 'liste' }, lignes) : h('p', {}, 'Aucune matière pour l’instant.'),
      ajout),
    contacts,
    securite,
    h('p', {}, bouton('Se déconnecter', async () => {
      await sb.auth.signOut();
      history.replaceState(null, '', '#/accueil');
    }, 'contour')));
}
