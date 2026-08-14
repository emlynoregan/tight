import { Application, Container, Graphics, Sprite } from "pixi.js";
import { MAP_SIZE, planeKey } from "../core/model/plane";
import type { PlaneView } from "../core";
import {
  actorPlayerKey,
  effectKey,
  featureKey,
  itemKey,
  monsterKey,
  npcKey,
  tileKey,
  type AnimationKind,
  type PresentationFacade,
  type ResolvedVisual,
  type VisualRequest,
} from "../presentation";
import { SpriteRegistry } from "./sprite-registry";

export const TILE_SIZE = 32;
export const WORLD_PIXELS = MAP_SIZE * TILE_SIZE;

interface TrackedSprite {
  sprite: Sprite;
  semanticId: string;
  tileX: number;
  tileY: number;
  fromX: number;
  fromY: number;
  animation: AnimationKind;
  periodMs: number;
  amplitude: number;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export class WorldRenderer {
  readonly app: Application;
  private readonly presentation: PresentationFacade;
  private readonly registry = new SpriteRegistry();
  private readonly layers = {
    terrain: new Container(),
    features: new Container(),
    items: new Container(),
    actors: new Container(),
    effects: new Container(),
    targeting: new Graphics(),
    visibility: new Graphics(),
  };
  private readonly sprites = {
    terrain: new Map<string, TrackedSprite>(),
    features: new Map<string, TrackedSprite>(),
    items: new Map<string, TrackedSprite>(),
    actors: new Map<string, TrackedSprite>(),
    effects: new Map<string, TrackedSprite>(),
  };
  private lastTick = -1;
  private lastPlane = "";
  private lastSyncAt = 0;

  constructor(app: Application, presentation: PresentationFacade) {
    this.app = app;
    this.presentation = presentation;
    app.stage.addChild(
      this.layers.terrain,
      this.layers.features,
      this.layers.items,
      this.layers.actors,
      this.layers.effects,
      this.layers.targeting,
      this.layers.visibility,
    );
  }

  sync(view: PlaneView, now: number): void {
    const key = planeKey(view.plane);
    if (key !== this.lastPlane) {
      this.clearTracked();
      this.lastPlane = key;
    }
    const tickChanged = view.tick !== this.lastTick;
    if (tickChanged) {
      this.lastTick = view.tick;
      this.lastSyncAt = now;
    }
    const slide = Math.min(1, (now - this.lastSyncAt) / 180);
    this.syncGrid(this.sprites.terrain, this.layers.terrain, view, now, slide, tickChanged, (cell) => ({
      id: `t:${cell.y},${cell.x}`,
      x: cell.x,
      y: cell.y,
      request: { semanticId: tileKey(cell.terrainId), plane: view.plane, family: view.family },
      present: true,
    }));
    this.syncGrid(this.sprites.features, this.layers.features, view, now, slide, tickChanged, (cell) => ({
      id: `f:${cell.y},${cell.x}`,
      x: cell.x,
      y: cell.y,
      request: {
        semanticId: cell.featureState ? featureKey(cell.featureId ?? "", cell.featureState) : featureKey(cell.featureId ?? ""),
        plane: view.plane,
        family: view.family,
        ...(cell.featureState ? { state: cell.featureState } : {}),
      },
      present: cell.featureId !== null,
    }));
    this.syncEntities(
      this.sprites.items,
      this.layers.items,
      view.items.map((item) => ({
        id: item.id,
        x: item.x,
        y: item.y,
        request: { semanticId: itemKey(item.itemId), plane: view.plane, family: view.family },
        present: true,
      })),
      now,
      slide,
      tickChanged,
    );
    this.syncEntities(
      this.sprites.actors,
      this.layers.actors,
      view.actors
        .filter((actor) => actor.visible)
        .map((actor) => ({
          id: actor.id,
          x: actor.x,
          y: actor.y,
          request: {
            semanticId:
              actor.kind === "player" ? actorPlayerKey() : actor.kind === "npc" ? npcKey(actor.definitionId) : monsterKey(actor.definitionId),
            plane: view.plane,
            family: view.family,
          },
          present: true,
        })),
      now,
      slide,
      tickChanged,
    );
    this.syncEntities(
      this.sprites.effects,
      this.layers.effects,
      view.effects.map((fx) => ({
        id: fx.id,
        x: fx.x,
        y: fx.y,
        request: { semanticId: effectKey(fx.kind), plane: view.plane, family: view.family },
        present: true,
      })),
      now,
      slide,
      tickChanged,
    );
    this.drawTargeting(view);
    this.drawVisibility(view);
  }

  destroy(): void {
    this.clearTracked();
    this.registry.destroy();
    this.app.destroy(true);
  }

  private syncGrid(
    store: Map<string, TrackedSprite>,
    layer: Container,
    view: PlaneView,
    now: number,
    slide: number,
    tickChanged: boolean,
    describe: (cell: PlaneView["cells"][number]) => {
      id: string;
      x: number;
      y: number;
      request: VisualRequest;
      present: boolean;
    },
  ): void {
    this.syncEntities(
      store,
      layer,
      view.cells.map(describe),
      now,
      slide,
      tickChanged,
    );
  }

  private syncEntities(
    store: Map<string, TrackedSprite>,
    layer: Container,
    rows: readonly { id: string; x: number; y: number; request: VisualRequest; present: boolean }[],
    now: number,
    slide: number,
    tickChanged: boolean,
  ): void {
    const live = new Set<string>();
    for (const row of rows) {
      if (!row.present) {
        continue;
      }
      live.add(row.id);
      const visual = this.resolve(row.request);
      if (!visual) {
        continue;
      }
      let tracked = store.get(row.id);
      if (!tracked) {
        const sprite = new Sprite(this.registry.texture(visual));
        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;
        layer.addChild(sprite);
        tracked = {
          sprite,
          semanticId: visual.semanticId,
          tileX: row.x,
          tileY: row.y,
          fromX: row.x,
          fromY: row.y,
          animation: visual.animation.kind,
          periodMs: visual.animation.periodMs,
          amplitude: visual.animation.amplitude,
        };
        store.set(row.id, tracked);
      } else if (tracked.semanticId !== visual.semanticId) {
        tracked.sprite.texture = this.registry.texture(visual);
        tracked.semanticId = visual.semanticId;
        tracked.animation = visual.animation.kind;
        tracked.periodMs = visual.animation.periodMs;
        tracked.amplitude = visual.animation.amplitude;
      }
      if (tickChanged && (tracked.tileX !== row.x || tracked.tileY !== row.y)) {
        tracked.fromX = tracked.tileX;
        tracked.fromY = tracked.tileY;
        tracked.tileX = row.x;
        tracked.tileY = row.y;
      } else if (tickChanged) {
        tracked.fromX = row.x;
        tracked.fromY = row.y;
        tracked.tileX = row.x;
        tracked.tileY = row.y;
      }
      const x = lerp(tracked.fromX, tracked.tileX, slide) * TILE_SIZE;
      const y = lerp(tracked.fromY, tracked.tileY, slide) * TILE_SIZE;
      applyAnimation(tracked, x, y, now);
    }
    for (const [id, tracked] of store) {
      if (live.has(id)) {
        continue;
      }
      tracked.sprite.destroy();
      store.delete(id);
    }
  }

  private resolve(request: VisualRequest): ResolvedVisual | null {
    try {
      return this.presentation.resolveVisual(request);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private drawTargeting(view: PlaneView): void {
    const g = this.layers.targeting;
    g.clear();
    for (const cell of view.targeting) {
      g.rect(cell.x * TILE_SIZE + 1, cell.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      g.stroke({ width: 2, color: 0xf0d878, alpha: 0.9 });
    }
  }

  private drawVisibility(view: PlaneView): void {
    const g = this.layers.visibility;
    g.clear();
    for (const cell of view.cells) {
      if (cell.visible) {
        continue;
      }
      g.rect(cell.x * TILE_SIZE, cell.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      g.fill({ color: 0x050508, alpha: 0.72 });
    }
  }

  private clearTracked(): void {
    for (const store of Object.values(this.sprites)) {
      for (const tracked of store.values()) {
        tracked.sprite.destroy();
      }
      store.clear();
    }
    this.layers.targeting.clear();
    this.layers.visibility.clear();
  }
}

function applyAnimation(tracked: TrackedSprite, x: number, y: number, now: number): void {
  const sprite = tracked.sprite;
  sprite.x = x;
  sprite.y = y;
  sprite.alpha = 1;
  sprite.rotation = 0;
  sprite.scale.set(1);
  sprite.width = TILE_SIZE;
  sprite.height = TILE_SIZE;
  const period = Math.max(1, tracked.periodMs);
  const t = (now % period) / period;
  const wave = Math.sin(t * Math.PI * 2);
  switch (tracked.animation) {
    case "bob":
      sprite.y = y + wave * tracked.amplitude;
      break;
    case "pulse":
      sprite.scale.set(1 + wave * tracked.amplitude * 0.04);
      sprite.x = x + (TILE_SIZE - sprite.width) / 2;
      sprite.y = y + (TILE_SIZE - sprite.height) / 2;
      break;
    case "flash":
      sprite.alpha = 0.55 + 0.45 * (0.5 + 0.5 * wave);
      break;
    case "spin":
      sprite.rotation = t * Math.PI * 2;
      break;
    case "jitter":
      sprite.x = x + ((Math.floor(now / 50) % 2) * 2 - 1) * tracked.amplitude;
      break;
    default:
      break;
  }
}

export async function createWorldRenderer(host: HTMLElement, presentation: PresentationFacade): Promise<WorldRenderer> {
  const app = new Application();
  await app.init({
    width: WORLD_PIXELS,
    height: WORLD_PIXELS,
    background: 0x050508,
    antialias: false,
    autoDensity: true,
    resolution: 1,
    autoStart: false,
    preference: "webgl",
  });
  host.replaceChildren(app.canvas);
  app.canvas.setAttribute("aria-label", "Current plane");
  return new WorldRenderer(app, presentation);
}
