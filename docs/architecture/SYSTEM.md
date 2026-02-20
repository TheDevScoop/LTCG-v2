# LTCG-v2 System Architecture

## Overview

LunchTable: School of Hard Knocks is a white-label trading card game designed for:
- **Human players** via web client or milaidy Electron app (iframe)
- **ElizaOS agents** that play autonomously and stream via retake.tv

## System Diagram

```
┌─────────────────────────────────────────────────────┐
│                   milaidy (Electron)                │
│  ┌───────────────────────────────────────────────┐  │
│  │            <iframe> Game Client               │  │
 │  │         (React Router 7 + React 19)          │  │
│  │                                               │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │Game Board│  │Deck Build│  │Story Mode   │  │  │
│  │  │         │  │          │  │             │  │  │
│  │  └────┬────┘  └────┬─────┘  └──────┬──────┘  │  │
│  │       │             │               │         │  │
│  └───────┼─────────────┼───────────────┼─────────┘  │
│          │             │               │            │
└──────────┼─────────────┼───────────────┼────────────┘
           │     Convex Real-time        │
           ▼             ▼               ▼
┌──────────────────────────────────────────────────────┐
│                  Convex Backend                      │
│  ┌──────────┐                                        │
│  │ game.ts  │  Host orchestration layer              │
│  │ auth.ts  │  Privy auth sync                       │
│  │ seed.ts  │  132 cards, 6 decks, story content     │
│  └────┬─────┘                                        │
│       │ delegates to                                 │
│  ┌────┴──────────────────────────────────────────┐   │
│  │          White-Label Components               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │  Cards   │ │  Match   │ │  Story   │      │   │
│  │  │ 6 tables │ │ 4 tables │ │ 5 tables │      │   │
│  │  └──────────┘ └──────────┘ └──────────┘      │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────┐
│    ElizaOS Agent         │
│  ┌────────────────────┐  │
│  │  plugin-ltcg       │  │
│  │  26 game actions   │  │──── Convex API ────► Convex Backend
│  │  Decision engine   │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │  retake.tv stream  │──┼──── RTMP ────► retake.tv
│  └────────────────────┘  │
└──────────────────────────┘
```

## Data Flow: Match Lifecycle

```
1. Player/Agent starts match
   └─► api.game.startStoryBattle(stageId)
       └─► ltcgMatch.createMatch() + ltcgMatch.startMatch()
           └─► engine.createInitialState() → stored as snapshot

2. Player submits action
   └─► api.game.submitAction(matchId, command, seat)
       └─► Load latest snapshot
       └─► engine.decide(state, command, seat) → events
       └─► engine.evolve(state, events) → newState
       └─► Store new snapshot + append events
       └─► If AI opponent: schedule executeAITurn (500ms)

3. AI turn (server-side)
   └─► internal.game.executeAITurn(matchId)
       └─► engine.legalMoves(state, "away") → valid moves
       └─► Pick best move
       └─► Repeat step 2 flow

4. Client renders
   └─► api.game.getPlayerView(matchId, seat)
       └─► engine.mask(state, seat) → PlayerView
       └─► Real-time subscription updates UI
```

## Component Boundaries

### Engine (Pure TypeScript)
- Zero external dependencies
- Runs in browser, server, or standalone
- Exports: `createEngine`, `decide`, `evolve`, `mask`, `legalMoves`
- Owns: game rules, phases, combat, summoning, spells/traps, vice mechanic

### Cards Component (Convex)
- Owns: card definitions, player inventory, decks, starter decks
- Tables: 6 (cardDefinitions, playerCards, userDecks, deckCards, starterDeckDefinitions, numberedCardRegistry)
- Client: `LTCGCards` class

### Match Component (Convex)
- Owns: match lifecycle, state snapshots, event log, pending prompts
- Tables: 4 (matches, matchSnapshots, matchEvents, matchPrompts)
- Pattern: Event-sourced (snapshots + append-only events)
- Client: `LTCGMatch` class
- Depends on: `@lunchtable/engine`

### Story Component (Convex)
- Owns: chapters, stages, player progress, battle attempts
- Tables: 5 (storyProgress, storyBattleAttempts, storyChapters, storyStages, storyStageProgress)
- Client: `LTCGStory` class

### Host Layer (Convex)
- `convex/game.ts` - orchestrates all components
- `convex/auth.ts` - Privy user sync
- `convex/schema.ts` - only `users` table
- `convex/seed.ts` - seeds 132 cards + story content

## Frontend Architecture

```
apps/web/
├── src/
│   ├── App.tsx              # React Router 7 routes
│   ├── main.tsx             # ConvexProvider setup
│   ├── pages/               # Route page components (Home, Play, Story, etc.)
│   ├── components/
│   │   ├── ui/             # Radix primitives (shadcn pattern)
│   │   ├── game/           # Game board, cards, controls
│   │   ├── story/          # Story mode UI
│   │   ├── collection/     # Card binder, deck builder
│   │   ├── auth/           # Privy auth
│   │   └── streaming/      # retake.tv iframe, spectator
│   ├── hooks/              # Domain-organized hooks
│   ├── lib/               # Utilities, helpers
│   │   ├── convexHelpers.ts
│   │   ├── archetypeThemes.ts
│   │   └── iframe.ts
│   └── stores/            # Zustand state stores
├── index.html              # Entry HTML
└── vite.config.ts          # Vite + React + Tailwind plugins
```

## Embedding Strategy

### milaidy Electron App
- Game loaded as `<iframe>` within milaidy
- PostMessage API for cross-frame communication
- Separate embed routes: `/embed/play`, `/embed/stream/:id`
- Detect iframe: `window.self !== window.top`

### retake.tv Streams
- Agents stream gameplay to retake.tv
- Viewers watch via embedded `<iframe>` in game client
- Stream + game state shown side-by-side in spectator mode
