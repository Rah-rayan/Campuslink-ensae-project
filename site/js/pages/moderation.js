// Réservé aux modérateurs (la base vérifie aussi chaque action).
import { sb, q, etat, estModerateur, chargerReferences } from '../api.js';
import { h, champ, formulaire, bouton, choixClasse, vide, message, lienExterne, fmtDate } from '../ui.js';
import { telecharger } from '../fichiers.js';
import { supprimerRessource } from './bibliotheque.js';

const MOTIFS = { doublon: 'Doublon', erreur: 'Erreur', inapproprie: 'Contenu inapproprié', autre: 'Autre' };

const ouvrir = (r) => (r.chemin
  ? bouton('Télécharger pour vérifier', () => telecharger('bibliotheque', r.chemin, r.titre), 'contour petit')
  : lienExterne(r.url, 'Ouvrir le lien'));

export default async function moderation(vue, { recharger }) {
  if (!estModerateur()) { vue.replaceChildren(vide('Page réservée à la modération.')); return; }
  await chargerReferences();
  const [signalements, masquees, code] = await Promise.all([
    q(sb.from('signalements')
      .select('id, motif, details, cree_le, auteur:profils!signalements_auteur_id_fkey(nom_complet), ressource:ressources(id, titre, chemin, url, masquee)')
      .eq('statut', 'ouvert').order('cree_le').limit(100)),
    q(sb.from('ressources_detail').select('*').eq('masquee', true).order('cree_le', { ascending: false })),
    q(sb.rpc('lire_code_invitation')),
  ]);

  const agir = (fonction, params, texte) => async () => {
    await q(sb.rpc(fonction, params));
    message(texte);
    recharger();
  };

  const changerCode = formulaire({ class: 'ajout' }, async (d) => {
    await q(sb.rpc('changer_code_invitation', { p_code: d.code }));
    message('Nouveau code enregistré.');
    recharger();
  },
  champ('Nouveau code (6 à 40 caractères)', h('input', { name: 'code', required: true, minlength: 6, maxlength: 40, autocomplete: 'off' })),
  h('button', { type: 'submit', class: 'btn contour' }, 'Remplacer le code'));

  const supprimer = (table, id, nom) => bouton('Supprimer', async () => {
    if (!window.confirm(`Supprimer « ${nom} » ?`)) return;
    await q(sb.from(table).delete().eq('id', id));
    recharger();
  }, 'danger petit');

  const ajoutClasse = formulaire({ class: 'ajout' }, async (d) => {
    await q(sb.from('classes').insert({ nom: d.nom.trim(), ordre: etat.classes.length + 1 }));
    message('Classe ajoutée.');
    recharger();
  },
  champ('Nouvelle classe', h('input', { name: 'nom', required: true, maxlength: 60 })),
  h('button', { type: 'submit', class: 'btn contour' }, 'Ajouter la classe'));

  const ajoutMatiere = formulaire({ class: 'ajout' }, async (d) => {
    await q(sb.from('matieres').insert({ classe_id: Number(d.classe_id), nom: d.nom.trim() }));
    message('Matière ajoutée.');
    recharger();
  },
  h('div', { class: 'filtres' },
    champ('Classe', choixClasse({ required: true })),
    champ('Nouvelle matière', h('input', { name: 'nom', required: true, maxlength: 100 }))),
  h('button', { type: 'submit', class: 'btn contour' }, 'Ajouter la matière'));

  vue.replaceChildren(
    h('h1', {}, 'Modération'),
    h('section', {},
      h('h2', {}, `Signalements à traiter (${signalements.length})`),
      signalements.length ? h('ul', { class: 'liste' }, signalements.map((s) => h('li', {},
        h('strong', {}, s.ressource.titre),
        h('p', {}, `${MOTIFS[s.motif]}${s.details ? ` : ${s.details}` : ''}`),
        h('p', { class: 'doux' }, `Signalé par ${s.auteur.nom_complet} le ${fmtDate(s.cree_le)}`),
        h('div', { class: 'actions' }, ouvrir(s.ressource),
          bouton('Masquer le document', agir('moderer_ressource', { p_ressource: s.ressource.id, p_masquer: true }, 'Document masqué.'), 'petit'),
          bouton('Rejeter le signalement', agir('rejeter_signalement', { p_signalement: s.id }, 'Signalement rejeté.'), 'contour petit')))))
        : h('p', { class: 'doux' }, 'Aucun signalement en attente.')),
    masquees.length ? h('section', {},
      h('h2', {}, 'Documents masqués'),
      h('ul', { class: 'liste' }, masquees.map((r) => h('li', {},
        h('strong', {}, r.titre), h('p', { class: 'doux' }, `${r.matiere}, partagé par ${r.auteur}`),
        h('div', { class: 'actions' }, ouvrir(r),
          bouton('Rétablir', agir('moderer_ressource', { p_ressource: r.id, p_masquer: false }, 'Document rétabli.'), 'contour petit'),
          bouton('Supprimer', async () => {
            if (!window.confirm(`Supprimer définitivement « ${r.titre} » ?`)) return;
            await supprimerRessource(r);
            recharger();
          }, 'danger petit')))))) : '',
    h('section', { class: 'panneau' },
      h('h2', {}, 'Code d’invitation'),
      h('p', {}, 'À donner aux nouveaux inscrits : ', h('code', {}, code || 'aucun (inscription libre)')),
      changerCode),
    h('section', { class: 'panneau' },
      h('h2', {}, 'Classes et matières'),
      etat.classes.map((c) => h('details', {},
        h('summary', {}, c.nom),
        h('ul', { class: 'liste' },
          etat.matieres.filter((m) => m.classe_id === c.id).map((m) => h('li', { class: 'entre' }, m.nom, supprimer('matieres', m.id, m.nom))),
          h('li', { class: 'entre' }, h('em', {}, 'La classe entière'), supprimer('classes', c.id, c.nom))))),
      ajoutMatiere, ajoutClasse));
}
