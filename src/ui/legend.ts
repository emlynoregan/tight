import { CONTENT_REGISTRY, type PlaneView } from "../core";
import {
  actorPlayerKey,
  featureKey,
  itemKey,
  monsterKey,
  npcKey,
  tileKey,
  type PresentationFacade,
} from "../presentation";

export interface LegendEntry {
  readonly semanticId: string;
  readonly title: string;
  readonly detail: string;
  readonly count: number;
}

function pretty(id: string): string {
  return id.replaceAll("_", " ");
}

function featureDetail(id: string, state: string | null): string {
  if (id === "transition_fixture" && state === "exit") {
    return "Leave this plane. Stand on or next to it and press E.";
  }
  if (id === "transition_fixture" && state === "arrival") {
    return "Arrival from another plane. Pressing E does not take you away.";
  }
  if (id === "transition_fixture" && state === "broken") {
    return "Broken passage. Cannot be used.";
  }
  if (id === "safe_anchor") {
    return "Safe Anchor. Press E to heal to full and set respawn / AP spend.";
  }
  if (id === "door") {
    if (state === "open") {
      return "Open door. Walk through, or press E to close.";
    }
    if (state === "locked") {
      return "Locked door.";
    }
    return "Door. Press E to open or close.";
  }
  if (id === "container_chest" || id === "container_cache" || id === "crate" || id === "barrel") {
    return "Container. Press E to interact.";
  }
  const feature = CONTENT_REGISTRY.byId.feature.get(id);
  if (feature?.interact) {
    return `${pretty(id)}. Press E to interact.`;
  }
  return `${pretty(id)}. Blocks movement.`;
}

function actorDetail(kind: string): string {
  if (kind === "player") {
    return "You.";
  }
  if (kind === "npc") {
    return "NPC. Press E to talk.";
  }
  return "Hostile. Press F when adjacent to attack.";
}

function tileDetail(id: string): string {
  const tile = CONTENT_REGISTRY.byId.tile.get(id);
  if (tile?.hazardId) {
    return `${pretty(id)}. Walkable, but hazardous.`;
  }
  if (tile?.walkable) {
    return `${pretty(id)}. Walkable ground.`;
  }
  return `${pretty(id)}. Blocks movement.`;
}

function bump(store: Map<string, LegendEntry>, semanticId: string, title: string, detail: string): void {
  const existing = store.get(semanticId);
  if (existing) {
    store.set(semanticId, { ...existing, count: existing.count + 1 });
    return;
  }
  store.set(semanticId, { semanticId, title, detail, count: 1 });
}

function rank(semanticId: string): number {
  if (semanticId === actorPlayerKey()) {
    return 0;
  }
  if (semanticId === "feature.transition_fixture.exit") {
    return 1;
  }
  if (semanticId === "feature.transition_fixture.arrival") {
    return 2;
  }
  if (semanticId === "feature.transition_fixture.broken") {
    return 3;
  }
  if (semanticId.startsWith("feature.safe_anchor")) {
    return 4;
  }
  if (semanticId.startsWith("feature.")) {
    return 5;
  }
  if (semanticId.startsWith("npc.") || semanticId.startsWith("monster.")) {
    return 6;
  }
  if (semanticId.startsWith("item.")) {
    return 7;
  }
  return 8;
}

export function legendEntries(plane: PlaneView, facade: PresentationFacade): readonly LegendEntry[] {
  const store = new Map<string, LegendEntry>();
  bump(store, actorPlayerKey(), "You", actorDetail("player"));
  for (const cell of plane.cells) {
    if (!cell.visible) {
      continue;
    }
    const terrainId = tileKey(cell.terrainId);
    const terrain = facade.resolveVisual({ semanticId: terrainId, plane: plane.plane, family: plane.family });
    bump(store, terrainId, terrain.label, tileDetail(cell.terrainId));
    if (!cell.featureId) {
      continue;
    }
    const semanticId = cell.featureState ? featureKey(cell.featureId, cell.featureState) : featureKey(cell.featureId);
    const visual = facade.resolveVisual({
      semanticId,
      plane: plane.plane,
      family: plane.family,
      ...(cell.featureState ? { state: cell.featureState } : {}),
    });
    bump(store, semanticId, visual.label, featureDetail(cell.featureId, cell.featureState));
  }
  for (const actor of plane.actors) {
    if (!actor.visible || actor.id === "player") {
      continue;
    }
    const semanticId = actor.kind === "npc" ? npcKey(actor.definitionId) : monsterKey(actor.definitionId);
    const visual = facade.resolveVisual({ semanticId, plane: plane.plane, family: plane.family });
    bump(store, semanticId, visual.label, actorDetail(actor.kind));
  }
  for (const item of plane.items) {
    const semanticId = itemKey(item.itemId);
    const visual = facade.resolveVisual({ semanticId, plane: plane.plane, family: plane.family });
    bump(store, semanticId, visual.label, `${visual.label}. Press G to pick up.`);
  }
  return [...store.values()].sort((left, right) => rank(left.semanticId) - rank(right.semanticId) || left.title.localeCompare(right.title));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function svgMarkup(facade: PresentationFacade, plane: PlaneView, semanticId: string): string {
  const visual = facade.resolveVisual({ semanticId, plane: plane.plane, family: plane.family });
  return visual.source.type === "svg" ? visual.source.markup : "";
}

export function legendMarkup(plane: PlaneView, facade: PresentationFacade): string {
  const rows = legendEntries(plane, facade)
    .map((entry) => {
      const count = entry.count > 1 ? ` ×${entry.count}` : "";
      return `<li>
        <span class="tight-legend-icon">${svgMarkup(facade, plane, entry.semanticId)}</span>
        <div>
          <strong>${escapeHtml(entry.title)}${count}</strong>
          <p>${escapeHtml(entry.detail)}</p>
        </div>
      </li>`;
    })
    .join("");
  return `
    <h2>Map key</h2>
    <p>Placeholder icons on this plane. These will be replaced by real art later. Esc closes.</p>
    <ul class="tight-legend">${rows}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}
