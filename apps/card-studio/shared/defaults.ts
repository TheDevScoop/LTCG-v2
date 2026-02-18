import type { CardProjectV1 } from "@lunchtable-tcg/card-studio-sdk";

export const DEFAULT_CARD_STUDIO_PROJECT: CardProjectV1 = {
  schemaVersion: "1.0.0",
  projectId: "project_default",
  name: "LunchTable Card Studio",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  template: {
    id: "template_default",
    name: "LTCG Core Template",
    width: 744,
    height: 1039,
    background: "#fdf2db",
    variables: [
      {
        id: "var_name",
        name: "name",
        label: "Card Name",
        type: "string",
        defaultValue: "New Card",
        required: true,
      },
      {
        id: "var_type",
        name: "type",
        label: "Card Type",
        type: "string",
        defaultValue: "stereotype",
        required: true,
      },
      {
        id: "var_attack",
        name: "attack",
        label: "Attack",
        type: "number",
        defaultValue: 1200,
        required: false,
      },
      {
        id: "var_defense",
        name: "defense",
        label: "Defense",
        type: "number",
        defaultValue: 800,
        required: false,
      },
      {
        id: "var_flavor",
        name: "flavor",
        label: "Flavor",
        type: "string",
        defaultValue: "Born in detention. Forged by cafeteria wars.",
        required: false,
      },
    ],
    layers: [
      {
        id: "layer_frame",
        name: "Frame",
        type: "shape",
        x: 0,
        y: 0,
        width: 744,
        height: 1039,
        zIndex: 0,
        rotation: 0,
        visible: true,
        content: "",
        variableBindings: {},
        style: {
          background: "var(--token-card-bg)",
          borderColor: "#1f1d1a",
          borderWidth: 6,
          borderRadius: 20,
        },
      },
      {
        id: "layer_title",
        name: "Title",
        type: "text",
        x: 44,
        y: 44,
        width: 656,
        height: 88,
        zIndex: 1,
        rotation: 0,
        visible: true,
        content: "{{name}}",
        variableBindings: {
          content: "name",
        },
        style: {
          color: "#151312",
          fontFamily: "Space Grotesk",
          fontSize: 52,
          fontWeight: 700,
          textAlign: "left",
        },
      },
      {
        id: "layer_type",
        name: "Type Badge",
        type: "text",
        x: 44,
        y: 138,
        width: 220,
        height: 42,
        zIndex: 2,
        rotation: 0,
        visible: true,
        content: "{{type}}",
        variableBindings: {
          content: "type",
        },
        style: {
          background: "var(--token-type-bg)",
          color: "#0f0f0f",
          fontFamily: "IBM Plex Mono",
          fontSize: 20,
          fontWeight: 600,
          textAlign: "center",
          borderColor: "#111",
          borderWidth: 2,
          borderRadius: 8,
        },
      },
      {
        id: "layer_stats",
        name: "Stats",
        type: "text",
        x: 484,
        y: 874,
        width: 216,
        height: 96,
        zIndex: 2,
        rotation: 0,
        visible: true,
        content: "ATK {{attack}} / DEF {{defense}}",
        variableBindings: {
          content: "attack",
        },
        style: {
          color: "#1f1d1a",
          fontFamily: "IBM Plex Mono",
          fontSize: 24,
          fontWeight: 700,
          textAlign: "right",
        },
      },
      {
        id: "layer_flavor",
        name: "Flavor",
        type: "text",
        x: 44,
        y: 760,
        width: 656,
        height: 116,
        zIndex: 2,
        rotation: 0,
        visible: true,
        content: "{{flavor}}",
        variableBindings: {
          content: "flavor",
        },
        style: {
          color: "#3b3832",
          fontFamily: "IBM Plex Mono",
          fontSize: 18,
          fontWeight: 400,
          textAlign: "left",
          lineHeight: 1.25,
        },
      },
    ],
  },
  themes: [
    {
      id: "theme_inked",
      name: "Inked Ledger",
      description: "Paper + marker style for LunchTable core",
      tokens: {
        "--token-card-bg": "#f7f0de",
        "--token-type-bg": "#ffcb4d",
        "--token-accent": "#1f8cff",
      },
      layerStyleOverrides: {},
    },
    {
      id: "theme_neon_detention",
      name: "Neon Detention",
      description: "High contrast synth style",
      tokens: {
        "--token-card-bg": "#0f1326",
        "--token-type-bg": "#4cffaf",
        "--token-accent": "#ff3f8a",
      },
      layerStyleOverrides: {
        layer_title: {
          color: "#f6f6f6",
        },
        layer_flavor: {
          color: "#d5d7e4",
        },
        layer_stats: {
          color: "#f6f6f6",
        },
      },
    },
  ],
  variations: [
    {
      id: "var_matrix_base",
      name: "Base Variants",
      axes: [
        {
          id: "axis_type",
          variableName: "type",
          values: ["stereotype", "spell", "trap"],
        },
      ],
      maxCards: 50,
    },
  ],
  cards: [
    {
      id: "card_default_1",
      name: "Lunchline Legend",
      themeId: "theme_inked",
      variables: {
        name: "Lunchline Legend",
        type: "stereotype",
        attack: 1700,
        defense: 1200,
        flavor: "Gains confidence whenever the bell rings.",
      },
      gameplay: {
        name: "Lunchline Legend",
        rarity: "common",
        archetype: "geeks",
        cardType: "stereotype",
        cost: 1,
        level: 4,
        attack: 1700,
        defense: 1200,
      },
    },
  ],
  metadata: {},
};

export function cloneDefaultProject(): CardProjectV1 {
  const clone = structuredClone(DEFAULT_CARD_STUDIO_PROJECT);
  const now = Date.now();
  clone.projectId = `project_${now}`;
  clone.createdAt = now;
  clone.updatedAt = now;
  return clone;
}
