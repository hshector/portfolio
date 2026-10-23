#!/usr/bin/env bash
# Copies WarrenIA's web app (its pages, server actions, components, lib and styles) into
# vendor/warrenia/web, so the pavilion runs the real app: same screens, same code. Usage:
#   scripts/warrenia/vendor.sh /path/to/warrenia   (a checkout of github.com/hshector/warrenia)
#
# The files are copied as they are; then scripts/warrenia/demo.patch adapts the few places that
# show a market price (the public extract has none: see src/warrenia-app/README.md). What only
# exists on a server (Supabase, the data storage, Next.js itself) is replaced at build time by
# src/warrenia-app/shims, never edited here.
set -euo pipefail
src="${1:?path to a warrenia checkout}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
dst="$root/vendor/warrenia"
rev=$(git -C "$src" rev-parse --short HEAD)
rm -rf "$dst"
mkdir -p "$dst/web/app"
cp -R "$src/web/components" "$src/web/lib" "$dst/web/"
cp -R "$src/web/app/(app)" "$dst/web/app/"
cp "$src/web/app/globals.css" "$dst/web/app/"
# Tests that need a server, a database or Next.js stay in WarrenIA; the rest run with ours.
find "$dst/web" \( -path '*/lib/supabase/*' -o -path '*/lib/user/store*' -o -name 'source.test.ts' -o -name '*.test.tsx' \) -name '*.test.*' -delete
(cd "$dst" && patch -p1 --no-backup-if-mismatch < "$root/scripts/warrenia/demo.patch")
cat > "$dst/README.md" <<MD
# WarrenIA (copia de su web)

La app web de https://github.com/hshector/warrenia en el commit \`$rev\` (\`web/app/(app)\`, \`web/components\`,
\`web/lib\` y los estilos), copiada con \`scripts/warrenia/vendor.sh\`. Solo cambia lo de
\`scripts/warrenia/demo.patch\` (dónde se mostraba un precio de mercado). Lo que solo existe en un servidor
lo sustituye \`src/warrenia-app/shims\` al compilar. Los tests de \`lib\` se ejecutan con los del portfolio.
MD
echo "vendored warrenia@$rev ($(find "$dst/web" -type f | wc -l) files)"
