import { useEffect, useMemo, useState } from "react";
import { compilePrompt } from "@/lib/ttrpgStudio";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PromptStudioTab() {
  const draft = useActiveProjectDraft();
  const updateActiveProject = useTTGStudioStore((state) => state.updateActiveProject);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!draft) return;
    setSelectedPromptId(draft.world.creationKit.corePrompts[0]?.id ?? "");
  }, [draft?.id]);

  const prompt = useMemo(
    () => draft?.world.creationKit.corePrompts.find((entry) => entry.id === selectedPromptId) ?? null,
    [draft, selectedPromptId],
  );

  const promptValues = draft?.promptInputs[selectedPromptId] ?? {};

  const compiled = useMemo(() => {
    if (!prompt) return "";
    return compilePrompt(prompt, promptValues);
  }, [prompt, promptValues]);

  if (!draft || !prompt) {
    return <div className="paper-panel p-6">No prompt template available.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-2xl">Prompt Template Inputs</h3>
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase font-bold">Template</span>
            <select
              value={selectedPromptId}
              onChange={(event) => setSelectedPromptId(event.target.value)}
              className="border-2 border-[#121212] bg-white px-3 py-2"
            >
              {draft.world.creationKit.corePrompts.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <p className="text-sm text-[#121212]/70">{prompt.purpose}</p>

          <div className="grid gap-2 md:grid-cols-2">
            {prompt.inputSchema.map((key) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] uppercase">{key.replaceAll("_", " ")}</span>
                <input
                  value={promptValues[key] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveProject((next) => {
                      next.promptInputs[selectedPromptId] = {
                        ...(next.promptInputs[selectedPromptId] ?? {}),
                        [key]: value,
                      };
                      return next;
                    });
                  }}
                  className="border border-[#121212] px-2 py-1 bg-white"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl">Compiled Prompt</h3>
          <pre className="paper-panel-flat p-3 text-xs whitespace-pre-wrap min-h-56 overflow-auto">{compiled}</pre>
          <div className="flex flex-wrap gap-2">
            <button
              className="tcg-button"
              onClick={async () => {
                await navigator.clipboard.writeText(compiled);
                setCopyStatus("Prompt copied.");
                window.setTimeout(() => setCopyStatus(""), 1200);
              }}
            >
              Copy Prompt
            </button>
            <button
              className="tcg-button"
              onClick={() => downloadText(`${prompt.id}.md`, compiled)}
            >
              Export .md
            </button>
            <button
              className="tcg-button"
              onClick={() =>
                downloadText(
                  `${prompt.id}-inputs.json`,
                  JSON.stringify(promptValues, null, 2),
                )
              }
            >
              Export Inputs
            </button>
          </div>
          {copyStatus ? <p className="text-xs uppercase">{copyStatus}</p> : null}
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Checklist Validation</h3>
        <div className="grid gap-2">
          {prompt.outputChecklist.map((item) => {
            const tokens = item
              .toLowerCase()
              .split(/\s+/)
              .filter((token) => token.length > 4);
            const hits = tokens.filter((token) => compiled.toLowerCase().includes(token)).length;
            const score = tokens.length === 0 ? 1 : hits / tokens.length;
            const passed = score >= 0.35;

            return (
              <div key={item} className="paper-panel-flat p-3 flex items-center justify-between gap-2">
                <p className="text-sm">{item}</p>
                <span
                  className={`text-xs uppercase font-black px-2 py-1 border border-[#121212] ${
                    passed ? "bg-[#c7f4cd]" : "bg-[#ffe0e0]"
                  }`}
                >
                  {passed ? "Likely covered" : "Needs detail"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
