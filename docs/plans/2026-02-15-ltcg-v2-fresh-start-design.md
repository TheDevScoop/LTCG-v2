# LTCG v2 — Fresh Start Design

## Decision

Fresh Convex deployment. Cards + Story mode only. Privy auth. Event-sourced match engine via white-label components.

## Components (MVP)

| Component | Role |
|-----------|------|
| `@lunchtable/cards` | Card definitions, player inventory, decks, starter collections |
| `@lunchtable/match` | Event-sourced game state (decide/evolve/mask + snapshots + events) |
| `@lunchtable/story` | Chapters, stages, progress tracking |
| `@lunchtable/engine` | Pure game logic (not a Convex component — imported by match) |

## New convex/ Directory (~5 files)

```
convex/
  convex.config.ts     — Register 3 components (cards, match, story)
  schema.ts            — Just users table + Privy auth fields
  auth.ts              — Privy auth: syncUser, getCurrentUser
  game.ts              — Thin mutations: startStoryBattle, submitAction, getPlayerView, AI turn
  seed.ts              — Seed card definitions + story chapters
```

## Data Flow — Story Battle

```
startStoryBattle(chapterId, stageNumber)
  → cards.getUserDeck()
  → engine.createInitialState()
  → match.createMatch()
  → match.startMatch(initialState)
  → return matchId

submitAction(matchId, command, seat)
  → match.submitAction() — decide/evolve/persist
  → if AI turn next: schedule AI action
  → return events

getPlayerView(matchId, seat)
  → match.getPlayerView() — mask(state, seat)
  → return masked state
```

## AI Turns

Use `engine.legalMoves(state, seat)` to get valid commands. Pick based on difficulty (weighted random). No separate AI engine modules.

## Auth

Privy. Users table in host schema with privyId, username, email, activeDeckId.

## Frontend (existing routes)

- `/play/story` — chapter list
- `/play/story/$chapterId` — stage select
- `/play/$matchId` — game board
- `/lunchtable` — home

## Deferred

Economy, PvP, guilds, social, tournaments, leaderboards, admin, streaming, payments, marketplace, referrals, seasons, email, branding, webhooks, AI agents, content. All component packages exist and are built — add when needed.
