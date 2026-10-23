#!/usr/bin/env bash
# The public extract of WarrenIA's latest night (scores, reasons, SEC fundamentals and logos; no
# prices), which WarrenIA's engine publishes as the asset of its `public-data` release
# (engine/warrenia_engine/public.py there). Unpacked into .warrenia-public/data/, which the demo's
# build copies to /warrenia-app/data/.
#   WARRENIA_PUBLIC_DIR=<folder>  use an extract already on disk (e.g. made from the engine's demo data)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
dst="$root/.warrenia-public/data"
url="https://github.com/hshector/warrenia/releases/download/public-data/public-data.tar.gz"
rm -rf "$dst" && mkdir -p "$dst"
if [ -n "${WARRENIA_PUBLIC_DIR:-}" ]; then
  cp -R "$WARRENIA_PUBLIC_DIR"/. "$dst"/
else
  curl -fsSL --retry 3 "$url" | tar -xz -C "$dst"
fi
node -e '
const l = require(process.argv[1] + "/latest.json");
const n = require("fs").readdirSync(process.argv[1] + "/assets").length;
console.log(`WarrenIA extract: session ${l.data_asof}${l.demo ? " (DEMO data)" : ""}, ${n} assets`);
' "$dst"
