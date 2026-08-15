import type { GameDiagnostics } from "../app/diagnostics";
import type { SaveRecord } from "../core";

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function mountErrorScreen(
  host: HTMLElement,
  options: {
    readonly diagnostics: GameDiagnostics;
    readonly stored: SaveRecord | unknown;
    readonly seed: string;
  },
): void {
  host.innerHTML = "";
  host.className = "tight-root";
  const panel = document.createElement("section");
  panel.className = "tight-error";
  panel.setAttribute("role", "alert");
  const seed = options.diagnostics.worldSeed || options.seed || "0";
  panel.innerHTML = `
    <h1>Tight could not start</h1>
    <p>The current save was not loaded. A different world was not generated.</p>
    <dl>
      <dt>Error</dt><dd>${escapeHtml(options.diagnostics.errorCode)}: ${escapeHtml(options.diagnostics.errorMessage)}</dd>
      <dt>App version</dt><dd>${escapeHtml(options.diagnostics.appVersion)}</dd>
      <dt>Generator</dt><dd>${escapeHtml(options.diagnostics.generatorVersion)}</dd>
      <dt>World seed</dt><dd>${escapeHtml(options.diagnostics.worldSeed || seed)}</dd>
      <dt>Topology hash</dt><dd>${escapeHtml(options.diagnostics.topologyHash || "—")}</dd>
      <dt>Plane</dt><dd>${escapeHtml(options.diagnostics.plane || "—")}</dd>
    </dl>
    <p>
      <button type="button" data-error="export"${options.stored ? "" : " disabled"}>Export save JSON</button>
      <button type="button" data-error="new">Start New Game</button>
    </p>
  `;
  panel.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-error]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.error === "export" && options.stored) {
      downloadText(`tight-save-${seed}.json`, JSON.stringify(options.stored, null, 2));
      return;
    }
    if (target.dataset.error === "new") {
      const url = new URL(window.location.href);
      url.searchParams.set("seed", seed);
      url.searchParams.set("new", "1");
      window.location.assign(url.toString());
    }
  });
  host.append(panel);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
