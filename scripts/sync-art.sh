#!/usr/bin/env bash
# Re-sync the pixel artist's finished modules into js/ (the game never imports from outside the repo).
# Usage: scripts/sync-art.sh [art-v2 dir]   then: node scripts/stamp.mjs && node test/hero64.test.mjs
set -euo pipefail
ART="${1:-/workspace/art-v2}"; cd "$(dirname "$0")/.."
for pair in "heroes-64/heroes64.mjs:js/hero64.js" "heroes-64/gm.mjs:js/gm64.js" "town/npcs.mjs:js/npc64.js" "bosses/final-21-30/bosses-21-30.mjs:js/bosses-21-30.js"; do
  src="$ART/${pair%%:*}"; dst="${pair##*:}"; cp "$src" "$dst"; echo "synced $dst <- $src"; done
# Hair v2 (hairstyles + Jet) and the Healer module it builds on: the artist's files import ../heroes-64/heroes64.mjs and ../healer/healer.mjs, so the copies are re-pointed at the synced js/ files.
cp "$ART/healer/healer.mjs" js/healer64.js && sed -i "s#from '\./heroes64\.mjs'#from './hero64.js'#" js/healer64.js && echo "synced js/healer64.js <- $ART/healer/healer.mjs"
# Floors 21-30 signature drops (data, icons, 64x64 equip layers): re-pointed at the synced hero64.js.
cp "$ART/drops-21-30/drops-21-30.mjs" js/drops-21-30.js && sed -i "s#from '\.\./heroes-64/heroes64\.mjs'#from './hero64.js'#" js/drops-21-30.js && echo "synced js/drops-21-30.js <- $ART/drops-21-30/drops-21-30.mjs"
cp "$ART/hair-v2/hair-v2.mjs" js/hair64.js && sed -i "s#from '\.\./heroes-64/heroes64\.mjs'#from './hero64.js'#; s#from '\.\./healer/healer\.mjs'#from './healer64.js'#" js/hair64.js && echo "synced js/hair64.js <- $ART/hair-v2/hair-v2.mjs"
