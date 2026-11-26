import { sb, q, etat } from '../api.js';
import { h, badges, vide } from '../ui.js';

const BAREME = [
  ['Partager un document', '+5', '5 partages récompensés au maximum par jour'],
  ['Recevoir un vote « utile »', '+2', 'retiré si le vote est annulé'],
  ['Aider quelqu’un (séance notée)', '+10', 'une fois par semaine pour la même personne'],
  ['Séance notée 4 ou 5', '+5', 'en plus des 10 points'],
];

export default async function classement(vue) {
  const lignes = await q(sb.from('classement').select('*').gt('points', 0)
    .order('points', { ascending: false }).order('nom_complet').limit(30));

  vue.replaceChildren(
    h('h1', {}, 'Classement'),
    lignes.length ? h('ol', { class: 'liste classement' }, lignes.map((l, i) => {
      // Ex æquo : même rang pour le même nombre de points
      const rang = lignes.findIndex((x) => x.points === l.points) + 1;
      return h('li', { class: l.profil_id === etat.moi.id ? 'moi' : '', value: i + 1 },
        h('span', { class: 'rang' }, rang),
        h('div', {}, h('a', { class: 'nom', href: `#/etudiant/${l.profil_id}` }, l.nom_complet),
          l.classe && h('span', { class: 'doux' }, l.classe),
          h('div', { class: 'etiquettes' }, badges(l))),
        h('strong', {}, `${l.points} pts`));
    })) : vide('Personne n’a encore de points. Le premier document partagé ouvre le classement.'),
    h('section', {},
      h('h2', {}, 'Comment gagner des points'),
      h('ul', { class: 'liste' }, BAREME.map(([action, points, regle]) => h('li', { class: 'entre' },
        h('span', {}, h('strong', {}, action), h('span', { class: 'doux' }, regle)), h('strong', {}, points))))),
    h('section', {},
      h('h2', {}, 'Les badges'),
      h('ul', { class: 'liste' },
        h('li', {}, h('span', { class: 'badge' }, 'Contributeur'), ' 5 documents partagés'),
        h('li', {}, h('span', { class: 'badge' }, 'Tuteur'), ' 3 personnes différentes t’ont noté 4 ou 5'),
        h('li', {}, h('span', { class: 'badge' }, 'Pilier de la promo'), ' 100 points'))));
}
