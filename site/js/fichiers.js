// Envoi, téléchargement et suppression de fichiers (Supabase Storage).
import { sb, q } from './api.js';
import { h, champ, sansAccents } from './ui.js';

export const TAILLE_MAX = 10 * 1024 * 1024;

const TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  csv: 'text/csv', zip: 'application/zip',
  txt: 'text/plain', md: 'text/plain', tex: 'text/plain', r: 'text/plain', rmd: 'text/plain',
  py: 'text/plain', do: 'text/plain', sas: 'text/plain', sql: 'text/plain', ipynb: 'text/plain',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

const nomPropre = (texte) =>
  sansAccents(texte).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier';

export async function envoyer(espace, dossier, fichier) {
  const ext = fichier.name.split('.').pop().toLowerCase();
  if (!Object.hasOwn(TYPES, ext)) {
    throw new Error('Type de fichier non accepté (PDF, images, Office, texte, code ou ZIP).');
  }
  if (fichier.size > TAILLE_MAX) throw new Error('Fichier trop lourd (10 Mo au maximum).');
  const base = nomPropre(fichier.name.slice(0, -(ext.length + 1)));
  const chemin = `${dossier}/${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;
  const propre = new File([fichier], `${base}.${ext}`, { type: TYPES[ext] });
  await q(sb.storage.from(espace).upload(chemin, propre, { contentType: TYPES[ext] }));
  return chemin;
}

export async function telecharger(espace, chemin, titre) {
  const nom = `${nomPropre(titre)}.${chemin.split('.').pop()}`;
  const { signedUrl } = await q(sb.storage.from(espace).createSignedUrl(chemin, 60, { download: nom }));
  const lien = h('a', { href: signedUrl, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
}

export async function effacer(espace, chemins) {
  if (chemins.length > 0) await q(sb.storage.from(espace).remove(chemins));
}

/** Les deux champs « fichier ou lien » des formulaires de partage. */
export function champsSource() {
  return [
    champ('Fichier (10 Mo au maximum)', h('input', { type: 'file', name: 'fichier', accept: Object.keys(TYPES).map((e) => `.${e}`).join(',') })),
    champ('Ou un lien', h('input', { type: 'url', name: 'url', placeholder: 'https://…', maxlength: 2000 }),
      'Pour une vidéo ou un gros document, colle un lien YouTube, Drive…'),
  ];
}

/** Envoie le fichier ou garde le lien, puis enregistre la ligne. Annule l'envoi en cas d'échec. */
export async function enregistrerAvecSource({ fichier, url }, espace, dossier, enregistrer) {
  const aFichier = fichier instanceof File && fichier.size > 0;
  const lien = (url || '').trim();
  if (aFichier === Boolean(lien)) throw new Error('Ajoute soit un fichier, soit un lien (un seul des deux).');
  if (lien && !/^https?:\/\//i.test(lien)) throw new Error('Le lien doit commencer par http:// ou https://');
  if (!aFichier) return enregistrer({ url: lien, chemin: null });
  const chemin = await envoyer(espace, dossier, fichier);
  try {
    return await enregistrer({ chemin, url: null });
  } catch (e) {
    await effacer(espace, [chemin]).catch(() => {});
    throw e;
  }
}
