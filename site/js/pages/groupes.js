import { sb, q } from '../api.js';
import { h, champ, bouton, dialogue, choixMatiere, vide, pluriel } from '../ui.js';

export function barreAvancement(taches) {
  const faites = taches.filter((t) => t.statut === 'terminee').length;
  const barre = h('progress', { max: taches.length || 1, value: faites, 'aria-label': 'Avancement' });
  return h('div', { class: 'avancement' }, barre,
    h('span', {}, taches.length ? `${faites} / ${taches.length} ${taches.length > 1 ? 'tâches terminées' : 'tâche terminée'}` : 'Aucune tâche'));
}

function creer() {
  dialogue({
    titre: 'Créer un espace de travail',
    valider: 'Créer le groupe',
    champs: [
      champ('Nom du groupe ou du projet', h('input', { name: 'nom', required: true, minlength: 2, maxlength: 80 })),
      champ('Matière (facultatif)', choixMatiere({ vide: 'Aucune' })),
      champ('Objectif', h('textarea', { name: 'description', maxlength: 500, rows: 3 })),
    ],
    onValider: async (d) => {
      const id = await q(sb.rpc('creer_groupe', {
        p_nom: d.nom, p_description: d.description, p_matiere: d.matiere_id ? Number(d.matiere_id) : null,
      }));
      location.hash = `#/groupe/${id}`;
    },
  });
}

function rejoindre() {
  dialogue({
    titre: 'Rejoindre un groupe',
    valider: 'Rejoindre',
    champs: [champ('Code du groupe', h('input', { name: 'code', required: true, autocomplete: 'off', maxlength: 20 }),
      'Un membre du groupe le trouve en haut de la page du groupe.')],
    onValider: async (d) => {
      const id = await q(sb.rpc('rejoindre_groupe', { p_code: d.code }));
      location.hash = `#/groupe/${id}`;
    },
  });
}

export default async function groupes(vue) {
  const liste = await q(sb.from('groupes')
    .select('id, nom, description, matiere:matieres(nom), membres(count), taches(statut)')
    .order('cree_le', { ascending: false }));

  vue.replaceChildren(
    h('div', { class: 'entre' }, h('h1', {}, 'Groupes et projets'),
      h('div', { class: 'actions' }, bouton('Créer un groupe', creer), bouton('Rejoindre avec un code', rejoindre, 'contour'))),
    liste.length ? h('ul', { class: 'liste' }, liste.map((g) => h('li', {},
      h('a', { class: 'nom', href: `#/groupe/${g.id}` }, g.nom),
      h('p', { class: 'doux' }, [g.matiere?.nom, pluriel(g.membres[0].count, 'membre')].filter(Boolean).join(', ')),
      g.description && h('p', {}, g.description),
      barreAvancement(g.taches))))
      : vide('Tu ne fais partie d’aucun groupe. Crées-en un, ou demande son code à un camarade.'));
}
