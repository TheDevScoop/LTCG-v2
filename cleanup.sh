#!/usr/bin/env bash
# LTCG-v2 cleanup helper for removing known transient artifacts.
# Default mode is dry-run. Use --apply to execute deletions.

set -euo pipefail

APPLY=false
AUTO_CONFIRM=false
INCLUDE_TRACKED=false

usage() {
  cat <<'EOF'
Usage: bash cleanup.sh [--apply] [--yes] [--include-tracked]

Options:
  --apply            Execute deletions. Without this flag, script is dry-run.
  --yes, -y          Skip confirmation prompt when using --apply.
  --include-tracked  Allow deleting files tracked by git.
  --help             Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=true
      ;;
    --yes|-y)
      AUTO_CONFIRM=true
      ;;
    --include-tracked)
      INCLUDE_TRACKED=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if [ ! -f "package.json" ] || [ ! -d ".git" ]; then
  echo "Run this script from the repository root."
  exit 1
fi

if [ "$APPLY" = true ] && [ "$AUTO_CONFIRM" = false ]; then
  printf "This will delete files from the working tree. Continue? [y/N] "
  read -r reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

if [ "$APPLY" = false ]; then
  echo "Running in dry-run mode. No files will be removed."
fi

is_tracked() {
  local target="$1"
  git ls-files --error-unmatch -- "$target" >/dev/null 2>&1
}

dir_has_tracked_files() {
  local dir="$1"
  [ -n "$(git ls-files -- "$dir")" ]
}

remove_file() {
  local target="$1"
  if [ ! -f "$target" ]; then
    return
  fi

  if is_tracked "$target" && [ "$INCLUDE_TRACKED" = false ]; then
    echo "⚠ Skipping tracked file: $target"
    return
  fi

  if [ "$APPLY" = true ]; then
    rm -f -- "$target"
    echo "✓ Removed $target"
  else
    echo "• Would remove $target"
  fi
}

remove_dir() {
  local target="$1"
  if [ ! -d "$target" ]; then
    return
  fi

  if dir_has_tracked_files "$target" && [ "$INCLUDE_TRACKED" = false ]; then
    echo "⚠ Skipping directory with tracked files: $target"
    return
  fi

  if [ "$APPLY" = true ]; then
    rm -rf -- "$target"
    echo "✓ Removed $target/"
  else
    echo "• Would remove $target/"
  fi
}

remove_empty_dir() {
  local target="$1"
  if [ ! -d "$target" ]; then
    return
  fi

  if [ -n "$(find "$target" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]; then
    return
  fi

  if [ "$APPLY" = true ]; then
    rmdir "$target" 2>/dev/null || true
    echo "✓ Removed empty directory $target/"
  else
    echo "• Would remove empty directory $target/"
  fi
}

echo "=== LTCG-v2 Codex Cleanup ==="
echo ""

# Step 1: Remove stale git lock file if present.
if [ -f .git/index.lock ]; then
  if [ "$APPLY" = true ]; then
    rm -f -- .git/index.lock
    echo "✓ Removed .git/index.lock"
  else
    echo "• Would remove .git/index.lock"
  fi
else
  echo "✓ No .git/index.lock found"
fi

echo ""
echo "--- Removing known transient directories ---"
remove_dir "video"

echo ""
echo "--- Removing known transient files ---"
JUNK_FILES=(
  ".github/workflows/remotion-pr-preview.yml"
  "apps/web-tanstack/public/lunchtable/ui-motion/gameplay-ambient-loop.mp4"
  "apps/web-tanstack/src/app/components/game/GameMotionOverlay.tsx"
  "apps/web-tanstack/src/app/types/convex-generated-api.d.ts"
  "apps/web-tanstack/vitest.config.ts"
  "vitest.workspace.ts"
  "index.ts"
  "apps/web-tanstack/src/app/components/game/hooks/useGameState.test.ts"
)

for file in "${JUNK_FILES[@]}"; do
  remove_file "$file"
done

remove_empty_dir "apps/web-tanstack/public/lunchtable/ui-motion"
remove_empty_dir "apps/web-tanstack/src/app/types"

echo ""
echo "--- Removing duplicate API handlers ---"
if [ -d "apps/web-tanstack/api" ]; then
  removed_any=false
  for handler in apps/web-tanstack/api/*.ts; do
    [ -e "$handler" ] || continue
    filename="$(basename "$handler")"
    root_handler="api/$filename"

    if [ ! -f "$root_handler" ]; then
      continue
    fi

    if ! cmp -s "$handler" "$root_handler"; then
      echo "⚠ Skipping non-identical handler: $handler"
      continue
    fi

    if [ "$APPLY" = false ]; then
      echo "• Would remove duplicate $handler"
      removed_any=true
      continue
    fi

    if is_tracked "$handler" && [ "$INCLUDE_TRACKED" = false ]; then
      echo "⚠ Skipping tracked duplicate: $handler"
      continue
    fi

    rm -f -- "$handler"
    echo "✓ Removed duplicate $handler"
    removed_any=true
  done

  if [ "$removed_any" = false ]; then
    echo "✓ No identical duplicates found under apps/web-tanstack/api/"
  fi

  remove_empty_dir "apps/web-tanstack/api"
else
  echo "✓ No apps/web-tanstack/api directory found"
fi

echo "✓ Root api/ handlers preserved (Vercel serverless convention)."
echo ""
echo "=== Cleanup complete ==="
