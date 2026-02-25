# Multi-Agent Development Workflow

This project is built by multiple Claude agents working in parallel on independent sections.

## Agent Ownership Model

Each agent owns a domain and its associated files. Agents should NOT modify files outside their domain without coordination.

### Domain Map

| Domain | Owner Agent | Files | Dependencies |
|--------|-------------|-------|--------------|
| Game Board UI | game-ui | `components/game/` | engine types, convex queries |
| Card Collection | collection-ui | `components/collection/` | convex card queries |
| Deck Builder | deckbuilder-ui | `pages/DeckBuilder.tsx` | convex deck mutations |
| Story Mode | story-ui | `components/story/` | convex story queries |
| Auth & Profile | auth-ui | `components/auth/` | Privy, convex auth |
| Streaming | stream-ui | `components/streaming/` | retake.tv iframe |
| Game Engine | engine-dev | `packages/engine/` | standalone |
| ElizaOS Plugin | plugin-dev | `packages/plugin-ltcg/` | Convex API |
| Convex Backend | backend-dev | `convex/` | all components |

## Coordination Rules

### Shared Files (coordinate changes)
- `convex/game.ts` - main API surface
- `lib/convexHelpers.ts` - shared type helpers
- `lib/archetypeThemes.ts` - shared theme config
- `globals.css` - shared styles
- `App.tsx` - root layout with providers
- `package.json` - dependencies

### Safe to Own (no coordination needed)
- Component directories under your domain
- Domain-specific hooks
- Domain-specific stores
- Route files for your domain

## How to Add a New Feature

1. **Check domain ownership** - is this your domain?
2. **Read the reference** - check `reference/frontend/` for existing patterns
3. **Use skills** - invoke relevant `.claude/skills/` for patterns
4. **Stay in your lane** - don't modify shared files without flagging
5. **Use convexHelpers** - always import from `lib/convexHelpers.ts`
6. **Follow the theming** - use `ltcg-theming` skill for visual patterns

## Adding Convex Functions

If you need a new Convex query/mutation:

1. Check if it already exists in `convex/game.ts`
2. If not, add it to `convex/game.ts` (the orchestration layer)
3. The function should delegate to the appropriate component client
4. Always include auth check via `getUser(ctx)`
5. Flag the change for other agents that might need it

## Testing Boundaries

| Layer | Test Location | Framework |
|-------|---------------|-----------|
| Engine | `packages/engine/src/__tests__/` | Vitest |
| Convex | `convex/*.test.ts` | Vitest + convex-test |
| Components | `components/**/*.test.tsx` | Vitest |
| E2E | `e2e/` | Playwright |

## Communication Protocol

When an agent needs something from another domain:

1. **Don't modify their files** - create a follow-up note
2. **Use the Convex API** - `convex/game.ts` is the contract
3. **Use engine types** - import from `@lunchtable/engine/types`
4. **Use theme tokens** - import from `lib/archetypeThemes.ts`

## Quick Start for New Agent

```bash
# 1. Read the CLAUDE.md
cat CLAUDE.md

# 2. Check your domain in reference implementation
ls reference/frontend/components/YOUR_DOMAIN/
ls reference/frontend/hooks/hooks/YOUR_DOMAIN/

# 3. Load relevant skills
# /ltcg-theming    - for visual patterns
# /game-engine     - for game logic
# /convex-components - for backend API
# /frontend-patterns - for React patterns

# 4. Build in apps/web-tanstack/ following reference patterns
```
