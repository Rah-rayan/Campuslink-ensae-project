-- Vérifie les règles métier et de sécurité. Tout échec arrête le script.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Outils de test --------------------------------------------------------
create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(condition boolean, libelle text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ÉCHEC : %', libelle; end if;
  raise notice 'ok  %', libelle;
end $$;

-- L'ordre doit être refusé (erreur ou aucune ligne touchée)
create function test.refuse(ordre text, libelle text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute ordre;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok  % (refusé : %)', libelle, sqlerrm;
    return;
  end;
  if n > 0 then raise exception 'ÉCHEC : % (l''action a réussi)', libelle; end if;
  raise notice 'ok  % (aucune ligne touchée)', libelle;
end $$;
grant execute on all functions in schema test to anon, authenticated;

-- Se mettre dans la peau d'un utilisateur (à utiliser avec "set role authenticated")
create function test.je_suis(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid)::text, false)
$$;
grant execute on function test.je_suis(text) to authenticated, anon;

-- Inscriptions ----------------------------------------------------------
select test.refuse($q$ insert into auth.users (email, raw_user_meta_data)
  values ('intrus@x.sn', '{"nom_complet":"Intrus","code_invitation":"FAUX"}') $q$,
  'inscription avec un mauvais code');
select test.refuse($q$ insert into auth.users (email) values ('intrus2@x.sn') $q$,
  'inscription sans code');

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.email, jsonb_build_object('nom_complet', u.nom, 'code_invitation', lower(r.code_invitation))
from private.reglages r, (values
  ('00000000-0000-0000-0000-00000000000a', 'awa@x.sn',    'Awa'),
  ('00000000-0000-0000-0000-00000000000b', 'binta@x.sn',  'Binta'),
  ('00000000-0000-0000-0000-00000000000c', 'cheikh@x.sn', 'Cheikh'),
  ('00000000-0000-0000-0000-00000000000d', 'demba@x.sn',  'Demba')) as u(id, email, nom);
select test.ok((select count(*) = 4 from public.profils), '4 profils créés automatiquement');
update public.profils set role = 'moderateur' where nom_complet = 'Demba';

select id as eco from public.matieres where nom = 'Économétrie' \gset

\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'

-- Visiteur non connecté : rien du tout ----------------------------------
set role anon;
select test.refuse('select * from public.profils', 'anonyme : lire les profils');
select test.refuse('select * from public.annuaire', 'anonyme : lire l''annuaire');
select test.refuse('select public.creer_groupe(''X group'')', 'anonyme : créer un groupe');
select test.refuse('select * from private.reglages', 'anonyme : lire le code');
reset role;

set role authenticated;

-- Profils et contacts ---------------------------------------------------
select test.je_suis(:'B');
insert into public.competences (matiere_id, niveau, tutorat) values (:eco, 4, true);
insert into public.contacts (telephone) values ('770000000');
select test.refuse($q$ update public.profils set role = 'moderateur' where id = auth.uid() $q$,
  's''auto-promouvoir modérateur');
select test.refuse($q$ update public.profils set nom_complet = 'Piraté' where nom_complet = 'Awa' $q$,
  'modifier le profil d''un autre');
select test.refuse(format($q$ insert into public.competences (profil_id, matiere_id, niveau) values (%L, %s, 5) $q$, :'A', :eco),
  'ajouter une compétence à un autre');
select test.refuse('select * from private.reglages', 'membre : lire le code');
select test.refuse('select public.lire_code_invitation()', 'étudiant : lire le code via la fonction');
select test.refuse('insert into public.points (profil_id, valeur, motif) values (auth.uid(), 999, ''partage'')',
  's''offrir des points');

select test.je_suis(:'A');
select test.ok((select count(*) = 0 from public.contacts), 'contacts cachés avant acceptation');
select test.ok((select score = 4.00 and nb_pairs = 0 from public.annuaire where profil_id = :'B'),
  'score = auto-évaluation sans avis');

-- Demandes --------------------------------------------------------------
select test.refuse(format($q$ insert into public.demandes (aidant_id, matiere_id, type, message) values (%L, %s, 'relecture', 'x') $q$, :'B', :eco),
  'demander un type d''aide non proposé');
insert into public.demandes (aidant_id, matiere_id, type, message) values (:'B', :eco, 'tutorat', 'Aide-moi');
select id as dem from public.demandes \gset
select test.refuse(format($q$ insert into public.demandes (aidant_id, matiere_id, type, message) values (%L, %s, 'tutorat', 'bis') $q$, :'B', :eco),
  'demande en double');
select test.refuse(format('select public.repondre_demande(%s, true)', :dem), 'accepter sa propre demande');
select test.refuse(format('select public.terminer_demande(%s, 5)', :dem), 'noter avant acceptation');
select test.refuse(format($q$ update public.demandes set statut = 'acceptee' where id = %s $q$, :dem),
  'changer le statut directement');
select test.refuse(format($q$ insert into public.avis (demande_id, auteur_id, aidant_id, matiere_id, note) values (%s, %L, %L, %s, 5) $q$, :dem, :'A', :'B', :eco),
  'écrire un avis directement');

select test.je_suis(:'C');
select test.ok((select count(*) = 0 from public.demandes), 'un tiers ne voit pas la demande');
select test.refuse(format('select public.repondre_demande(%s, true)', :dem), 'un tiers répond');

select test.je_suis(:'B');
select public.repondre_demande(:dem, true);
select test.refuse(format('select public.terminer_demande(%s, 5)', :dem), 'l''aidant se note lui-même');

select test.je_suis(:'A');
select test.ok((select telephone = '770000000' from public.contacts where profil_id = :'B'),
  'contact visible après acceptation');
select public.terminer_demande(:dem, 5, 'Super');
select test.refuse(format('select public.terminer_demande(%s, 5)', :dem), 'noter deux fois');
select test.ok((select score = 4.25 and nb_pairs = 1 from public.annuaire where profil_id = :'B'),
  'score = (3×4 + 5) / 4 = 4,25');
select test.ok((select points = 15 from public.classement where profil_id = :'B'), '10 + 5 points d''entraide');

-- 2e séance de la même paire dans la semaine : avis compté, pas de points
insert into public.demandes (aidant_id, matiere_id, type, message) values (:'B', :eco, 'tutorat', 'Encore');
select max(id) as dem2 from public.demandes \gset
select test.je_suis(:'B');
select public.repondre_demande(:dem2, true);
select test.je_suis(:'A');
select public.terminer_demande(:dem2, 5);
select test.ok((select points = 15 from public.classement where profil_id = :'B'), 'pas de points en boucle');
select test.ok((select nb_pairs = 1 from public.annuaire where profil_id = :'B'), 'un évaluateur = une voix');

-- Profil masqué
select test.je_suis(:'B');
update public.profils set visible = false where id = auth.uid();
select test.je_suis(:'C');
select test.ok((select count(*) = 0 from public.annuaire where profil_id = :'B'), 'profil masqué hors recherche');
select test.refuse(format($q$ insert into public.demandes (aidant_id, matiere_id, type, message) values (%L, %s, 'tutorat', 'x') $q$, :'B', :eco),
  'solliciter un profil masqué');

-- Groupes ---------------------------------------------------------------
select test.je_suis(:'A');
select public.creer_groupe('Projet sondage', '', :eco) as grp \gset
select code from public.groupes where id = :grp \gset
insert into public.taches (groupe_id, titre) values (:grp, 'Plan');

select test.je_suis(:'C');
select test.ok((select count(*) = 0 from public.groupes), 'non-membre : groupe invisible');
select test.ok((select count(*) = 0 from public.taches), 'non-membre : tâches invisibles');
select test.refuse(format($q$ insert into public.taches (groupe_id, titre) values (%s, 'x') $q$, :grp),
  'non-membre : ajouter une tâche');
select test.refuse(format($q$ insert into public.membres (groupe_id, profil_id) values (%s, auth.uid()) $q$, :grp),
  'entrer dans un groupe sans le code');
select test.refuse(format($q$ insert into storage.objects (bucket_id, name) values ('brouillons', '%s/%s/x.pdf') $q$, :grp, :'C'),
  'non-membre : envoyer un brouillon');

select test.je_suis(:'A');
insert into storage.objects (bucket_id, name) values ('brouillons', :'grp' || '/' || :'A' || '/plan.pdf');
insert into public.brouillons (groupe_id, titre, chemin) values (:grp, 'Plan', :'grp' || '/' || :'A' || '/plan.pdf');
select test.refuse(format($q$ update public.taches set assignee_id = %L $q$, :'C'), 'assigner un non-membre');
select test.refuse(format($q$ insert into public.brouillons (groupe_id, titre, url) values (%s, 'x', 'javascript:alert(1)') $q$, :grp),
  'lien non http');

select test.je_suis(:'C');
select test.ok((select count(*) = 0 from storage.objects), 'non-membre : fichiers invisibles');
select public.rejoindre_groupe(lower(:'code'));
select test.ok((select count(*) = 1 from storage.objects), 'membre : fichiers visibles');
select test.refuse('delete from storage.objects', 'membre : supprimer le fichier d''un autre');
select test.refuse('delete from public.brouillons', 'membre : supprimer le brouillon d''un autre');
update public.taches set assignee_id = :'C';
select test.refuse(format('delete from public.membres where profil_id = %L', :'A'), 'membre : exclure le responsable');
select test.refuse('delete from public.groupes', 'membre : supprimer le groupe');

select test.je_suis(:'A');
delete from public.membres where profil_id = :'A';
select test.je_suis(:'C');
select test.ok((select role = 'responsable' from public.membres where profil_id = :'C'),
  'le membre restant devient responsable');
delete from public.membres where profil_id = :'C';
reset role;
select test.ok((select count(*) = 0 from public.groupes), 'groupe vide supprimé');
set role authenticated;

-- Bibliothèque -----------------------------------------------------------
select test.je_suis(:'A');
select test.refuse(format($q$ insert into storage.objects (bucket_id, name) values ('bibliotheque', '%s/x.pdf') $q$, :'B'),
  'envoyer dans le dossier d''un autre');
insert into storage.objects (bucket_id, name) values ('bibliotheque', :'A' || '/fiche.pdf');
insert into public.ressources (matiere_id, type, titre, chemin) values (:eco, 'fiche', 'Fiche MCO', :'A' || '/fiche.pdf');
select id as res from public.ressources \gset
select test.refuse(format('insert into public.votes (ressource_id) values (%s)', :res), 'voter pour soi');
select test.refuse(format($q$ insert into public.ressources (matiere_id, type, titre, chemin) values (%s, 'fiche', 'Volée', '%s/a.pdf') $q$, :eco, :'B'),
  'déclarer le fichier d''un autre');
select test.refuse('update public.ressources set masquee = true', 'changer "masquée" soi-même');

select test.je_suis(:'C');
insert into public.votes (ressource_id) values (:res);
select test.ok((select nb_votes = 1 and a_vote from public.ressources_detail where id = :res), 'vote compté');
select test.ok((select points = 7 from public.classement where profil_id = :'A'), '5 + 2 points');
select test.refuse(format('insert into public.votes (ressource_id) values (%s)', :res), 'voter deux fois');
delete from public.votes where ressource_id = :res;
select test.ok((select points = 5 from public.classement where profil_id = :'A'), 'vote retiré, points retirés');
select test.refuse('delete from public.ressources', 'supprimer la ressource d''un autre');
insert into public.signalements (ressource_id, motif) values (:res, 'erreur');
select test.refuse('select public.moderer_ressource(1, true)', 'étudiant : modérer');
select test.refuse($q$ update public.signalements set statut = 'rejete' $q$, 'étudiant : clore un signalement');
select test.refuse($q$ insert into public.matieres (classe_id, nom) select id, 'Pirate' from public.classes limit 1 $q$,
  'étudiant : créer une matière');
select test.refuse('select acteur_id from public.points', 'lire qui a voté');

select test.je_suis(:'D');
select test.ok((select count(*) = 1 from public.signalements), 'modérateur voit le signalement');
select public.moderer_ressource(:res, true);
select test.ok((select public.lire_code_invitation() is not null), 'modérateur lit le code');
select public.changer_code_invitation('rentree2026');

select test.je_suis(:'C');
select test.ok((select count(*) = 0 from public.ressources_detail), 'ressource masquée invisible');
select test.ok((select count(*) = 0 from storage.objects where bucket_id = 'bibliotheque'), 'fichier masqué inaccessible');
select test.ok((select points = 0 from public.classement where profil_id = :'A'), 'ressource masquée : points suspendus');

select test.je_suis(:'D');
delete from storage.objects where bucket_id = 'bibliotheque';
delete from public.ressources where id = :res;
reset role;
select test.ok((select count(*) = 0 from public.points where ressource_id is not null), 'points nettoyés');

-- Suppression d'un compte : rien ne bloque
delete from auth.users where id = :'B';
select test.ok((select count(*) = 3 from public.profils), 'compte supprimé proprement');

\echo
\echo 'TOUS LES TESTS SONT PASSÉS'
