// Mise en relation : recherche par matière, suggestions d'échanges et annuaire.
import { sb, q, etat, nomClasse } from '../api.js';
import { h, champ, choixMatiere, choixClasse, options, vide, signalerErreur, pluriel, TYPES_AIDE } from '../ui.js';
import { ligneCompetence } from './commun.js';

const PAR_PAGE = 30;

const identite = (id, nom, classe, bio) => [
  h('a', { class: 'nom', href: `#/etudiant/${id}` }, nom),
  classe && h('span', { class: 'doux' }, classe),
  bio && h('p', { class: 'bio' }, bio),
];

async function resultats(matiereId, type) {
  let requete = sb.from('annuaire').select('*').eq('matiere_id', matiereId).neq('profil_id', etat.moi.id);
  requete = type ? requete.eq(type, true) : requete.or('tutorat.eq.true,relecture.eq.true,equipe.eq.true');
  const lignes = await q(requete.order('score', { ascending: false }).order('nb_pairs', { ascending: false }).limit(50));
  if (!lignes.length) {
    return vide('Personne ne propose encore cette aide dans cette matière. Essaie un autre type d’aide, ou invite un camarade à compléter son profil.');
  }
  return h('section', {},
    h('h2', {}, `${pluriel(lignes.length, 'personne')} pour t’aider`),
    h('p', { class: 'doux' }, 'Classement : auto-évaluation et notes reçues après des séances. Un trait hachuré n’est pas encore confirmé par d’autres.'),
    h('ul', { class: 'liste' }, lignes.map((c) => ligneCompetence(c, {
      titre: identite(c.profil_id, c.nom_complet, c.classe, c.bio), typeChoisi: type,
    }))));
}

/** Personnes fortes là où je suis en difficulté, et ce que je peux leur apporter en retour. */
async function suggestions() {
  const miennes = await q(sb.from('competences').select('matiere_id, niveau').eq('profil_id', etat.moi.id));
  const faibles = miennes.filter((c) => c.niveau <= 2).map((c) => c.matiere_id);
  const fortes = miennes.filter((c) => c.niveau >= 4).map((c) => c.matiere_id);
  const titre = h('h2', {}, 'Échanges possibles pour toi');
  if (!faibles.length) {
    return h('section', {}, titre, h('p', { class: 'doux' },
      'Ajoute dans ton profil les matières où tu es en difficulté (niveau 1 ou 2) pour recevoir des suggestions. ',
      h('a', { href: '#/profil' }, 'Mettre à jour mes matières')));
  }
  const aidants = await q(sb.from('annuaire').select('*').in('matiere_id', faibles).eq('tutorat', true)
    .neq('profil_id', etat.moi.id).gte('score', 3.5).order('score', { ascending: false }).limit(40));
  if (!aidants.length) {
    return h('section', {}, titre, h('p', { class: 'doux' }, 'Aucun tuteur disponible pour l’instant dans tes matières difficiles.'));
  }
  const retours = fortes.length
    ? await q(sb.from('annuaire').select('profil_id, matiere').in('profil_id', aidants.map((a) => a.profil_id))
      .in('matiere_id', fortes).lte('niveau', 2))
    : [];
  const enRetour = (id) => retours.filter((r) => r.profil_id === id).map((r) => r.matiere);
  // Les échanges dans les deux sens passent en premier
  aidants.sort((a, b) => Number(enRetour(b.profil_id).length > 0) - Number(enRetour(a.profil_id).length > 0) || b.score - a.score);
  return h('section', {}, titre, h('ul', { class: 'liste' }, aidants.slice(0, 6).map((c) => ligneCompetence(c, {
    titre: [...identite(c.profil_id, c.nom_complet, c.classe), h('p', {}, `Peut t’aider en ${c.matiere}`)],
    typeChoisi: 'tutorat',
    note: enRetour(c.profil_id).length > 0 && `En retour, tu peux l’aider en ${enRetour(c.profil_id).join(', ')}.`,
  }))));
}

function annuaire() {
  const liste = h('ul', { class: 'liste' });
  const etatListe = h('p', { class: 'doux' });
  const suite = h('button', { type: 'button', class: 'btn contour', hidden: true }, 'Afficher plus');
  const nom = h('input', { type: 'search', name: 'nom', placeholder: 'Prénom ou nom' });
  const classe = choixClasse({ vide: 'Toutes les classes' });
  let debut = 0;
  let version = 0;

  async function charger(recommencer) {
    if (recommencer) debut = 0;
    const ma = version += 1;
    let requete = sb.from('profils')
      .select('id, nom_complet, bio, classe_id, competences(niveau, tutorat, relecture, equipe, matiere:matieres(nom))')
      .eq('visible', true).neq('id', etat.moi.id);
    const texte = nom.value.trim().replace(/[\\%_]/g, '\\$&');
    if (texte) requete = requete.ilike('nom_complet', `%${texte}%`);
    if (classe.value) requete = requete.eq('classe_id', classe.value);
    const lignes = await q(requete.order('nom_complet').order('id').range(debut, debut + PAR_PAGE - 1));
    if (ma !== version) return;   // une recherche plus récente est en cours
    if (recommencer) liste.replaceChildren();
    liste.append(...lignes.map((p) => {
      const forts = p.competences.filter((c) => c.niveau >= 4).sort((a, b) => b.niveau - a.niveau).slice(0, 4);
      return h('li', { class: 'resultat' },
        h('div', { class: 'qui' }, identite(p.id, p.nom_complet, nomClasse(p.classe_id), p.bio),
          h('div', { class: 'etiquettes' }, forts.map((c) => h('span', { class: 'etiquette fluo' }, c.matiere.nom)))),
        h('a', { class: 'btn contour petit', href: `#/etudiant/${p.id}` }, 'Voir le profil'));
    }));
    debut += lignes.length;
    suite.hidden = lignes.length < PAR_PAGE;
    etatListe.textContent = liste.children.length ? '' : 'Aucun étudiant ne correspond.';
  }

  let attente;
  nom.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(() => charger(true).catch(signalerErreur), 300); });
  classe.addEventListener('change', () => charger(true).catch(signalerErreur));
  suite.addEventListener('click', () => charger(false).catch(signalerErreur));
  charger(true).catch(signalerErreur);

  return h('section', {},
    h('h2', {}, 'Annuaire des étudiants'),
    h('div', { class: 'filtres' }, champ('Rechercher', nom), champ('Classe', classe)),
    liste, etatListe, suite);
}

export default async function entraide(vue, { query }) {
  const matiere = choixMatiere({ value: query.get('matiere_id') || '', vide: 'Choisir une matière' });
  const type = h('select', { name: 'type', value: query.get('type') || '' },
    h('option', { value: '' }, 'Tous les types'), options(TYPES_AIDE));
  const corps = h('div', { class: 'pile' });
  let version = 0;

  async function chercher() {
    const ma = version += 1;
    corps.replaceChildren(h('p', { class: 'chargement' }, 'Recherche…'));
    const contenu = matiere.value
      ? [await resultats(matiere.value, type.value)]
      : [await suggestions(), annuaire()];
    if (ma === version) corps.replaceChildren(...contenu);
  }
  const changer = () => {
    const p = new URLSearchParams();
    if (matiere.value) p.set('matiere_id', matiere.value);
    if (type.value) p.set('type', type.value);
    history.replaceState(null, '', `#/entraide${p.size ? `?${p}` : ''}`);
    chercher().catch(signalerErreur);
  };
  matiere.addEventListener('change', changer);
  type.addEventListener('change', changer);

  vue.replaceChildren(
    h('h1', {}, 'Entraide'),
    h('div', { class: 'filtres' }, champ('Matière', matiere), champ('Type d’aide', type)),
    corps);
  await chercher();
}
