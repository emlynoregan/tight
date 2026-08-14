import { describe, expect, it } from "vitest";
import {
  CONTENT_REGISTRY,
  generateTopology,
  resolveProgressionOutcomes,
  resolveRewardProfileDrop,
} from "../../src/core";
import type { WorldTopology } from "../../src/core";

function requireResolved(seed: string, attempt = 0): WorldTopology {
  const generated = generateTopology(seed, attempt);
  expect(generated.ok).toBe(true);
  if (!generated.ok) {
    throw new Error(generated.message);
  }
  return resolveProgressionOutcomes(generated.topology);
}

describe("progression outcome resolution", () => {
  it("resolves shop stock identically and without duplicate source IDs", () => {
    const generated = generateTopology("seed-alpha", 0);
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }
    const first = resolveProgressionOutcomes(generated.topology);
    const second = resolveProgressionOutcomes(generated.topology);
    expect(first.topologyHash).toBe(second.topologyHash);
    const ids = first.progressionSources.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    const shopSources = first.progressionSources.filter((source) => source.sourceType === "shop_stock");
    expect(shopSources.length).toBeGreaterThan(0);
    expect(shopSources.every((source) => source.quantity > 0)).toBe(true);
    expect(shopSources.every((source) => source.price !== undefined && source.price >= 0)).toBe(true);
    expect(first.ordinaryEncounterDropsAreSolverVisible).toBe(false);
  });

  it("never selects unique items as generated shop randomness", () => {
    const resolved = requireResolved("seed-alpha", 0);
    const generatedShopItems = resolved.progressionSources
      .filter((source) => source.sourceType === "shop_stock" && !source.id.endsWith(".staple"))
      .map((source) => source.contentReference);
    for (const itemId of generatedShopItems) {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      const shop = resolved.shopInstances.find((row) => sourceShopId(row.id, itemId, resolved));
      void shop;
      const authored = CONTENT_REGISTRY.shopInstances.some((instance) =>
        instance.specialStock.some((stock) => stock.itemId === itemId),
      );
      if (item?.rarity === "unique") {
        expect(authored).toBe(true);
      }
    }
  });

  it("distinguishes finite limited stock from unlimited staples at catalogue prices", () => {
    const resolved = requireResolved("seed-alpha", 0);
    const limited = resolved.progressionSources.filter((source) => source.sourceType === "shop_stock" && !source.unlimited);
    const staples = resolved.progressionSources.filter((source) => source.sourceType === "shop_stock" && source.unlimited);
    expect(limited.length).toBeGreaterThan(0);
    expect(staples.length).toBeGreaterThan(0);
    for (const source of [...limited, ...staples]) {
      const item = CONTENT_REGISTRY.byId.item.get(source.contentReference);
      expect(item).toBeDefined();
      const catalogue = CONTENT_REGISTRY.shopInstances.find((row) => row.id === source.id.split(".")[2]);
      const override = catalogue?.specialStock.find((stock) => stock.itemId === source.contentReference)?.priceOverride;
      expect(source.price).toBe(override ?? item!.value);
      expect(source.requirements).toEqual([`currency:${source.price}`]);
    }
  });

  it("resolves a percentage drop to presence or absence, never an expected value", () => {
    const identity = { generatorVersion: "tight-v1", worldSeed: "drop-seed", topologyAttempt: 0 } as const;
    const first = resolveRewardProfileDrop(identity, "monster.fixture.0", "beast_small");
    const second = resolveRewardProfileDrop(identity, "monster.fixture.0", "beast_small");
    expect(first).toBe(second);
    expect(first === null || typeof first === "string").toBe(true);
    if (typeof first === "string") {
      expect(CONTENT_REGISTRY.byId.item.has(first)).toBe(true);
    }
  });

  it("rejects malformed grant and requirement references", () => {
    const generated = generateTopology("seed-alpha", 0);
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }
    const broken = {
      ...generated.topology,
      progressionSources: [
        ...generated.topology.progressionSources,
        {
          id: "source.broken.grant",
          plane: generated.topology.planeNodes[0]!.plane,
          sourceType: "fixed_item" as const,
          grants: ["item:no_such_item"],
          requirements: [],
          consumption: false,
          contentReference: "no_such_item",
          quantity: 1,
        },
      ],
    };
    expect(() => resolveProgressionOutcomes(broken)).toThrow(/unknown item:no_such_item/);

    const brokenReq = {
      ...generated.topology,
      progressionSources: [
        ...generated.topology.progressionSources,
        {
          id: "source.broken.req",
          plane: generated.topology.planeNodes[0]!.plane,
          sourceType: "shop_stock" as const,
          grants: ["item:sword"],
          requirements: ["currency:abc"],
          consumption: true,
          contentReference: "sword",
          quantity: 1,
          price: 15,
        },
      ],
    };
    expect(() => resolveProgressionOutcomes(brokenReq)).toThrow(/illegal currency/);
  });

  it("produces no unresolved solver-relevant probability across a multi-seed sweep", () => {
    for (let n = 0; n < 20; n += 1) {
      const resolved = requireResolved(`resolve-sweep-${n}`, 0);
      expect(resolved.ordinaryEncounterDropsAreSolverVisible).toBe(false);
      expect(resolved.progressionSources.every((source) => source.quantity > 0 && Number.isFinite(source.quantity))).toBe(true);
      expect(resolved.progressionSources.some((source) => source.sourceType === "monster_drop")).toBe(false);
      const questSources = resolved.progressionSources.filter((source) => source.sourceType === "quest_reward");
      for (const source of questSources) {
        const quest = CONTENT_REGISTRY.byId.quest.get(source.contentReference);
        const needsGuardian = quest?.objectives.some(
          (objective) => objective.type === "defeat_encounter" && objective.encounterId !== "boss_olympus",
        );
        if (needsGuardian) {
          expect(source.requirements.length).toBeGreaterThan(0);
        }
      }
    }
  }, 60_000);
});

function sourceShopId(shopId: string, itemId: string, resolved: WorldTopology): boolean {
  return resolved.progressionSources.some((source) => source.id === `source.shop_stock.${shopId}.${itemId}`);
}
