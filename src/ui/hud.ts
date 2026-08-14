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
      wrap.title = `${gem.name} (${gem.state})`;
      wrap.innerHTML = svgMarkup(facade, gemKey(gem.dimension, gem.state));
      const label = document.createElement("span");
      label.className = "gem-label";
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
  if (hud.modal) {
    shell.modal.hidden = false;
    shell.modal.textContent = `Paused: ${hud.modal}. Esc to close.`;
  } else {
    shell.modal.hidden = true;
    shell.modal.textContent = "";
  }
}
