import { CONTENT_REGISTRY } from "../../core/data/registry";
import type { Direction } from "../../core/model/save-state";
import type {
  ActorReadability,
  AnimationParams,
  CollisionReadability,
  VisualRequest,
} from "../visual-types";
import { dimensionVisualProfile, mixPalette } from "./palettes";
import { circle, ellipse, fingerprint, line, path, polygon, polyline, rect, svg } from "./svg";

export interface DrawnVisual {
  readonly markup: string;
  readonly animation: AnimationParams;
  readonly collisionClass: CollisionReadability | null;
  readonly actorClass: ActorReadability | null;
  readonly label: string;
}

const NONE: AnimationParams = { kind: "none", periodMs: 0, amplitude: 0 };
const BOB: AnimationParams = { kind: "bob", periodMs: 900, amplitude: 0.06 };
const PULSE: AnimationParams = { kind: "pulse", periodMs: 1100, amplitude: 0.08 };
const FLASH: AnimationParams = { kind: "flash", periodMs: 280, amplitude: 0.4 };

function colours(request: VisualRequest, fallbackFill: string, fallbackInk: string, fallbackAccent: string) {
  if (request.plane) {
    return mixPalette(request.plane.a, request.plane.b);
  }
  return { fill: fallbackFill, ink: fallbackInk, accent: fallbackAccent };
}

function marks(id: string, ink: string): string {
  const n = fingerprint(id);
  const x = 6 + (n % 21);
  const y = 6 + ((n >>> 5) % 21);
  const x2 = 8 + ((n >>> 10) % 16);
  const y2 = 8 + ((n >>> 15) % 16);
  return line(x, y, x2, y2, ink, 1.2) + circle(x, y, 1.2, ink);
}

function facingMark(facing: Direction | undefined, accent: string): string {
  if (facing === "north") {
    return polygon("16,4 12,10 20,10", accent);
  }
  if (facing === "south") {
    return polygon("16,28 12,22 20,22", accent);
  }
  if (facing === "west") {
    return polygon("4,16 10,12 10,20", accent);
  }
  return polygon("28,16 22,12 22,20", accent);
}

function tileCollision(id: string): CollisionReadability {
  const tile = CONTENT_REGISTRY.byId.tile.get(id);
  if (!tile?.walkable) {
    return "blocked_solid";
  }
  if (tile.hazardId) {
    return "walkable_hazard";
  }
  return "walkable_plain";
}

function drawTile(id: string, request: VisualRequest): DrawnVisual {
  const tile = CONTENT_REGISTRY.byId.tile.get(id);
  const c = colours(request, "#6a8f5a", "#3a4a32", "#d0e0a8");
  const hazard = Boolean(tile?.hazardId);
  let body = rect(0, 0, 32, 32, c.fill);
  if (id.includes("water")) {
    body += polyline("2,10 8,14 14,10 20,14 26,10 30,13", c.accent, 1.4);
    body += polyline("2,20 8,24 14,20 20,24 26,20 30,23", c.ink, 1.2);
  } else if (id.includes("lava")) {
    body = rect(0, 0, 32, 32, "#4a2010") + polyline("4,8 10,22 16,6 22,24 28,10", "#ff8030", 2);
  } else if (id.includes("stone") || id.includes("rock") || id.includes("cave")) {
    body += polyline("4,6 12,10 8,18 18,22 24,12 28,20", c.ink, 1.4);
  } else if (id.includes("metal") || id.includes("station")) {
    body += rect(4, 4, 24, 24, "none", ` stroke="${c.ink}" stroke-width="1.5"`);
    body += line(4, 16, 28, 16, c.ink, 1) + line(16, 4, 16, 28, c.ink, 1);
  } else if (id.includes("arcane") || id.includes("unstable")) {
    body += circle(16, 16, 8, "none", ` stroke="${c.accent}" stroke-width="1.5"`) + circle(16, 16, 3, c.accent);
  } else if (id.includes("spectral") || id.includes("mist") || id.includes("cloud")) {
    body += ellipse(12, 16, 8, 5, c.accent) + ellipse(20, 18, 7, 4, c.ink);
  } else if (id.includes("vacuum") || id === "nothing" || id.includes("void")) {
    body = rect(0, 0, 32, 32, "#101018") + circle(8, 9, 1, "#f0f4ff") + circle(22, 14, 1.2, "#c0d0ff") + circle(16, 24, 0.8, "#ffffff");
  } else if (id.includes("divine")) {
    body += polygon("16,4 20,16 16,28 12,16", c.accent) + line(6, 16, 26, 16, c.ink, 1.2);
  } else if (id === "grass" || id.includes("dirt") || id.includes("sand") || id.includes("mud") || id.includes("snow")) {
    body += polyline("6,18 10,14 14,20", c.accent, 1.3) + polyline("18,12 22,16 26,11", c.ink, 1.2) + circle(9, 24, 1, c.ink);
  } else {
    body += marks(`tile.${id}`, c.ink);
  }
  if (hazard) {
    body += polygon("16,6 26,24 6,24", "none", ` stroke="${c.accent}" stroke-width="1.8"`);
  }
  return {
    markup: svg(body),
    animation: NONE,
    collisionClass: tileCollision(id),
    actorClass: null,
    label: id.replaceAll("_", " "),
  };
}

function drawFeature(id: string, state: string | undefined, request: VisualRequest): DrawnVisual {
  const feature = CONTENT_REGISTRY.byId.feature.get(id);
  const c = colours(request, "#5a5048", "#2a2420", "#e0d0a0");
  const resolvedState = state ?? request.state;
  let body = rect(1, 1, 30, 30, "none");
  let collision: CollisionReadability = feature?.interact ? "interactive_blocked" : "blocked_solid";
  if (id === "tree") {
    body = rect(14, 18, 4, 10, c.ink) + ellipse(16, 14, 8, 9, c.fill);
  } else if (id === "bush") {
    body = ellipse(16, 20, 10, 7, c.fill) + ellipse(12, 16, 6, 5, c.accent);
  } else if (id.includes("boulder") || id.includes("rock")) {
    body = polygon("8,24 6,14 16,8 26,13 24,24", c.ink);
  } else if (id.startsWith("wall")) {
    body = rect(4, 4, 24, 24, c.fill, ` stroke="${c.ink}" stroke-width="2"`);
  } else if (id === "fence") {
    body = line(6, 8, 6, 26, c.ink, 2) + line(26, 8, 26, 26, c.ink, 2) + line(6, 14, 26, 14, c.fill, 2);
  } else if (id === "altar" || id === "statue" || id === "pillar") {
    body = rect(10, 18, 12, 10, c.ink) + polygon("8,18 16,6 24,18", c.accent);
  } else if (id === "gravestone") {
    body = path("M8 28 V14 A8 8 0 0 1 24 14 V28 Z", c.fill, ` stroke="${c.ink}" stroke-width="1.4"`);
  } else if (id === "machine" || id === "console") {
    body = rect(6, 8, 20, 18, c.fill, ` stroke="${c.ink}" stroke-width="1.6"`) + line(10, 14, 22, 14, c.accent, 1.4) + circle(16, 20, 2, c.accent);
  } else if (id === "crystal") {
    body = polygon("16,4 24,16 16,28 8,16", c.accent, ` stroke="${c.ink}" stroke-width="1.2"`);
  } else if (id === "crate" || id === "barrel" || id === "container_chest" || id === "container_cache") {
    body = rect(7, 10, 18, 14, c.fill, ` stroke="${c.ink}" stroke-width="1.6"`) + line(7, 17, 25, 17, c.ink, 1);
  } else if (id === "safe_anchor") {
    body = circle(16, 16, 11, "none", ` stroke="${c.accent}" stroke-width="2"`) + circle(16, 16, 6, "none", ` stroke="${c.ink}" stroke-width="1.6"`) + circle(16, 16, 2, c.fill);
  } else if (id === "door") {
    const open = resolvedState === "open";
    const locked = resolvedState === "locked";
    body = rect(8, 4, 16, 24, open ? "none" : c.fill, ` stroke="${c.ink}" stroke-width="2"`);
    if (open) {
      body += line(8, 4, 8, 28, c.ink, 3);
      collision = "walkable_plain";
    } else {
      body += circle(20, 18, 1.6, locked ? c.accent : c.ink);
      if (locked) {
        body += rect(18, 10, 4, 6, "none", ` stroke="${c.accent}" stroke-width="1.4"`);
      }
    }
  } else if (id === "transition_fixture") {
    body = circle(16, 16, 10, "none", ` stroke="${c.accent}" stroke-width="2"`) + polygon("16,8 20,16 16,24 12,16", c.fill);
    collision = "transition_usable";
  } else if (id === "table" || id === "counter" || id === "shelf" || id === "bed" || id === "pew" || id === "chair") {
    body = rect(6, 10, 20, 12, c.fill, ` stroke="${c.ink}" stroke-width="1.4"`);
  } else {
    body = rect(8, 8, 16, 16, c.fill, ` stroke="${c.ink}" stroke-width="1.6"`) + marks(`feature.${id}`, c.accent);
  }
  return {
    markup: svg(body),
    animation: id === "safe_anchor" ? PULSE : NONE,
    collisionClass: collision,
    actorClass: null,
    label: `${id.replaceAll("_", " ")}${resolvedState ? ` (${resolvedState})` : ""}`,
  };
}

function drawPlayer(request: VisualRequest): DrawnVisual {
  const c = colours(request, "#f0e0c0", "#203040", "#f4d060");
  const body =
    circle(16, 11, 5, c.fill, ` stroke="${c.ink}" stroke-width="1.6"`) +
    polygon("10,16 22,16 20,28 12,28", c.fill, ` stroke="${c.ink}" stroke-width="1.6"`) +
    facingMark(request.facing, c.accent) +
    rect(13, 28, 6, 2, c.accent);
  return { markup: svg(body), animation: BOB, collisionClass: null, actorClass: "player", label: "player" };
}

function drawNpc(id: string, request: VisualRequest): DrawnVisual {
  const c = colours(request, "#d8c8a8", "#403428", "#80c0e0");
  const story = CONTENT_REGISTRY.byId.storyNpc.get(id);
  const body =
    circle(16, 14, 7, c.fill, ` stroke="${c.ink}" stroke-width="1.5"`) +
    polygon("16,4 18,8 14,8", c.accent) +
    marks(`npc.${id}`, c.ink);
  return {
    markup: svg(body),
    animation: BOB,
    collisionClass: null,
    actorClass: "friendly_npc",
    label: story?.name ?? id.replaceAll("_", " "),
  };
}

function drawMonster(id: string, request: VisualRequest): DrawnVisual {
  const species = CONTENT_REGISTRY.byId.monster.get(id);
  const c = colours(request, "#703848", "#201018", "#e8a040");
  const role = species?.role ?? "brute";
  let figure = "";
  if (role === "swarm") {
    figure = circle(11, 18, 4, c.fill) + circle(18, 14, 3.5, c.fill) + circle(21, 21, 3, c.ink);
  } else if (role === "skirmisher") {
    figure = polygon("8,26 16,6 24,26", c.fill, ` stroke="${c.ink}" stroke-width="1.4"`);
  } else if (role === "sniper") {
    figure = ellipse(16, 16, 5, 10, c.fill, ` stroke="${c.ink}" stroke-width="1.4"`) + line(16, 6, 16, 2, c.accent, 2);
  } else if (role === "ambusher") {
    figure = ellipse(16, 22, 10, 6, c.fill, ` stroke="${c.ink}" stroke-width="1.4"`) + circle(16, 16, 3, c.accent);
  } else if (role === "controller") {
    figure = circle(16, 16, 8, c.fill) + line(16, 6, 16, 2, c.accent, 1.4) + line(6, 16, 2, 16, c.accent, 1.4) + line(26, 16, 30, 16, c.accent, 1.4);
  } else if (role === "tank") {
    figure = rect(7, 8, 18, 18, c.fill, ` stroke="${c.ink}" stroke-width="2.2"`);
  } else if (role === "pursuer") {
    figure = polygon("6,24 16,6 26,24 16,18", c.fill, ` stroke="${c.ink}" stroke-width="1.4"`);
  } else {
    figure = polygon("8,24 10,10 22,10 24,24", c.fill, ` stroke="${c.ink}" stroke-width="1.6"`);
  }
  figure += facingMark(request.facing, c.accent);
  let actorClass: ActorReadability = "hostile";
  if (species?.boss) {
    figure += circle(16, 16, 13, "none", ` stroke="${c.accent}" stroke-width="1.6"`);
    actorClass = "boss";
  } else if (species?.guardianOf || role === "tank") {
    figure += rect(12, 3, 8, 4, c.accent);
    actorClass = "elite";
  }
  figure += polygon("26,6 30,6 28,10", c.accent);
  return { markup: svg(figure), animation: BOB, collisionClass: null, actorClass, label: id.replaceAll("_", " ") };
}

function drawItem(id: string, request: VisualRequest): DrawnVisual {
  const item = CONTENT_REGISTRY.byId.item.get(id);
  const c = colours(request, "#c8b070", "#403020", "#f0e8c0");
  let body = rect(4, 4, 24, 24, "#1c1814", ` rx="3"`);
  if (item?.kind === "weapon") {
    body += line(10, 24, 22, 8, c.accent, 2.2) + rect(8, 22, 6, 4, c.ink);
  } else if (item?.kind === "consumable") {
    body += ellipse(16, 18, 6, 8, c.fill, ` stroke="${c.ink}" stroke-width="1.3"`) + circle(16, 8, 2, c.accent);
  } else if (item?.kind === "key") {
    body += circle(12, 16, 5, "none", ` stroke="${c.accent}" stroke-width="2"`) + rect(16, 14, 10, 4, c.accent);
  } else if (item?.kind === "body") {
    body += polygon("10,8 22,8 24,24 8,24", c.fill, ` stroke="${c.ink}" stroke-width="1.3"`);
  } else {
    body += rect(10, 10, 12, 12, c.fill, ` stroke="${c.ink}" stroke-width="1.3"`) + marks(`item.${id}`, c.accent);
  }
  return { markup: svg(body), animation: NONE, collisionClass: null, actorClass: null, label: item?.name ?? id.replaceAll("_", " ") };
}

function drawStatus(id: string): DrawnVisual {
  const status = CONTENT_REGISTRY.byId.status.get(id);
  const fill = id.includes("ward") ? "#4060c0" : id.includes("poison") ? "#3a8040" : id.includes("burn") ? "#d05020" : "#704090";
  const body = circle(16, 16, 12, fill, ` stroke="#f4f0e8" stroke-width="1.6"`) + marks(`status.${id}`, "#f4f0e8");
  return { markup: svg(body), animation: PULSE, collisionClass: null, actorClass: null, label: status?.name ?? id };
}

function drawAbility(id: string): DrawnVisual {
  const ability = CONTENT_REGISTRY.byId.ability.get(id);
  const body = rect(3, 3, 26, 26, "#202830", ` rx="4"`) + polygon("16,6 24,16 16,26 8,16", "#80d0ff") + marks(`ability.${id}`, "#f0f8ff");
  return { markup: svg(body), animation: NONE, collisionClass: null, actorClass: null, label: ability?.name ?? id.replaceAll("_", " ") };
}

function drawTransition(id: string, request: VisualRequest): DrawnVisual {
  const broken = id.endsWith("_broken");
  const activate = id.endsWith("_activate");
  const arrive = id.endsWith("_arrive");
  const c = colours(request, "#406080", "#101820", "#e8d080");
  let body = circle(16, 16, 12, broken ? "#2a2a28" : c.fill, ` stroke="${broken ? "#a07040" : c.accent}" stroke-width="2"`);
  if (broken) {
    body += line(8, 8, 24, 24, "#c08040", 2) + line(24, 8, 8, 24, "#c08040", 2);
  } else {
    body += polygon("16,7 21,16 16,25 11,16", c.accent);
  }
  return {
    markup: svg(body),
    animation: activate || arrive ? FLASH : broken ? NONE : PULSE,
    collisionClass: broken ? "transition_broken" : "transition_usable",
    actorClass: null,
    label: id.replaceAll("_", " "),
  };
}

function drawGem(dimension: number, state: string): DrawnVisual {
  const palettes = dimensionVisualProfile(dimension);
  const fill = state === "unknown" ? "none" : palettes.primary;
  let body = polygon("16,4 28,16 16,28 4,16", fill, ` stroke="${palettes.accent}" stroke-width="1.8"`);
  if (state === "unknown") {
    body = polygon("16,4 28,16 16,28 4,16", "none", ` stroke="${palettes.secondary}" stroke-width="1.8"`);
  }
  if (state === "known") {
    body += circle(16, 16, 3, palettes.accent);
  }
  if (state === "current") {
    body += circle(16, 16, 14, "none", ` stroke="${palettes.accent}" stroke-width="1.6"`);
  }
  body += marks(`gem.${dimension}`, palettes.secondary);
  return {
    markup: svg(body),
    animation: state === "current" ? PULSE : NONE,
    collisionClass: null,
    actorClass: null,
    label: `dimension ${dimension} ${state}`,
  };
}

function drawEffect(id: string): DrawnVisual {
  let body = circle(16, 16, 10, "none", ` stroke="#f0f0f0" stroke-width="1.6"`);
  if (id.includes("miss")) {
    body += line(8, 8, 24, 24, "#c0c0c0", 2);
  } else if (id.includes("hit")) {
    body += polygon("16,6 18,14 26,16 18,18 16,26 14,18 6,16 14,14", "#f0d060");
  } else if (id.includes("death")) {
    body += line(8, 16, 24, 16, "#e0e0e0", 2) + line(16, 8, 16, 24, "#e0e0e0", 2);
  } else if (id.includes("blocked") || id.includes("invalid")) {
    body += rect(10, 10, 12, 12, "none", ` stroke="#e07070" stroke-width="2"`);
  } else {
    body += circle(16, 16, 5, "#80d0ff");
  }
  return { markup: svg(body), animation: FLASH, collisionClass: null, actorClass: null, label: id.replaceAll("_", " ") };
}

function drawUi(id: string): DrawnVisual {
  const body = rect(2, 2, 28, 28, "#1a1e24", ` rx="4"`) + marks(`ui.${id}`, "#e8e4d8");
  return { markup: svg(body), animation: NONE, collisionClass: null, actorClass: null, label: id.replaceAll("_", " ") };
}

function drawHazard(id: string): DrawnVisual {
  const body = polygon("16,4 28,28 4,28", "#c04020", ` stroke="#f0e0c0" stroke-width="1.5"`) + marks(`hazard.${id}`, "#f0e0c0");
  return { markup: svg(body), animation: PULSE, collisionClass: "walkable_hazard", actorClass: null, label: id.replaceAll("_", " ") };
}

function drawVisibility(id: string): DrawnVisual {
  const body = rect(0, 0, 32, 32, id === "clear" ? "#d0d8c8" : "#101018") + circle(16, 16, id === "blinded" ? 4 : 10, "#f0f4e8");
  return { markup: svg(body), animation: NONE, collisionClass: null, actorClass: null, label: id };
}

export function drawSemantic(request: VisualRequest): DrawnVisual {
  const id = request.semanticId;
  const [kind, ...rest] = id.split(".");
  const restId = rest.join(".");
  if (kind === "tile") {
    return drawTile(restId, request);
  }
  if (kind === "feature") {
    const [featureId, state] = rest;
    return drawFeature(featureId ?? restId, state, request);
  }
  if (id === "actor.player") {
    return drawPlayer(request);
  }
  if (kind === "npc") {
    return drawNpc(restId, request);
  }
  if (kind === "monster") {
    return drawMonster(restId, request);
  }
  if (kind === "item") {
    return drawItem(restId, request);
  }
  if (kind === "status") {
    return drawStatus(restId);
  }
  if (kind === "ability") {
    return drawAbility(restId);
  }
  if (kind === "transition") {
    return drawTransition(restId, request);
  }
  if (kind === "gem") {
    return drawGem(Number(rest[0]), rest[1] ?? "unknown");
  }
  if (kind === "effect") {
    return drawEffect(restId);
  }
  if (kind === "ui") {
    return drawUi(restId);
  }
  if (kind === "hazard") {
    return drawHazard(restId);
  }
  if (kind === "visibility") {
    return drawVisibility(restId);
  }
  throw new Error(`unhandled visual family: ${id}`);
}
