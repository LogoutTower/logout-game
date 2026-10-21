#!/usr/bin/env bash
# Re-sync the pixel artist's finished modules into js/ (the game never imports from outside the repo).
# Usage: scripts/sync-art.sh [art-v2 dir]   then: node scripts/stamp.mjs && node test/hero64.test.mjs
set -euo pipefail
ART="${1:-/workspace/art-v2}"; cd "$(dirname "$0")/.."
for pair in "heroes-64/heroes64.mjs:js/hero64.js" "heroes-64/gm.mjs:js/gm64.js" "town/npcs.mjs:js/npc64.js"; do
  src="$ART/${pair%%:*}"; dst="${pair##*:}"; cp "$src" "$dst"; echo "synced $dst <- $src"; done
