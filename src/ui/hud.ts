import type { HudView } from "../core";
import { gemKey } from "../presentation";
import type { PresentationFacade } from "../presentation";
import type { ShellElements } from "./shell";

function svgMarkup(facade: PresentationFacade, semanticId: string): string {
  const visual = facade.resolveVisual({ semanticId });
  return visual.source.type === "svg" ? visual.source.markup : "";
}

export function renderHud(shell: ShellElements, hud: HudView, facade: PresentationFacade): void {
  shell.plane.textContent = `Plane (${hud.plane.a},${hud.plane.b}) · ${hud.family} · tick ${hud.tick}`;
  shell.hp.textContent = `HP ${hud.hp} / ${hud.maxHp}`;
  shell.gems.replaceChildren(
    ...hud.gems.map((gem) => {
      const wrap = document.createElement("span");
      wrap.className = `gem gem-${gem.state}`;
      wrap.setAttribute("role", "img");
      wrap.setAttribute("aria-label", `${gem.name}, ${gem.state}`);
      wrap.title = `${gem.name} (${gem.state})`;
      wrap.innerHTML = svgMarkup(facade, gemKey(gem.dimension, gem.state));
      const svg = wrap.querySelector("svg");
      svg?.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "gem-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = String(gem.dimension);
      wrap.append(label);
      return wrap;
    }),
  );
  shell.statuses.textContent = hud.statuses.length
    ? hud.statuses.map((status) => `${status.name} (${status.remainingTicks})`).join(" · ")
    : "No statuses";
  shell.hints.replaceChildren(
    ...hud.actionHints.map((hint) => {
      const row = document.createElement("div");
      row.textContent = hint;
      return row;
    }),
  );
  shell.messages.replaceChildren(
    ...hud.messages.map((line) => {
      const row = document.createElement("div");
      row.textContent = line;
      return row;
    }),
  );
}

export function renderBanner(shell: ShellElements, persistError: string | null, storageWarning: string | null): void {
  const text = persistError ?? storageWarning;
  if (!text) {
    shell.banner.hidden = true;
    shell.banner.textContent = "";
    return;
  }
  shell.banner.hidden = false;
  shell.banner.textContent = persistError ? `Save failed: ${persistError}` : text;
}
