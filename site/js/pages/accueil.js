import { sb, q, etat } from '../api.js';
import { h, choixMatiere, badges, fmtDate, pluriel, TYPES_AIDE, TYPES_RESSOURCE } from '../ui.js';

export default async function accueil(vue) {
  const moi = etat.moi.id;
  const [nbCompetences, recues, taches, documents, mesPoints] = await Promise.all([
    sb.from('competences').select('*', { count: 'exact', head: true }).eq('profil_id', moi),
    q(sb.from('demandes')
      .select('id, type, matiere:matieres(nom), demandeur:profils!demandes_demandeur_id_fkey(nom_complet)')
      .eq('aidant_id', moi).eq('statut', 'en_attente').order('creee_le')),
    q(sb.from('taches').select('id, titre, echeance, groupe:groupes(id, nom)')
      .eq('assignee_id', moi).neq('statut', 'terminee').order('echeance', { nullsFirst: false }).limit(6)),
    q(sb.from('ressources_detail').select('id, titre, type, matiere, matiere_id, classe')
      .eq('masquee', false).order('cree_le', { ascending: false }).limit(5)),
    q(sb.from('classement').select('*').eq('profil_id', moi).maybeSingle()),
  ]);

  const recherche = h('form', { class: 'phrase' },
    h('label', {}, 'Je cherche',
      h('select', { name: 'type', 'aria-label': 'Type d’aide' },
        h('option', { value: 'tutorat' }, 'un tutorat'),
        h('option', { value: 'relecture' }, 'une relecture'),
        h('option', { value: 'equipe' }, 'des coéquipiers'))),
    h('label', {}, 'en', choixMatiere({ required: true, 'aria-label': 'Matière' })),
    h('button', { type: 'submit', class: 'btn' }, 'Trouver quelqu’un'));
  recherche.addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = `#/entraide?${new URLSearchParams(new FormData(recherche))}`;
  });

  const aCompleter = !etat.moi.classe_id || !nbCompetences.count;
  const aFaire = [
    recues.map((d) => h('li', {}, h('a', { href: '#/demandes' },
      h('strong', {}, `Répondre à ${d.demandeur.nom_complet}`),
      h('span', {}, `${TYPES_AIDE[d.type]} en ${d.matiere.nom}`)))),
    taches.map((t) => h('li', {}, h('a', { href: `#/groupe/${t.groupe.id}` },
      h('strong', {}, t.titre),
      h('span', {}, t.groupe.nom + (t.echeance ? `, pour le ${fmtDate(t.echeance)}` : ''))))),
  ].flat();

  vue.replaceChildren(
    h('section', { class: 'cahier tete' },
      h('h1', {}, `Salut ${etat.moi.nom_complet.split(' ')[0]}`),
      recherche),
    aCompleter ? h('p', { class: 'encart' }, 'Indique ta classe et tes matières pour que les autres puissent te trouver. ',
      h('a', { href: '#/profil' }, 'Compléter mon profil')) : '',
    h('div', { class: 'colonnes' },
      h('section', {},
        h('h2', {}, 'À faire'),
        aFaire.length ? h('ul', { class: 'liste liens' }, aFaire)
          : h('p', { class: 'doux' }, 'Rien en attente : ni demande à traiter, ni tâche assignée.')),
      h('section', {},
        h('h2', {}, 'Derniers documents partagés'),
        documents.length ? h('ul', { class: 'liste liens' }, documents.map((r) => h('li', {},
          h('a', { href: `#/bibliotheque?matiere=${r.matiere_id}` },
            h('strong', {}, r.titre),
            h('span', {}, `${TYPES_RESSOURCE[r.type]}, ${r.matiere} (${r.classe})`)))))
          : h('p', { class: 'doux' }, 'La bibliothèque est vide. ', h('a', { href: '#/bibliotheque' }, 'Partager le premier document')))),
    h('section', { class: 'mes-points' },
      h('h2', {}, `Tu as ${pluriel(mesPoints?.points || 0, 'point')}`),
      h('div', { class: 'etiquettes' }, badges(mesPoints)),
      h('p', {}, h('a', { href: '#/classement' }, 'Voir le barème et le classement'))));
}
