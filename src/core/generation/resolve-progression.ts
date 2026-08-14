import { CONTENT_REGISTRY } from "../data/registry";
import { planeKey } from "../model/plane";
import { hashTopology, sortByStableId } from "./canonical";
import { chance, semantic, weightedChoice, type SemanticPart } from "./semantic-random";
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

export function resolveRewardProfileDrop(
  topology: Pick<WorldTopology, "generatorVersion" | "worldSeed" | "topologyAttempt">,
  instanceId: string,
  profileId: string,
): string | null {
  const profile = CONTENT_REGISTRY.monsterRewardProfiles.find((row) => row.id === profileId);
  if (!profile) {
    throw new Error(`unknown reward profile ${profileId}`);
  }
  const chanceRow = CONTENT_REGISTRY.dropChances.find((row) => row.id === profile.itemChance);
  if (!chanceRow) {
    throw new Error(`unknown drop chance ${profile.itemChance}`);
  }
  const identity: SemanticPart[] = [
    semantic.string(topology.generatorVersion),
    semantic.string(topology.worldSeed),
    semantic.i64(topology.topologyAttempt),
    semantic.string("topology.monster.drop"),
    semantic.string(instanceId),
  ];
  if (!chance(identity, chanceRow.percent)) {
    return null;
  }
  if (profile.drops.length === 1) {
    return profile.drops[0]!;
  }
  return weightedChoice(
    identity,
    profile.drops.map((itemId) => ({ id: itemId, weight: 1, value: itemId })),
    1,
  );
}

function shopPrice(itemId: string, priceOverride: number | null): number {
  if (priceOverride !== null) {
    return priceOverride;
  }
  const item = CONTENT_REGISTRY.byId.item.get(itemId);
  if (!item) {
    throw new Error(`unknown shop item ${itemId}`);
  }
  return item.value;
}

function resolveShopStock(topology: WorldTopology): ProgressionSource[] {
  const sources: ProgressionSource[] = [];
  for (const shop of topology.shopInstances) {
    const shopType = CONTENT_REGISTRY.byId.shopType.get(shop.shopTypeId);
    if (!shopType) {
      throw new Error(`unknown shop type ${shop.shopTypeId}`);
    }
    const catalogue = CONTENT_REGISTRY.shopInstances.find((row) => row.id === shop.catalogueShopId);
    const specialStock = catalogue?.specialStock ?? [];
    const selected: { itemId: string; price: number }[] = [];
    const already = new Set<string>();

    for (const stock of specialStock) {
      const item = CONTENT_REGISTRY.byId.item.get(stock.itemId);
      if (!item || item.rarity === "unique") {
        continue;
      }
      if (selected.length >= shopType.limitedPickCount) {
        break;
      }
      selected.push({ itemId: stock.itemId, price: shopPrice(stock.itemId, stock.priceOverride) });
      already.add(stock.itemId);
    }

    const limitedPool = shopType.limitedPoolItemIds.filter((itemId) => {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      return item !== undefined && item.rarity !== "unique" && !already.has(itemId);
    });
    const remaining = [...limitedPool];
    let ordinal = 0;
    while (selected.length < shopType.limitedPickCount && remaining.length > 0) {
      const chosen = remaining.length === 1
        ? remaining[0]!
        : weightedChoice(
            parts(topology, "topology.shop.assignment", `${shop.id}.limited`),
            remaining.map((itemId) => ({ id: itemId, weight: 1, value: itemId })),
            ordinal,
          );
      ordinal += 1;
      selected.push({ itemId: chosen, price: shopPrice(chosen, null) });
      already.add(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }

    let rareExtras = 0;
    for (const stock of specialStock) {
      if (already.has(stock.itemId) || rareExtras >= shopType.maxRareExtras) {
        continue;
      }
      const item = CONTENT_REGISTRY.byId.item.get(stock.itemId);
      if (!item) {
        throw new Error(`unknown special stock ${stock.itemId}`);
      }
      if (item.rarity !== "rare" && item.rarity !== "unique") {
        continue;
      }
      selected.push({ itemId: stock.itemId, price: shopPrice(stock.itemId, stock.priceOverride) });
      already.add(stock.itemId);
      rareExtras += 1;
    }

    for (const entry of selected) {
      sources.push({
        id: `source.shop_stock.${shop.id}.${entry.itemId}`,
        plane: shop.plane,
        sourceType: "shop_stock",
        grants: [`item:${entry.itemId}`],
        requirements: [`currency:${entry.price}`],
        consumption: true,
        contentReference: entry.itemId,
        quantity: 1,
        price: entry.price,
      });
    }
    for (const itemId of shopType.stapleItemIds) {
      const item = CONTENT_REGISTRY.byId.item.get(itemId);
      if (!item) {
        throw new Error(`unknown staple ${itemId}`);
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
        price: item.value,
      });
    }
  }
  return sources;
}

function parseToken(token: string): { kind: string; value: string } {
  const split = token.indexOf(":");
  if (split <= 0 || split === token.length - 1) {
    throw new Error(`malformed token ${token}`);
  }
  return { kind: token.slice(0, split), value: token.slice(split + 1) };
}

function validateToken(token: string, role: "grant" | "requirement"): void {
  const parsed = parseToken(token);
  switch (parsed.kind) {
    case "item":
    case "resource":
      if (!CONTENT_REGISTRY.byId.item.has(parsed.value)) {
        throw new Error(`${role} unknown ${token}`);
      }
      break;
    case "ability":
      if (!CONTENT_REGISTRY.byId.ability.has(parsed.value)) {
        throw new Error(`${role} unknown ${token}`);
      }
      break;
    case "currency":
      if (!/^\d+$/.test(parsed.value) || Number(parsed.value) <= 0) {
        throw new Error(`${role} illegal currency ${token}`);
      }
      break;
    case "flag":
      if (parsed.value.length === 0) {
        throw new Error(`${role} empty flag`);
      }
      break;
    default:
      throw new Error(`${role} unknown token kind ${parsed.kind}`);
  }
}

function validateResolvedSources(sources: readonly ProgressionSource[]): void {
  const ids = new Set<string>();
  const uniqueItemCounts = new Map<string, number>();
  for (const source of sources) {
    if (ids.has(source.id)) {
      throw new Error(`duplicate progression source ${source.id}`);
    }
    ids.add(source.id);
    if (!Number.isFinite(source.quantity) || source.quantity <= 0) {
      throw new Error(`non-positive or unresolved quantity on ${source.id}`);
    }
    if (source.unlimited && source.sourceType !== "shop_stock") {
      throw new Error(`${source.id} unlimited is only valid for shop staples`);
    }
    if (source.sourceType === "shop_stock") {
      if (source.price === undefined || source.price < 0) {
        throw new Error(`${source.id} missing canonical price`);
      }
    }
    for (const grant of source.grants) {
      validateToken(grant, "grant");
      const parsed = parseToken(grant);
      if (parsed.kind === "item") {
        const item = CONTENT_REGISTRY.byId.item.get(parsed.value);
        if (item?.rarity === "unique") {
          uniqueItemCounts.set(parsed.value, (uniqueItemCounts.get(parsed.value) ?? 0) + 1);
        }
      }
    }
    for (const requirement of source.requirements) {
      validateToken(requirement, "requirement");
    }
    if (source.sourceType === "quest_reward") {
      const quest = CONTENT_REGISTRY.byId.quest.get(source.contentReference);
      if (!quest) {
        throw new Error(`${source.id} unknown quest ${source.contentReference}`);
      }
      const needsGuardian = quest.objectives.some(
        (objective) => objective.type === "defeat_encounter" && objective.encounterId !== "boss_olympus",
      );
      if (needsGuardian && source.requirements.length === 0) {
        throw new Error(`${source.id} missing authored quest prerequisites`);
      }
    }
  }
  for (const [itemId, count] of uniqueItemCounts) {
    if (count > 1) {
      throw new Error(`unique item ${itemId} granted ${count} times`);
    }
  }
}

export function resolveProgressionOutcomes(topology: WorldTopology): WorldTopology {
  if (topology.ordinaryEncounterDropsAreSolverVisible) {
    throw new Error("ordinary encounter drops cannot be solver-visible before concrete monster instances exist");
  }
  const extraSources = resolveShopStock(topology);
  const merged = sortByStableId([...topology.progressionSources, ...extraSources]);
  validateResolvedSources(merged);
  const { topologyHash: _unusedHash, ...rest } = topology;
  void _unusedHash;
  const resolved = {
    ...rest,
    progressionSources: merged,
    ordinaryEncounterDropsAreSolverVisible: false,
  };
  return {
    ...resolved,
    topologyHash: hashTopology(resolved),
  };
}

export function sourcePlaneKey(source: ProgressionSource): string {
  return `${source.id}@${planeKey(source.plane)}`;
}
