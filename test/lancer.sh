#!/usr/bin/env bash
# Teste la base sur un PostgreSQL 15+ jetable (variables PGHOST, PGUSER, PGPASSWORD...).
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=campuslink_test
dropdb --if-exists "$BASE"
createdb "$BASE"
q() { psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" "$@"; }
q -f tests/imitation_supabase.sql
q -f supabase/01_installation.sql >/dev/null
q -f supabase/02_classes_matieres.sql
q -f supabase/02_classes_matieres.sql   # relançable sans doublon
q -f tests/securite.sql >/dev/null
dropdb "$BASE"
echo "Base de données : tous les tests sont passés."
