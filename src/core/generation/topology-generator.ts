import { CONTENT_REGISTRY } from "../data/registry";
import { familyForPlane } from "../data/dimensions";
import { GLOBAL_CONSTANTS } from "../model/constants";
import {
  enumeratePlanes,
  OLYMPUS_PLANE,
  planeKey,
  planesEqual,
  STARTING_PLANE,
  type PlanePair,
} from "../model/plane";
import type { FamilyId } from "../model/ids";
import { bytesToHex, sha256 } from "./sha256";
import { chance, percentile, semantic, weightedChoice, type SemanticPart } from "./semantic-random";
import { neighbourWeight, potentialNeighbours, planeTier, sharesExactlyOneDimension } from "./topology-neighbours";
import type {
  GuardianInstance,
  NpcInstance,
  OlympusBossInstance,
  PlaneNode,
  ProgressionClass,
  ProgressionSource,
  QuestInstance,
  ShopInstance,
  TopologyGate,
  TopologyGenerationResult,
  TopologyTransition,
  WorldTopology,
} from "./topology-types";

const COORDINATE_MODES: { id: string; weight: number; value: { mode: TopologyTransition["coordinateMode"]; profile: string } }[] = [
  { id: "fixed", weight: 55, value: { mode: "fixed", profile: "fixed_gate" } },
  { id: "source_axis_copy", weight: 25, value: { mode: "source_axis_copy", profile: "copied_gate" } },
  { id: "deterministic_derived", weight: 20, value: { mode: "deterministic_derived", profile: "derived_gate" } },
];

const ARCHETYPES_BY_FAMILY: Record<FamilyId, readonly string[]> = {
  aboveground: ["door", "stairs", "ladder", "cave_mouth", "well", "hole", "elevator"],
  inside: ["door", "stairs", "ladder", "cave_mouth", "well", "hole", "elevator"],
  dungeon: ["door", "stairs", "ladder", "cave_mouth", "well", "hole", "elevator"],
  arcane: ["mirror", "portal", "magic_circle", "rift"],
  ethereal: ["grave", "dimensional_tear", "mirror", "map_edge_passage"],
  space: ["airlock", "wormhole", "portal"],
  void: ["dimensional_tear", "rift", "grave", "portal"],
  olympus: ["portal", "stairs", "elevator", "magic_circle"],
};

const KEYS_BY_TIER: Record<number, readonly string[]> = {
  0: ["house_key"],
  1: ["house_key"],
  2: ["mine_key"],
  3: ["rune_sigil"],
  4: ["spirit_token"],
  5: ["station_clearance"],
  6: ["abyss_mark"],
  7: ["abyss_mark"],
};

const RESOURCES_BY_TIER: Record<number, readonly string[]> = {
  0: ["ore"],
  1: ["ore"],
  2: ["ore"],
  3: ["crystal"],
  4: ["ectoplasm"],
  5: ["star_matter"],
  6: ["void_fragment"],
  7: ["divine_fragment"],
};

const ABILITIES_BY_TIER: Record<number, readonly string[]> = {
  0: [],
  1: [],
  2: [],
  3: ["arcane_gate"],
  4: ["dream_step"],
  5: ["dream_step"],
  6: ["void_slip"],
  7: ["divine_passage"],
};

function identityParts(version: string, seed: string, attempt: number): SemanticPart[] {
  return [semantic.string(version), semantic.string(seed), semantic.i64(attempt)];
}

function parts(
  version: string,
  seed: string,
  attempt: number,
  purpose: string,
  subject: string,
): SemanticPart[] {
  return [...identityParts(version, seed, attempt), semantic.string(purpose), semantic.string(subject)];
}

function outboundTarget(version: string, seed: string, attempt: number, plane: PlanePair): number {
  const roll = percentile(parts(version, seed, attempt, "topology.edge.count", planeKey(plane)));
  if (roll <= 49) {
    return 3;
  }
  if (roll <= 84) {
    return 4;
  }
  return 5;
}

function rankedNeighbours(version: string, seed: string, attempt: number, source: PlanePair): PlanePair[] {
  const entries = potentialNeighbours(source).map((destination) => ({
    id: planeKey(destination),
    weight: neighbourWeight(source, destination),
    value: destination,
  }));
  return weightedRankPlanes(parts(version, seed, attempt, "topology.edge.rank", planeKey(source)), entries);
}

function weightedRankPlanes(
  keyParts: SemanticPart[],
  entries: { id: string; weight: number; value: PlanePair }[],
): PlanePair[] {
  const remaining = [...entries];
  const ranked: PlanePair[] = [];
  let ordinal = 0;
  while (remaining.length > 0) {
    const chosen = weightedChoice(keyParts, remaining, ordinal);
    ranked.push(chosen);
    const index = remaining.findIndex((entry) => planesEqual(entry.value, chosen));
    remaining.splice(index, 1);
    ordinal += 1;
  }
  return ranked;
}

function eligibleArchetypes(source: PlanePair, destination: PlanePair): string[] {
  const sourceFamily = familyForPlane(source);
  const destFamily = familyForPlane(destination);
  const ids = new Set([...ARCHETYPES_BY_FAMILY[sourceFamily], ...ARCHETYPES_BY_FAMILY[destFamily]]);
  if (!etherealEdgeLegal(source, destination)) {
    ids.delete("map_edge_passage");
  }
  return [...ids].sort();
}

function etherealEdgeLegal(source: PlanePair, destination: PlanePair): boolean {
  if (familyForPlane(source) !== "ethereal") {
    return false;
  }
  const kept = source.a;
  if (destination.a !== kept && destination.b !== kept) {
    return false;
  }
  const incoming = destination.a === kept ? destination.b : destination.a;
  return incoming === 12 || incoming === 13;
}

function gateClassWeights(tier: number): { id: string; weight: number; value: ProgressionClass }[] {
  if (tier <= 1) {
    return [
      { id: "open", weight: 90, value: "open" },
      { id: "key_gate", weight: 5, value: "key_gate" },
      { id: "resource_gate", weight: 5, value: "resource_gate" },
    ];
  }
  if (tier <= 3) {
    return [
      { id: "open", weight: 65, value: "open" },
      { id: "guardian_gate", weight: 10, value: "guardian_gate" },
      { id: "key_gate", weight: 8, value: "key_gate" },
      { id: "resource_gate", weight: 8, value: "resource_gate" },
      { id: "ability_gate", weight: 5, value: "ability_gate" },
      { id: "quest_flag_gate", weight: 4, value: "quest_flag_gate" },
    ];
  }
  if (tier <= 5) {
    return [
      { id: "open", weight: 50, value: "open" },
      { id: "guardian_gate", weight: 15, value: "guardian_gate" },
      { id: "key_gate", weight: 8, value: "key_gate" },
      { id: "resource_gate", weight: 10, value: "resource_gate" },
      { id: "ability_gate", weight: 10, value: "ability_gate" },
      { id: "quest_flag_gate", weight: 7, value: "quest_flag_gate" },
    ];
  }
  return [
    { id: "open", weight: 35, value: "open" },
    { id: "guardian_gate", weight: 20, value: "guardian_gate" },
    { id: "key_gate", weight: 8, value: "key_gate" },
    { id: "resource_gate", weight: 12, value: "resource_gate" },
    { id: "ability_gate", weight: 12, value: "ability_gate" },
    { id: "quest_flag_gate", weight: 13, value: "quest_flag_gate" },
  ];
}

function breakageChance(tier: number): number {
  if (tier <= 1) {
    return 2;
  }
  if (tier <= 3) {
    return 4;
  }
  if (tier <= 5) {
    return 6;
  }
  return 8;
}

function eligibleGuardians(destination: PlanePair): { id: string; monsterId: string }[] {
  const dominant = destination.b;
  return CONTENT_REGISTRY.guardianEncounters
    .filter((row) => dominant >= row.bandMin && dominant <= row.bandMax)
    .map((row) => ({ id: row.id, monsterId: row.monsterId }));
}

function transitionId(source: PlanePair, destination: PlanePair, ordinal: number): string {
  return `transition.${planeKey(source)}.${planeKey(destination)}.${ordinal}`;
}

function makeTransition(
  version: string,
  seed: string,
  attempt: number,
  source: PlanePair,
  destination: PlanePair,
  ordinal: number,
  forceOpen: boolean,
): TopologyTransition | { error: string } {
  const id = transitionId(source, destination, ordinal);
  const archetypes = eligibleArchetypes(source, destination);
  if (archetypes.length === 0) {
    return { error: `no eligible archetype for ${id}` };
  }
  const archetypeId =
    archetypes.length === 1
      ? archetypes[0]!
      : weightedChoice(
          parts(version, seed, attempt, "topology.edge.archetype", id),
          archetypes.map((value) => ({ id: value, weight: 1, value })),
        );
  const mode = weightedChoice(parts(version, seed, attempt, "topology.edge.archetype", `${id}.coordinateMode`), COORDINATE_MODES);
  const destTier = planeTier(destination);
  let progressionClass: ProgressionClass = "open";
  if (!forceOpen) {
    const classes = gateClassWeights(destTier).filter((row) => classEligible(row.value, destination));
    progressionClass = weightedChoice(parts(version, seed, attempt, "topology.edge.conditionClass", id), classes);
  }
  let initiallyBroken = false;
  if (!forceOpen && progressionClass === "open") {
    initiallyBroken = chance(parts(version, seed, attempt, "topology.optionalBreakage", id), breakageChance(destTier));
    if (initiallyBroken) {
      progressionClass = "optional_broken";
    }
  }
  return {
    id,
    sourcePlane: source,
    destinationPlane: destination,
    archetypeId,
    transitionEffectProfileId: mode.profile,
    coordinateMode: mode.mode,
    conditionSetId: progressionClass === "open" || progressionClass === "optional_broken" ? null : `condition.${id}`,
    gateId: progressionClass === "open" || progressionClass === "optional_broken" ? null : `gate.${id}`,
    progressionClass,
    initiallyBroken,
    semanticTags: [familyForPlane(source), familyForPlane(destination)],
  };
}

function classEligible(progressionClass: ProgressionClass, destination: PlanePair): boolean {
  const tier = planeTier(destination);
  switch (progressionClass) {
    case "open":
    case "optional_broken":
      return true;
    case "guardian_gate":
      return eligibleGuardians(destination).length > 0;
    case "key_gate":
      return (KEYS_BY_TIER[tier] ?? []).length > 0;
    case "resource_gate":
      return (RESOURCES_BY_TIER[tier] ?? []).length > 0;
    case "ability_gate":
      return (ABILITIES_BY_TIER[tier] ?? []).length > 0;
    case "quest_flag_gate":
      return true;
  }
}

function pickOne<T extends string>(
  version: string,
  seed: string,
  attempt: number,
  purpose: string,
  subject: string,
  options: readonly T[],
): T {
  if (options.length === 1) {
    return options[0]!;
  }
  return weightedChoice(
    parts(version, seed, attempt, purpose, subject),
    options.map((value) => ({ id: value, weight: 1, value })),
  );
}

export function generateTopology(
  worldSeed: string,
  topologyAttempt = 0,
  generatorVersion: WorldTopology["generatorVersion"] = GLOBAL_CONSTANTS.generatorVersion,
): TopologyGenerationResult {
  if (topologyAttempt < 0 || topologyAttempt >= GLOBAL_CONSTANTS.maxTopologyAttempts) {
    return { ok: false, code: "TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED", message: `attempt ${topologyAttempt} outside 0..${GLOBAL_CONSTANTS.maxTopologyAttempts - 1}` };
  }

  const planeNodes: PlaneNode[] = enumeratePlanes().map((plane) => ({
    plane,
    dominantDimension: plane.b,
    family: familyForPlane(plane),
    progressionTier: planeTier(plane),
  }));

  const transitions: TopologyTransition[] = [];
  const edgeKeys = new Set<string>();

  function addEdge(source: PlanePair, destination: PlanePair, forceOpen: boolean): TopologyTransition | { error: string } {
    const key = `${planeKey(source)}->${planeKey(destination)}`;
    if (edgeKeys.has(key)) {
      return transitions.find((row) => row.id === transitionId(source, destination, 0))!;
    }
    const created = makeTransition(generatorVersion, worldSeed, topologyAttempt, source, destination, 0, forceOpen);
    if ("error" in created) {
      return created;
    }
    edgeKeys.add(key);
    transitions.push(created);
    return created;
  }

  for (const node of planeNodes) {
    const ranked = rankedNeighbours(generatorVersion, worldSeed, topologyAttempt, node.plane);
    const target = outboundTarget(generatorVersion, worldSeed, topologyAttempt, node.plane);
    for (const destination of ranked.slice(0, target)) {
      const created = addEdge(node.plane, destination, false);
      if ("error" in created) {
        return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: created.error };
      }
    }
  }

  const startRanked = rankedNeighbours(generatorVersion, worldSeed, topologyAttempt, STARTING_PLANE);
  let startUsable = transitions.filter((row) => planesEqual(row.sourcePlane, STARTING_PLANE) && !row.initiallyBroken);
  for (const destination of startRanked) {
    if (startUsable.length >= 3) {
      break;
    }
    if (startUsable.some((row) => planesEqual(row.destinationPlane, destination))) {
      continue;
    }
    const created = addEdge(STARTING_PLANE, destination, true);
    if ("error" in created) {
      return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: created.error };
    }
    startUsable = transitions.filter((row) => planesEqual(row.sourcePlane, STARTING_PLANE) && !row.initiallyBroken);
  }

  startUsable = transitions.filter((row) => planesEqual(row.sourcePlane, STARTING_PLANE) && !row.initiallyBroken);
  for (const row of startUsable.slice(0, 3)) {
    const index = transitions.findIndex((candidate) => candidate.id === row.id);
    transitions[index] = {
      ...row,
      progressionClass: "open",
      initiallyBroken: false,
      conditionSetId: null,
      gateId: null,
    };
  }

  const olympusNeighbours = potentialNeighbours(OLYMPUS_PLANE);
  const inboundSources = new Set(
    transitions.filter((row) => planesEqual(row.destinationPlane, OLYMPUS_PLANE)).map((row) => planeKey(row.sourcePlane)),
  );
  const inboundRanked = weightedRankPlanes(
    parts(generatorVersion, worldSeed, topologyAttempt, "topology.edge.rank", "olympus.inbound"),
    olympusNeighbours.map((source) => ({
      id: planeKey(source),
      weight: neighbourWeight(source, OLYMPUS_PLANE),
      value: source,
    })),
  );
  for (const source of inboundRanked) {
    if (inboundSources.size >= 2) {
      break;
    }
    if (inboundSources.has(planeKey(source))) {
      continue;
    }
    const created = addEdge(source, OLYMPUS_PLANE, false);
    if ("error" in created) {
      return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: created.error };
    }
    inboundSources.add(planeKey(source));
  }

  const gates: TopologyGate[] = [];
  const progressionSources: ProgressionSource[] = [];
  const guardianInstances: GuardianInstance[] = [];
  const questInstances: QuestInstance[] = [];
  const npcInstances: NpcInstance[] = [];
  const shopInstances: ShopInstance[] = [];
  const usedNpcs = new Set<string>();

  function placeNpc(npcId: string, plane: PlanePair): string {
    const existing = npcInstances.find((row) => row.npcId === npcId);
    if (existing) {
      return existing.id;
    }
    const id = `npc.${npcId}.${planeKey(plane)}.0`;
    npcInstances.push({ id, npcId, plane });
    usedNpcs.add(npcId);
    return id;
  }

  for (const transition of transitions) {
    if (!transition.gateId || transition.initiallyBroken) {
      continue;
    }
    const destTier = planeTier(transition.destinationPlane);
    const sourceTier = planeTier(transition.sourcePlane);
    if (transition.progressionClass === "guardian_gate") {
      const options = eligibleGuardians(transition.destinationPlane);
      const chosen = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.guardian.assignment", transition.id, options.map((row) => row.id));
      const encounter = options.find((row) => row.id === chosen)!;
      const guardianId = `guardian.${transition.id}`;
      guardianInstances.push({
        id: guardianId,
        encounterId: chosen,
        monsterId: encounter.monsterId,
        plane: transition.sourcePlane,
        gatedTransitionId: transition.id,
      });
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "guardian_gate",
        requiredFlag: `gate.${transition.id}.guardianDefeated`,
        guardianInstanceId: guardianId,
      });
      progressionSources.push({
        id: `source.guardian_reward.${guardianId}`,
        plane: transition.sourcePlane,
        sourceType: "guardian_reward",
        grants: [`flag:gate.${transition.id}.guardianDefeated`],
        requirements: [],
        consumption: false,
        contentReference: chosen,
        quantity: 1,
      });
    } else if (transition.progressionClass === "key_gate") {
      const keyId = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.key`, KEYS_BY_TIER[destTier] ?? ["house_key"]);
      const sourcePlanes = planeNodes.filter((node) => planeTier(node.plane) <= sourceTier + 1).map((node) => node.plane);
      const sourcePlane = weightedChoice(
        parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.keyPlane`),
        sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
      );
      const sourceId = `source.fixed_item.${transition.id}.${keyId}`;
      progressionSources.push({
        id: sourceId,
        plane: sourcePlane,
        sourceType: "fixed_item",
        grants: [`item:${keyId}`],
        requirements: [],
        consumption: false,
        contentReference: keyId,
        quantity: 1,
      });
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "key_gate",
        requiredItemId: keyId,
      });
    } else if (transition.progressionClass === "resource_gate") {
      const resourceId = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.resource`, RESOURCES_BY_TIER[destTier] ?? ["ore"]);
      const quantity = weightedChoice(parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.qty`), [
        { id: "1", weight: 70, value: 1 },
        { id: "2", weight: 25, value: 2 },
        { id: "3", weight: 5, value: 3 },
      ]);
      const sourcePlanes = planeNodes.filter((node) => planeTier(node.plane) <= sourceTier + 1).map((node) => node.plane);
      for (let n = 0; n < quantity + 1; n += 1) {
        const sourcePlane = weightedChoice(
          parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.resPlane`),
          sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
          n,
        );
        progressionSources.push({
          id: `source.container.${transition.id}.${resourceId}.${n}`,
          plane: sourcePlane,
          sourceType: "container",
          grants: [`resource:${resourceId}`],
          requirements: [],
          consumption: false,
          contentReference: resourceId,
          quantity: 1,
        });
      }
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "resource_gate",
        requiredResourceId: resourceId,
        requiredQuantity: quantity,
      });
    } else if (transition.progressionClass === "ability_gate") {
      const abilityId = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.ability`, ABILITIES_BY_TIER[destTier] ?? ["arcane_gate"]);
      const sourcePlanes = planeNodes.filter((node) => planeTier(node.plane) <= sourceTier + 1).map((node) => node.plane);
      const sourcePlane = weightedChoice(
        parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.abilityPlane`),
        sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
      );
      const abilityQuest: Record<string, string> = {
        arcane_gate: "q_arcane_gate",
        dream_step: "q_spirit_path",
        void_slip: "q_abyss_gate",
        divine_passage: "q_olympus",
      };
      const quest = CONTENT_REGISTRY.byId.quest.get(abilityQuest[abilityId] ?? "q_arcane_gate")!;
      const npcId = quest.giver;
      const npcInstanceId = npcId ? placeNpc(npcId, sourcePlane) : null;
      const questInstanceId = `quest.${quest.id}.${planeKey(sourcePlane)}.0`;
      if (!questInstances.some((row) => row.id === questInstanceId)) {
        questInstances.push({
          id: questInstanceId,
          questId: quest.id,
          plane: sourcePlane,
          npcId: npcInstanceId,
          flagId: `gate.${transition.id}.questComplete`,
        });
      }
      progressionSources.push({
        id: `source.npc_teaching.${transition.id}.${abilityId}`,
        plane: sourcePlane,
        sourceType: "npc_teaching",
        grants: [`ability:${abilityId}`],
        requirements: [],
        consumption: false,
        contentReference: abilityId,
        quantity: 1,
      });
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "ability_gate",
        requiredAbilityId: abilityId,
      });
    } else if (transition.progressionClass === "quest_flag_gate") {
      const quest = pickOne(
        generatorVersion,
        worldSeed,
        topologyAttempt,
        "topology.quest.assignment",
        transition.id,
        CONTENT_REGISTRY.quests.filter((row) => row.major).map((row) => row.id),
      );
      const questDef = CONTENT_REGISTRY.byId.quest.get(quest)!;
      const sourcePlanes = planeNodes.filter((node) => planeTier(node.plane) <= sourceTier + 1).map((node) => node.plane);
      const sourcePlane = weightedChoice(
        parts(generatorVersion, worldSeed, topologyAttempt, "topology.quest.assignment", `${transition.id}.plane`),
        sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
      );
      const npcInstanceId = questDef.giver ? placeNpc(questDef.giver, sourcePlane) : null;
      const flagId = `gate.${transition.id}.questComplete`;
      const questInstanceId = `quest.${quest}.${planeKey(sourcePlane)}.${transition.id}`;
      questInstances.push({
        id: questInstanceId,
        questId: quest,
        plane: sourcePlane,
        npcId: npcInstanceId,
        flagId,
      });
      progressionSources.push({
        id: `source.quest_reward.${questInstanceId}`,
        plane: sourcePlane,
        sourceType: "quest_reward",
        grants: [`flag:${flagId}`],
        requirements: [],
        consumption: false,
        contentReference: quest,
        quantity: 1,
      });
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "quest_flag_gate",
        requiredFlag: flagId,
        questInstanceId,
      });
    }
  }

  const startShopPlane = STARTING_PLANE;
  shopInstances.push({
    id: `shop.${planeKey(startShopPlane)}.0`,
    shopTypeId: "general_store",
    plane: startShopPlane,
    npcInstanceId: placeNpc("shopkeeper", startShopPlane),
  });

  const olympusBossInstance: OlympusBossInstance = {
    encounterId: "boss_olympus",
    monsterId: "olympian_final",
    plane: OLYMPUS_PLANE,
    arenaId: "olympus_arena",
  };

  const topologyWithoutHash = {
    generatorVersion,
    worldSeed,
    topologyAttempt,
    planeNodes,
    transitions: [...transitions].sort((left, right) => left.id.localeCompare(right.id)),
    gates: [...gates].sort((left, right) => left.id.localeCompare(right.id)),
    progressionSources: [...progressionSources].sort((left, right) => left.id.localeCompare(right.id)),
    guardianInstances: [...guardianInstances].sort((left, right) => left.id.localeCompare(right.id)),
    questInstances: [...questInstances].sort((left, right) => left.id.localeCompare(right.id)),
    npcInstances: [...npcInstances].sort((left, right) => left.id.localeCompare(right.id)),
    shopInstances: [...shopInstances].sort((left, right) => left.id.localeCompare(right.id)),
    olympusBossInstance,
  };

  const topology: WorldTopology = {
    ...topologyWithoutHash,
    topologyHash: hashTopology(topologyWithoutHash),
  };

  const issues = validateTopology(topology);
  if (issues.length > 0) {
    return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: issues.join("; ") };
  }
  return { ok: true, topology };
}

export function validateTopology(topology: WorldTopology): string[] {
  const issues: string[] = [];
  if (topology.planeNodes.length !== 120) {
    issues.push(`expected 120 planes, found ${topology.planeNodes.length}`);
  }
  const planeKeys = new Set<string>();
  for (const node of topology.planeNodes) {
    const key = planeKey(node.plane);
    if (planeKeys.has(key)) {
      issues.push(`duplicate plane ${key}`);
    }
    planeKeys.add(key);
  }
  const ids = new Set<string>();
  const remember = (id: string, label: string): void => {
    if (ids.has(id)) {
      issues.push(`duplicate stable id ${id} (${label})`);
    }
    ids.add(id);
  };
  for (const row of topology.transitions) {
    remember(row.id, "transition");
    if (!sharesExactlyOneDimension(row.sourcePlane, row.destinationPlane)) {
      issues.push(`${row.id} does not change exactly one dimension`);
    }
    if (!CONTENT_REGISTRY.byId.transition.has(row.archetypeId)) {
      issues.push(`${row.id} unknown archetype ${row.archetypeId}`);
    }
  }
  for (const row of [...topology.gates, ...topology.progressionSources, ...topology.guardianInstances, ...topology.questInstances, ...topology.npcInstances, ...topology.shopInstances]) {
    remember(row.id, "generated");
  }
  const startUsable = topology.transitions.filter((row) => planesEqual(row.sourcePlane, STARTING_PLANE) && !row.initiallyBroken && row.progressionClass === "open");
  if (startUsable.length < 3) {
    issues.push(`start plane has ${startUsable.length} protected open outbound edges`);
  }
  const olympusInbound = new Set(
    topology.transitions.filter((row) => planesEqual(row.destinationPlane, OLYMPUS_PLANE)).map((row) => planeKey(row.sourcePlane)),
  );
  if (olympusInbound.size < 2) {
    issues.push(`Olympus has ${olympusInbound.size} inbound source planes`);
  }
  for (const gate of topology.gates) {
    if (gate.progressionClass === "guardian_gate" && !gate.guardianInstanceId) {
      issues.push(`${gate.id} missing guardian`);
    }
    if (gate.progressionClass === "quest_flag_gate" && !gate.questInstanceId) {
      issues.push(`${gate.id} missing quest chain`);
    }
    if (gate.requiredQuantity !== undefined && gate.requiredQuantity <= 0) {
      issues.push(`${gate.id} non-positive resource quantity`);
    }
    if (gate.requiredItemId && !CONTENT_REGISTRY.byId.item.has(gate.requiredItemId)) {
      issues.push(`${gate.id} unknown key ${gate.requiredItemId}`);
    }
    if (gate.requiredAbilityId && !CONTENT_REGISTRY.byId.ability.has(gate.requiredAbilityId)) {
      issues.push(`${gate.id} unknown ability ${gate.requiredAbilityId}`);
    }
    if (gate.requiredResourceId && !CONTENT_REGISTRY.byId.item.has(gate.requiredResourceId)) {
      issues.push(`${gate.id} unknown resource ${gate.requiredResourceId}`);
    }
  }
  const npcCounts = new Map<string, number>();
  for (const npc of topology.npcInstances) {
    if (CONTENT_REGISTRY.byId.storyNpc.has(npc.npcId)) {
      npcCounts.set(npc.npcId, (npcCounts.get(npc.npcId) ?? 0) + 1);
    }
  }
  for (const [npcId, count] of npcCounts) {
    if (count > 1) {
      issues.push(`story NPC ${npcId} instantiated ${count} times`);
    }
  }
  if (topology.olympusBossInstance.monsterId !== "olympian_final") {
    issues.push("missing Olympus boss definition");
  }
  return issues;
}

export function hashTopology(topology: Omit<WorldTopology, "topologyHash">): string {
  const serialized = JSON.stringify(topology);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}
