import { useEffect, useMemo, useState } from "react";
import type { CardProjectV1, LayerNodeV1, ThemePackV1, VariableDefinitionV1 } from "@lunchtable-tcg/card-studio-sdk";
import { toast } from "sonner";
import { cloneDefaultProject } from "../shared/defaults";
import { buildBundleFromProject } from "../shared/bundle";
import { useEditorStore } from "./store/editorStore";
import { loadActiveProject, saveActiveProject } from "./lib/idb";
import { resolveCardTheme, resolveLayerContent, resolveLayerStyle } from "./lib/rendering";

const KEY_STORAGE = "ltcg-card-studio-session-keys";

type SessionKeys = {
  gatewayApiKey?: string;
  openrouterApiKey?: string;
  falApiKey?: string;
  promotionToken?: string;
};

type PrimitiveValue = string | number | boolean | null;

function toPrimitiveRecord(input: Record<string, unknown>): Record<string, PrimitiveValue> {
  const output: Record<string, PrimitiveValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = value;
    }
  }
  return output;
}

type ExecuteResponse = {
  run: {
    runId: string;
    status: "queued" | "running" | "completed" | "failed" | "canceled";
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    canceledJobs: number;
    updatedAt: number;
  };
  processedJobs: number;
};

function createLayerDraft(): LayerNodeV1 {
  return {
    id: `layer_${Date.now()}`,
    name: "New Layer",
    type: "text",
    x: 60,
    y: 60,
    width: 220,
    height: 60,
    zIndex: 5,
    rotation: 0,
    visible: true,
    content: "{{name}}",
    variableBindings: {
      content: "name",
    },
    style: {
      color: "#151312",
      fontFamily: "Space Grotesk",
      fontSize: 24,
      fontWeight: 600,
      textAlign: "left",
    },
  };
}

function createVariableDraft(): VariableDefinitionV1 {
  const id = `var_${Date.now()}`;
  return {
    id,
    name: id,
    label: "New Variable",
    type: "string",
    defaultValue: "",
    required: false,
  };
}

function createThemeDraft(): ThemePackV1 {
  return {
    id: `theme_${Date.now()}`,
    name: "New Theme",
    tokens: {
      "--token-card-bg": "#ffffff",
      "--token-type-bg": "#f2f2f2",
      "--token-accent": "#1f8cff",
    },
    layerStyleOverrides: {},
  };
}

function createCardDraft(project: CardProjectV1) {
  const variableValues = Object.fromEntries(
    project.template.variables.map((variable) => [variable.name, variable.defaultValue]),
  );

  return {
    id: `card_${Date.now()}`,
    name: "New Variant",
    themeId: project.themes[0]?.id,
    variables: variableValues,
    gameplay: {
      name: "New Variant",
      rarity: "common",
      archetype: "dropouts",
      cardType: "stereotype",
      cost: 1,
    },
  };
}

function readSessionKeys(): SessionKeys {
  const raw = window.sessionStorage.getItem(KEY_STORAGE);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as SessionKeys;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeSessionKeys(keys: SessionKeys): void {
  window.sessionStorage.setItem(KEY_STORAGE, JSON.stringify(keys));
}

async function callApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected response type");
  }

  return (await response.json()) as T;
}

export function App() {
  const {
    project,
    selectedCardId,
    run,
    hydrate,
    execute,
    undo,
    redo,
    setSelectedCard,
    setRun,
  } = useEditorStore();

  const [sessionKeys, setSessionKeys] = useState<SessionKeys>({});
  const [batchPrompt, setBatchPrompt] = useState(
    "Generate polished TCG copy and effect text that matches LunchTable style.",
  );
  const [previewPrompt, setPreviewPrompt] = useState("Design a bold cafeteria-chaos card variation.");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const stored = await loadActiveProject();
      if (canceled) return;
      hydrate(stored ?? cloneDefaultProject());
      setSessionKeys(readSessionKeys());
      setIsBootstrapping(false);
    })();

    return () => {
      canceled = true;
    };
  }, [hydrate]);

  useEffect(() => {
    if (isBootstrapping) return;
    const timeout = window.setTimeout(() => {
      void saveActiveProject(project);
    }, 200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isBootstrapping, project]);

  useEffect(() => {
    if (isBootstrapping) return;
    writeSessionKeys(sessionKeys);
  }, [isBootstrapping, sessionKeys]);

  const selectedCard = useMemo(() => {
    return project.cards.find((card) => card.id === selectedCardId) ?? project.cards[0] ?? null;
  }, [project.cards, selectedCardId]);

  const selectedTheme = useMemo(() => {
    if (!selectedCard) return project.themes[0] ?? null;
    return resolveCardTheme(project, selectedCard.id) ?? null;
  }, [project, selectedCard]);

  const sortedLayers = useMemo(() => {
    return [...project.template.layers].sort((a, b) => a.zIndex - b.zIndex);
  }, [project.template.layers]);

  async function handlePreview() {
    if (!selectedCard) return;
    setIsPreviewLoading(true);
    try {
      const response = await callApi<{ suggestion: string; updatedVariables: Record<string, unknown> }>(
        "/api/studio/preview",
        {
          prompt: previewPrompt,
          card: selectedCard,
          template: project.template,
          providerConfig: {
            gatewayApiKey: sessionKeys.gatewayApiKey,
            openrouterApiKey: sessionKeys.openrouterApiKey,
            falApiKey: sessionKeys.falApiKey,
          },
        },
      );

      execute({
        type: "updateCard",
        cardId: selectedCard.id,
        patch: {
          variables: {
            ...selectedCard.variables,
            ...toPrimitiveRecord(response.updatedVariables),
          },
        },
      });
      toast.success(response.suggestion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleExecuteBatch() {
    if (project.cards.length === 0) {
      toast.error("Add at least one card before running a batch.");
      return;
    }

    setIsExecuting(true);
    try {
      const runId = `run_${Date.now()}`;
      let currentRunStatus: ExecuteResponse["run"]["status"] = "queued";
      let round = 0;

      while ((currentRunStatus === "queued" || currentRunStatus === "running") && round < 20) {
        const response = await callApi<ExecuteResponse>("/api/studio/execute", {
          runId,
          runSpec: {
            schemaVersion: "1.0.0",
            runId,
            projectId: project.projectId,
            projectName: project.name,
            batchSize: 50,
            stopOnBudget: false,
            providerConfig: {
              model: "openai/gpt-5-mini",
              provider: "gateway",
            },
            jobs: project.cards.map((card) => ({
              cardId: card.id,
              prompt: `${batchPrompt}\nCard Name: ${card.name}`,
              variables: card.variables,
              themeId: card.themeId,
              generateImage: true,
            })),
          },
          providerConfig: {
            gatewayApiKey: sessionKeys.gatewayApiKey,
            openrouterApiKey: sessionKeys.openrouterApiKey,
            falApiKey: sessionKeys.falApiKey,
          },
        });

        setRun(response.run);
        currentRunStatus = response.run.status;
        round += 1;
      }

      if (currentRunStatus === "completed") {
        toast.success("Batch completed.");
      } else {
        toast.info(`Batch stopped with status: ${currentRunStatus}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch execution failed");
    } finally {
      setIsExecuting(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const bundle = buildBundleFromProject(project);
      const response = await fetch("/api/studio/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project, bundle }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-export.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Export ZIP ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  async function handlePromote() {
    if (!sessionKeys.promotionToken) {
      toast.error("Promotion token is required.");
      return;
    }

    setIsPromoting(true);
    try {
      const bundle = buildBundleFromProject(project);
      const response = await callApi<{ status: string; report: { errors: string[] } }>(
        "/api/studio/promote",
        {
          schemaVersion: "1.0.0",
          promotionToken: sessionKeys.promotionToken,
          runId: run?.runId,
          stageOnly: true,
          bundle,
        },
      );

      if (response.report.errors.length > 0) {
        toast.error(`Promotion rejected: ${response.report.errors[0]}`);
      } else {
        toast.success(`Promotion status: ${response.status}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promotion failed");
    } finally {
      setIsPromoting(false);
    }
  }

  if (isBootstrapping || !selectedCard) {
    return (
      <div className="app-shell">
        <div className="toolbar">
          <h1>LTCG Card Studio</h1>
          <span className="meta">Loading local project...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div>
          <h1>LTCG Card Studio</h1>
          <div className="meta mono">Project: {project.name} | Local-first | No-auth BYOK</div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={undo}>Undo</button>
          <button className="btn" onClick={redo}>Redo</button>
          <button className="btn" onClick={handlePreview} disabled={isPreviewLoading}>
            {isPreviewLoading ? "Previewing..." : "AI Preview"}
          </button>
          <button className="btn secondary" onClick={handleExecuteBatch} disabled={isExecuting}>
            {isExecuting ? "Running..." : "Run Batch"}
          </button>
          <button className="btn" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export ZIP"}
          </button>
          <button className="btn primary" onClick={handlePromote} disabled={isPromoting}>
            {isPromoting ? "Promoting..." : "Validate + Promote"}
          </button>
        </div>
      </header>

      <main className="main-grid">
        <section className="panel">
          <h2>Project + Keys</h2>
          <div className="panel-body">
            <div className="field">
              <label>Project Name</label>
              <input
                value={project.name}
                onChange={(event) => execute({ type: "setProjectName", name: event.target.value })}
              />
            </div>

            <div className="field">
              <label>AI Gateway Key (session only)</label>
              <input
                type="password"
                value={sessionKeys.gatewayApiKey ?? ""}
                onChange={(event) => setSessionKeys((prev) => ({ ...prev, gatewayApiKey: event.target.value }))}
              />
            </div>

            <div className="field">
              <label>OpenRouter Key (session only)</label>
              <input
                type="password"
                value={sessionKeys.openrouterApiKey ?? ""}
                onChange={(event) => setSessionKeys((prev) => ({ ...prev, openrouterApiKey: event.target.value }))}
              />
            </div>

            <div className="field">
              <label>FAL Key (session only)</label>
              <input
                type="password"
                value={sessionKeys.falApiKey ?? ""}
                onChange={(event) => setSessionKeys((prev) => ({ ...prev, falApiKey: event.target.value }))}
              />
            </div>

            <div className="field">
              <label>Promotion Token</label>
              <input
                type="password"
                value={sessionKeys.promotionToken ?? ""}
                onChange={(event) => setSessionKeys((prev) => ({ ...prev, promotionToken: event.target.value }))}
              />
            </div>

            <div className="field">
              <label>Preview Prompt</label>
              <textarea rows={3} value={previewPrompt} onChange={(event) => setPreviewPrompt(event.target.value)} />
            </div>

            <div className="field">
              <label>Batch Prompt</label>
              <textarea rows={4} value={batchPrompt} onChange={(event) => setBatchPrompt(event.target.value)} />
            </div>

            {run && (
              <div className="status-grid">
                <div className="status-tile">Run: {run.runId}</div>
                <div className="status-tile">Status: {run.status}</div>
                <div className="status-tile">Done: {run.completedJobs}/{run.totalJobs}</div>
                <div className="status-tile">Failed: {run.failedJobs}</div>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Canvas</h2>
          <div className="canvas-wrap">
            <div
              className="card-canvas"
              style={{
                width: project.template.width / 2,
                height: project.template.height / 2,
                background: String(selectedTheme?.tokens["--token-card-bg"] ?? project.template.background),
              }}
            >
              {sortedLayers.map((layer) => {
                if (!layer.visible) return null;
                const style = resolveLayerStyle(
                  layer,
                  selectedTheme?.tokens,
                  selectedTheme?.layerStyleOverrides[layer.id],
                );
                const content = resolveLayerContent(layer, selectedCard.variables);
                const scale = 0.5;
                const commonStyle: React.CSSProperties = {
                  left: layer.x * scale,
                  top: layer.y * scale,
                  width: layer.width * scale,
                  height: layer.height * scale,
                  transform: `rotate(${layer.rotation}deg)`,
                  zIndex: layer.zIndex,
                  opacity: typeof style.opacity === "number" ? style.opacity : 1,
                };

                if (layer.type === "shape") {
                  return (
                    <div
                      className="card-layer"
                      key={layer.id}
                      style={{
                        ...commonStyle,
                        background: style.background ? String(style.background) : "transparent",
                        border: style.borderColor
                          ? `${style.borderWidth ?? 1}px solid ${String(style.borderColor)}`
                          : undefined,
                        borderRadius: style.borderRadius ? Number(style.borderRadius) * scale : undefined,
                      }}
                    />
                  );
                }

                if (layer.type === "image") {
                  return (
                    <img
                      className="card-layer"
                      key={layer.id}
                      src={layer.src}
                      alt={layer.name}
                      style={{
                        ...commonStyle,
                        objectFit: "cover",
                      }}
                    />
                  );
                }

                return (
                  <div
                    className="card-layer"
                    key={layer.id}
                    style={{
                      ...commonStyle,
                      color: style.color ? String(style.color) : "#111",
                      background: style.background ? String(style.background) : "transparent",
                      border: style.borderColor
                        ? `${style.borderWidth ?? 1}px solid ${String(style.borderColor)}`
                        : undefined,
                      borderRadius: style.borderRadius ? Number(style.borderRadius) * scale : undefined,
                      fontFamily: style.fontFamily ? String(style.fontFamily) : "Space Grotesk",
                      fontSize: style.fontSize ? Number(style.fontSize) * scale : 16,
                      fontWeight: style.fontWeight ? (style.fontWeight as number | string) : 400,
                      textAlign: style.textAlign ? (style.textAlign as React.CSSProperties["textAlign"]) : "left",
                      padding: 6,
                    }}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Cards, Variables, Layers, Themes</h2>
          <div className="panel-body">
            <div className="field">
              <label>Selected Card</label>
              <select value={selectedCard.id} onChange={(event) => setSelectedCard(event.target.value)}>
                {project.cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="btn-row">
              <button
                className="btn"
                onClick={() => execute({ type: "addCard", card: createCardDraft(project) })}
              >
                Add Card Variant
              </button>
            </div>

            <ul className="list">
              {project.template.variables.map((variable) => (
                <li key={variable.id}>
                  <div className="mono">{variable.name}</div>
                  <input
                    value={String(selectedCard.variables[variable.name] ?? "")}
                    onChange={(event) =>
                      execute({
                        type: "updateCard",
                        cardId: selectedCard.id,
                        patch: {
                          variables: {
                            [variable.name]:
                              variable.type === "number"
                                ? Number(event.target.value)
                                : event.target.value,
                          },
                        },
                      })
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="btn-row">
              <button className="btn" onClick={() => execute({ type: "upsertVariable", variable: createVariableDraft() })}>
                Add Variable
              </button>
            </div>

            <ul className="list">
              {project.template.layers.map((layer) => (
                <li key={layer.id}>
                  <div className="mono">{layer.name}</div>
                  <div className="btn-row">
                    <button
                      className="btn"
                      onClick={() =>
                        execute({
                          type: "updateLayer",
                          layerId: layer.id,
                          patch: { visible: !layer.visible },
                        })
                      }
                    >
                      {layer.visible ? "Hide" : "Show"}
                    </button>
                    <button className="btn" onClick={() => execute({ type: "removeLayer", layerId: layer.id })}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="btn-row">
              <button className="btn" onClick={() => execute({ type: "addLayer", layer: createLayerDraft() })}>
                Add Layer
              </button>
            </div>

            <ul className="list">
              {project.themes.map((theme) => (
                <li key={theme.id}>
                  <div className="mono">{theme.name}</div>
                  <div className="btn-row">
                    <button
                      className="btn"
                      onClick={() =>
                        execute({
                          type: "updateCard",
                          cardId: selectedCard.id,
                          patch: { themeId: theme.id },
                        })
                      }
                    >
                      Apply To Card
                    </button>
                    <button className="btn" onClick={() => execute({ type: "removeTheme", themeId: theme.id })}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="btn-row">
              <button className="btn" onClick={() => execute({ type: "upsertTheme", theme: createThemeDraft() })}>
                Add Theme
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
