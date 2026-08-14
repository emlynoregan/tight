import { CONTENT_REGISTRY } from "../data/registry";
import { planeKey } from "../model/plane";
import { chance, semantic, weightedChoice, type SemanticPart } from "./semantic-random";
import { hashTopology } from "./topology-generator";
import type { ProgressionSource, WorldTopology } from "./topology-types";

function parts(topology: WorldTopology, purpose: string, subject: string): SemanticPart[] {
  return [
    semantic.string(topology.generatorVersion),
    semantic.string(topology.worldSeed),
    semantic.i64(topology.topologyAttempt),
    semantic.string(purpose),
    semantic.string(subject),
  ];
}

function resolveShopStock(topology: WorldTopology): ProgressionSource[] {
  const sources: ProgressionSource[] = [];
  for (const shop of topology.shopInstances) {
    const shopType = CONTENT_REGISTRY.byId.shopType.get(shop.shopTypeId);
    if (!shopType) {
      continue;
    }
    const limitedPool = shopType.limitedPoolItemIds.filter((itemId) => {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      return item !== undefined && item.rarity !== "unique";
    });
    const selectedLimited: string[] = [];
    const remaining = [...limitedPool];
    for (let n = 0; n < 2 && remaining.length > 0; n += 1) {
      const chosen = weightedChoice(
        parts(topology, "topology.shop.assignment", `${shop.id}.limited`),
        remaining.map((itemId) => ({ id: itemId, weight: 1, value: itemId })),
        n,
      );
      selectedLimited.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }
    const rarePool = remaining.filter((itemId) => CONTENT_REGISTRY.byId.item.get(itemId)?.rarity === "rare");
    if (rarePool.length > 0 && chance(parts(topology, "topology.shop.assignment", `${shop.id}.rare`), 25)) {
      selectedLimited.push(
        weightedChoice(
          parts(topology, "topology.shop.assignment", `${shop.id}.rareItem`),
          rarePool.map((itemId) => ({ id: itemId, weight: 1, value: itemId })),
        ),
      );
    }
    for (const itemId of selectedLimited) {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      if (!item) {
        continue;
      }
      sources.push({
        id: `source.shop_stock.${shop.id}.${itemId}`,
        plane: shop.plane,
        sourceType: "shop_stock",
        grants: [`item:${itemId}`],
        requirements: [`currency:${item.value}`],
        consumption: true,
        contentReference: itemId,
        quantity: 1,
      });
    }
    for (const itemId of shopType.stapleItemIds) {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      if (!item) {
        continue;
      }
      sources.push({
        id: `source.shop_stock.${shop.id}.${itemId}.staple`,
        plane: shop.plane,
        sourceType: "shop_stock",
        grants: [`item:${itemId}`],
        requirements: [`currency:${item.value}`],
        consumption: true,
        contentReference: itemId,
        quantity: 1,
        unlimited: true,
      });
    }
  }
  return sources;
}

export function resolveProgressionOutcomes(topology: WorldTopology): WorldTopology {
  const extraSources = resolveShopStock(topology);
  const merged = [...topology.progressionSources, ...extraSources].sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set<string>();
  for (const source of merged) {
    if (ids.has(source.id)) {
      throw new Error(`duplicate progression source ${source.id}`);
    }
    ids.add(source.id);
    if (!Number.isFinite(source.quantity) || source.quantity <= 0) {
      throw new Error(`non-positive or unresolved quantity on ${source.id}`);
    }
    for (const grant of source.grants) {
      const [kind, id] = grant.split(":");
      if (kind === "item" || kind === "resource") {
        if (!id || !CONTENT_REGISTRY.byId.item.has(id)) {
          throw new Error(`${source.id} grants unknown ${grant}`);
        }
      }
      if (kind === "ability" && id && !CONTENT_REGISTRY.byId.ability.has(id)) {
        throw new Error(`${source.id} grants unknown ${grant}`);
      }
    }
  }
  const resolved: WorldTopology = {
    ...topology,
    progressionSources: merged,
    topologyHash: "",
  };
  const { topologyHash: _unusedHash, ...rest } = resolved;
  void _unusedHash;
  return {
    ...rest,
    topologyHash: hashTopology(rest),
  };
}

export function sourcePlaneKey(source: ProgressionSource): string {
  return `${source.id}@${planeKey(source.plane)}`;
}
