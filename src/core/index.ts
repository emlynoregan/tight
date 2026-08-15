export { CORE_IDENTITY } from "./identity";
export { GLOBAL_CONSTANTS } from "./model/constants";
export {
  canonicalizePlane,
  compareCoordinates,
  comparePlanes,
  DIMENSION_COUNT,
  enumeratePlanes,
  MAP_SIZE,
  OLYMPUS_PLANE,
  planeKey,
  STARTING_PLANE,
} from "./model/plane";
export type { DimensionNumber, MapCoordinate, PlanePair } from "./model/plane";
export type { ContentRegistry } from "./data/registry";
export { CONTENT_REGISTRY, createContentRegistry } from "./data/registry";
export { assertContentRegistryValid, validateContentRegistry } from "./data/validate";
export type { ValidationIssue } from "./data/validate";
export {
  boundedInt,
  boundedUnit,
  chance,
  compareStableIds,
  percentile,
  randomUint64,
  semantic,
  semanticHash,
  semanticHashHex,
  weightedChoice,
  weightedRank,
} from "./generation/semantic-random";
export type { SemanticPart, WeightedEntry } from "./generation/semantic-random";
export { bytesToHex, sha256 } from "./generation/sha256";
export { generateTopology, validateTopology, hashTopology } from "./generation/topology-generator";
export { generatePlaneBase, hashPlaneBase, familyWraps, finalizePlaneGeometry } from "./generation/generate-plane";
export { carveShortestConnector, chooseClosestBoundaryPair } from "./generation/plane-repair";
export {
  generateBlob,
  generateCluster,
  generateLine,
  generateRectangle,
  generateRing,
  generateScatter,
  generateStamp,
  generateStrip,
  generateWanderPath,
  rasterizeBresenham,
} from "./generation/geometry-primitives";
export { canonicalizeTopology } from "./generation/canonical";
export { resolveProgressionOutcomes, resolveRewardProfileDrop } from "./generation/resolve-progression";
export { proveWinnable } from "./generation/winnability-solver";
export { getAcceptedWorld, preflightWitnessPlanes, summarizeAcceptedWorld, createAcceptedWorldCache, witnessPlanes, proofRequiredFixtures, witnessPreflightTopology } from "./generation/accepted-world";
export { sweepAcceptedWorlds, deterministicSweepSeeds } from "./generation/seed-sweep";
export { potentialNeighbours, sharesExactlyOneDimension } from "./generation/topology-neighbours";
export { planeEligibleForArchetype } from "./data/eligibility";
export type { WorldTopology, TopologyGenerationResult } from "./generation/topology-types";
export type {
  AcceptedWorldResult,
  AcceptedWorldSuccess,
  AcceptedWorldSummary,
  WitnessPreflightResult,
} from "./generation/accepted-world";
export type { SeedSweepReport } from "./generation/seed-sweep";
export type {
  PlaneBase,
  PlaneGenerationResult,
  PrimitiveContext,
  PrimitiveResult,
} from "./generation/plane-types";
export type { SolverResult, SolverFailure, SolverSearchOptions, WitnessStep } from "./generation/solver-types";
export { createNewGame, hashSaveState, playerActor, createMonsterActor, maxHpForCon } from "./runtime/game-runtime";
export type { GameRuntime, CreateNewGameOptions } from "./runtime/game-runtime";
export { executeWitness } from "./runtime/execute-witness";
export type { WitnessExecutionResult } from "./runtime/execute-witness";
export { createRuntimeFromSave, createRuntimeFromSaveRecord } from "./runtime/load-game";
export type { LoadGameResult } from "./runtime/load-game";
export { materializeRuntimePlane } from "./runtime/materialize-plane";
export type { RuntimePlaneResult } from "./runtime/materialize-plane";
export { applyPlayerCommand } from "./rules/commands";
export type { PlayerCommand, CommandResult } from "./rules/commands";
export { advanceTick } from "./rules/tick";
export type { TickResult } from "./rules/tick";
export { getVisiblePlaneView, transitionFixtureState } from "./queries/plane-view";
export type { PlaneView, PlaneCellView, ActorView, GroundItemView, EffectView } from "./queries/plane-view";
export { getHudView, formatTickEvent } from "./queries/hud-view";
export type { HudView, GemView, StatusView, GemState } from "./queries/hud-view";
export { getAvailableActions } from "./queries/available-actions";
export type { AvailableActions } from "./queries/available-actions";
export { getInventoryView, getCharacterView } from "./queries/inventory-view";
export type { InventoryView, CharacterView, InventorySlotView } from "./queries/inventory-view";
export { getDialogueView, getShopView, getQuestLogView } from "./queries/authored-view";
export type { DialogueView, ShopView, QuestLogEntry } from "./queries/authored-view";
export { cellIsVisible, visibilityProfileFor } from "./queries/visibility";
export { tryAddItem, pickupGroundItem, dropInventoryItem, equipItem, unequipSlot, ordinarySlotCount, itemQuantity } from "./rules/inventory";
export { spendAdvancementPoint, playerAtSafeAnchor } from "./rules/advancement";
export { SAVE_FORMAT_VERSION, makeSaveRecord, validateSaveRecord, parseSaveJson, cloneSaveState } from "./save-record";
export type { SaveRecord, SaveValidationResult } from "./save-record";
export { selectMonsterAction, detectsPlayer, progressBossPhases } from "./rules/ai";
export { shortestPathFirstStep, shortestPathFirstAction, nearestReachable, movementCostTo } from "./rules/pathfinding";
export { defaultAiFields } from "./model/save-state";
export type { SaveState, IntentionalAction, Direction, ActorState, PursuitHandoff, GroundItemState } from "./model/save-state";
export {
  activateTransition,
  arrivalCellFor,
  destinationCoordinate,
  evaluatePursuitHandoffs,
  ensurePlaneLoaded,
  recordDiscovery,
  switchCurrentPlane,
} from "./rules/transitions";
export { initiativeOrder } from "./rules/initiative";
export { governingStat, hitChancePercent, rawDamage, resolveDamagePipeline, resolveFlatDamage } from "./rules/combat-math";
export { CHANNEL_MULTIPLIER, RESISTANCE_MULTIPLIER } from "./model/constants";
export { hasLineOfSight, hasLineOfEffect, supercoverLine } from "./rules/los";
export { applyStatus, forcedMove, expireStatusesAndCooldowns } from "./rules/apply-effects";
export { scaledMonster, effectiveAttributes, resistanceFor, flatArmour, channelStateForFamily, cooldownRemaining } from "./rules/actor-stats";
export type { ScalingRuleId } from "./model/ids";
