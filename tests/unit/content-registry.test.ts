import { describe, expect, it } from "vitest";
import {
  canonicalizePlane,
  CONTENT_REGISTRY,
  createContentRegistry,
  enumeratePlanes,
  planeKey,
  STARTING_PLANE,
  validateContentRegistry,
} from "../../src/core";
import type { ContentRegistry } from "../../src/core";
import { CORE_IDENTITY } from "../../src/core";

function withRegistry(patch: Partial<ContentRegistry>): ContentRegistry {
  return { ...CONTENT_REGISTRY, ...patch };
}

describe("canonical planes", () => {
  it("enumerates exactly 120 unordered pairs with a < b", () => {
    const planes = enumeratePlanes();
    expect(planes).toHaveLength(120);
    const keys = planes.map(planeKey);
    expect(new Set(keys).size).toBe(120);
    expect(planes.every((plane) => plane.a < plane.b)).toBe(true);
    expect(planes[0]).toEqual(STARTING_PLANE);
    expect(planes[planes.length - 1]).toEqual({ a: 14, b: 15 });
  });

  it("canonicalizes swapped pairs", () => {
    expect(canonicalizePlane(8, 3)).toEqual({ a: 3, b: 8 });
  });
});

describe("content registry", () => {
  it("validates the canonical v1 catalogues", () => {
    expect(validateContentRegistry()).toEqual([]);
    expect(CONTENT_REGISTRY.dimensions).toHaveLength(16);
    expect(CONTENT_REGISTRY.planes).toHaveLength(120);
    expect(CORE_IDENTITY.generatorVersion).toBe("tight-v1");
  });

  it("contains the concrete catalogue rows needed for a playable v1", () => {
    expect(CONTENT_REGISTRY.byId.attack.has("unarmed_strike")).toBe(true);
    expect(CONTENT_REGISTRY.byId.item.has("sword")).toBe(true);
    expect(CONTENT_REGISTRY.byId.monster.has("olympian_final")).toBe(true);
    expect(CONTENT_REGISTRY.byId.ability.has("arcane_gate")).toBe(true);
    expect(CONTENT_REGISTRY.byId.quest.has("q_first_crack")).toBe(true);
    expect(CONTENT_REGISTRY.bossEncounter.arenaId).toBe("olympus_arena");
    expect(CONTENT_REGISTRY.deathRules.id).toBe("player_death_v1");
    expect(CONTENT_REGISTRY.victory.actorId).toBe("boss.boss_olympus");
    expect(CONTENT_REGISTRY.startingLoadout.equippedWeapon).toBe("sword");
    const spirit = CONTENT_REGISTRY.byId.quest.get("q_spirit_path");
    expect(spirit?.objectives).toEqual([{ type: "defeat_encounter", encounterId: "guardian_spirit" }]);
    expect(spirit?.rewards.learnAbilityIds).toEqual(["dream_step"]);
    expect(spirit?.rewards.flagIds).toContain("spirit_route_open");
    const blob = CONTENT_REGISTRY.byId.primitiveProfile.get("blob_small_tight");
    expect(blob).toMatchObject({ kind: "blob", areaMin: 4, areaMax: 10, compactness: "high" });
    const forest = CONTENT_REGISTRY.byId.featureRecipe.get("forest_patch");
    expect(forest?.steps.some((step) => step.primitiveId === "blob_medium")).toBe(true);
    expect(CONTENT_REGISTRY.abilityAcquisitions.some((row) => row.abilityId === "divine_passage" && row.questId === null)).toBe(true);
    expect(CONTENT_REGISTRY.planeFamilies[0]?.majorRegionsMin).toBe(2);
  });

  it("rejects duplicate catalogue IDs", () => {
    const issues = validateContentRegistry(
      withRegistry({
        attacks: [...CONTENT_REGISTRY.attacks, CONTENT_REGISTRY.attacks[0]!],
      }),
    );
    expect(issues.some((issue) => issue.message.includes("duplicate id"))).toBe(true);
  });

  it("rejects dangling item attack references", () => {
    const original = CONTENT_REGISTRY.items[0]!;
    const issues = validateContentRegistry(
      withRegistry({
        items: [
          ...CONTENT_REGISTRY.items.slice(1),
          { ...original, attackIds: ["no_such_attack"] },
        ],
      }),
    );
    expect(issues.some((issue) => issue.message.includes("dangling reference no_such_attack"))).toBe(true);
  });

  it("rejects dangling tile hazard references", () => {
    const original = CONTENT_REGISTRY.tileTypes[0]!;
    const issues = validateContentRegistry(
      withRegistry({
        tileTypes: [{ ...original, hazardId: "no_such_hazard" }, ...CONTENT_REGISTRY.tileTypes.slice(1)],
      }),
    );
    expect(issues.some((issue) => issue.message.includes("dangling reference no_such_hazard"))).toBe(true);
  });

  it("rejects dangling quest givers and illegal primitive ranges", () => {
    const original = CONTENT_REGISTRY.quests[0]!;
    const giverIssues = validateContentRegistry(
      withRegistry({
        quests: [{ ...original, giver: "no_such_npc" }, ...CONTENT_REGISTRY.quests.slice(1)],
      }),
    );
    expect(giverIssues.some((issue) => issue.message.includes("dangling reference no_such_npc"))).toBe(true);

    const blob = CONTENT_REGISTRY.primitiveProfiles.find((row) => row.kind === "blob")!;
    const rangeIssues = validateContentRegistry(
      withRegistry({
        primitiveProfiles: [{ ...blob, areaMin: 20, areaMax: 4 }, ...CONTENT_REGISTRY.primitiveProfiles.filter((row) => row.id !== blob.id)],
      }),
    );
    expect(rangeIssues.some((issue) => issue.message.includes("illegal blob area range"))).toBe(true);
  });

  it("rejects an invalid scaling-rule and attribute combination", () => {
    const original = CONTENT_REGISTRY.attacks[0]!;
    const issues = validateContentRegistry(
      withRegistry({
        attacks: [{ ...original, scalingRule: "average2" }, ...CONTENT_REGISTRY.attacks.slice(1)],
      }),
    );
    expect(issues.some((issue) => issue.message.includes("average2 requires exactly two attributes"))).toBe(true);
  });

  it("createContentRegistry returns an independent but equivalent registry", () => {
    const created = createContentRegistry();
    expect(validateContentRegistry(created)).toEqual([]);
    expect(created.planes).toHaveLength(120);
  });
});
