import { sb, q, etat, nomClasse } from '../api.js';
import { h, badges, vide, fmtDate, pluriel } from '../ui.js';
import { ligneCompetence } from './commun.js';

export default async function etudiant(vue, { arg }) {
  if (!/^[0-9a-f-]{36}$/i.test(arg || '')) { vue.replaceChildren(vide('Profil introuvable.')); return; }
  const [profil, competences, avis, rang] = await Promise.all([
    q(sb.from('profils').select('*').eq('id', arg).maybeSingle()),
    q(sb.from('annuaire').select('*').eq('profil_id', arg).order('score', { ascending: false })),
    q(sb.from('avis').select('demande_id, note, commentaire, cree_le, matiere:matieres(nom), auteur:profils!avis_auteur_id_fkey(nom_complet)')
      .eq('aidant_id', arg).order('cree_le', { ascending: false }).limit(30)),
    q(sb.from('classement').select('*').eq('profil_id', arg).maybeSingle()),
  ]);
  if (!profil) { vue.replaceChildren(vide('Profil introuvable.')); return; }
  const moi = arg === etat.moi.id;

  vue.replaceChildren(
    h('section', { class: 'cahier tete' },
      h('h1', {}, profil.nom_complet),
      h('p', {}, nomClasse(profil.classe_id)),
      profil.bio && h('p', { class: 'bio' }, profil.bio),
      h('div', { class: 'etiquettes' }, h('span', { class: 'etiquette' }, pluriel(rang?.points || 0, 'point')), badges(rang)),
      moi && h('p', {}, h('a', { href: '#/profil' }, 'Modifier mon profil'))),
    h('section', {},
      h('h2', {}, 'Matières'),
      competences.length ? h('ul', { class: 'liste' }, competences.map((c) => ligneCompetence(c, {
        titre: [h('strong', {}, c.matiere), h('span', { class: 'doux' }, c.matiere_classe)], demander: !moi,
      }))) : h('p', { class: 'doux' }, 'Aucune matière affichée.')),
    h('section', {},
      h('h2', {}, 'Avis reçus'),
      avis.length ? h('ul', { class: 'liste' }, avis.map((a) => h('li', {},
        h('p', {}, h('strong', {}, `${a.note} / 5`), ` en ${a.matiere.nom}`),
        a.commentaire && h('p', {}, `« ${a.commentaire} »`),
        h('p', { class: 'doux' }, `${a.auteur.nom_complet}, le ${fmtDate(a.cree_le)}`))))
        : h('p', { class: 'doux' }, 'Pas encore d’avis.')));
}
