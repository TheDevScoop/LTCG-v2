import type { CardProjectV1, LayerNodeV1 } from "@lunchtable-tcg/card-studio-sdk";

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return `${value}`;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function interpolate(template: string | undefined, values: Record<string, unknown>): string {
  return (template ?? "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name) => {
    return valueToString(values[name]);
  });
}

export function resolveLayerContent(layer: LayerNodeV1, values: Record<string, unknown>): string {
  return interpolate(layer.content, values);
}

export function resolveLayerStyle(
  layer: LayerNodeV1,
  themeTokens: Record<string, string | number> = {},
  layerStyleOverride: Partial<LayerNodeV1["style"]> = {},
): Record<string, string | number | undefined> {
  const style = {
    ...layer.style,
    ...layerStyleOverride,
  };

  const resolved = Object.fromEntries(
    Object.entries(style).map(([key, value]) => {
      if (typeof value !== "string") return [key, value];
      if (!value.startsWith("var(")) return [key, value];

      const tokenName = value.replace("var(", "").replace(")", "").trim();
      return [key, themeTokens[tokenName] ?? value];
    }),
  );

  return resolved;
}

export function resolveCardTheme(project: CardProjectV1, cardId: string) {
  const card = project.cards.find((item) => item.id === cardId);
  const theme = project.themes.find((item) => item.id === card?.themeId) ?? project.themes[0];
  return theme;
}
