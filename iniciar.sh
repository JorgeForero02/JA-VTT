#!/usr/bin/env sh
# Arranca Mini VTT en http://localhost:3000 (o en el puerto que indiques: ./iniciar.sh 4000)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instala la versión LTS (22 o superior) desde https://nodejs.org"
  exit 1
fi
exec node server.js "$@"
