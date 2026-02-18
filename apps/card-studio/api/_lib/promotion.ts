import type { GeneratedCardBundleV1 } from "@lunchtable-tcg/card-studio-sdk";

const VALID_ARCHETYPES = new Set(["dropouts", "preps", "geeks", "freaks", "nerds", "goodies"]);
const VALID_CARD_TYPES = new Set(["stereotype", "spell", "trap"]);

function lintAbilityShape(ability: unknown): string[] {
  if (ability === undefined || ability === null) return [];

  if (!Array.isArray(ability)) {
    return ["ability must be an array when present"];
  }

  const errors: string[] = [];
  for (const [index, entry] of ability.entries()) {
    if (!entry || typeof entry !== "object") {
      errors.push(`ability[${index}] must be an object`);
      continue;
    }

    const record = entry as Record<string, unknown>;
    if (typeof record.trigger !== "string") {
      errors.push(`ability[${index}].trigger must be a string`);
    }

    if (!Array.isArray(record.operations)) {
      errors.push(`ability[${index}].operations must be an array`);
    }
  }

  return errors;
}

export function validateBundleForPromotion(bundle: GeneratedCardBundleV1): { errors: string[] } {
  const errors: string[] = [];

  for (const card of bundle.cards) {
    const gameplay = card.gameplay;
    if (!gameplay) {
      errors.push(`card ${card.id} is missing gameplay payload`);
      continue;
    }

    if (!VALID_ARCHETYPES.has(gameplay.archetype)) {
      errors.push(`card ${card.id} has invalid archetype: ${gameplay.archetype}`);
    }

    if (!VALID_CARD_TYPES.has(gameplay.cardType)) {
      errors.push(`card ${card.id} has invalid cardType: ${gameplay.cardType}`);
    }

    if (typeof gameplay.cost !== "number" || Number.isNaN(gameplay.cost)) {
      errors.push(`card ${card.id} has invalid cost`);
    }

    errors.push(...lintAbilityShape(gameplay.ability).map((message) => `card ${card.id}: ${message}`));
  }

  return { errors };
}
