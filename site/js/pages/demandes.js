import { sb, q, etat } from '../api.js';
import { h, champ, bouton, dialogue, vide, message, fmtDate, TYPES_AIDE } from '../ui.js';

const STATUTS = {
  en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée', terminee: 'Terminée',
};

function coordonnees(contact, nom) {
  if (!contact || !(contact.telephone || contact.email || contact.autre)) {
    return h('p', { class: 'contact' }, `${nom} n’a pas encore ajouté de contact à son profil.`);
  }
  return h('p', { class: 'contact' }, h('strong', {}, `Contacter ${nom}`),
    contact.telephone && h('a', { href: `tel:${contact.telephone.replace(/[^+\d]/g, '')}` }, contact.telephone),
    contact.email && h('a', { href: `mailto:${encodeURIComponent(contact.email).replace('%40', '@')}` }, contact.email),
    contact.autre && h('span', {}, contact.autre));
}

function laisserAvis(d, recharger) {
  dialogue({
    titre: `Comment s’est passée la séance avec ${d.aidant.nom_complet} ?`,
    valider: 'Publier mon avis',
    champs: [
      h('fieldset', { class: 'notes' }, h('legend', {}, 'Note (5 = très utile)'),
        [1, 2, 3, 4, 5].map((n) => h('label', {}, h('input', { type: 'radio', name: 'note', value: n, required: true }), String(n)))),
      champ('Commentaire (facultatif, visible par tous les membres)', h('textarea', { name: 'commentaire', maxlength: 500, rows: 3 })),
    ],
    onValider: async (f) => {
      await q(sb.rpc('terminer_demande', { p_demande: d.id, p_note: Number(f.note), p_commentaire: f.commentaire }));
      message('Avis publié. Merci !');
      recharger();
    },
  });
}

export default async function demandes(vue, { query, recharger, majPastille }) {
  const moi = etat.moi.id;
  const toutes = await q(sb.from('demandes')
    .select('*, matiere:matieres(nom), demandeur:profils!demandes_demandeur_id_fkey(id, nom_complet), aidant:profils!demandes_aidant_id_fkey(id, nom_complet)')
    .order('creee_le', { ascending: false }).limit(200));
  const recues = toutes.filter((d) => d.aidant_id === moi);
  const envoyees = toutes.filter((d) => d.demandeur_id === moi);
  const ouvertes = toutes.filter((d) => ['acceptee', 'terminee'].includes(d.statut));
  const autres = [...new Set(ouvertes.map((d) => (d.aidant_id === moi ? d.demandeur_id : d.aidant_id)))];
  const contacts = autres.length ? await q(sb.from('contacts').select('*').in('profil_id', autres)) : [];

  const agir = (fonction, params, texte) => async () => {
    await q(sb.rpc(fonction, params));
    message(texte);
    recharger();
    majPastille().catch(() => {});
  };

  function ligne(d, recue) {
    const autre = recue ? d.demandeur : d.aidant;
    const actions = [];
    if (recue && d.statut === 'en_attente') {
      actions.push(
        bouton('Accepter', agir('repondre_demande', { p_demande: d.id, p_accepter: true }, 'Demande acceptée. Vos contacts sont visibles l’un pour l’autre.'), 'petit'),
        bouton('Refuser', agir('repondre_demande', { p_demande: d.id, p_accepter: false }, 'Demande refusée.'), 'contour petit'));
    }
    if (!recue && d.statut === 'acceptee') {
      actions.push(bouton('Séance faite : donner mon avis', () => laisserAvis(d, recharger), 'petit'));
    }
    if (!recue && ['en_attente', 'acceptee'].includes(d.statut)) {
      actions.push(bouton('Annuler la demande', async () => {
        if (window.confirm('Annuler cette demande ?')) await agir('annuler_demande', { p_demande: d.id }, 'Demande annulée.')();
      }, 'contour petit'));
    }
    return h('li', {},
      h('div', { class: 'entre' },
        h('p', {}, h('a', { class: 'nom', href: `#/etudiant/${autre.id}` }, autre.nom_complet),
          ` : ${TYPES_AIDE[d.type].toLowerCase()} en ${d.matiere.nom}`),
        h('span', { class: `statut ${d.statut}` }, STATUTS[d.statut])),
      h('p', { class: 'citation' }, d.message),
      h('p', { class: 'doux' }, `Envoyée le ${fmtDate(d.creee_le)}`),
      ['acceptee', 'terminee'].includes(d.statut) && coordonnees(contacts.find((c) => c.profil_id === autre.id), autre.nom_complet),
      recue && d.statut === 'acceptee' && h('p', { class: 'doux' }, `Après la séance, ${autre.nom_complet} pourra la clôturer et te noter.`),
      actions.length > 0 && h('div', { class: 'actions' }, actions));
  }

  const onglet = query.get('onglet') === 'envoyees' || (!query.has('onglet') && !recues.length && envoyees.length) ? 'envoyees' : 'recues';
  const liste = onglet === 'recues' ? recues : envoyees;
  const lienOnglet = (id, libelle) => h('button', {
    type: 'button', class: 'onglet', 'aria-pressed': String(onglet === id),
    onclick: () => { query.set('onglet', id); history.replaceState(null, '', `#/demandes?${query}`); recharger(); },
  }, libelle);

  vue.replaceChildren(
    h('h1', {}, 'Demandes d’entraide'),
    h('div', { class: 'onglets' }, lienOnglet('recues', `Reçues (${recues.length})`), lienOnglet('envoyees', `Envoyées (${envoyees.length})`)),
    liste.length
      ? h('ul', { class: 'liste' }, liste.map((d) => ligne(d, onglet === 'recues')))
      : vide(onglet === 'recues'
        ? 'Aucune demande reçue. Indique dans ton profil les matières où tu peux aider.'
        : 'Tu n’as encore rien demandé.',
      h('a', { class: 'btn', href: onglet === 'recues' ? '#/profil' : '#/entraide' }, onglet === 'recues' ? 'Mon profil' : 'Trouver de l’aide')));
}
