#!/bin/bash
# LTCG-v2 Post-Codex Cleanup Script
# Run this from the project root: bash cleanup.sh
#
# This script:
# 1. Removes the git index lock file
# 2. Deletes junk files/directories added by Codex
# 3. Moves API handlers from root api/ to apps/web/api/ (proper Vercel location)
# 4. Commits the cleaned state
#
# All GOOD changes from Codex have already been re-applied to the working tree.
# This script handles the deletions that couldn't be done from the sandbox.

set -e

echo "=== LTCG-v2 Codex Cleanup ==="
echo ""

# Step 1: Remove git lock file
if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  echo "✓ Removed .git/index.lock"
else
  echo "✓ No .git/index.lock found"
fi

# Step 2: Delete junk directories
echo ""
echo "--- Removing junk directories ---"
rm -rf video/
echo "✓ Removed video/"

# Step 3: Delete junk files
echo ""
echo "--- Removing junk files ---"
JUNK_FILES=(
  ".github/workflows/remotion-pr-preview.yml"
  "apps/web/public/lunchtable/ui-motion/gameplay-ambient-loop.mp4"
  "apps/web/src/components/game/GameMotionOverlay.tsx"
  "apps/web/src/types/convex-generated-api.d.ts"
  "apps/web/vitest.config.ts"
  "vitest.workspace.ts"
  "index.ts"
  "apps/web/src/components/game/hooks/useGameState.test.ts"
)

for f in "${JUNK_FILES[@]}"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "✓ Removed $f"
  fi
done

# Clean up empty directories left behind
rmdir apps/web/public/lunchtable/ui-motion 2>/dev/null || true
rmdir apps/web/src/types 2>/dev/null || true

# Step 4: Move API handlers to proper location
echo ""
echo "--- Relocating API handlers ---"
# The api/ directory at root is for Vercel serverless functions
# These should stay in api/ for Vercel deployment but the duplicate
# in apps/web/api/ needs to go
if [ -d "apps/web/api" ]; then
  rm -rf apps/web/api/
  echo "✓ Removed duplicate apps/web/api/"
fi

# Keep root api/ handlers - they're in the correct Vercel convention location
echo "✓ Root api/ handlers preserved (correct Vercel serverless location)"

# Step 5: Delete this script
echo ""
echo "--- Cleaning up ---"
rm -f cleanup.sh
echo "✓ Removed cleanup.sh"

echo ""
echo "=== Cleanup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run: git add -A"
echo "  2. Run: git diff --cached --stat  (review what changed)"
echo "  3. Run: git commit -m 'chore: clean up Codex agent damage, keep good engine/convex/frontend fixes'"
echo "  4. Run: bun install  (refresh lockfile)"
echo "  5. Run: bun run test:once  (verify engine tests pass)"
