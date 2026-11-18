#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
test -f server/dist/index.js
test -f server/dist/seed-super-admin.js
test -f server/dist/seed-content.js
test -f server/dist/seed-landing-content.js
test -f client/dist/index.html
mkdir -p dist
staging=$(mktemp -d "$root/dist/.azure-package.XXXXXX")
trap 'rm -rf "$staging"' EXIT
trap 'exit 130' HUP INT TERM
mkdir -p "$staging/server/prisma" "$staging/client" "$staging/shared" "$staging/deploy"
cp package.json package-lock.json "$staging/"
cp server/package.json "$staging/server/"
cp -R server/dist "$staging/server/"
cp server/prisma/schema.prisma "$staging/server/prisma/"
cp -R server/prisma/migrations "$staging/server/prisma/"
cp client/package.json "$staging/client/"
cp -R client/dist "$staging/client/"
cp shared/package.json "$staging/shared/"
cp -R shared/src "$staging/shared/"
cp deploy/start-production.mjs "$staging/deploy/"
cp -a node_modules "$staging/node_modules"
npm prune --omit=dev --ignore-scripts --no-audit --offline --prefix "$staging"
test -f "$staging/node_modules/prisma/build/index.js"
test -f "$staging/node_modules/.prisma/client/index.js"
test -f "$staging/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
node -e "require(process.argv[1])" "$staging/node_modules/argon2"
archive="$root/dist/azure-deployment.zip"
if [ -f "$archive" ]; then rm "$archive"; fi
cd "$staging"
zip -q -r -y "$archive" .
printf 'Created %s without development databases, .env files, or publish profiles.\n' "$archive"
