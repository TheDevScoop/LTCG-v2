#!/bin/bash
# fix-packages.sh — Nuke stale node_modules, junk dirs, and reinstall cleanly
set -euo pipefail

echo "=== LTCG-v2 Package Cleanup ==="

# 1. Remove junk directories left by Codex agent
echo "[1/4] Removing junk directories..."
rm -rf "./--with-vercel-json"
rm -rf "./tools/promo-video"
# Remove tools/ if empty after promo-video deletion
rmdir ./tools 2>/dev/null || true

# 2. Nuke all node_modules and lockfile (fixes esbuild platform mismatch)
echo "[2/4] Nuking node_modules + bun.lockb..."
rm -rf node_modules
rm -rf apps/web/node_modules
rm -rf packages/engine/node_modules
rm -rf packages/lunchtable-tcg-cards/node_modules
rm -rf packages/lunchtable-tcg-match/node_modules
rm -rf packages/lunchtable-tcg-story/node_modules
rm -rf packages/lunchtable-tcg-guilds/node_modules
rm -rf packages/plugin-ltcg/node_modules
rm -f bun.lockb

# 3. Clean install
echo "[3/4] Running bun install..."
bun install

# 4. Verify esbuild platform
echo "[4/4] Verifying esbuild platform..."
ESBUILD_PLATFORM=$(node -e "console.log(process.arch + '-' + process.platform)")
echo "Platform: $ESBUILD_PLATFORM"

echo ""
echo "=== Done! ==="
echo "Next steps:"
echo "  1. Run 'npx convex dev' (will prompt browser auth if needed)"
echo "  2. Run 'bun run dev' to start both Convex + Vite"
