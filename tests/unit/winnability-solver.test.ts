import { describe, expect, it } from "vitest";
import { OLYMPUS_PLANE, proveWinnable, STARTING_PLANE } from "../../src/core";
import type { WorldTopology } from "../../src/core";
import type {
  ProgressionSource,
  TopologyGate,
  TopologyTransition,
} from "../../src/core/generation/topology-types";

const START = STARTING_PLANE;
const OLYMPUS = OLYMPUS_PLANE;
const SIDE = { a: 0 as const, b: 2 as const };

function transition(
  id: string,
  source: WorldTopology["olympusBossInstance"]["plane"],
  destination: WorldTopology["olympusBossInstance"]["plane"],
  extras: Partial<TopologyTransition> = {},
): TopologyTransition {
  return {
    id,
    sourcePlane: source,
    destinationPlane: destination,
    archetypeId: "door",
    transitionEffectProfileId: "fixed_gate",
    coordinateMode: "fixed",
    conditionSetId: null,
    gateId: extras.gateId ?? null,
    progressionClass: extras.progressionClass ?? "open",
    initiallyBroken: extras.initiallyBroken ?? false,
    semanticTags: [],
  };
}

function gate(partial: TopologyGate): TopologyGate {
  return partial;
}

function source(partial: ProgressionSource): ProgressionSource {
  return partial;
}

function topology(partial: Partial<WorldTopology> = {}): WorldTopology {
  return {
    generatorVersion: "tight-v1",
    worldSeed: "fixture",
    topologyAttempt: 0,
    planeNodes: [
      { plane: START, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
      { plane: OLYMPUS, dominantDimension: 15, family: "olympus", progressionTier: 7 },
    ],
    transitions: [],
    gates: [],
    progressionSources: [],
    guardianInstances: [],
    questInstances: [],
    npcInstances: [],
    shopInstances: [],
    olympusBossInstance: {
      encounterId: "boss_olympus",
      monsterId: "olympian_final",
      plane: OLYMPUS,
      arenaId: "olympus_arena",
    },
    ordinaryEncounterDropsAreSolverVisible: false,
    topologyHash: "fixture",
    ...partial,
  };
}

describe("winnability solver", () => {
  it("passes a direct open route", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.open", START, OLYMPUS)],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.witness[0]?.type).toBe("START");
    expect(result.witness.some((step) => step.type === "TRAVERSE_TRANSITION")).toBe(true);
    expect(result.witness.at(-1)?.type).toBe("FINAL_BOSS_AVAILABLE");
  });

  it("fails when Olympus is unreachable", () => {
    const result = proveWinnable(topology());
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failure.reachablePlaneCount).toBe(1);
    expect(result.failure.discoveredDimensions).toEqual([0, 1]);
  });

  it("passes a key gate when the key is reachable", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.key", START, OLYMPUS, { gateId: "gate.key", progressionClass: "key_gate" })],
        gates: [gate({ id: "gate.key", transitionId: "transition.key", progressionClass: "key_gate", requiredItemId: "house_key" })],
        progressionSources: [
          source({
            id: "source.fixed_item.house_key",
            plane: START,
            sourceType: "fixed_item",
            grants: ["item:house_key"],
            requirements: [],
            consumption: false,
            contentReference: "house_key",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("fails a key-behind-own-gate cycle", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.key", START, OLYMPUS, { gateId: "gate.key", progressionClass: "key_gate" })],
        gates: [gate({ id: "gate.key", transitionId: "transition.key", progressionClass: "key_gate", requiredItemId: "house_key" })],
        progressionSources: [
          source({
            id: "source.fixed_item.house_key",
            plane: OLYMPUS,
            sourceType: "fixed_item",
            grants: ["item:house_key"],
            requirements: [],
            consumption: false,
            contentReference: "house_key",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failure.unsatisfiedGateSummaries.some((row) => row.reason.includes("house_key"))).toBe(true);
  });

  it("passes a resource gate with exact required quantity", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" })],
        gates: [
          gate({
            id: "gate.ore",
            transitionId: "transition.ore",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 1,
          }),
        ],
        progressionSources: [
          source({
            id: "source.container.ore.0",
            plane: START,
            sourceType: "container",
            grants: ["resource:ore"],
            requirements: [],
            consumption: false,
            contentReference: "ore",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.witness.some((step) => step.type === "UNLOCK_GATE" && step.id === "gate.ore")).toBe(true);
  });

  it("fails a resource gate with insufficient quantity", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" })],
        gates: [
          gate({
            id: "gate.ore",
            transitionId: "transition.ore",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 2,
          }),
        ],
        progressionSources: [
          source({
            id: "source.container.ore.0",
            plane: START,
            sourceType: "container",
            grants: ["resource:ore"],
            requirements: [],
            consumption: false,
            contentReference: "ore",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failure.scarceResources).toContain("ore");
  });

  it("does not double-count ore across competing resource gates", () => {
    const result = proveWinnable(
      topology({
        planeNodes: [
          { plane: START, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
          { plane: SIDE, dominantDimension: 2, family: "inside", progressionTier: 1 },
          { plane: OLYMPUS, dominantDimension: 15, family: "olympus", progressionTier: 7 },
        ],
        transitions: [
          transition("transition.side", START, SIDE, { gateId: "gate.side", progressionClass: "resource_gate" }),
          transition("transition.olympus", SIDE, OLYMPUS, { gateId: "gate.olympus", progressionClass: "resource_gate" }),
        ],
        gates: [
          gate({
            id: "gate.side",
            transitionId: "transition.side",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 1,
          }),
          gate({
            id: "gate.olympus",
            transitionId: "transition.olympus",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 1,
          }),
        ],
        progressionSources: [
          source({
            id: "source.container.ore.0",
            plane: START,
            sourceType: "container",
            grants: ["resource:ore"],
            requirements: [],
            consumption: false,
            contentReference: "ore",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes a shop purchase when currency is provable", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.key", START, OLYMPUS, { gateId: "gate.key", progressionClass: "key_gate" })],
        gates: [gate({ id: "gate.key", transitionId: "transition.key", progressionClass: "key_gate", requiredItemId: "house_key" })],
        shopInstances: [{ id: "shop_start", shopTypeId: "general_store", plane: START, npcInstanceId: null, catalogueShopId: "shop_start" }],
        progressionSources: [
          source({
            id: "source.guardian_reward.g1",
            plane: START,
            sourceType: "guardian_reward",
            grants: ["currency:15", "flag:g1"],
            requirements: [],
            consumption: false,
            contentReference: "guardian_stone",
            quantity: 1,
          }),
          source({
            id: "source.shop_stock.shop_start.house_key",
            plane: START,
            sourceType: "shop_stock",
            grants: ["item:house_key"],
            requirements: ["currency:15"],
            consumption: true,
            contentReference: "house_key",
            quantity: 1,
            price: 15,
          }),
        ],
        guardianInstances: [
          { id: "g1", encounterId: "guardian_stone", monsterId: "golem_warden", plane: START, gatedTransitionId: null },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.witness.some((step) => step.type === "BUY_ITEM")).toBe(true);
  });

  it("cannot purchase finite stock twice", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.key", START, OLYMPUS, { gateId: "gate.key", progressionClass: "key_gate" })],
        gates: [gate({ id: "gate.key", transitionId: "transition.key", progressionClass: "key_gate", requiredItemId: "house_key" })],
        progressionSources: [
          source({
            id: "source.shop_stock.shop_start.house_key",
            plane: START,
            sourceType: "shop_stock",
            grants: ["item:house_key"],
            requirements: ["currency:15"],
            consumption: true,
            contentReference: "house_key",
            quantity: 1,
            price: 15,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("opens an ability gate from a quest-granted ability", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.ability", START, OLYMPUS, { gateId: "gate.ability", progressionClass: "ability_gate" })],
        gates: [gate({ id: "gate.ability", transitionId: "transition.ability", progressionClass: "ability_gate", requiredAbilityId: "arcane_gate" })],
        questInstances: [{ id: "quest.q_arcane_gate.start.0", questId: "q_arcane_gate", plane: START, npcId: null, flagIds: [] }],
        progressionSources: [
          source({
            id: "source.quest_reward.quest.q_arcane_gate.start.0",
            plane: START,
            sourceType: "quest_reward",
            grants: ["ability:arcane_gate", "flag:arcane_route_open"],
            requirements: [],
            consumption: false,
            contentReference: "q_arcane_gate",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.witness.some((step) => step.type === "COMPLETE_QUEST")).toBe(true);
    expect(result.witness.some((step) => step.type === "LEARN_ABILITY")).toBe(true);
  });

  it("fails a circular quest/ability dependency", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.ability", START, OLYMPUS, { gateId: "gate.ability", progressionClass: "ability_gate" })],
        gates: [gate({ id: "gate.ability", transitionId: "transition.ability", progressionClass: "ability_gate", requiredAbilityId: "arcane_gate" })],
        questInstances: [{ id: "quest.q_arcane_gate.olympus.0", questId: "q_arcane_gate", plane: OLYMPUS, npcId: null, flagIds: [] }],
        progressionSources: [
          source({
            id: "source.quest_reward.quest.q_arcane_gate.olympus.0",
            plane: OLYMPUS,
            sourceType: "quest_reward",
            grants: ["ability:arcane_gate"],
            requirements: [],
            consumption: false,
            contentReference: "q_arcane_gate",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes a guardian gate from a reachable guardian", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.guard", START, OLYMPUS, { gateId: "gate.guard", progressionClass: "guardian_gate" })],
        gates: [
          gate({
            id: "gate.guard",
            transitionId: "transition.guard",
            progressionClass: "guardian_gate",
            requiredFlag: "gate.transition.guard.guardianDefeated",
            guardianInstanceId: "guardian.1",
          }),
        ],
        guardianInstances: [
          { id: "guardian.1", encounterId: "guardian_stone", monsterId: "golem_warden", plane: START, gatedTransitionId: "transition.guard" },
        ],
        progressionSources: [
          source({
            id: "source.guardian_reward.guardian.1",
            plane: START,
            sourceType: "guardian_reward",
            grants: ["flag:gate.transition.guard.guardianDefeated"],
            requirements: [],
            consumption: false,
            contentReference: "guardian_stone",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.witness.some((step) => step.type === "DEFEAT_GUARDIAN")).toBe(true);
  });

  it("passes a quest flag gate", () => {
    const result = proveWinnable(
      topology({
        transitions: [transition("transition.quest", START, OLYMPUS, { gateId: "gate.quest", progressionClass: "quest_flag_gate" })],
        gates: [
          gate({
            id: "gate.quest",
            transitionId: "transition.quest",
            progressionClass: "quest_flag_gate",
            requiredFlag: "gate.transition.quest.questComplete",
            questInstanceId: "quest.q_arcane_gate.start.0",
          }),
        ],
        questInstances: [{ id: "quest.q_arcane_gate.start.0", questId: "q_arcane_gate", plane: START, npcId: null, flagIds: ["gate.transition.quest.questComplete"] }],
        progressionSources: [
          source({
            id: "source.quest_reward.quest.q_arcane_gate.start.0",
            plane: START,
            sourceType: "quest_reward",
            grants: ["flag:gate.transition.quest.questComplete", "ability:arcane_gate"],
            requirements: [],
            consumption: false,
            contentReference: "q_arcane_gate",
            quantity: 1,
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("counts a concrete monster drop and ignores an absent drop", () => {
    const present = proveWinnable(
      topology({
        ordinaryEncounterDropsAreSolverVisible: true,
        transitions: [transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" })],
        gates: [
          gate({
            id: "gate.ore",
            transitionId: "transition.ore",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 1,
          }),
        ],
        progressionSources: [
          source({
            id: "source.monster_drop.m42.ore",
            plane: START,
            sourceType: "monster_drop",
            grants: ["resource:ore"],
            requirements: [],
            consumption: false,
            contentReference: "ore",
            quantity: 1,
          }),
        ],
      }),
    );
    const absent = proveWinnable(
      topology({
        ordinaryEncounterDropsAreSolverVisible: true,
        transitions: [transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" })],
        gates: [
          gate({
            id: "gate.ore",
            transitionId: "transition.ore",
            progressionClass: "resource_gate",
            requiredResourceId: "ore",
            requiredQuantity: 1,
          }),
        ],
      }),
    );
    expect(present.ok).toBe(true);
    expect(absent.ok).toBe(false);
  });

  it("returns an identical witness on repeated solves", () => {
    const world = topology({
      transitions: [transition("transition.open", START, OLYMPUS)],
    });
    const first = proveWinnable(world);
    const second = proveWinnable(world);
    expect(first).toEqual(second);
  });
});

const RESOURCE_IDS = ["herb", "ore", "crystal", "ectoplasm", "star_matter", "void_fragment", "divine_fragment"] as const;

function resourceSource(id: string, resourceId: string, quantity: number, plane = START): ProgressionSource {
  return source({
    id,
    plane,
    sourceType: "container",
    grants: [`resource:${resourceId}`],
    requirements: [],
    consumption: false,
    contentReference: resourceId,
    quantity,
  });
}

function resourceGateRow(
  id: string,
  transitionId: string,
  resourceId: string,
  quantity: number,
): TopologyGate {
  return gate({
    id,
    transitionId,
    progressionClass: "resource_gate",
    requiredResourceId: resourceId,
    requiredQuantity: quantity,
  });
}

function agreesWithUnpruned(world: WorldTopology): void {
  expect(proveWinnable(world).ok).toBe(proveWinnable(world, { prune: false }).ok);
}

describe("winnability solver inventory feasibility", () => {
  it("passes when optional free loot exceeds 12 slots but the winning route needs a subset", () => {
    const extras = RESOURCE_IDS.filter((id) => id !== "ore");
    const extraPlanes: { a: 0; b: 2 | 3 | 4 | 5 | 6 | 7 }[] = [
      { a: 0, b: 2 },
      { a: 0, b: 3 },
      { a: 0, b: 4 },
      { a: 0, b: 5 },
      { a: 0, b: 6 },
      { a: 0, b: 7 },
    ];
    const world = topology({
      planeNodes: [
        { plane: START, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
        { plane: OLYMPUS, dominantDimension: 15, family: "olympus", progressionTier: 7 },
        ...extraPlanes.map((plane) => ({
          plane,
          dominantDimension: plane.b,
          family: "inside" as const,
          progressionTier: 1,
        })),
      ],
      transitions: [
        transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" }),
        ...extraPlanes.map((plane, index) =>
          transition(`transition.${extras[index]}`, START, plane, {
            gateId: `gate.${extras[index]}`,
            progressionClass: "resource_gate",
          }),
        ),
      ],
      gates: [
        resourceGateRow("gate.ore", "transition.ore", "ore", 1),
        ...extras.map((id) => resourceGateRow(`gate.${id}`, `transition.${id}`, id, 10)),
      ],
      progressionSources: [
        resourceSource("source.container.ore", "ore", 10),
        ...extras.map((id) => resourceSource(`source.container.${id}`, id, 10)),
      ],
    });
    const result = proveWinnable(world);
    expect(result.ok).toBe(true);
    agreesWithUnpruned(world);
  });

  it("passes when a bulky useful resource can be discarded so a later resource fits", () => {
    const dead = { a: 0 as const, b: 3 as const };
    const world = topology({
      planeNodes: [
        { plane: START, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
        { plane: SIDE, dominantDimension: 2, family: "inside", progressionTier: 1 },
        { plane: dead, dominantDimension: 3, family: "inside", progressionTier: 1 },
        { plane: OLYMPUS, dominantDimension: 15, family: "olympus", progressionTier: 7 },
      ],
      transitions: [
        transition("transition.side", START, SIDE, { gateId: "gate.side", progressionClass: "resource_gate" }),
        transition("transition.dead", START, dead, { gateId: "gate.dead", progressionClass: "resource_gate" }),
        transition("transition.olympus", SIDE, OLYMPUS, { gateId: "gate.olympus", progressionClass: "resource_gate" }),
      ],
      gates: [
        resourceGateRow("gate.side", "transition.side", "ore", 1),
        resourceGateRow("gate.dead", "transition.dead", "ore", 108),
        resourceGateRow("gate.olympus", "transition.olympus", "crystal", 1),
      ],
      progressionSources: [
        resourceSource("source.container.ore", "ore", 108),
        resourceSource("source.container.crystal", "crystal", 1, SIDE),
      ],
    });
    const result = proveWinnable(world);
    expect(result.ok).toBe(true);
    agreesWithUnpruned(world);
  });

  it("fails when a winning route would have to carry more than 12 slots at once", () => {
    const world = topology({
      transitions: [transition("transition.ore", START, OLYMPUS, { gateId: "gate.ore", progressionClass: "resource_gate" })],
      gates: [resourceGateRow("gate.ore", "transition.ore", "ore", 109)],
      progressionSources: [resourceSource("source.container.ore", "ore", 109)],
    });
    const result = proveWinnable(world);
    expect(result.ok).toBe(false);
    agreesWithUnpruned(world);
  });

  it("agrees with the unpruned reference solver on small inventory-pressure graphs", () => {
    const extras = [0, 10, 108];
    const needs = [1, 9, 10, 108, 109];
    for (const need of needs) {
      for (const extra of extras) {
        const world = topology({
          planeNodes: [
            { plane: START, dominantDimension: 1, family: "aboveground", progressionTier: 0 },
            { plane: SIDE, dominantDimension: 2, family: "inside", progressionTier: 1 },
            { plane: OLYMPUS, dominantDimension: 15, family: "olympus", progressionTier: 7 },
          ],
          transitions: [
            transition("transition.olympus", START, OLYMPUS, { gateId: "gate.olympus", progressionClass: "resource_gate" }),
            ...(extra > 0
              ? [transition("transition.side", START, SIDE, { gateId: "gate.side", progressionClass: "resource_gate" })]
              : []),
          ],
          gates: [
            resourceGateRow("gate.olympus", "transition.olympus", "ore", need),
            ...(extra > 0 ? [resourceGateRow("gate.side", "transition.side", "herb", extra)] : []),
          ],
          progressionSources: [
            resourceSource("source.container.ore", "ore", need),
            ...(extra > 0 ? [resourceSource("source.container.herb", "herb", extra)] : []),
          ],
        });
        agreesWithUnpruned(world);
      }
    }
  });
});
