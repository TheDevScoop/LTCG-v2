import type { CardProjectV1, GeneratedCardBundleV1 } from "@lunchtable-tcg/card-studio-sdk";

const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WfQ7QAAAABJRU5ErkJggg==";

function encodeBase64(value: string | Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value as any).toString("base64");
  }

  if (typeof value === "string") {
    const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
    return btoa(utf8);
  }

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
}

function formatVariableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function interpolate(template: string | undefined, values: Record<string, unknown>): string {
  const source = template ?? "";
  return source.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    return formatVariableValue(values[key]);
  });
}

function renderSvgCard(
  project: CardProjectV1,
  card: CardProjectV1["cards"][number],
): string {
  const width = project.template.width;
  const height = project.template.height;
  const activeTheme = project.themes.find((theme) => theme.id === card.themeId) ?? project.themes[0];
  const tokenEntries = Object.entries(activeTheme?.tokens ?? {});
  const tokenCss = tokenEntries.map(([key, value]) => `${key}:${String(value)};`).join(" ");

  const sortedLayers = [...project.template.layers].sort((a, b) => a.zIndex - b.zIndex);
  const layerMarkup = sortedLayers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const style = layer.style;
      const styleAttr = [
        style.color ? `color:${style.color};` : "",
        style.background ? `background:${style.background};` : "",
        style.fontFamily ? `font-family:${style.fontFamily};` : "",
        style.fontSize ? `font-size:${style.fontSize}px;` : "",
        style.fontWeight ? `font-weight:${style.fontWeight};` : "",
        style.textAlign ? `text-align:${style.textAlign};` : "",
        style.borderColor ? `border:${style.borderWidth ?? 1}px solid ${style.borderColor};` : "",
        style.borderRadius ? `border-radius:${style.borderRadius}px;` : "",
        style.opacity !== undefined ? `opacity:${style.opacity};` : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (layer.type === "text") {
        const content = interpolate(layer.content, card.variables);
        return `<foreignObject x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="${styleAttr} width:100%; height:100%; display:flex; align-items:flex-start; justify-content:${style.textAlign === "right" ? "flex-end" : style.textAlign === "center" ? "center" : "flex-start"};">${content}</div></foreignObject>`;
      }

      if (layer.type === "image") {
        const src = layer.src ?? "";
        return `<image x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" href="${src}" style="${styleAttr}" preserveAspectRatio="xMidYMid slice" />`;
      }

      return `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" style="${styleAttr}" />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <style>:root{${tokenCss}}</style>\n  <rect x="0" y="0" width="${width}" height="${height}" fill="${project.template.background}" />\n  ${layerMarkup}\n</svg>`;
}

function buildCardTemplateTsx(): string {
  return `import type { CSSProperties } from "react";\n\nexport type CardTemplateProps = {\n  width?: number;\n  height?: number;\n  style?: CSSProperties;\n  children?: React.ReactNode;\n};\n\nexport function CardTemplate({ width = 744, height = 1039, style, children }: CardTemplateProps) {\n  return (\n    <div style={{ width, height, position: "relative", ...style }}>\n      {children}\n    </div>\n  );\n}\n`;
}

function buildTypesArtifact(): string {
  return `import type { CardProjectV1, GeneratedCardBundleV1 } from "@lunchtable-tcg/card-studio-sdk";\n\nexport type StudioProject = CardProjectV1;\nexport type StudioBundle = GeneratedCardBundleV1;\n`;
}

function buildValidatorsArtifact(): string {
  return `import { GeneratedCardBundleV1Schema } from "@lunchtable-tcg/card-studio-sdk";\n\nexport function validateBundle(input: unknown) {\n  return GeneratedCardBundleV1Schema.safeParse(input);\n}\n`;
}

function buildTokensCss(project: CardProjectV1): string {
  const blocks = project.themes.map((theme) => {
    const entries = Object.entries(theme.tokens)
      .map(([key, value]) => `  ${key}: ${String(value)};`)
      .join("\n");

    return `[data-theme=\"${theme.id}\"] {\n${entries}\n}`;
  });

  return blocks.join("\n\n");
}

export function buildBundleFromProject(project: CardProjectV1): GeneratedCardBundleV1 {
  const svgAssets = project.cards.map((card) => {
    const svg = renderSvgCard(project, card);
    return {
      id: `${card.id}_svg`,
      fileName: `previews/${card.id}.svg`,
      mimeType: "image/svg+xml",
      dataUri: `data:image/svg+xml;base64,${encodeBase64(svg)}`,
      checksum: checksum(svg),
    };
  });

  const pngAssets = project.cards.map((card) => {
    return {
      id: `${card.id}_png`,
      fileName: `previews/${card.id}.png`,
      mimeType: "image/png",
      dataUri: `data:image/png;base64,${TRANSPARENT_PNG_BASE64}`,
      checksum: checksum(`${card.id}:${TRANSPARENT_PNG_BASE64}`),
    };
  });

  const assets = [...svgAssets, ...pngAssets];
  const cardTemplateTsx = buildCardTemplateTsx();
  const indexTs = `export * from "./CardTemplate";\n`;
  const cssTokens = buildTokensCss(project);
  const typesTs = buildTypesArtifact();
  const validatorsTs = buildValidatorsArtifact();

  const manifestFiles = [
    { path: "project.studio.json", checksum: checksum(JSON.stringify(project)) },
    { path: "bundle.studio.json", checksum: checksum(JSON.stringify(project.cards)) },
    { path: "code/CardTemplate.tsx", checksum: checksum(cardTemplateTsx) },
    { path: "code/index.ts", checksum: checksum(indexTs) },
    { path: "styles/tokens.css", checksum: checksum(cssTokens) },
    { path: "sdk/types.ts", checksum: checksum(typesTs) },
    { path: "sdk/validators.ts", checksum: checksum(validatorsTs) },
    ...assets.map((asset) => ({ path: `assets/${asset.fileName}`, checksum: asset.checksum })),
  ];

  return {
    schemaVersion: "1.0.0",
    engineCompatibility: {
      min: "0.1.0",
      tested: "0.1.0",
    },
    template: project.template,
    themes: project.themes,
    cards: project.cards,
    assets,
    generatedCode: {
      cardTemplateTsx,
      indexTs,
    },
    cssTokens,
    sdkArtifacts: {
      typesTs,
      validatorsTs,
    },
    manifest: {
      createdAt: Date.now(),
      files: manifestFiles,
    },
  };
}
