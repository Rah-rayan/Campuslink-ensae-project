// Un espace de travail : tâches, brouillons, membres.
import { sb, q, etat } from '../api.js';
import { h, champ, bouton, dialogue, options, choixMatiere, vide, message, signalerErreur, lienExterne, fmtDate } from '../ui.js';
import { telecharger, effacer, champsSource, enregistrerAvecSource } from '../fichiers.js';
import { barreAvancement } from './groupes.js';

const COLONNES = { a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminé' };

const aujourdhui = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default async function groupe(vue, { arg, recharger }) {
  const id = Number(arg);
  const g = Number.isInteger(id) && await q(sb.from('groupes').select('*, matiere:matieres(nom)').eq('id', id).maybeSingle());
  if (!g) {
    vue.replaceChildren(vide('Ce groupe n’existe pas, ou tu n’en fais pas partie.', h('a', { class: 'btn', href: '#/groupes' }, 'Mes groupes')));
    return;
  }
  const [membres, taches, brouillons] = await Promise.all([
    q(sb.from('membres').select('profil_id, role, profil:profils(nom_complet)').eq('groupe_id', id).order('rejoint_le')),
    q(sb.from('taches').select('*').eq('groupe_id', id).order('echeance', { nullsFirst: false }).order('id')),
    q(sb.from('brouillons').select('*, auteur:profils(nom_complet)').eq('groupe_id', id).order('cree_le', { ascending: false })),
  ]);
  const moi = etat.moi.id;
  const responsable = membres.some((m) => m.profil_id === moi && m.role === 'responsable');
  const nomDe = (uid) => membres.find((m) => m.profil_id === uid)?.profil.nom_complet;

  function editerTache(t) {
    dialogue({
      titre: t ? 'Modifier la tâche' : 'Nouvelle tâche',
      valider: t ? 'Enregistrer' : 'Ajouter la tâche',
      champs: [
        champ('Titre', h('input', { name: 'titre', required: true, maxlength: 150, value: t?.titre })),
        champ('Détails', h('textarea', { name: 'description', maxlength: 1000, rows: 3, value: t?.description })),
        champ('Responsable', h('select', { name: 'assignee_id', value: t?.assignee_id || '' },
          h('option', { value: '' }, 'Personne pour l’instant'),
          membres.map((m) => h('option', { value: m.profil_id }, m.profil.nom_complet)))),
        champ('Échéance', h('input', { type: 'date', name: 'echeance', value: t?.echeance })),
        champ('État', h('select', { name: 'statut', value: t?.statut || 'a_faire' }, options(COLONNES))),
      ],
      onValider: async (d) => {
        const ligne = {
          titre: d.titre.trim(), description: d.description.trim(),
          assignee_id: d.assignee_id || null, echeance: d.echeance || null, statut: d.statut,
        };
        await q(t ? sb.from('taches').update(ligne).eq('id', t.id) : sb.from('taches').insert({ ...ligne, groupe_id: id }));
        recharger();
      },
    });
  }

  function carte(t) {
    const retard = t.echeance && t.statut !== 'terminee' && t.echeance < aujourdhui();
    const deplacer = h('select', { value: t.statut, 'aria-label': `État de la tâche ${t.titre}` }, options(COLONNES));
    deplacer.addEventListener('change', async () => {
      try {
        await q(sb.from('taches').update({ statut: deplacer.value }).eq('id', t.id));
      } catch (e) {
        signalerErreur(e);
      }
      recharger();
    });
    return h('li', { class: 'tache' },
      h('strong', {}, t.titre),
      t.description && h('p', {}, t.description),
      h('p', { class: 'doux' }, nomDe(t.assignee_id) || 'Non assignée'),
      t.echeance && h('p', { class: retard ? 'retard' : 'doux' }, `${retard ? 'En retard : ' : 'Pour le '}${fmtDate(t.echeance)}`),
      deplacer,
      h('div', { class: 'actions' },
        bouton('Modifier', () => editerTache(t), 'contour petit'),
        bouton('Supprimer', async () => {
          if (!window.confirm(`Supprimer la tâche « ${t.titre} » ?`)) return;
          await q(sb.from('taches').delete().eq('id', t.id));
          recharger();
        }, 'danger petit')));
  }

  function ajouterBrouillon() {
    dialogue({
      titre: 'Partager un brouillon',
      valider: 'Partager',
      champs: [
        champ('Titre', h('input', { name: 'titre', required: true, maxlength: 150, placeholder: 'Rapport, version 2' })),
        champ('Ce qui a changé ou reste à faire', h('textarea', { name: 'note', maxlength: 500, rows: 2 })),
        champsSource(),
      ],
      onValider: async (d) => {
        await enregistrerAvecSource(d, 'brouillons', `${id}/${moi}`, (source) =>
          q(sb.from('brouillons').insert({ groupe_id: id, titre: d.titre.trim(), note: d.note.trim(), ...source })));
        message('Brouillon partagé.');
        recharger();
      },
    });
  }

  function modifierGroupe() {
    dialogue({
      titre: 'Modifier le groupe',
      champs: [
        champ('Nom', h('input', { name: 'nom', required: true, minlength: 2, maxlength: 80, value: g.nom })),
        champ('Matière', choixMatiere({ value: g.matiere_id || '', vide: 'Aucune' })),
        champ('Objectif', h('textarea', { name: 'description', maxlength: 500, rows: 3, value: g.description })),
      ],
      onValider: async (d) => {
        await q(sb.from('groupes').update({
          nom: d.nom.trim(), description: d.description.trim(), matiere_id: d.matiere_id ? Number(d.matiere_id) : null,
        }).eq('id', id));
        recharger();
      },
    });
  }

  async function supprimerGroupe() {
    // Les fichiers d'abord : une fois le groupe supprimé, plus personne n'y a accès.
    await effacer('brouillons', brouillons.map((b) => b.chemin).filter(Boolean));
    await q(sb.from('groupes').delete().eq('id', id));
    message('Groupe supprimé.');
    location.hash = '#/groupes';
  }

  async function quitter() {
    if (membres.length === 1) {
      if (window.confirm('Tu es le dernier membre : le groupe et ses fichiers seront supprimés. Continuer ?')) await supprimerGroupe();
      return;
    }
    if (!window.confirm('Quitter ce groupe ?')) return;
    await q(sb.from('membres').delete().eq('groupe_id', id).eq('profil_id', moi));
    location.hash = '#/groupes';
  }

  vue.replaceChildren(
    h('section', { class: 'cahier tete' },
      h('h1', {}, g.nom),
      g.matiere && h('p', { class: 'doux' }, g.matiere.nom),
      g.description && h('p', {}, g.description),
      h('p', {}, 'Code pour inviter : ', h('code', {}, g.code), ' ',
        bouton('Copier', async () => { await navigator.clipboard.writeText(g.code); message('Code copié.'); }, 'contour petit')),
      barreAvancement(taches),
      responsable && h('p', {}, bouton('Modifier le groupe', modifierGroupe, 'contour petit'))),
    h('section', {},
      h('div', { class: 'entre' }, h('h2', {}, 'Tâches'), bouton('Ajouter une tâche', () => editerTache())),
      h('div', { class: 'tableau' }, Object.entries(COLONNES).map(([statut, titre]) => {
        const colonne = taches.filter((t) => t.statut === statut);
        return h('div', { class: `colonne ${statut}` },
          h('h3', {}, `${titre} (${colonne.length})`),
          h('ul', {}, colonne.map(carte)));
      }))),
    h('section', {},
      h('div', { class: 'entre' }, h('h2', {}, 'Brouillons partagés'), bouton('Partager un brouillon', ajouterBrouillon)),
      brouillons.length ? h('ul', { class: 'liste' }, brouillons.map((b) => h('li', {},
        h('strong', {}, b.titre),
        b.note && h('p', {}, b.note),
        h('p', { class: 'doux' }, `${b.auteur.nom_complet}, le ${fmtDate(b.cree_le)}`),
        h('div', { class: 'actions' },
          b.chemin ? bouton('Télécharger', () => telecharger('brouillons', b.chemin, b.titre), 'contour petit')
            : lienExterne(b.url, 'Ouvrir le lien'),
          (responsable || b.auteur_id === moi) && bouton('Supprimer', async () => {
            if (!window.confirm(`Supprimer « ${b.titre} » ?`)) return;
            if (b.chemin) await effacer('brouillons', [b.chemin]);
            await q(sb.from('brouillons').delete().eq('id', b.id));
            recharger();
          }, 'danger petit')))))
        : h('p', { class: 'doux' }, 'Aucun brouillon. Partage un fichier ou le lien d’un document en cours.')),
    h('section', {},
      h('h2', {}, 'Membres'),
      h('ul', { class: 'liste' }, membres.map((m) => h('li', { class: 'entre' },
        h('span', {}, h('a', { href: `#/etudiant/${m.profil_id}` }, m.profil.nom_complet),
          m.role === 'responsable' && h('span', { class: 'etiquette' }, 'Responsable')),
        responsable && m.profil_id !== moi && bouton('Retirer', async () => {
          if (!window.confirm(`Retirer ${m.profil.nom_complet} du groupe ?`)) return;
          await q(sb.from('membres').delete().eq('groupe_id', id).eq('profil_id', m.profil_id));
          recharger();
        }, 'danger petit')))),
      h('div', { class: 'actions' },
        bouton('Quitter le groupe', quitter, 'contour'),
        responsable && bouton('Supprimer le groupe', async () => {
          if (window.confirm('Supprimer définitivement ce groupe, ses tâches et ses fichiers ?')) await supprimerGroupe();
        }, 'danger'))));
}
