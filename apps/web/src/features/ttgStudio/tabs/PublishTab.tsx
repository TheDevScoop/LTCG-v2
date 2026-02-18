import { useMemo, useState } from "react";
import { serializeDraft, validateDraft } from "@/lib/ttrpgStudio";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

const bumpVersion = (value: string, mode: "major" | "minor" | "patch") => {
  const [a, b, c] = value.split(".").map((part) => Number(part || 0));
  if (mode === "major") return `${a + 1}.0.0`;
  if (mode === "minor") return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
};

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PublishTab() {
  const draft = useActiveProjectDraft();
  const { updateActiveProject, importProjectFromJson, exportActiveProjectJson } = useTTGStudioStore((state) => ({
    updateActiveProject: state.updateActiveProject,
    importProjectFromJson: state.importProjectFromJson,
    exportActiveProjectJson: state.exportActiveProjectJson,
  }));
  const [importStatus, setImportStatus] = useState("");

  const preflight = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);
  const hasErrors = preflight.some((issue) => issue.severity === "error");

  if (!draft) {
    return <div className="paper-panel p-6">No active project found.</div>;
  }

  const packagePreview = {
    id: draft.id,
    sourceWorldId: draft.sourceWorldId,
    packageName: draft.publish.packageName,
    version: draft.publish.version,
    visibility: draft.publish.visibility,
    exportManifest: draft.world.creationKit.exportPackage,
    releaseNotes: draft.publish.releaseNotes,
  };

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-2 lg:col-span-2">
          <span className="text-xs uppercase font-bold">Package Name</span>
          <input
            value={draft.publish.packageName}
            onChange={(event) => {
              const value = event.target.value;
              updateActiveProject((next) => {
                next.publish.packageName = value;
                return next;
              });
            }}
            className="border-2 border-[#121212] bg-white px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Visibility</span>
          <select
            value={draft.publish.visibility}
            onChange={(event) => {
              const value = event.target.value as "public" | "private" | "unlisted";
              updateActiveProject((next) => {
                next.publish.visibility = value;
                return next;
              });
            }}
            className="border-2 border-[#121212] bg-white px-3 py-2"
          >
            <option value="public">public</option>
            <option value="unlisted">unlisted</option>
            <option value="private">private</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Version</span>
          <input
            value={draft.publish.version}
            onChange={(event) => {
              const value = event.target.value;
              updateActiveProject((next) => {
                next.publish.version = value;
                return next;
              });
            }}
            className="border-2 border-[#121212] bg-white px-3 py-2"
          />
        </label>

        <div className="flex items-end gap-2 lg:col-span-2">
          <button
            className="tcg-button"
            onClick={() =>
              updateActiveProject((next) => {
                next.publish.version = bumpVersion(next.publish.version, "major");
                return next;
              })
            }
          >
            Major +1
          </button>
          <button
            className="tcg-button"
            onClick={() =>
              updateActiveProject((next) => {
                next.publish.version = bumpVersion(next.publish.version, "minor");
                return next;
              })
            }
          >
            Minor +1
          </button>
          <button
            className="tcg-button"
            onClick={() =>
              updateActiveProject((next) => {
                next.publish.version = bumpVersion(next.publish.version, "patch");
                return next;
              })
            }
          >
            Patch +1
          </button>
        </div>

        <label className="flex flex-col gap-2 lg:col-span-3">
          <span className="text-xs uppercase font-bold">Release Notes</span>
          <textarea
            value={draft.publish.releaseNotes}
            onChange={(event) => {
              const value = event.target.value;
              updateActiveProject((next) => {
                next.publish.releaseNotes = value;
                return next;
              });
            }}
            className="border-2 border-[#121212] bg-white p-3 min-h-24"
          />
        </label>

        <label className="flex flex-col gap-2 lg:col-span-3">
          <span className="text-xs uppercase font-bold">Tags (comma separated)</span>
          <input
            value={draft.publish.tags.join(", ")}
            onChange={(event) => {
              const tags = event.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
              updateActiveProject((next) => {
                next.publish.tags = tags;
                return next;
              });
            }}
            className="border-2 border-[#121212] bg-white px-3 py-2"
          />
        </label>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Preflight Checklist</h3>
        <div className="space-y-2">
          {preflight.map((issue) => (
            <div key={`${issue.code}-${issue.path}`} className="paper-panel-flat p-3 flex items-center justify-between gap-2">
              <p className="text-sm">[{issue.severity}] {issue.message}</p>
              <code className="text-xs">{issue.path}</code>
            </div>
          ))}
        </div>

        <p className={`text-sm font-bold ${hasErrors ? "text-[#b42318]" : "text-[#177245]"}`}>
          {hasErrors ? "Publishing blocked until errors are resolved." : "Preflight ready for release."}
        </p>
      </section>

      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-2xl">Export / Import</h3>
          <div className="flex flex-wrap gap-2">
            <button
              className="tcg-button"
              onClick={() => downloadJson(`${draft.publish.packageName.replace(/\s+/g, "-").toLowerCase()}.json`, exportActiveProjectJson())}
              disabled={hasErrors}
            >
              Export Project JSON
            </button>
            <button
              className="tcg-button"
              onClick={() => downloadJson(`${draft.id}-snapshot.json`, serializeDraft(draft))}
            >
              Export Snapshot
            </button>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Import Project JSON</span>
            <input
              type="file"
              accept="application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const result = importProjectFromJson(text);
                if (result.ok) {
                  setImportStatus(`Imported project ${result.id}.`);
                } else {
                  setImportStatus(`Import failed: ${result.error}`);
                }
              }}
              className="border-2 border-[#121212] bg-white px-3 py-2"
            />
          </label>

          {importStatus ? <p className="text-xs uppercase">{importStatus}</p> : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl">Package Preview</h3>
          <pre className="paper-panel-flat p-3 text-xs whitespace-pre-wrap min-h-56 overflow-auto">
            {JSON.stringify(packagePreview, null, 2)}
          </pre>
          <div className="paper-panel-flat p-3">
            <h4 className="text-sm uppercase mb-2">Manifest</h4>
            <ul className="space-y-1 text-sm">
              {draft.world.creationKit.exportPackage.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
