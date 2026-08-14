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
export { generatePlaneBase, hashPlaneBase, familyWraps } from "./generation/generate-plane";
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
export { potentialNeighbours, sharesExactlyOneDimension } from "./generation/topology-neighbours";
export { planeEligibleForArchetype } from "./data/eligibility";
export type { WorldTopology, TopologyGenerationResult } from "./generation/topology-types";
export type { PlaneBase, PrimitiveContext, PrimitiveResult } from "./generation/plane-types";
export type { SolverResult, SolverFailure, SolverSearchOptions, WitnessStep } from "./generation/solver-types";
