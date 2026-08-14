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
import { chance, percentile, semantic, weightedChoice, type SemanticPart } from "./semantic-random";
import { neighbourWeight, potentialNeighbours, planeTier, sharesExactlyOneDimension } from "./topology-neighbours";
import { hashTopology, sortByStableId } from "./canonical";
import {
  assignAbilitySource,
  createGateGuardian,
  createPlacementContext,
  ensureQuest,
  placeCatalogueShops,
} from "./topology-progress";
import { TRANSITION_EFFECT_PROFILES } from "../data/transitions";
import { planeEligibleForArchetype } from "../data/eligibility";
import type {
  OlympusBossInstance,
  PlaneNode,
  ProgressionClass,
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
    conditionSetId: null,
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
      return abilityOptions(tier).length > 0;
    case "quest_flag_gate":
      return CONTENT_REGISTRY.quests.some((quest) => quest.usableAsProgressionGate);
  }
}

function abilityOptions(tier: number): string[] {
  return (ABILITIES_BY_TIER[tier] ?? []).filter((abilityId) =>
    CONTENT_REGISTRY.abilityAcquisitions.some((row) => row.abilityId === abilityId),
  );
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
  const placement = createPlacementContext(
    generatorVersion,
    worldSeed,
    topologyAttempt,
    planeNodes.map((node) => node.plane),
  );

  for (const transition of transitions) {
    if (!transition.gateId || transition.initiallyBroken) {
      continue;
    }
    const destTier = planeTier(transition.destinationPlane);
    const sourceTier = planeTier(transition.sourcePlane);
    const sourcePlanes = planeNodes.filter((node) => planeTier(node.plane) <= sourceTier + 1).map((node) => node.plane);
    if (transition.progressionClass === "guardian_gate") {
      const options = eligibleGuardians(transition.destinationPlane);
      const chosen = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.guardian.assignment", transition.id, options.map((row) => row.id));
      const encounter = options.find((row) => row.id === chosen)!;
      const guardian = createGateGuardian(placement, transition, chosen, encounter.monsterId);
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "guardian_gate",
        requiredFlag: `gate.${transition.id}.guardianDefeated`,
        guardianInstanceId: guardian.id,
      });
    } else if (transition.progressionClass === "key_gate") {
      const keyId = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.key`, KEYS_BY_TIER[destTier] ?? ["house_key"]);
      const existingKey = placement.progressionSources.find((source) => source.grants.includes(`item:${keyId}`));
      if (!existingKey) {
        const sourcePlane = weightedChoice(
          parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.keyPlane`),
          sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
        );
        placement.progressionSources.push({
          id: `source.fixed_item.${keyId}`,
          plane: sourcePlane,
          sourceType: "fixed_item",
          grants: [`item:${keyId}`],
          requirements: [],
          consumption: false,
          contentReference: keyId,
          quantity: 1,
        });
      }
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
      for (let n = 0; n < quantity + 1; n += 1) {
        const sourcePlane = weightedChoice(
          parts(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.resPlane`),
          sourcePlanes.map((plane) => ({ id: planeKey(plane), weight: 1, value: plane })),
          n,
        );
        placement.progressionSources.push({
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
      const abilityId = pickOne(generatorVersion, worldSeed, topologyAttempt, "topology.progressionSource.assignment", `${transition.id}.ability`, abilityOptions(destTier));
      const assigned = assignAbilitySource(placement, transition, abilityId, sourcePlanes);
      if (assigned.error) {
        return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: assigned.error };
      }
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "ability_gate",
        requiredAbilityId: abilityId,
      });
    } else if (transition.progressionClass === "quest_flag_gate") {
      const questId = pickOne(
        generatorVersion,
        worldSeed,
        topologyAttempt,
        "topology.quest.assignment",
        transition.id,
        CONTENT_REGISTRY.quests.filter((row) => row.usableAsProgressionGate).map((row) => row.id),
      );
      const flagId = `gate.${transition.id}.questComplete`;
      const quest = ensureQuest(placement, questId, flagId, sourcePlanes);
      if ("error" in quest) {
        return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: quest.error };
      }
      gates.push({
        id: transition.gateId,
        transitionId: transition.id,
        progressionClass: "quest_flag_gate",
        requiredFlag: flagId,
        questInstanceId: quest.id,
      });
    }
  }

  const shops = placeCatalogueShops(placement);
  if (shops.error) {
    return { ok: false, code: "STRUCTURAL_VALIDATION_FAILED", message: shops.error };
  }

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
    transitions: sortByStableId(transitions),
    gates: sortByStableId(gates),
    progressionSources: sortByStableId(placement.progressionSources),
    guardianInstances: sortByStableId(placement.guardianInstances),
    questInstances: sortByStableId(placement.questInstances),
    npcInstances: sortByStableId(placement.npcInstances),
    shopInstances: sortByStableId(placement.shopInstances),
    olympusBossInstance,
    ordinaryEncounterDropsAreSolverVisible: false,
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
  const effectProfiles = new Set<string>(TRANSITION_EFFECT_PROFILES);
  const transitionById = new Map(topology.transitions.map((row) => [row.id, row]));
  const npcById = new Map(topology.npcInstances.map((row) => [row.id, row]));
  const questById = new Map(topology.questInstances.map((row) => [row.id, row]));
  const guardianById = new Map(topology.guardianInstances.map((row) => [row.id, row]));
  for (const row of topology.transitions) {
    remember(row.id, "transition");
    if (!sharesExactlyOneDimension(row.sourcePlane, row.destinationPlane)) {
      issues.push(`${row.id} does not change exactly one dimension`);
    }
    if (!CONTENT_REGISTRY.byId.transition.has(row.archetypeId)) {
      issues.push(`${row.id} unknown archetype ${row.archetypeId}`);
    }
    if (!effectProfiles.has(row.transitionEffectProfileId)) {
      issues.push(`${row.id} unknown effect profile ${row.transitionEffectProfileId}`);
    }
    if (row.conditionSetId) {
      issues.push(`${row.id} dangling conditionSetId ${row.conditionSetId}`);
    }
    if (row.gateId && !topology.gates.some((gate) => gate.id === row.gateId)) {
      issues.push(`${row.id} missing gate ${row.gateId}`);
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

  const grantIndex = new Map<string, number>();
  for (const source of topology.progressionSources) {
    if (!Number.isFinite(source.quantity) || source.quantity <= 0) {
      issues.push(`${source.id} non-positive quantity`);
    }
    for (const grant of source.grants) {
      const parsed = parseToken(grant);
      if (!parsed) {
        issues.push(`${source.id} malformed grant ${grant}`);
        continue;
      }
      grantIndex.set(grant, (grantIndex.get(grant) ?? 0) + source.quantity);
      const refIssue = tokenReferenceIssue(parsed);
      if (refIssue) {
        issues.push(`${source.id} ${refIssue}`);
      }
    }
    for (const requirement of source.requirements) {
      const parsed = parseToken(requirement);
      if (!parsed) {
        issues.push(`${source.id} malformed requirement ${requirement}`);
        continue;
      }
      const refIssue = tokenReferenceIssue(parsed);
      if (refIssue && parsed.kind !== "flag" && parsed.kind !== "currency") {
        issues.push(`${source.id} ${refIssue}`);
      }
    }
  }

  for (const gate of topology.gates) {
    if (!transitionById.has(gate.transitionId)) {
      issues.push(`${gate.id} references missing transition ${gate.transitionId}`);
    }
    if (gate.progressionClass === "guardian_gate") {
      if (!gate.guardianInstanceId || !guardianById.has(gate.guardianInstanceId)) {
        issues.push(`${gate.id} missing guardian`);
      }
      if (gate.requiredFlag && (grantIndex.get(`flag:${gate.requiredFlag}`) ?? 0) < 1) {
        issues.push(`${gate.id} missing guardian reward source`);
      }
    }
    if (gate.progressionClass === "quest_flag_gate") {
      if (!gate.questInstanceId || !questById.has(gate.questInstanceId)) {
        issues.push(`${gate.id} missing quest chain`);
      }
      if (gate.requiredFlag && (grantIndex.get(`flag:${gate.requiredFlag}`) ?? 0) < 1) {
        issues.push(`${gate.id} missing quest reward source`);
      }
    }
    if (gate.progressionClass === "key_gate" && gate.requiredItemId && (grantIndex.get(`item:${gate.requiredItemId}`) ?? 0) < 1) {
      issues.push(`${gate.id} missing key source`);
    }
    if (gate.progressionClass === "ability_gate" && gate.requiredAbilityId && (grantIndex.get(`ability:${gate.requiredAbilityId}`) ?? 0) < 1) {
      issues.push(`${gate.id} missing ability source`);
    }
    if (gate.progressionClass === "resource_gate") {
      const available = grantIndex.get(`resource:${gate.requiredResourceId}`) ?? 0;
      if (!gate.requiredResourceId || available < (gate.requiredQuantity ?? 0)) {
        issues.push(`${gate.id} insufficient resource sources`);
      }
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
      const story = CONTENT_REGISTRY.byId.storyNpc.get(npc.npcId)!;
      const archetype = CONTENT_REGISTRY.byId.npcArchetype.get(story.archetypeId);
      if (archetype && !planeEligibleForArchetype(npc.plane, archetype)) {
        issues.push(`story NPC ${npc.npcId} placed outside eligible dimensions`);
      }
    }
  }
  for (const [npcId, count] of npcCounts) {
    if (count > 1) {
      issues.push(`story NPC ${npcId} instantiated ${count} times`);
    }
  }

  for (const quest of topology.questInstances) {
    if (quest.npcId) {
      const npc = npcById.get(quest.npcId);
      if (!npc) {
        issues.push(`${quest.id} missing NPC ${quest.npcId}`);
      } else if (!planesEqual(npc.plane, quest.plane)) {
        issues.push(`${quest.id} NPC/quest plane mismatch`);
      }
    }
  }

  for (const source of topology.progressionSources) {
    if (source.sourceType === "npc_teaching" || source.sourceType === "quest_reward") {
      const quest = topology.questInstances.find((row) => planesEqual(row.plane, source.plane) && (source.contentReference === row.questId || source.id.includes(row.id)));
      if (quest?.npcId) {
        const npc = npcById.get(quest.npcId);
        if (npc && !planesEqual(npc.plane, source.plane)) {
          issues.push(`${source.id} source/NPC plane mismatch`);
        }
      }
    }
  }

  if (topology.olympusBossInstance.monsterId !== "olympian_final") {
    issues.push("missing Olympus boss definition");
  }
  if (!topology.shopInstances.some((shop) => shop.catalogueShopId === "shop_start" && planesEqual(shop.plane, STARTING_PLANE))) {
    issues.push("missing catalogue-backed starting shop");
  }
  return issues;
}

function parseToken(token: string): { kind: string; value: string } | null {
  const split = token.indexOf(":");
  if (split <= 0 || split === token.length - 1) {
    return null;
  }
  return { kind: token.slice(0, split), value: token.slice(split + 1) };
}

function tokenReferenceIssue(parsed: { kind: string; value: string }): string | null {
  switch (parsed.kind) {
    case "item":
    case "resource":
      return CONTENT_REGISTRY.byId.item.has(parsed.value) ? null : `unknown ${parsed.kind} ${parsed.value}`;
    case "ability":
      return CONTENT_REGISTRY.byId.ability.has(parsed.value) ? null : `unknown ability ${parsed.value}`;
    case "currency":
      return /^\d+$/.test(parsed.value) && Number(parsed.value) > 0 ? null : `illegal currency amount ${parsed.value}`;
    case "flag":
      return parsed.value.length > 0 ? null : "empty flag";
    default:
      return `unknown token kind ${parsed.kind}`;
  }
}

export { hashTopology } from "./canonical";

