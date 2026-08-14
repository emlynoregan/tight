import type { PrimitiveProfile, StaticFeature, StructureTemplate, TileType } from "../model/content-types";

/**
 * Terrain tiles that named a hazard ID not present in environment-v1 are stored
 * against the owning environment hazard ID. See ticket 01 notes.
 */
const TERRAIN_HAZARD_ALIASES: Record<string, string> = {
  poison_mire: "poison_ground",
  arcane_flux: "arcane_field",
  void_erosion: "void_corruption",
};

function tile(
  id: string,
  walkable: boolean,
  blocksLos: boolean,
  blocksLoe: boolean,
  allowsItems: boolean,
  allowsActors: boolean,
  hazardId: string | null,
  tags: readonly string[],
): TileType {
  const canonicalHazard = hazardId === null ? null : (TERRAIN_HAZARD_ALIASES[hazardId] ?? hazardId);
  return { id, walkable, blocksLos, blocksLoe, allowsItems, allowsActors, hazardId: canonicalHazard, tags };
}

export const TILE_TYPES: readonly TileType[] = [
  tile("grass", true, false, false, true, true, null, ["ground", "organic", "aboveground"]),
  tile("dirt", true, false, false, true, true, null, ["ground", "organic"]),
  tile("sand", true, false, false, true, true, null, ["ground", "loose"]),
  tile("mud", true, false, false, true, true, null, ["ground", "wet"]),
  tile("shallow_water", true, false, false, false, true, null, ["water", "wet"]),
  tile("deep_water", false, false, false, false, false, null, ["water", "deep"]),
  tile("wood_floor", true, false, false, true, true, null, ["floor", "artificial", "flammable"]),
  tile("stone_floor", true, false, false, true, true, null, ["floor", "stone"]),
  tile("cracked_stone", true, false, false, true, true, null, ["floor", "stone", "ruined"]),
  tile("tile_floor", true, false, false, true, true, null, ["floor", "artificial"]),
  tile("metal_floor", true, false, false, true, true, null, ["floor", "artificial", "metal"]),
  tile("carpet", true, false, false, true, true, null, ["floor", "artificial", "soft"]),
  tile("cave_floor", true, false, false, true, true, null, ["floor", "stone", "dungeon"]),
  tile("fungal_floor", true, false, false, true, true, null, ["floor", "organic", "dungeon"]),
  tile("ice", true, false, false, true, true, null, ["floor", "cold"]),
  tile("snow", true, false, false, true, true, null, ["ground", "cold"]),
  tile("lava", true, false, false, false, true, "lava", ["hazard", "hot"]),
  tile("poison_mire", true, false, false, false, true, "poison_mire", ["hazard", "wet", "poison"]),
  tile("arcane_floor", true, false, false, true, true, null, ["floor", "arcane"]),
  tile("unstable_arcane", true, false, false, false, true, "arcane_flux", ["floor", "arcane", "hazard"]),
  tile("spectral_floor", true, false, false, true, true, null, ["floor", "ethereal"]),
  tile("mist_floor", true, false, false, true, true, null, ["floor", "ethereal", "mist"]),
  tile("vacuum", true, false, false, false, true, "vacuum", ["space", "vacuum"]),
  tile("asteroid_surface", true, false, false, true, true, null, ["space", "stone"]),
  tile("station_floor", true, false, false, true, true, null, ["space", "artificial", "metal"]),
  tile("void_floor", true, false, false, true, true, null, ["void"]),
  tile("void_erosion", true, false, false, false, true, "void_erosion", ["void", "hazard"]),
  tile("divine_floor", true, false, false, true, true, null, ["olympus", "divine"]),
  tile("cloud_floor", true, false, false, true, true, null, ["olympus", "divine"]),
  tile("pit", false, false, false, false, false, null, ["hole", "blocked"]),
  tile("solid_rock", false, true, true, false, false, null, ["solid", "stone"]),
  tile("nothing", false, false, false, false, false, null, ["outside", "invalid"]),
];

function feature(
  id: string,
  blocksMovement: boolean | "state",
  blocksLos: boolean | "state",
  interact: boolean,
  destructible: boolean,
  tags: readonly string[],
): StaticFeature {
  return { id, blocksMovement, blocksLos, interact, destructible, tags };
}

export const STATIC_FEATURES: readonly StaticFeature[] = [
  feature("tree", true, true, false, false, ["organic", "vegetation"]),
  feature("bush", true, false, false, false, ["organic", "vegetation"]),
  feature("boulder", true, true, false, false, ["stone"]),
  feature("small_rock", true, false, false, false, ["stone"]),
  feature("wall_wood", true, true, false, false, ["wall", "wood"]),
  feature("wall_stone", true, true, false, false, ["wall", "stone"]),
  feature("wall_metal", true, true, false, false, ["wall", "metal"]),
  feature("wall_arcane", true, true, false, false, ["wall", "arcane"]),
  feature("wall_spectral", true, true, false, false, ["wall", "ethereal"]),
  feature("wall_divine", true, true, false, false, ["wall", "divine"]),
  feature("fence", true, false, false, false, ["barrier"]),
  feature("counter", true, false, false, false, ["furniture", "counter"]),
  feature("table", true, false, false, false, ["furniture"]),
  feature("chair", true, false, false, false, ["furniture"]),
  feature("shelf", true, true, false, false, ["furniture", "storage"]),
  feature("bed", true, false, false, false, ["furniture"]),
  feature("pew", true, false, false, false, ["furniture"]),
  feature("altar", true, false, true, false, ["altar", "ritual"]),
  feature("statue", true, true, true, false, ["monument"]),
  feature("gravestone", true, false, true, false, ["grave"]),
  feature("machine", true, true, true, false, ["machine"]),
  feature("console", true, false, true, false, ["machine", "console"]),
  feature("crystal", true, false, true, true, ["crystal", "resource"]),
  feature("crate", true, false, true, true, ["container", "destructible"]),
  feature("barrel", true, false, true, true, ["container", "destructible"]),
  feature("rubble", true, false, false, false, ["ruined"]),
  feature("pillar", true, true, false, false, ["architecture"]),
  feature("safe_anchor", true, false, true, false, ["anchor", "required-space"]),
  feature("container_chest", true, false, true, false, ["container"]),
  feature("container_cache", true, false, true, false, ["container"]),
  feature("door", "state", "state", true, false, ["door"]),
  feature("transition_fixture", "state", false, true, false, ["transition"]),
];

export const PRIMITIVE_PROFILES: readonly PrimitiveProfile[] = [
  { id: "blob_small_tight", kind: "blob" },
  { id: "blob_medium", kind: "blob" },
  { id: "blob_large", kind: "blob" },
  { id: "blob_sparse", kind: "blob" },
  { id: "line_wall", kind: "line" },
  { id: "line_barrier_rough", kind: "line" },
  { id: "line_canal", kind: "line" },
  { id: "path_road", kind: "path" },
  { id: "path_trail", kind: "path" },
  { id: "path_river", kind: "path" },
  { id: "path_tunnel", kind: "path" },
  { id: "rect_room_small", kind: "rectangle" },
  { id: "rect_room_large", kind: "rectangle" },
  { id: "rect_courtyard", kind: "rectangle" },
  { id: "rect_building", kind: "rectangle" },
  { id: "strip_counter", kind: "strip" },
  { id: "strip_table", kind: "strip" },
  { id: "strip_shelf", kind: "strip" },
  { id: "strip_pew", kind: "strip" },
  { id: "cluster_small", kind: "cluster" },
  { id: "cluster_medium", kind: "cluster" },
  { id: "scatter_sparse", kind: "scatter" },
  { id: "scatter_dense", kind: "scatter" },
];

export const FEATURE_RECIPES = [
  "forest_patch", "pond", "road", "fence_run", "small_house", "village_cluster",
  "room_cluster", "furnished_room", "shop_room", "library_room", "temple_room",
  "dungeon_rooms", "cave_network", "treasure_pocket", "trap_corridor", "ruin_hall",
  "rune_ring", "crystal_field", "wrap_islands", "arcane_lattice",
  "mist_region", "spectral_echo", "grave_cluster", "open_edge_zone",
  "asteroid_cluster", "station_module", "debris_field", "open_manoeuvre_zone",
  "void_island", "erosion_patch", "shadow_pillars", "void_landmark",
  "divine_plaza", "columnade", "shrine", "boss_arena", "monument",
] as const;

export const STRUCTURE_TEMPLATES: readonly StructureTemplate[] = [
  { id: "house_small", minWidth: 4, minHeight: 4, requiredCells: ["entrance", "interior"] },
  { id: "shop_small", minWidth: 5, minHeight: 5, requiredCells: ["entrance", "counter", "shopkeeper", "customer"] },
  { id: "shrine_small", minWidth: 3, minHeight: 3, requiredCells: ["altar", "interaction"] },
  { id: "safe_anchor_site", minWidth: 3, minHeight: 3, requiredCells: ["anchor", "approach"] },
  { id: "portal_chamber", minWidth: 4, minHeight: 4, requiredCells: ["transition", "approach"] },
  { id: "treasure_room", minWidth: 4, minHeight: 4, requiredCells: ["container", "approach"] },
  { id: "boss_arena_small", minWidth: 8, minHeight: 8, requiredCells: ["playerEntry", "bossSpawn", "manoeuvre"] },
  { id: "station_module", minWidth: 5, minHeight: 5, requiredCells: ["airlock", "interior"] },
  { id: "olympus_arena", minWidth: 10, minHeight: 10, requiredCells: ["playerEntry", "bossSpawn", "centre"] },
];

export const MAP_VALIDATORS = [
  "required_points_in_bounds",
  "required_points_occupiable",
  "required_points_connected",
  "minimum_walkable_fraction",
  "no_spawn_overlap",
  "entry_not_adjacent_to_ordinary_hostile",
  "transition_sources_reachable",
  "required_transition_destinations_valid",
  "shop_has_two_sides",
  "anchor_has_approach",
  "boss_arena_has_space",
  "space_has_manoeuvre_region",
  "no_isolated_required_actor",
  "final_legality",
] as const;

export const MAP_REPAIRS = [
  "remove_decoration_blocker",
  "remove_optional_scatter_blocker",
  "remove_optional_cluster_member",
  "remove_optional_furniture",
  "carve_shortest_connector",
  "relocate_optional_spawn",
  "relocate_required_spawn_nearest_legal",
  "remove_optional_structure_cell",
  "expand_walkable_region",
  "remove_space_obstacle",
] as const;
