import type {
  CardProjectV1,
  LayerNodeV1,
  ThemePackV1,
  VariableDefinitionV1,
} from "@lunchtable-tcg/card-studio-sdk";

type CardRecord = CardProjectV1["cards"][number];

export type StudioCommand =
  | { type: "setProjectName"; name: string }
  | { type: "addCard"; card: CardRecord }
  | { type: "updateCard"; cardId: string; patch: Partial<CardRecord> }
  | { type: "upsertVariable"; variable: VariableDefinitionV1 }
  | { type: "removeVariable"; variableId: string }
  | { type: "addLayer"; layer: LayerNodeV1 }
  | { type: "updateLayer"; layerId: string; patch: Partial<LayerNodeV1> }
  | { type: "removeLayer"; layerId: string }
  | { type: "upsertTheme"; theme: ThemePackV1 }
  | { type: "removeTheme"; themeId: string }
  | { type: "replaceProject"; project: CardProjectV1 };

function patchCard(
  card: CardProjectV1["cards"][number],
  patch: Partial<CardProjectV1["cards"][number]>,
): CardProjectV1["cards"][number] {
  return {
    ...card,
    ...patch,
    variables: {
      ...card.variables,
      ...(patch.variables ?? {}),
    },
    gameplay: patch.gameplay
      ? {
          ...card.gameplay,
          ...patch.gameplay,
        }
      : card.gameplay,
  };
}

export function applyCommand(project: CardProjectV1, command: StudioCommand): CardProjectV1 {
  const base = structuredClone(project);
  base.updatedAt = Date.now();

  switch (command.type) {
    case "setProjectName": {
      base.name = command.name;
      return base;
    }
    case "addCard": {
      base.cards.push(command.card);
      return base;
    }
    case "updateCard": {
      base.cards = base.cards.map((card) =>
        card.id === command.cardId ? patchCard(card, command.patch) : card,
      );
      return base;
    }
    case "upsertVariable": {
      const index = base.template.variables.findIndex((variable) => variable.id === command.variable.id);
      if (index === -1) {
        base.template.variables.push(command.variable);
      } else {
        base.template.variables[index] = command.variable;
      }
      return base;
    }
    case "removeVariable": {
      base.template.variables = base.template.variables.filter(
        (variable) => variable.id !== command.variableId,
      );
      return base;
    }
    case "addLayer": {
      base.template.layers.push(command.layer);
      return base;
    }
    case "updateLayer": {
      base.template.layers = base.template.layers.map((layer) => {
        if (layer.id !== command.layerId) return layer;
        return {
          ...layer,
          ...command.patch,
          style: {
            ...layer.style,
            ...(command.patch.style ?? {}),
          },
        };
      });
      return base;
    }
    case "removeLayer": {
      base.template.layers = base.template.layers.filter((layer) => layer.id !== command.layerId);
      return base;
    }
    case "upsertTheme": {
      const index = base.themes.findIndex((theme) => theme.id === command.theme.id);
      if (index === -1) {
        base.themes.push(command.theme);
      } else {
        base.themes[index] = command.theme;
      }
      return base;
    }
    case "removeTheme": {
      base.themes = base.themes.filter((theme) => theme.id !== command.themeId);
      base.cards = base.cards.map((card) => {
        if (card.themeId === command.themeId) {
          return {
            ...card,
            themeId: base.themes[0]?.id,
          };
        }
        return card;
      });
      return base;
    }
    case "replaceProject": {
      return structuredClone(command.project);
    }
    default: {
      const exhaustiveCheck: never = command;
      return exhaustiveCheck;
    }
  }
}
