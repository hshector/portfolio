#!/usr/bin/env bash
# Copies WarrenIA's pure TypeScript modules (no server, no database) and their unit tests into
# vendor/warrenia, so the pavilion's demo runs on the app's own code. Usage:
#   scripts/warrenia/vendor.sh /path/to/warrenia   (a checkout of github.com/hshector/warrenia)
# Only the "@/lib/…" alias is rewritten to relative paths; nothing else is changed.
set -euo pipefail
src="${1:?path to a warrenia checkout}"
dst="$(cd "$(dirname "$0")/../.." && pwd)/vendor/warrenia"
rev=$(git -C "$src" rev-parse --short HEAD)
files=(
  format.ts format.test.ts
  portfolio/engine.ts portfolio/engine.test.ts portfolio/xirr.ts portfolio/tax.ts portfolio/tax.test.ts portfolio/types.ts
  plan/catalog.ts plan/catalog.test.ts plan/projection.ts plan/projection.test.ts
  market/radar.ts market/radar.test.ts market/types.ts market/series.ts
)
rm -rf "$dst"
for f in "${files[@]}"; do
  mkdir -p "$dst/lib/$(dirname "$f")"
  depth=$(awk -F/ '{print NF-1}' <<<"$f")
  up=$([ "$depth" = 0 ] && echo "./" || printf '../%.0s' $(seq 1 "$depth"))
  sed -E "s#from \"@/lib/#from \"${up}#g" "$src/web/lib/$f" > "$dst/lib/$f"
done
cat > "$dst/README.md" <<MD
# WarrenIA (copia de su lógica)

Módulos de \`web/lib\` de https://github.com/hshector/warrenia en el commit \`$rev\`, copiados con
\`scripts/warrenia/vendor.sh\`. Son TypeScript puro (cartera con FIFO, TWR y TIR, impuestos españoles,
plan mensual, abanico de proyección y radar) y sus tests se ejecutan con los del portfolio (\`npm test\`).
La demo del pabellón (src/warrenia-demo) los usa con datos ficticios. El código es de Héctor Sanchis.
MD
echo "vendored ${#files[@]} files from warrenia@$rev"
