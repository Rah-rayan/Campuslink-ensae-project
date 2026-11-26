// Éléments utilisés par plusieurs pages.
import { sb, q } from '../api.js';
import { h, champ, dialogue, options, message, jauge, bouton, TYPES_AIDE } from '../ui.js';

export const typesProposes = (c) => Object.keys(TYPES_AIDE).filter((t) => c[t]);

export function demanderAide({ aidantId, nom, matiereId, matiere, types, typeChoisi }) {
  dialogue({
    titre: `Demander de l’aide à ${nom}`,
    valider: 'Envoyer la demande',
    champs: [
      h('p', { class: 'doux' }, `Matière : ${matiere}`),
      champ('Type d’aide', h('select', { name: 'type', value: types.includes(typeChoisi) ? typeChoisi : types[0] },
        options(Object.fromEntries(types.map((t) => [t, TYPES_AIDE[t]]))))),
      champ('Ton message', h('textarea', {
        name: 'message', required: true, maxlength: 1000, rows: 4,
        placeholder: 'Ce qui te bloque, et quand tu es disponible',
      })),
    ],
    onValider: async (d) => {
      try {
        await q(sb.from('demandes').insert({ aidant_id: aidantId, matiere_id: matiereId, type: d.type, message: d.message.trim() }));
      } catch (e) {
        if (e.code === '23505') throw new Error('Tu as déjà une demande en cours avec cette personne dans cette matière.');
        throw e;
      }
      message(`Demande envoyée à ${nom}.`);
    },
  });
}

/** Une ligne de résultat de la recherche (ou d'un profil) à partir de la vue « annuaire ». */
export function ligneCompetence(c, { titre, typeChoisi, note, demander = true }) {
  const types = typesProposes(c);
  return h('li', { class: 'resultat' },
    h('div', { class: 'qui' }, titre,
      h('div', { class: 'etiquettes' }, types.map((t) => h('span', { class: 'etiquette' }, TYPES_AIDE[t]))),
      note && h('p', { class: 'note-echange' }, note)),
    jauge(c.score, c.nb_pairs),
    demander && types.length > 0 && bouton('Demander', () => demanderAide({
      aidantId: c.profil_id, nom: c.nom_complet, matiereId: c.matiere_id, matiere: c.matiere, types, typeChoisi,
    }), 'petit'));
}
