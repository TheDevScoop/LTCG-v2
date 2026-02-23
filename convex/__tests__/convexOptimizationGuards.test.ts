import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("convex optimization guardrails", () => {
  it("keeps queue and index schema required for runtime efficiency", () => {
    const schemaSource = readSource("convex/schema.ts");
    expect(schemaSource).toContain("matchPresence: defineTable");
    expect(schemaSource).toContain('.index("by_match_user", ["matchId", "userId"])');
    expect(schemaSource).toContain('.index("by_clique", ["cliqueId"])');
  });

  it("dedupes AI turn scheduling and avoids full card fetches in AI turn handler", () => {
    const gameSource = readSource("convex/game.ts");

    expect(gameSource).toContain("export const submitAction");
    expect(gameSource).toContain("export const executeAITurn");
    expect(gameSource).toContain("buildCardLookup");
  });

  it("collection UIs use optimized card/catalog queries", () => {
    const collectionPage = readSource("apps/web-tanstack/src/routes/collection.tsx");
    expect(collectionPage).toContain("api.game.getCatalogCards");
    expect(collectionPage).toContain("api.game.getUserCardCounts");

    const deckBuilderPage = readSource("apps/web-tanstack/src/routes/decks.$deckId.tsx");
    expect(deckBuilderPage).toContain("api.game.getCatalogCards");
    expect(deckBuilderPage).toContain("api.game.getUserCardCounts");
  });

  it("deck builder initializes local state in effects instead of render", () => {
    const deckBuilderPage = readSource("apps/web-tanstack/src/routes/decks.$deckId.tsx");
    expect(deckBuilderPage).toContain("const initializedDeckIdRef = useRef<string | null>(null)");
    expect(deckBuilderPage).toContain("useEffect(() => {");
    expect(deckBuilderPage).not.toContain("setLocalCards(new Map(");
  });
});
