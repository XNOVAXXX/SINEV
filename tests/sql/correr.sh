#!/bin/sh
# Crea la base desde cero con los SQL del proyecto y ejecuta las pruebas.
# Usa las variables de conexión normales de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
set -e
cd "$(dirname "$0")/../.."
correr() { echo "→ $1"; psql -v ON_ERROR_STOP=1 -q -X -f "$1" > /dev/null; }
correr tests/sql/00_simular_supabase.sql
for f in 01_schema 02_datos 03_campanas 04_actualizaciones 05_sin_edicion 06_privacidad 07_corregir_datos 08_estadisticas; do
  correr "SUPABASE/$f.sql"
done
# Los scripts deben poder repetirse sin problema
for f in 04_actualizaciones 05_sin_edicion 06_privacidad 07_corregir_datos 08_estadisticas; do
  correr "SUPABASE/$f.sql"
done
echo "→ tests/sql/verificar.sql"
psql -v ON_ERROR_STOP=1 -q -X -t -f tests/sql/verificar.sql
