-- =====================================================================
--  Classes et matières de départ.
--  CE SONT DES EXEMPLES : adaptez-les à vos vrais programmes avant de
--  lancer ce fichier (ou modifiez-les ensuite depuis la page Modération).
--  Peut être relancé sans créer de doublons.
-- =====================================================================
insert into public.classes (nom, ordre) values
  ('ISE 1', 1), ('ISE 2', 2), ('ISE 3', 3),
  ('AS 1', 4), ('AS 2', 5), ('AS 3', 6)
on conflict (nom) do nothing;

insert into public.matieres (classe_id, nom)
select c.id, v.matiere
from (values
  ('ISE 1', 'Probabilités'),
  ('ISE 1', 'Statistique mathématique'),
  ('ISE 1', 'Microéconomie'),
  ('ISE 1', 'Analyse des données'),
  ('ISE 1', 'Algorithmique et programmation'),
  ('ISE 2', 'Économétrie'),
  ('ISE 2', 'Macroéconomie'),
  ('ISE 2', 'Théorie des sondages'),
  ('ISE 2', 'Séries temporelles'),
  ('ISE 2', 'Systèmes d''information géographique'),
  ('ISE 2', 'Logiciels statistiques (Stata, R, Python)'),
  ('ISE 3', 'Économétrie avancée'),
  ('ISE 3', 'Machine learning'),
  ('ISE 3', 'Évaluation des politiques publiques'),
  ('AS 1',  'Mathématiques'),
  ('AS 1',  'Statistique descriptive'),
  ('AS 1',  'Informatique'),
  ('AS 2',  'Probabilités'),
  ('AS 2',  'Comptabilité nationale'),
  ('AS 2',  'Techniques de sondage'),
  ('AS 3',  'Démographie'),
  ('AS 3',  'Gestion de bases de données')
) as v(classe, matiere)
join public.classes c on c.nom = v.classe
on conflict (classe_id, nom) do nothing;
