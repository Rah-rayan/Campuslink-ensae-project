-- =====================================================================
--  CampusLink — installation de la base de données
--  À exécuter UNE SEULE FOIS sur un projet Supabase neuf :
--  SQL Editor > New query > coller tout ce fichier > Run
--
--  Principe de sécurité : le site est public, la clé du site aussi.
--  Ce sont les règles de CE fichier (RLS) qui protègent les données.
-- =====================================================================
begin;

-- Schéma "private" : jamais exposé par l'API
create schema if not exists private;

-- ---------------------------------------------------------------------
-- 1. Réglages (code d'invitation demandé à l'inscription)
-- ---------------------------------------------------------------------
create table private.reglages (
  ligne_unique    boolean primary key default true check (ligne_unique),
  -- NULL = inscription libre (déconseillé : n'importe qui pourrait entrer)
  code_invitation text check (code_invitation is null or length(code_invitation) between 6 and 40)
);

insert into private.reglages (code_invitation)
values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table public.classes (
  id    bigint generated always as identity primary key,
  nom   text not null unique check (length(trim(nom)) between 1 and 60),
  ordre int  not null default 0
);

create table public.matieres (
  id        bigint generated always as identity primary key,
  classe_id bigint not null references public.classes on delete cascade,
  nom       text   not null check (length(trim(nom)) between 1 and 100),
  unique (classe_id, nom)
);

create table public.profils (
  id          uuid primary key references auth.users on delete cascade,
  nom_complet text not null check (length(trim(nom_complet)) between 2 and 80),
  classe_id   bigint references public.classes on delete set null,
  bio         text not null default '' check (length(bio) <= 500),
  visible     boolean not null default true,          -- apparaît dans la recherche
  role        text not null default 'etudiant' check (role in ('etudiant', 'moderateur')),
  cree_le     timestamptz not null default now()
);

-- Coordonnées : séparées du profil, visibles seulement après une demande acceptée
create table public.contacts (
  profil_id uuid primary key default auth.uid() references public.profils on delete cascade,
  telephone text not null default '' check (length(telephone) <= 30),
  email     text not null default '' check (length(email) <= 120),
  autre     text not null default '' check (length(autre) <= 120)
);

-- Auto-évaluation par matière
create table public.competences (
  profil_id  uuid     not null default auth.uid() references public.profils on delete cascade,
  matiere_id bigint   not null references public.matieres on delete cascade,
  niveau     smallint not null check (niveau between 1 and 5),
  tutorat    boolean  not null default false,
  relecture  boolean  not null default false,
  equipe     boolean  not null default false,
  primary key (profil_id, matiere_id)
);

-- Demandes d'entraide
create table public.demandes (
  id            bigint generated always as identity primary key,
  demandeur_id  uuid   not null default auth.uid() references public.profils on delete cascade,
  aidant_id     uuid   not null references public.profils on delete cascade,
  matiere_id    bigint not null references public.matieres on delete restrict,
  type          text   not null check (type in ('tutorat', 'relecture', 'equipe')),
  message       text   not null check (length(trim(message)) between 1 and 1000),
  statut        text   not null default 'en_attente'
                check (statut in ('en_attente', 'acceptee', 'refusee', 'annulee', 'terminee')),
  creee_le      timestamptz not null default now(),
  repondue_le   timestamptz,
  terminee_le   timestamptz,
  check (demandeur_id <> aidant_id)
);
create unique index demandes_une_active on public.demandes (demandeur_id, aidant_id, matiere_id)
  where statut in ('en_attente', 'acceptee');

-- Avis laissé par la personne aidée, une fois la séance faite
create table public.avis (
  demande_id  bigint   primary key references public.demandes on delete cascade,
  auteur_id   uuid     not null references public.profils on delete cascade,
  aidant_id   uuid     not null references public.profils on delete cascade,
  matiere_id  bigint   not null references public.matieres on delete restrict,
  note        smallint not null check (note between 1 and 5),
  commentaire text     not null default '' check (length(commentaire) <= 500),
  cree_le     timestamptz not null default now()
);

-- Groupes & projets
create table public.groupes (
  id          bigint generated always as identity primary key,
  nom         text not null check (length(trim(nom)) between 2 and 80),
  description text not null default '' check (length(description) <= 500),
  matiere_id  bigint references public.matieres on delete set null,
  code        text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  cree_par    uuid references public.profils on delete set null,
  cree_le     timestamptz not null default now()
);

create table public.membres (
  groupe_id  bigint not null references public.groupes on delete cascade,
  profil_id  uuid   not null references public.profils on delete cascade,
  role       text   not null default 'membre' check (role in ('responsable', 'membre')),
  rejoint_le timestamptz not null default now(),
  primary key (groupe_id, profil_id)
);

create table public.taches (
  id          bigint generated always as identity primary key,
  groupe_id   bigint not null references public.groupes on delete cascade,
  titre       text   not null check (length(trim(titre)) between 1 and 150),
  description text   not null default '' check (length(description) <= 1000),
  assignee_id uuid   references public.profils on delete set null,
  statut      text   not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'terminee')),
  echeance    date,
  creee_par   uuid   default auth.uid() references public.profils on delete set null,
  creee_le    timestamptz not null default now()
);

create table public.brouillons (
  id        bigint generated always as identity primary key,
  groupe_id bigint not null references public.groupes on delete cascade,
  auteur_id uuid   not null default auth.uid() references public.profils on delete cascade,
  titre     text   not null check (length(trim(titre)) between 1 and 150),
  note      text   not null default '' check (length(note) <= 500),
  chemin    text,
  url       text   check (url is null or (url ~* '^https?://' and length(url) <= 2000)),
  cree_le   timestamptz not null default now(),
  check ((chemin is null) <> (url is null)),
  check (chemin is null or starts_with(chemin, groupe_id::text || '/' || auteur_id::text || '/'))
);

-- Bibliothèque (fax, annales, vidéos, liens)
create table public.ressources (
  id          bigint generated always as identity primary key,
  matiere_id  bigint not null references public.matieres on delete restrict,
  auteur_id   uuid   not null default auth.uid() references public.profils on delete cascade,
  type        text   not null check (type in ('fiche', 'resume', 'annale', 'video', 'lien', 'autre')),
  titre       text   not null check (length(trim(titre)) between 3 and 150),
  description text   not null default '' check (length(description) <= 500),
  annee       smallint check (annee between 2000 and 2100),
  chemin      text unique,
  url         text check (url is null or (url ~* '^https?://' and length(url) <= 2000)),
  masquee     boolean not null default false,
  cree_le     timestamptz not null default now(),
  check ((chemin is null) <> (url is null)),
  check (chemin is null or starts_with(chemin, auteur_id::text || '/'))
);

create table public.votes (
  ressource_id bigint not null references public.ressources on delete cascade,
  profil_id    uuid   not null default auth.uid() references public.profils on delete cascade,
  cree_le      timestamptz not null default now(),
  primary key (ressource_id, profil_id)
);

create table public.signalements (
  id           bigint generated always as identity primary key,
  ressource_id bigint not null references public.ressources on delete cascade,
  auteur_id    uuid   not null default auth.uid() references public.profils on delete cascade,
  motif        text   not null check (motif in ('doublon', 'erreur', 'inapproprie', 'autre')),
  details      text   not null default '' check (length(details) <= 500),
  statut       text   not null default 'ouvert' check (statut in ('ouvert', 'traite', 'rejete')),
  cree_le      timestamptz not null default now(),
  traite_par   uuid references public.profils on delete set null,
  traite_le    timestamptz,
  unique (ressource_id, auteur_id)
);

-- Journal des points (écrit uniquement par la base, jamais par le site)
create table public.points (
  id           bigint generated always as identity primary key,
  profil_id    uuid   not null references public.profils on delete cascade,
  valeur       int    not null,
  motif        text   not null check (motif in ('partage', 'vote_utile', 'entraide', 'entraide_bonus')),
  ressource_id bigint references public.ressources on delete cascade,
  demande_id   bigint references public.demandes on delete cascade,
  acteur_id    uuid,          -- qui a déclenché le gain (votant, personne aidée)
  cree_le      timestamptz not null default now(),
  unique nulls not distinct (profil_id, motif, ressource_id, demande_id, acteur_id)
);

create index on public.competences (matiere_id);
create index on public.demandes (aidant_id, statut);
create index on public.demandes (demandeur_id, statut);
create index on public.avis (aidant_id, matiere_id);
create index on public.membres (profil_id);
create index on public.taches (groupe_id);
create index on public.taches (assignee_id);
create index on public.brouillons (groupe_id);
create index on public.ressources (matiere_id);
create index on public.ressources (auteur_id);
create index on public.signalements (statut);
create index on public.points (profil_id);

-- ---------------------------------------------------------------------
-- 3. Fonctions internes (utilisées par les règles de sécurité)
-- ---------------------------------------------------------------------
create function private.est_moderateur() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'moderateur')
$$;

create function private.est_membre(p_groupe bigint, p_profil uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membres where groupe_id = p_groupe and profil_id = p_profil)
$$;

create function private.est_responsable(p_groupe bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membres
                 where groupe_id = p_groupe and profil_id = auth.uid() and role = 'responsable')
$$;

-- Variantes pour le stockage (le nom du dossier arrive sous forme de texte)
create function private.membre_dossier(p_dossier text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membres
                 where groupe_id::text = p_dossier and profil_id = auth.uid())
$$;

create function private.responsable_dossier(p_dossier text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membres
                 where groupe_id::text = p_dossier and profil_id = auth.uid() and role = 'responsable')
$$;

create function private.en_relation(p_autre uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.demandes
                 where statut in ('acceptee', 'terminee')
                   and ((demandeur_id = auth.uid() and aidant_id = p_autre)
                     or (aidant_id = auth.uid() and demandeur_id = p_autre)))
$$;

create function private.peut_aider(p_aidant uuid, p_matiere bigint, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.competences c
    join public.profils p on p.id = c.profil_id
    where c.profil_id = p_aidant and c.matiere_id = p_matiere and p.visible
      and case p_type when 'tutorat' then c.tutorat
                      when 'relecture' then c.relecture
                      when 'equipe' then c.equipe
                      else false end)
$$;

create function private.profil_visible(p_profil uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profils where id = p_profil and visible)
$$;

create function private.ressource_masquee(p_ressource bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select masquee from public.ressources where id = p_ressource), false)
$$;

create function private.peut_voter(p_ressource bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ressources
                 where id = p_ressource and not masquee and auteur_id <> auth.uid())
$$;

create function private.fichier_visible(p_chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ressources where chemin = p_chemin and not masquee)
$$;

create function private.nb_votes(p_ressource bigint) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.votes where ressource_id = p_ressource
$$;

create function private.nb_signalements(p_ressource bigint) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.signalements where ressource_id = p_ressource and statut = 'ouvert'
$$;

-- ---------------------------------------------------------------------
-- 4. Automatismes (inscription, garde-fous, points)
-- ---------------------------------------------------------------------

-- À l'inscription : vérifie le code d'invitation puis crée le profil
create function private.nouvel_utilisateur() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_nom  text;
begin
  select code_invitation into v_code from private.reglages;
  if v_code is not null
     and upper(trim(coalesce(new.raw_user_meta_data ->> 'code_invitation', ''))) <> upper(v_code) then
    raise exception 'CODE_INVITATION_INVALIDE';
  end if;

  v_nom := trim(coalesce(new.raw_user_meta_data ->> 'nom_complet', ''));
  if length(v_nom) < 2 then v_nom := 'Nouvel étudiant'; end if;

  insert into public.profils (id, nom_complet) values (new.id, trim(left(v_nom, 80)));
  return new;
end $$;

create trigger campuslink_nouvel_utilisateur
  after insert on auth.users
  for each row execute function private.nouvel_utilisateur();

-- Anti-spam : 10 demandes en attente au maximum par personne
create function private.limiter_demandes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.demandes
      where demandeur_id = new.demandeur_id and statut = 'en_attente') >= 10 then
    raise exception 'Tu as déjà 10 demandes en attente. Attends des réponses ou annules-en.';
  end if;
  return new;
end $$;

create trigger limiter_demandes before insert on public.demandes
  for each row execute function private.limiter_demandes();

-- Quand quelqu'un quitte un groupe : libérer ses tâches, garder un responsable
create function private.apres_depart() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groupes where id = old.groupe_id) then
    return old;   -- le groupe entier est en cours de suppression
  end if;

  update public.taches set assignee_id = null
   where groupe_id = old.groupe_id and assignee_id = old.profil_id;

  if not exists (select 1 from public.membres where groupe_id = old.groupe_id) then
    delete from public.groupes where id = old.groupe_id;
  elsif not exists (select 1 from public.membres
                    where groupe_id = old.groupe_id and role = 'responsable') then
    update public.membres set role = 'responsable'
     where groupe_id = old.groupe_id
       and profil_id = (select profil_id from public.membres
                        where groupe_id = old.groupe_id order by rejoint_le, profil_id limit 1);
  end if;
  return old;
end $$;

create trigger apres_depart after delete on public.membres
  for each row execute function private.apres_depart();

-- Points : +5 par partage (5 partages récompensés au maximum par 24 h)
create function private.points_partage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.points
      where profil_id = new.auteur_id and motif = 'partage'
        and cree_le > now() - interval '24 hours') < 5 then
    insert into public.points (profil_id, valeur, motif, ressource_id)
    values (new.auteur_id, 5, 'partage', new.id);
  end if;
  return new;
end $$;

create trigger points_partage after insert on public.ressources
  for each row execute function private.points_partage();

-- Points : +2 par vote « utile » reçu (retirés si le vote est retiré)
create function private.points_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.points (profil_id, valeur, motif, ressource_id, acteur_id)
    select auteur_id, 2, 'vote_utile', id, new.profil_id
    from public.ressources where id = new.ressource_id
    on conflict do nothing;
    return new;
  end if;
  delete from public.points
   where motif = 'vote_utile' and ressource_id = old.ressource_id and acteur_id = old.profil_id;
  return old;
end $$;

create trigger points_vote after insert or delete on public.votes
  for each row execute function private.points_vote();

-- Points : +10 par séance évaluée, +5 si la note est 4 ou 5.
-- Une même paire (aidant, aidé) ne rapporte qu'une fois tous les 7 jours.
create function private.points_entraide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.points
             where profil_id = new.aidant_id and acteur_id = new.auteur_id
               and motif = 'entraide' and cree_le > now() - interval '7 days') then
    return new;
  end if;
  insert into public.points (profil_id, valeur, motif, demande_id, acteur_id)
  values (new.aidant_id, 10, 'entraide', new.demande_id, new.auteur_id);
  if new.note >= 4 then
    insert into public.points (profil_id, valeur, motif, demande_id, acteur_id)
    values (new.aidant_id, 5, 'entraide_bonus', new.demande_id, new.auteur_id);
  end if;
  return new;
end $$;

create trigger points_entraide after insert on public.avis
  for each row execute function private.points_entraide();

-- ---------------------------------------------------------------------
-- 5. Actions appelées par le site (elles vérifient elles-mêmes les droits)
-- ---------------------------------------------------------------------
create function public.repondre_demande(p_demande bigint, p_accepter boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.demandes
     set statut = case when p_accepter then 'acceptee' else 'refusee' end, repondue_le = now()
   where id = p_demande and aidant_id = auth.uid() and statut = 'en_attente';
  if not found then raise exception 'Cette demande n''attend plus de réponse de ta part.'; end if;
end $$;

create function public.annuler_demande(p_demande bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.demandes set statut = 'annulee'
   where id = p_demande and demandeur_id = auth.uid() and statut in ('en_attente', 'acceptee');
  if not found then raise exception 'Cette demande ne peut plus être annulée.'; end if;
end $$;

create function public.terminer_demande(p_demande bigint, p_note int, p_commentaire text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.demandes;
begin
  select * into d from public.demandes where id = p_demande for update;
  if not found or d.demandeur_id is distinct from auth.uid() then
    raise exception 'Demande introuvable.';
  end if;
  if d.statut <> 'acceptee' then
    raise exception 'Seule une demande acceptée peut être clôturée.';
  end if;
  if p_note is null or p_note not between 1 and 5 then
    raise exception 'La note doit être comprise entre 1 et 5.';
  end if;
  insert into public.avis (demande_id, auteur_id, aidant_id, matiere_id, note, commentaire)
  values (d.id, d.demandeur_id, d.aidant_id, d.matiere_id, p_note, trim(coalesce(p_commentaire, '')));
  update public.demandes set statut = 'terminee', terminee_le = now() where id = d.id;
end $$;

create function public.creer_groupe(p_nom text, p_description text default '', p_matiere bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord.'; end if;
  insert into public.groupes (nom, description, matiere_id, cree_par)
  values (trim(p_nom), trim(coalesce(p_description, '')), p_matiere, auth.uid())
  returning id into v_id;
  insert into public.membres (groupe_id, profil_id, role) values (v_id, auth.uid(), 'responsable');
  return v_id;
end $$;

create function public.rejoindre_groupe(p_code text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'Connecte-toi d''abord.'; end if;
  select id into v_id from public.groupes where code = upper(trim(p_code));
  if v_id is null then raise exception 'Aucun groupe ne correspond à ce code.'; end if;
  insert into public.membres (groupe_id, profil_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

-- Modération
create function public.moderer_ressource(p_ressource bigint, p_masquer boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_moderateur() then raise exception 'Réservé aux modérateurs.'; end if;
  update public.ressources set masquee = p_masquer where id = p_ressource;
  if p_masquer then
    update public.signalements set statut = 'traite', traite_par = auth.uid(), traite_le = now()
     where ressource_id = p_ressource and statut = 'ouvert';
  end if;
end $$;

create function public.rejeter_signalement(p_signalement bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_moderateur() then raise exception 'Réservé aux modérateurs.'; end if;
  update public.signalements set statut = 'rejete', traite_par = auth.uid(), traite_le = now()
   where id = p_signalement and statut = 'ouvert';
end $$;

create function public.lire_code_invitation() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_moderateur() then raise exception 'Réservé aux modérateurs.'; end if;
  return (select code_invitation from private.reglages);
end $$;

create function public.changer_code_invitation(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_moderateur() then raise exception 'Réservé aux modérateurs.'; end if;
  if length(trim(coalesce(p_code, ''))) not between 6 and 40 then
    raise exception 'Le code doit contenir entre 6 et 40 caractères.';
  end if;
  update private.reglages set code_invitation = upper(trim(p_code)) where ligne_unique;
end $$;

-- ---------------------------------------------------------------------
-- 6. Vues (elles respectent les règles de sécurité de l'utilisateur)
-- ---------------------------------------------------------------------

-- Évaluations des pairs : une voix par évaluateur (un ami ne compte qu'une fois)
create view public.evaluations_pairs with (security_invoker = true) as
  select aidant_id, matiere_id,
         count(*)::int  as nb_pairs,
         sum(note_pair) as somme,
         avg(note_pair) as moyenne
  from (select aidant_id, matiere_id, auteur_id, avg(note) as note_pair
        from public.avis group by aidant_id, matiere_id, auteur_id) t
  group by aidant_id, matiere_id;

-- Annuaire : score = (3 × auto-évaluation + somme des notes des pairs) / (3 + nombre de pairs)
create view public.annuaire with (security_invoker = true) as
  select c.profil_id, p.nom_complet, p.bio, p.classe_id, cl.nom as classe,
         c.matiere_id, m.nom as matiere, mc.nom as matiere_classe,
         c.niveau, c.tutorat, c.relecture, c.equipe,
         coalesce(e.nb_pairs, 0) as nb_pairs,
         round(e.moyenne, 2) as moyenne_pairs,
         round((3 * c.niveau + coalesce(e.somme, 0))::numeric / (3 + coalesce(e.nb_pairs, 0)), 2) as score
  from public.competences c
  join public.profils p  on p.id = c.profil_id
  join public.matieres m on m.id = c.matiere_id
  join public.classes mc on mc.id = m.classe_id
  left join public.classes cl on cl.id = p.classe_id
  left join public.evaluations_pairs e on e.aidant_id = c.profil_id and e.matiere_id = c.matiere_id
  where p.visible or p.id = auth.uid();

create view public.ressources_detail with (security_invoker = true) as
  select r.id, r.matiere_id, r.auteur_id, r.type, r.titre, r.description, r.annee,
         r.chemin, r.url, r.masquee, r.cree_le,
         m.nom as matiere, m.classe_id, c.nom as classe, p.nom_complet as auteur,
         private.nb_votes(r.id) as nb_votes,
         private.nb_signalements(r.id) as nb_signalements,
         exists (select 1 from public.votes v
                 where v.ressource_id = r.id and v.profil_id = auth.uid()) as a_vote
  from public.ressources r
  join public.matieres m on m.id = r.matiere_id
  join public.classes c  on c.id = m.classe_id
  join public.profils p  on p.id = r.auteur_id;

-- Points et badges
create view public.classement with (security_invoker = true) as
  select p.id as profil_id, p.nom_complet, c.nom as classe,
         pt.total as points, r.nb as nb_partages, t.nb as nb_pairs_satisfaits,
         r.nb >= 5     as badge_contributeur,
         t.nb >= 3     as badge_tuteur,
         pt.total >= 100 as badge_pilier
  from public.profils p
  left join public.classes c on c.id = p.classe_id
  cross join lateral (
    select coalesce(sum(valeur), 0)::int as total from public.points
    where profil_id = p.id
      and (ressource_id is null or not private.ressource_masquee(ressource_id))) pt
  cross join lateral (
    select count(*)::int as nb from public.ressources where auteur_id = p.id and not masquee) r
  cross join lateral (
    select count(distinct auteur_id)::int as nb from public.avis where aidant_id = p.id and note >= 4) t;

-- ---------------------------------------------------------------------
-- 7. Droits d'accès : rien pour les visiteurs, le strict nécessaire pour
--    les membres connectés (puis filtrage ligne par ligne par les règles)
-- ---------------------------------------------------------------------
revoke all on private.reglages from public, anon, authenticated;

revoke all on
  public.classes, public.matieres, public.profils, public.contacts, public.competences,
  public.demandes, public.avis, public.groupes, public.membres, public.taches,
  public.brouillons, public.ressources, public.votes, public.signalements, public.points,
  public.evaluations_pairs, public.annuaire, public.ressources_detail, public.classement
from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.classes, public.matieres to authenticated;
grant select on public.profils to authenticated;
grant update (nom_complet, classe_id, bio, visible) on public.profils to authenticated;
grant select, insert, update, delete on public.contacts, public.competences to authenticated;
grant select on public.demandes to authenticated;
grant insert (aidant_id, matiere_id, type, message) on public.demandes to authenticated;
grant select on public.avis to authenticated;
grant select, delete on public.groupes to authenticated;
grant update (nom, description, matiere_id) on public.groupes to authenticated;
grant select, delete on public.membres to authenticated;
grant select, delete on public.taches to authenticated;
grant insert (groupe_id, titre, description, assignee_id, statut, echeance) on public.taches to authenticated;
grant update (titre, description, assignee_id, statut, echeance) on public.taches to authenticated;
grant select, delete on public.brouillons to authenticated;
grant insert (groupe_id, titre, note, chemin, url) on public.brouillons to authenticated;
grant select, delete on public.ressources to authenticated;
grant insert (matiere_id, type, titre, description, annee, chemin, url) on public.ressources to authenticated;
grant update (matiere_id, type, titre, description, annee) on public.ressources to authenticated;
grant select, delete on public.votes to authenticated;
grant insert (ressource_id) on public.votes to authenticated;
grant select on public.signalements to authenticated;
grant insert (ressource_id, motif, details) on public.signalements to authenticated;
-- la colonne acteur_id (qui a voté) reste confidentielle
grant select (id, profil_id, valeur, motif, ressource_id, demande_id, cree_le) on public.points to authenticated;
grant select on public.evaluations_pairs, public.annuaire, public.ressources_detail, public.classement to authenticated;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.est_moderateur(), private.est_membre(bigint, uuid), private.est_responsable(bigint),
  private.membre_dossier(text), private.responsable_dossier(text), private.en_relation(uuid),
  private.peut_aider(uuid, bigint, text), private.profil_visible(uuid),
  private.ressource_masquee(bigint), private.peut_voter(bigint), private.fichier_visible(text),
  private.nb_votes(bigint), private.nb_signalements(bigint)
to authenticated;

revoke all on function
  public.repondre_demande(bigint, boolean), public.annuler_demande(bigint),
  public.terminer_demande(bigint, int, text), public.creer_groupe(text, text, bigint),
  public.rejoindre_groupe(text), public.moderer_ressource(bigint, boolean),
  public.rejeter_signalement(bigint), public.lire_code_invitation(),
  public.changer_code_invitation(text)
from public, anon;
grant execute on function
  public.repondre_demande(bigint, boolean), public.annuler_demande(bigint),
  public.terminer_demande(bigint, int, text), public.creer_groupe(text, text, bigint),
  public.rejoindre_groupe(text), public.moderer_ressource(bigint, boolean),
  public.rejeter_signalement(bigint), public.lire_code_invitation(),
  public.changer_code_invitation(text)
to authenticated;

-- ---------------------------------------------------------------------
-- 8. Règles de sécurité ligne par ligne (RLS)
-- ---------------------------------------------------------------------
alter table public.classes      enable row level security;
alter table public.matieres     enable row level security;
alter table public.profils      enable row level security;
alter table public.contacts     enable row level security;
alter table public.competences  enable row level security;
alter table public.demandes     enable row level security;
alter table public.avis         enable row level security;
alter table public.groupes      enable row level security;
alter table public.membres      enable row level security;
alter table public.taches       enable row level security;
alter table public.brouillons   enable row level security;
alter table public.ressources   enable row level security;
alter table public.votes        enable row level security;
alter table public.signalements enable row level security;
alter table public.points       enable row level security;

-- classes et matières : lecture pour tous les membres, écriture par la modération
create policy lire on public.classes  for select to authenticated using (true);
create policy gerer on public.classes for all to authenticated
  using ((select private.est_moderateur())) with check ((select private.est_moderateur()));
create policy lire on public.matieres  for select to authenticated using (true);
create policy gerer on public.matieres for all to authenticated
  using ((select private.est_moderateur())) with check ((select private.est_moderateur()));

create policy lire on public.profils for select to authenticated using (true);
create policy modifier_le_mien on public.profils for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy lire on public.contacts for select to authenticated
  using (profil_id = (select auth.uid()) or private.en_relation(profil_id));
create policy ajouter on public.contacts for insert to authenticated
  with check (profil_id = (select auth.uid()));
create policy modifier on public.contacts for update to authenticated
  using (profil_id = (select auth.uid())) with check (profil_id = (select auth.uid()));
create policy supprimer on public.contacts for delete to authenticated
  using (profil_id = (select auth.uid()));

create policy lire on public.competences for select to authenticated
  using (profil_id = (select auth.uid()) or private.profil_visible(profil_id));
create policy ajouter on public.competences for insert to authenticated
  with check (profil_id = (select auth.uid()));
create policy modifier on public.competences for update to authenticated
  using (profil_id = (select auth.uid())) with check (profil_id = (select auth.uid()));
create policy supprimer on public.competences for delete to authenticated
  using (profil_id = (select auth.uid()));

create policy lire_les_miennes on public.demandes for select to authenticated
  using (demandeur_id = (select auth.uid()) or aidant_id = (select auth.uid()));
create policy demander on public.demandes for insert to authenticated
  with check (demandeur_id = (select auth.uid()) and statut = 'en_attente'
              and private.peut_aider(aidant_id, matiere_id, type));

create policy lire on public.avis for select to authenticated using (true);

create policy lire on public.groupes for select to authenticated
  using (private.est_membre(id));
create policy modifier on public.groupes for update to authenticated
  using (private.est_responsable(id)) with check (private.est_responsable(id));
create policy supprimer on public.groupes for delete to authenticated
  using (private.est_responsable(id));

create policy lire on public.membres for select to authenticated
  using (private.est_membre(groupe_id));
create policy quitter_ou_retirer on public.membres for delete to authenticated
  using (profil_id = (select auth.uid()) or private.est_responsable(groupe_id));

create policy lire on public.taches for select to authenticated
  using (private.est_membre(groupe_id));
create policy ajouter on public.taches for insert to authenticated
  with check (private.est_membre(groupe_id) and creee_par = (select auth.uid())
              and (assignee_id is null or private.est_membre(groupe_id, assignee_id)));
create policy modifier on public.taches for update to authenticated
  using (private.est_membre(groupe_id))
  with check (private.est_membre(groupe_id)
              and (assignee_id is null or private.est_membre(groupe_id, assignee_id)));
create policy supprimer on public.taches for delete to authenticated
  using (private.est_membre(groupe_id));

create policy lire on public.brouillons for select to authenticated
  using (private.est_membre(groupe_id));
create policy ajouter on public.brouillons for insert to authenticated
  with check (private.est_membre(groupe_id) and auteur_id = (select auth.uid()));
create policy supprimer on public.brouillons for delete to authenticated
  using (private.est_membre(groupe_id)
         and (auteur_id = (select auth.uid()) or private.est_responsable(groupe_id)));

create policy lire on public.ressources for select to authenticated
  using (not masquee or auteur_id = (select auth.uid()) or (select private.est_moderateur()));
create policy partager on public.ressources for insert to authenticated
  with check (auteur_id = (select auth.uid()) and not masquee);
create policy modifier on public.ressources for update to authenticated
  using (auteur_id = (select auth.uid())) with check (auteur_id = (select auth.uid()));
create policy supprimer on public.ressources for delete to authenticated
  using (auteur_id = (select auth.uid()) or (select private.est_moderateur()));

create policy lire_les_miens on public.votes for select to authenticated
  using (profil_id = (select auth.uid()));
create policy voter on public.votes for insert to authenticated
  with check (profil_id = (select auth.uid()) and private.peut_voter(ressource_id));
create policy retirer on public.votes for delete to authenticated
  using (profil_id = (select auth.uid()));

create policy lire on public.signalements for select to authenticated
  using (auteur_id = (select auth.uid()) or (select private.est_moderateur()));
create policy signaler on public.signalements for insert to authenticated
  with check (auteur_id = (select auth.uid()) and statut = 'ouvert');

create policy lire on public.points for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 9. Fichiers (Supabase Storage) : 2 espaces privés, 10 Mo par fichier
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b, b, false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation']
from unnest(array['bibliotheque', 'brouillons']) as b
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Bibliothèque : fichiers rangés dans <id de l'auteur>/...
create policy campuslink_biblio_lire on storage.objects for select to authenticated
  using (bucket_id = 'bibliotheque'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select private.est_moderateur())
              or private.fichier_visible(name)));
create policy campuslink_biblio_envoyer on storage.objects for insert to authenticated
  with check (bucket_id = 'bibliotheque'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy campuslink_biblio_supprimer on storage.objects for delete to authenticated
  using (bucket_id = 'bibliotheque'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select private.est_moderateur())));

-- Brouillons de groupe : fichiers rangés dans <id du groupe>/<id de l'auteur>/...
create policy campuslink_brouillons_lire on storage.objects for select to authenticated
  using (bucket_id = 'brouillons' and private.membre_dossier((storage.foldername(name))[1]));
create policy campuslink_brouillons_envoyer on storage.objects for insert to authenticated
  with check (bucket_id = 'brouillons'
              and private.membre_dossier((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy campuslink_brouillons_supprimer on storage.objects for delete to authenticated
  using (bucket_id = 'brouillons'
         and private.membre_dossier((storage.foldername(name))[1])
         and ((storage.foldername(name))[2] = (select auth.uid())::text
              or private.responsable_dossier((storage.foldername(name))[1])));

commit;

-- Le code à donner aux étudiants pour qu'ils s'inscrivent :
select code_invitation from private.reglages;
