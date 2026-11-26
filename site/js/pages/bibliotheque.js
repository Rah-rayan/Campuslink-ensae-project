// Bibliothèque : fax, fiches, annales, vidéos et liens, classés par classe et matière.
import { sb, q, etat, estModerateur } from '../api.js';
import {
  h, champ, bouton, dialogue, choixClasse, choixMatiere, options, vide, message, signalerErreur,
  lienExterne, fmtDate, sansAccents, pluriel, TYPES_RESSOURCE,
} from '../ui.js';
import { telecharger, effacer, champsSource, enregistrerAvecSource } from '../fichiers.js';

const PAR_PAGE = 40;
const MOTIFS = { doublon: 'Doublon', erreur: 'Contient une erreur', inapproprie: 'Contenu inapproprié', autre: 'Autre' };

const anneeEnCours = () => {
  const d = new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;   // l'année démarre en septembre
};
const libelleAnnee = (a) => `${a}-${a + 1}`;

export async function supprimerRessource(r) {
  const supprimees = await q(sb.from('ressources').delete().eq('id', r.id).select('id'));
  if (!supprimees.length) throw new Error('Suppression non autorisée.');
  if (r.chemin) await effacer('bibliotheque', [r.chemin]);
}

function partager(matiereId, apres) {
  const annees = Array.from({ length: 12 }, (_, i) => anneeEnCours() - i);
  dialogue({
    titre: 'Partager un document',
    valider: 'Publier',
    champs: [
      champ('Matière', choixMatiere({ required: true, value: matiereId })),
      champ('Type', h('select', { name: 'type', value: 'fiche' }, options(TYPES_RESSOURCE))),
      champ('Titre', h('input', { name: 'titre', required: true, minlength: 3, maxlength: 150, placeholder: 'Annale d’économétrie, session de juin' })),
      champ('Description (facultatif)', h('textarea', { name: 'description', maxlength: 500, rows: 2 })),
      champ('Année académique', h('select', { name: 'annee', value: anneeEnCours() },
        h('option', { value: '' }, 'Non précisée'), annees.map((a) => h('option', { value: a }, libelleAnnee(a))))),
      champsSource(),
    ],
    onValider: async (d) => {
      await enregistrerAvecSource(d, 'bibliotheque', etat.moi.id, (source) => q(sb.from('ressources').insert({
        matiere_id: Number(d.matiere_id), type: d.type, titre: d.titre.trim(), description: d.description.trim(),
        annee: d.annee ? Number(d.annee) : null, ...source,
      })));
      message('Document publié.');
      apres();
    },
  });
}

function signaler(r, apres) {
  dialogue({
    titre: `Signaler « ${r.titre} »`,
    valider: 'Envoyer le signalement',
    champs: [
      champ('Problème', h('select', { name: 'motif', value: 'erreur' }, options(MOTIFS))),
      champ('Précisions', h('textarea', { name: 'details', maxlength: 500, rows: 3, placeholder: 'Quelle erreur ? Doublon de quel document ?' })),
    ],
    onValider: async (d) => {
      try {
        await q(sb.from('signalements').insert({ ressource_id: r.id, motif: d.motif, details: d.details.trim() }));
      } catch (e) {
        if (e.code === '23505') throw new Error('Tu as déjà signalé ce document.');
        throw e;
      }
      message('Signalement envoyé à la modération.');
      apres();
    },
  });
}

function ligne(r, apres) {
  const mien = r.auteur_id === etat.moi.id;
  const voter = bouton(`Utile (${r.nb_votes})`, async (b) => {
    await q(r.a_vote
      ? sb.from('votes').delete().eq('ressource_id', r.id).eq('profil_id', etat.moi.id)
      : sb.from('votes').insert({ ressource_id: r.id }));
    r.a_vote = !r.a_vote;
    r.nb_votes += r.a_vote ? 1 : -1;
    b.textContent = `Utile (${r.nb_votes})`;
    b.setAttribute('aria-pressed', String(r.a_vote));
  }, 'vote petit', { 'aria-pressed': String(r.a_vote), disabled: mien || r.masquee, title: mien ? 'Tu ne peux pas voter pour ton document' : undefined });
  // bouton() réactive le bouton après un clic ; celui-ci reste désactivé pour son auteur
  voter.disabled = mien || r.masquee;

  return h('li', { class: 'document' },
    h('span', { class: `genre ${r.type}` }, TYPES_RESSOURCE[r.type]),
    h('div', {},
      h('strong', {}, r.titre),
      r.description && h('p', {}, r.description),
      h('p', { class: 'details' },
        h('span', {}, `${r.matiere} (${r.classe})`),
        r.annee && h('span', {}, libelleAnnee(r.annee)),
        h('span', {}, `Partagé par ${r.auteur} le ${fmtDate(r.cree_le)}`)),
      r.masquee && h('p', { class: 'retard' }, 'Masqué par la modération : toi seul et les modérateurs le voyez.'),
      !r.masquee && r.nb_signalements >= 3 && h('p', { class: 'retard' }, `Signalé par ${pluriel(r.nb_signalements, 'étudiant')} : à vérifier.`),
      h('div', { class: 'actions' },
        r.chemin ? bouton('Télécharger', () => telecharger('bibliotheque', r.chemin, r.titre), 'petit')
          : lienExterne(r.url, 'Ouvrir le lien', 'btn petit'),
        voter,
        !mien && bouton('Signaler', () => signaler(r, apres), 'discret petit'),
        (mien || estModerateur()) && bouton('Supprimer', async () => {
          if (!window.confirm(`Supprimer « ${r.titre} » ?`)) return;
          await supprimerRessource(r);
          apres();
        }, 'danger petit'))));
}

export default async function bibliotheque(vue, { query }) {
  const matiereInitiale = etat.matieres.find((m) => m.id === Number(query.get('matiere')));
  const classe = choixClasse({ vide: 'Toutes les classes', value: matiereInitiale?.classe_id ?? '' });
  let matiere = choixMatiere({ vide: 'Toutes les matières', classeId: classe.value, value: matiereInitiale?.id ?? '' });
  const type = h('select', {}, h('option', { value: '' }, 'Tous les types'), options(TYPES_RESSOURCE));
  const tri = h('select', {}, h('option', { value: 'utiles' }, 'Les plus utiles'), h('option', { value: 'recents' }, 'Les plus récents'));
  const texte = h('input', { type: 'search', placeholder: 'Mot du titre ou de la description' });
  const liste = h('div', {});
  let documents = [];
  let affiches = PAR_PAGE;
  let version = 0;

  function dessiner() {
    const mots = sansAccents(texte.value).split(/\s+/).filter(Boolean);
    const trouves = documents.filter((r) => {
      const contenu = sansAccents(`${r.titre} ${r.description} ${r.auteur}`);
      return mots.every((m) => contenu.includes(m));
    });
    liste.replaceChildren(trouves.length
      ? h('ul', { class: 'liste' }, trouves.slice(0, affiches).map((r) => ligne(r, charger)))
      : vide('Aucun document ne correspond. Si tu en as un, partage-le.'));
    if (trouves.length > affiches) {
      liste.append(h('button', { type: 'button', class: 'btn contour', onclick: () => { affiches += PAR_PAGE; dessiner(); } }, 'Afficher plus'));
    }
  }

  async function charger() {
    const ma = version += 1;
    let requete = sb.from('ressources_detail').select('*');
    if (classe.value) requete = requete.eq('classe_id', classe.value);
    if (matiere.value) requete = requete.eq('matiere_id', matiere.value);
    if (type.value) requete = requete.eq('type', type.value);
    if (tri.value === 'utiles') requete = requete.order('nb_votes', { ascending: false });
    // La recherche par mots se fait dans le navigateur, sur les 1000 premiers résultats au plus
    const donnees = await q(requete.order('cree_le', { ascending: false }).limit(1000));
    if (ma !== version) return;
    documents = donnees;
    dessiner();
  }
  const relancer = () => { affiches = PAR_PAGE; charger().catch(signalerErreur); };

  const champMatiere = champ('Matière', matiere);
  classe.addEventListener('change', () => {
    const neuve = choixMatiere({ vide: 'Toutes les matières', classeId: classe.value });
    neuve.addEventListener('change', relancer);
    matiere.replaceWith(neuve);
    matiere = neuve;
    relancer();
  });
  matiere.addEventListener('change', relancer);
  type.addEventListener('change', relancer);
  tri.addEventListener('change', relancer);
  texte.addEventListener('input', () => { affiches = PAR_PAGE; dessiner(); });

  vue.replaceChildren(
    h('div', { class: 'entre' }, h('h1', {}, 'Bibliothèque'),
      bouton('Partager un document', () => partager(matiere.value, relancer))),
    h('div', { class: 'filtres' }, champ('Classe', classe), champMatiere, champ('Type', type), champ('Trier', tri)),
    champ('Rechercher', texte),
    liste);
  await charger();
}
