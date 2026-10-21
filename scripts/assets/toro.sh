#!/usr/bin/env bash
# Rebuilds src/assets/island/toro.glb from the Sketchfab download in assets-src/toro/.
# Steps: glTF → GLB, resample the animation, drop unused data (UVs, empty nodes), then
# meshopt compression with quantised attributes (three.js decodes it with MeshoptDecoder).
# Measured on 21 Oct 2026: 1,182,448 B → 229,436 B (114 KB gzipped).
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
unzip -q -o assets-src/toro/bull_walk_cycle.zip -d "$tmp"
npx gltf-transform copy "$tmp/scene.gltf" "$tmp/a.glb"
npx gltf-transform resample "$tmp/a.glb" "$tmp/b.glb"
npx gltf-transform prune "$tmp/b.glb" "$tmp/c.glb"
npx gltf-transform meshopt "$tmp/c.glb" src/assets/island/toro.glb
rm -rf "$tmp"
ls -l src/assets/island/toro.glb
