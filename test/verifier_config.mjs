// Bloque le déploiement si une clé secrète a été collée dans site/config.js.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const contexte = { window: {} };
runInNewContext(readFileSync('site/config.js', 'utf8'), contexte);
const { supabaseUrl = '', supabaseKey = '' } = contexte.window.CAMPUSLINK_CONFIG ?? {};

let secrete = supabaseKey.startsWith('sb_secret_');
try {
  const charge = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64url').toString());
  secrete ||= charge.role === 'service_role';
} catch { /* ce n'est pas une clé au format JWT */ }

if (secrete) {
  console.log('::error::site/config.js contient une clé SECRÈTE. Utilisez la clé « publishable » et désactivez la clé exposée.');
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.log('::warning::site/config.js est vide : le site affichera la page de configuration.');
} else {
  console.log('Configuration correcte.');
}
