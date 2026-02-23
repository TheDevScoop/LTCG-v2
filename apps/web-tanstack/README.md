# LTCG TanStack Start Migration Shell

This app is the initial TanStack Start migration target for the existing
LunchTable TCG web client.

Current scope:

- Stand up a parallel TanStack Start app in the monorepo.
- Wire TanStack Router + React Query + Convex query subscriptions.
- Keep existing `apps/web` unchanged while migration proceeds incrementally.
- Port the first read-only gameplay data surfaces (`/` and `/cards` routes).

## Development

From your terminal:

```sh
bun install
bun run dev:tanstack
```

The TanStack app expects `VITE_CONVEX_URL` to be configured.

## Build + typecheck

```sh
bun run build:web:tanstack
bun run --cwd apps/web-tanstack type-check
```

## References

- [TanStack Start docs](https://tanstack.com/start/latest)
- [Convex TanStack Start quickstart](https://docs.convex.dev/quickstart/tanstack-start)

## Migration checkpoints

- `/` now acts as a migration launchpad with auth-aware route cards and Convex summary stats.
- `/cards` lists a subset of cards from `api.cards.getAllCards`.
- `/cards/$cardId` loads details via `api.cards.getCard`.
- `/leaderboard` loads ranked data from `api.ranked.getLeaderboard` and `api.ranked.getRankDistribution`.
- `/about` includes the first converted static marketing/about route.
- `/privacy` and `/terms` are now converted into TanStack legal pages.
- `/token` now includes the migrated Solana token info entry point.
- `/watch` now fetches and displays live retake.tv stream status.
- `/onboarding` now supports full step progression (username, avatar, starter deck) from live onboarding status.
- `/collection` now includes search/filter controls, owned-copy counts, and card detail links.
- `/settings` now supports username + avatar updates via `api.auth.setUsername` and `api.auth.setAvatarPath`.
- `/profile` now shows account identity, avatar, deck count, and ranked snapshot.
- `/decks` now supports create deck, set active deck, and deck list management.
- `/decks/$deckId` now includes a functional deck builder with owned-card filtering and save flow.
- `/pvp` now supports PvP lobby create/join/cancel flows and join-by-code.
- `/duel` now supports direct lobby create/join flow and invite link generation.
- `/story` now includes chapter-level progress summaries (status, stars, clears, last attempt) and `/story/$chapterId` supports stage launches.
- `/play/$matchId` now renders live player zones/board snapshots, chain prompt responses, event feeds, and custom command submission.
- `/cliques` now includes auto-assignment, roster preview, and leaderboard summaries.
- `/agent-dev` now supports platform selection, API key registration, runtime connectivity checks, and starter deck assignment.
- `/stream-overlay` now resolves an agent/match and renders spectator+chat diagnostics for capture migration.
- `/discord-callback` now handles OAuth callback status and popup auto-close flow.
