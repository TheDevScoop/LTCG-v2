import * as z from "zod";

export const STUDIO_SCHEMA_VERSION = "1.0.0" as const;

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const VariableTypeSchema = z.enum(["string", "number", "color", "image", "boolean"]);

export const VariableDefinitionV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  label: z.string().min(1),
  type: VariableTypeSchema,
  defaultValue: PrimitiveSchema,
  required: z.boolean().default(false),
  description: z.string().optional(),
});

const LayerTypeSchema = z.enum(["text", "image", "shape"]);

const LayerStyleSchema = z.object({
  color: z.string().optional(),
  background: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  borderRadius: z.number().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  shadow: z.string().optional(),
});

export const LayerNodeV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: LayerTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  zIndex: z.number().int().default(0),
  rotation: z.number().default(0),
  visible: z.boolean().default(true),
  content: z.string().optional(),
  src: z.string().optional(),
  variableBindings: z.record(z.string(), z.string()).default({}),
  style: LayerStyleSchema.default({}),
});

export const CardTemplateV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  background: z.string().default("#ffffff"),
  variables: z.array(VariableDefinitionV1Schema).default([]),
  layers: z.array(LayerNodeV1Schema).default([]),
});

const ThemeTokenSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const ThemePackV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tokens: ThemeTokenSchema.default({}),
  layerStyleOverrides: z.record(z.string(), LayerStyleSchema).default({}),
});

const VariationAxisSchema = z.object({
  id: z.string().min(1),
  variableName: z.string().min(1),
  values: z.array(PrimitiveSchema).min(1),
});

export const VariationMatrixV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  axes: z.array(VariationAxisSchema).default([]),
  maxCards: z.number().int().positive().default(50),
});

const GameplayCardSchema = z.object({
  name: z.string().min(1),
  rarity: z.string().min(1),
  archetype: z.string().min(1),
  cardType: z.string().min(1),
  cost: z.number(),
  level: z.number().optional(),
  attack: z.number().optional(),
  defense: z.number().optional(),
  attribute: z.string().optional(),
  spellType: z.string().optional(),
  trapType: z.string().optional(),
  ability: z.unknown().optional(),
  flavorText: z.string().optional(),
  imageUrl: z.string().optional(),
});

const CardInstanceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  themeId: z.string().optional(),
  variables: z.record(z.string(), PrimitiveSchema).default({}),
  gameplay: GameplayCardSchema.optional(),
});

export const CardProjectV1Schema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  projectId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  template: CardTemplateV1Schema,
  themes: z.array(ThemePackV1Schema).default([]),
  variations: z.array(VariationMatrixV1Schema).default([]),
  cards: z.array(CardInstanceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const ProviderConfigSchema = z.object({
  model: z.string().min(1),
  provider: z.enum(["gateway", "openrouter", "fal"]),
  maxTokens: z.number().int().positive().optional(),
  imageModel: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const BatchJobInputSchema = z.object({
  cardId: z.string().min(1),
  prompt: z.string().min(1),
  variables: z.record(z.string(), PrimitiveSchema).default({}),
  themeId: z.string().optional(),
  generateImage: z.boolean().default(false),
});

export const BatchRunSpecV1Schema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  runId: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  batchSize: z.number().int().positive().max(50).default(50),
  stopOnBudget: z.boolean().default(false),
  budgetUsd: z.number().positive().optional(),
  providerConfig: ProviderConfigSchema,
  jobs: z.array(BatchJobInputSchema).min(1).max(500),
});

const AssetSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  dataUri: z.string().min(1),
  checksum: z.string().min(1),
});

export const GeneratedCardBundleV1Schema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  engineCompatibility: z.object({
    min: z.string().min(1),
    tested: z.string().min(1),
  }),
  template: CardTemplateV1Schema,
  themes: z.array(ThemePackV1Schema).default([]),
  cards: z.array(CardInstanceSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  generatedCode: z.object({
    cardTemplateTsx: z.string(),
    indexTs: z.string(),
  }),
  cssTokens: z.string(),
  sdkArtifacts: z.object({
    typesTs: z.string(),
    validatorsTs: z.string(),
  }),
  manifest: z.object({
    createdAt: z.number(),
    files: z.array(
      z.object({
        path: z.string(),
        checksum: z.string(),
      }),
    ),
  }),
});

export const PromotionPayloadV1Schema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  promotionToken: z.string().min(8),
  runId: z.string().optional(),
  stageOnly: z.boolean().default(true),
  bundle: GeneratedCardBundleV1Schema,
});

export type VariableDefinitionV1 = z.infer<typeof VariableDefinitionV1Schema>;
export type LayerNodeV1 = z.infer<typeof LayerNodeV1Schema>;
export type CardTemplateV1 = z.infer<typeof CardTemplateV1Schema>;
export type ThemePackV1 = z.infer<typeof ThemePackV1Schema>;
export type VariationMatrixV1 = z.infer<typeof VariationMatrixV1Schema>;
export type CardProjectV1 = z.infer<typeof CardProjectV1Schema>;
export type BatchRunSpecV1 = z.infer<typeof BatchRunSpecV1Schema>;
export type GeneratedCardBundleV1 = z.infer<typeof GeneratedCardBundleV1Schema>;
export type PromotionPayloadV1 = z.infer<typeof PromotionPayloadV1Schema>;

function buildDefaultProject(partial: Partial<CardProjectV1>): CardProjectV1 {
  const now = Date.now();
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    projectId: partial.projectId ?? `project_${now}`,
    name: partial.name ?? "Untitled Card Studio Project",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    template: partial.template ?? {
      id: "template_default",
      name: "Default Template",
      width: 744,
      height: 1039,
      background: "#f6f3ea",
      variables: [],
      layers: [],
    },
    themes: partial.themes ?? [],
    variations: partial.variations ?? [],
    cards: partial.cards ?? [],
    metadata: partial.metadata ?? {},
  };
}

export function migrateStudioSchema(input: unknown): CardProjectV1 {
  if (!input || typeof input !== "object") {
    return buildDefaultProject({});
  }

  const raw = input as Record<string, unknown>;

  if (raw.schemaVersion === STUDIO_SCHEMA_VERSION) {
    return CardProjectV1Schema.parse(raw);
  }

  const migrated = {
    ...raw,
    schemaVersion: STUDIO_SCHEMA_VERSION,
    projectId:
      typeof raw.projectId === "string"
        ? raw.projectId
        : typeof raw.id === "string"
          ? raw.id
          : undefined,
    name: typeof raw.name === "string" ? raw.name : "Migrated Card Studio Project",
    template:
      typeof raw.template === "object" && raw.template !== null
        ? raw.template
        : {
            id: "template_migrated",
            name: "Migrated Template",
            width: 744,
            height: 1039,
            background: "#ffffff",
            variables: [],
            layers: [],
          },
  };

  return CardProjectV1Schema.parse(buildDefaultProject(migrated as Partial<CardProjectV1>));
}

export function validateStudioBundle(input: unknown):
  | { success: true; data: GeneratedCardBundleV1 }
  | { success: false; errors: string[] } {
  const parsed = GeneratedCardBundleV1Schema.safeParse(input);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
