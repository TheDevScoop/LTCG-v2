# LTCG Card Studio Architecture

## Scope

`apps/card-studio` is a standalone second app for no-auth, BYOK card generation and overlay editing.

- Local-first project persistence in browser IndexedDB.
- Session-only provider keys (`AI Gateway`, `OpenRouter`, `FAL`) in `sessionStorage`.
- Server-orchestrated batch execution with Convex run/job state.
- Validation-gated promotion into inactive LTCG card definitions.

## Workspace Boundaries

- App: `apps/card-studio` (Vite, port `3335`, separate Vercel target)
- SDK: `packages/lunchtable-tcg-card-studio-sdk`
- Convex queue/promotion: `convex/studio.ts`, `convex/schema.ts`

No routing changes are made in `apps/web` for v1.

## Data Contracts

SDK exports:

- `CardTemplateV1`
- `CardProjectV1`
- `VariableDefinitionV1`
- `LayerNodeV1`
- `ThemePackV1`
- `VariationMatrixV1`
- `BatchRunSpecV1`
- `GeneratedCardBundleV1`
- `PromotionPayloadV1`
- `migrateStudioSchema()`
- `validateStudioBundle()`

Bundle output contract (`studio.bundle.json`) includes:

- `schemaVersion`
- `engineCompatibility`
- `template`
- `themes`
- `cards`
- `assets`
- `generatedCode`
- `cssTokens`
- `sdkArtifacts`

## Batch Execution

1. Client starts or resumes a run via `POST /api/studio/execute`.
2. API ensures run exists (`studio:createRun`) and claims a chunk (`studio:claimRunWork`).
3. Jobs run with request-scoped provider credentials and are written via `completeJob`/`failJob`.
4. Client re-calls execute until run is terminal.
5. UI reads live/refreshable run state from execution responses and Convex queries.

Default chunk cap is `50` jobs.

## AI Provider Strategy

- AI SDK v6 APIs (`generateText` with `Output.object`, `generateImage`).
- Gateway-first model routing (`@ai-sdk/gateway`).
- OpenRouter fallback (`@openrouter/ai-sdk-provider`).
- FAL image generation (`@ai-sdk/fal`).
- Keys are request-scoped and redacted from error payloads.

## Promotion Gate

`POST /api/studio/promote` runs:

1. SDK schema validation (`validateStudioBundle`).
2. Gameplay shape checks (`archetype`, `cardType`, `cost`, ability linting).
3. Rejected payloads are recorded via `recordPromotionResult`.
4. Valid bundles are staged through `studio:stageBundleCards` as `isActive: false` card definitions.

## Export Set

`POST /api/studio/export` returns ZIP with:

- `project.studio.json`
- `bundle.studio.json`
- `studio.bundle.json`
- `code/CardTemplate.tsx`
- `code/index.ts`
- `styles/tokens.css`
- `sdk/types.ts`
- `sdk/validators.ts`
- `previews/*.svg`
- `previews/*.png`
- `manifest.checksums.json`

## Operational Notes

- No key persistence server-side or in Convex tables.
- Run/job state is idempotent by claim token checks.
- `retryFailedJobs` allows explicit failed job replay.
- `cancelRun` transitions queued/running jobs to canceled.
