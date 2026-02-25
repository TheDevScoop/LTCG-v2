# LunchTable: School of Hard Knocks (LTCG-v2)

White-label trading card game built for both humans and ElizaOS agents.
Embedded as iframe in [milaidy Electron app](https://github.com/milady-ai/milaidy).
Agents stream gameplay via retake.tv.

## Architecture

```
LTCG-v2/
├── convex/                    # Convex backend (host layer)
│   ├── convex.config.ts       # 3 white-label components
│   ├── schema.ts              # Users table only
│   ├── auth.ts                # Privy auth sync
│   ├── game.ts                # Game orchestration (cards, decks, story, match)
│   ├── seed.ts                # Seed 132 cards, 6 decks, 1 chapter
│   └── cardData.ts            # 132 card definitions (6 archetypes x 22)
├── packages/
│   ├── engine/                # Pure TS game engine (zero deps)
│   ├── plugin-ltcg/           # ElizaOS plugin for AI agents
│   ├── lunchtable-tcg-cards/  # Convex component: card inventory + decks
│   ├── lunchtable-tcg-match/  # Convex component: event-sourced matches
│   └── lunchtable-tcg-story/  # Convex component: story mode progression
├── apps/web-tanstack/         # Frontend (TanStack Start + React 19)
├── apps/web/                  # Legacy archive (excluded from default flows)
├── reference/frontend/        # Reference frontend (patterns only)
└── docs/                      # Architecture + agent docs
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun 1.3.5 |
| Frontend | TanStack Start + React 19 + TanStack Router |
| Styling | Tailwind CSS 4 |
| Backend | Convex 1.31.6 (white-label components) |
| Auth | Privy 3.12 |
| State | Zustand 5.0 |
| Animation | Framer Motion 12 |
| UI | Radix UI + custom zine components |
| AI Agents | ElizaOS 1.7.2 |
| Streaming | retake.tv (iframe embed) |
| Wallet | Solana wallet-adapter |
| Host App | milaidy Electron app (iframe) |

## milaidy Integration

This app runs inside milaidy as an ElizaOS app. Key facts:

- **Delivery**: iframe loaded from `localhost:3334` (dev) or production URL
- **Auth**: postMessage handshake (`LTCG_READY` -> `LTCG_AUTH`)
- **Sandbox**: `allow-scripts allow-same-origin allow-popups allow-forms`
- **Package**: npm package with `elizaos.app` metadata in package.json
- **Rendering**: TanStack Start app shell + route chunks, Convex handles game state

### postMessage Protocol
```typescript
// Game -> milaidy
{ type: "LTCG_READY" }
{ type: "MATCH_STARTED", matchId: string }
{ type: "MATCH_ENDED", result: "win" | "loss" | "draw" }

// milaidy -> Game
{ type: "LTCG_AUTH", authToken: string, agentId?: string }
{ type: "START_MATCH", mode: "story" | "pvp" }
```

## Multi-Agent Development

This project uses **multiple Claude agents working on sections independently**.

### Rules for Parallel Agents

1. **Never modify files another agent owns** - check task assignments first
2. **Convex functions are shared** - coordinate via `convex/game.ts` as the API surface
3. **Components are isolated** - each package has its own schema, safe to work independently
4. **Frontend pages are independent** - different agents can own different pages
5. **Use the reference frontend** at `reference/frontend/` for patterns only

### Agent Boundaries

| Domain | Files | Notes |
|--------|-------|-------|
| Game Board UI | `apps/web-tanstack/src/routes/play.$matchId.tsx` | Match actions, legal move runner |
| Collection/Decks | `apps/web-tanstack/src/routes/collection.tsx`, `apps/web-tanstack/src/routes/decks*.tsx` | Binder + deck builder |
| Story Mode | `apps/web-tanstack/src/routes/story*.tsx` | Chapters, stages, launch flow |
| Auth/Profile | `apps/web-tanstack/src/routes/onboarding.tsx`, `apps/web-tanstack/src/routes/profile.tsx` | Account setup + profile |
| Streaming | `apps/web-tanstack/src/routes/watch.tsx`, `apps/web-tanstack/src/routes/stream-overlay.tsx` | retake.tv viewer + overlay |
| Game Engine | `packages/engine/` | Pure TS, no Convex deps |
| ElizaOS Plugin | `packages/plugin-ltcg/` | AI agent actions + decision engine |
| Convex Backend | `convex/` | Shared - coordinate changes |

## TypeScript Conventions

- **Prefer inference** over explicit return types
- **Convex functions**: use `returns` validator, not TS return types
- **TS2589 fix**: import from `@/lib/convexHelpers`, never inline `api as any`
- **React hooks**: let inference handle return types
- **Type guards**: always annotate explicitly

```typescript
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
```

## Theming: Zine Aesthetic

Source of truth: original LTCG at `/Users/home/Desktop/LTCG/apps/web/app/globals.css`

### Core Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#fdfdfb` | Off-white paper |
| `--foreground` | `#121212` | Ink black |
| `--primary` | `#121212` | Ink black |
| `--reputation` | `#ffcc00` | Yellow accent (rep/highlights) |
| `--stability` | `#33ccff` | Cyan blue (stability stat) |
| `--radius` | `0rem` | Sharp corners everywhere |

### Fonts
- **Headings**: `Outfit` (black weight, uppercase, tracking-tighter)
- **Body**: `Inter`
- **Special/Zine**: `Special Elite` (typewriter cursive)

### Signature Effects
- `shadow-zine`: `4px 4px 0px 0px rgba(18,18,18,1)` (chunky offset shadow)
- `border-zine`: `2px solid #121212` (ink border)
- `.torn-paper-edge` - polygon clip-path for ragged edges
- `.ink-bleed` - SVG filter for xerox bleeding
- `.paper-panel` - dot grid + noise texture background
- `.scanner-noise` - overlay noise for photocopy feel
- `.tcg-button` - chunky shadow buttons with hover lift
- `.zine-border` - ink border-image from png asset

### Aesthetic Rules
- **No rounded corners** (radius: 0rem)
- **High contrast** black/white with yellow accents
- **All caps headings** with tight tracking
- **Chunky shadows** that lift on hover
- **Torn edges, ink bleeds, noise overlays** for analog feel
- **Vice-themed content** (gambling, crypto, narcissism, etc.)
- Think: **photocopied zine, not polished app**

## Game Engine API

The engine at `packages/engine/` is pure TypeScript with zero dependencies.

### Key Exports
```typescript
import { createEngine, createInitialState, decide, evolve, mask, legalMoves } from "@lunchtable/engine";
```

### Game Flow
```
draw -> standby -> main -> combat -> main2 -> breakdown_check -> end
```

### Command Types
```typescript
SUMMON | SET_MONSTER | FLIP_SUMMON | CHANGE_POSITION |
SET_SPELL_TRAP | ACTIVATE_SPELL | ACTIVATE_TRAP | ACTIVATE_EFFECT |
DECLARE_ATTACK | ADVANCE_PHASE | END_TURN | CHAIN_RESPONSE | SURRENDER
```

### Archetypes (6)
| Archetype | Color | Playstyle |
|-----------|-------|-----------|
| Dropout | Red | Aggro, rebellious |
| Prep | Blue | Midrange, popular |
| Geek | Yellow | Combo, tech-savvy |
| Freak | Purple | Chaos, unpredictable |
| Nerd | Green | Control, defensive |
| Goodie Two-Shoes | White/Gray | Attrition, grindy |

### Card Types
- **Stereotype** (monsters): attack/defense, positions, tributes, vice counters
- **Spell**: normal, equip, field
- **Trap**: normal, counter
- **Vice**: breakdown mechanic (unique to LunchTable)

## Convex Patterns

### Component Architecture
```typescript
// convex/convex.config.ts
app.use(ltcgCards);   // @lunchtable/cards
app.use(ltcgMatch);   // @lunchtable/match
app.use(ltcgStory);   // @lunchtable/story
```

### Host Schema (minimal)
```typescript
users: defineTable({
  privyId: v.string(),
  username: v.optional(v.string()),
  activeDeckId: v.optional(v.string()),
}).index("by_privyId", ["privyId"])
```

## Scripts

```bash
bun run dev           # Convex + web dev servers
bun run dev:convex    # Convex dev only
bun run dev:web       # Frontend dev only (Vite on port 3334)
bun run test          # Vitest watch mode
bun run test:once     # Vitest single run
```

## Key File References

```
# Frontend (TanStack Start)
apps/web-tanstack/src/router.tsx         # Router + Query client wiring
apps/web-tanstack/src/routes/__root.tsx  # Root layout, providers, nav
apps/web-tanstack/src/routes/index.tsx   # Home launchpad
apps/web-tanstack/src/routes/play.$matchId.tsx
apps/web-tanstack/src/routes/decks.$deckId.tsx
apps/web-tanstack/src/lib/convexApi.ts   # Convex generated API exports
apps/web-tanstack/src/lib/blob.ts        # Blob asset URL helpers

# Backend
convex/game.ts                           # Main API surface (272 lines)
convex/cardData.ts                       # 132 card definitions (3450 lines)
convex/auth.ts                           # Privy auth sync

# Engine
packages/engine/src/engine.ts            # Core: decide, evolve, mask, legalMoves
packages/engine/src/types/state.ts       # GameState, PlayerView, BoardCard
packages/engine/src/types/commands.ts    # Command union type

# ElizaOS Plugin
packages/plugin-ltcg/src/index.ts       # Plugin entry, actions, decision engine

# Component Clients
packages/lunchtable-tcg-cards/src/client/index.ts
packages/lunchtable-tcg-match/src/client/index.ts
packages/lunchtable-tcg-story/src/client/index.ts

# Reference (patterns only - don't build from here)
reference/frontend/                      # TanStack Start reference (old patterns)
```
