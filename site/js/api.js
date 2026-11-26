// Connexion à Supabase, traduction des erreurs et données partagées.
const cfg = window.CAMPUSLINK_CONFIG || {};

function estCleSecrete(cle) {
  if (cle.startsWith('sb_secret_')) return true;
  try {
    const charge = cle.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(charge)).role === 'service_role';
  } catch { return false; }
}

export const problemeConfig =
  !/^https?:\/\//.test(cfg.supabaseUrl || '') || !cfg.supabaseKey ? 'absente'
    : estCleSecrete(cfg.supabaseKey) ? 'secrete'
      : null;

export const sb = problemeConfig ? null
  : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { flowType: 'pkce' } });

const TRADUCTIONS = [
  [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/already registered/i, 'Un compte existe déjà avec cet e-mail.'],
  [/Database error saving new user|CODE_INVITATION_INVALIDE/i, 'Inscription refusée : vérifie le code d’invitation.'],
  [/Email not confirmed/i, 'Confirme d’abord ton adresse e-mail (regarde ta boîte de réception).'],
  [/Password should|weak password/i, 'Mot de passe trop faible : 8 caractères au minimum.'],
  [/different from the old/i, 'Choisis un mot de passe différent de l’ancien.'],
  [/rate limit|too many requests/i, 'Trop de tentatives. Réessaie dans quelques minutes.'],
  [/Email address not authorized|Error sending/i, 'L’envoi d’e-mails n’est pas configuré. Contacte un responsable.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Le serveur ne répond pas. Vérifie ta connexion Internet.'],
  [/mime type/i, 'Ce type de fichier n’est pas accepté.'],
  [/maximum allowed size|too large/i, 'Fichier trop lourd (10 Mo au maximum).'],
];

export function traduire(erreur) {
  const message = erreur?.message || String(erreur);
  for (const [motif, texte] of TRADUCTIONS) if (motif.test(message)) return texte;
  switch (erreur?.code) {
    case 'P0001': return message;                 // messages écrits dans la base, déjà en français
    case '23505': return 'Cela existe déjà.';
    case '23503': return 'Impossible : cet élément est encore utilisé ailleurs.';
    case '23514': case '22P02': return 'Une des valeurs saisies n’est pas valide.';
    case '42501': return 'Action non autorisée.';
    default: break;
  }
  if (/row-level security|permission denied/i.test(message)) return 'Action non autorisée.';
  return message;
}

/** Attend une requête Supabase ; renvoie les données ou lève une erreur lisible. */
export async function q(requete) {
  const { data, error } = await requete;
  if (error) {
    const e = new Error(traduire(error));
    e.code = error.code;
    throw e;
  }
  return data;
}

// Données gardées en mémoire pendant la session
export const etat = { moi: null, classes: [], matieres: [] };

export async function chargerReferences() {
  const [classes, matieres] = await Promise.all([
    q(sb.from('classes').select('*').order('ordre').order('nom')),
    q(sb.from('matieres').select('*').order('nom')),
  ]);
  etat.classes = classes;
  etat.matieres = matieres;
}

export async function chargerMoi(id) {
  etat.moi = await q(sb.from('profils').select('*').eq('id', id).maybeSingle());
  return etat.moi;
}

export const nomClasse = (id) => etat.classes.find((c) => c.id === id)?.nom || '';
export const estModerateur = () => etat.moi?.role === 'moderateur';
