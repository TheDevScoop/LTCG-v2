# LunchTable RPG Platform (v1 Foundation)

This repository now includes the first implementation pass for an AI-native RPG/VTT platform, built as a separate app and package set next to LTCG.

## Added Workspaces

- `apps/rpg-web` - Player + GM + Creator UI shell with library, creator, and live session demo surfaces.
- `packages/rpg-engine` - Deterministic session state evolution and dice runtime.
- `packages/rpg-worlds` - Core public interfaces, validators, and 3 fully authored flagship world bundles.
- `packages/rpg-render` - 2D tactical renderer and 3D adapter contract.
- `packages/rpg-agents` - Agent seat policy defaults, prompt filtering, and auto-pause helpers.
- `packages/plugin-rpg` - ElizaOS-compatible plugin for RPG APIs.

## Convex Backend

- `convex/schema.ts` now defines RPG tables for rulesets, worlds, versions, scenes, dungeons, campaigns, sessions, snapshots, events, matchmaking, marketplace, ratings, moderation, and payouts.
- `convex/rpg.ts` provides query/mutation foundations for:
  - World creation/publish/fork/install/list/search
  - Campaign generation/validation
  - Character create/level/export
  - Session create/join/state/action/end
  - Dice roll
  - Matchmaking create/list/join
  - Marketplace sell/list/buy
  - Moderation report/review
- `convex/http.ts` now exposes `/api/rpg/*` routes plus `/api/rpg/agent/register` and `/api/rpg/agent/me`.
  - RPG registration now returns `rpg_*` keys (legacy `ltcg_*` keys remain accepted for compatibility).

## Flagship Worlds Included

Each world includes the full creator artifact bundle in `packages/rpg-worlds/worlds/<slug>/`:

1. `glass-circuit`
2. `ashen-oath`
3. `starfall-frontier`

Per-world assets included:

- `manifest.json`
- `ruleset.json`
- `character-templates.json`
- `campaign-graph.json`
- `scenes-2d.json`
- `scenes-3d.json`
- `dungeons.json`
- `agents.json`
- `audio-cues.json`
- `publish-manifest.json`
- `test-fixture.json`

## Local Development

```bash
bun install
bun run dev:convex
bun run dev:rpg
```

RPG UI launches at `http://localhost:3340`.

## Notes

This is a functional platform baseline and schema/API scaffold for Release 1 scope. It is intentionally extensible and expected to be iterated into full Release 2/3 capabilities (advanced world tooling UX, production auth roles, payments rails, and analytics dashboards).
