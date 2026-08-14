import { describe, expect, it } from "vitest";
import { CONTENT_REGISTRY, generateTopology, resolveProgressionOutcomes } from "../../src/core";

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
    for (const source of first.progressionSources) {
      for (const grant of source.grants) {
        const [kind, id] = grant.split(":");
        if (kind === "item" || kind === "resource") {
          expect(CONTENT_REGISTRY.byId.item.has(id ?? "")).toBe(true);
        }
      }
    }
  });

  it("never selects unique items as generated shop randomness", () => {
    const generated = generateTopology("seed-alpha", 0);
    if (!generated.ok) {
      return;
    }
    const resolved = resolveProgressionOutcomes(generated.topology);
    const generatedShopItems = resolved.progressionSources
      .filter((source) => source.sourceType === "shop_stock" && !source.id.endsWith(".staple"))
      .map((source) => source.contentReference);
    for (const itemId of generatedShopItems) {
      expect(CONTENT_REGISTRY.byId.item.get(itemId)?.rarity).not.toBe("unique");
    }
  });
});
