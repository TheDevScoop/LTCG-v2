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

- `/` shows Convex connectivity + first card summary sample.
- `/cards` lists a subset of cards from `api.cards.getAllCards`.
- `/cards/$cardId` loads details via `api.cards.getCard`.
