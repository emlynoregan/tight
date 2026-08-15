import { CONTENT_REGISTRY } from "../data/registry";
import { dialogueConditionsMet, dialogueNodeById, parseDialogueModal } from "../rules/dialogue";
import { questState } from "../rules/quests";
import { sellPriceFor, shopSourcesFor } from "../rules/shops";
import type { GameRuntime } from "../runtime/game-runtime";

export interface DialogueChoiceView {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
}

export interface DialogueView {
  readonly actorId: string;
  readonly speaker: string;
  readonly text: string;
  readonly choices: readonly DialogueChoiceView[];
}

export function getDialogueView(runtime: GameRuntime): DialogueView | null {
  const parsed = parseDialogueModal(runtime.save.modal);
  if (!parsed) {
    return null;
  }
  const node = dialogueNodeById(parsed.nodeId);
  if (!node) {
    return null;
  }
  const speaker = CONTENT_REGISTRY.byId.storyNpc.get(node.speaker)?.name ?? node.speaker;
  const choices = node.choices
    .filter((choice) => !choice.hideWhenUnmet || dialogueConditionsMet(runtime, choice.conditions))
    .map((choice) => ({
      id: choice.id,
      label: choice.label,
      available: dialogueConditionsMet(runtime, choice.conditions),
    }));
  return { actorId: parsed.actorId, speaker, text: node.text, choices };
}

export interface ShopStockView {
  readonly sourceId: string;
  readonly itemId: string;
  readonly name: string;
  readonly price: number;
  readonly unlimited: boolean;
  readonly remaining: number;
}

export interface ShopView {
  readonly shopId: string;
  readonly currency: number;
  readonly stock: readonly ShopStockView[];
  readonly sellable: readonly { itemId: string; name: string; price: number }[];
}

export function getShopView(runtime: GameRuntime): ShopView | null {
  const modal = runtime.save.modal;
  if (!modal?.startsWith("shop:")) {
    return null;
  }
  const shopId = modal.slice("shop:".length);
  const stock = shopSourcesFor(runtime, shopId).map((source) => {
    const item = CONTENT_REGISTRY.byId.item.get(source.contentReference);
    const sold = runtime.save.collectedSources.includes(source.id);
    return {
      sourceId: source.id,
      itemId: source.contentReference,
      name: item?.name ?? source.contentReference,
      price: source.price ?? 0,
      unlimited: source.unlimited === true,
      remaining: source.unlimited ? 1 : sold ? 0 : 1,
    };
  });
  const sellable = runtime.save.player.inventory.flatMap((row) => {
    const price = sellPriceFor(row.itemId);
    if (price === null) {
      return [];
    }
    const item = CONTENT_REGISTRY.byId.item.get(row.itemId);
    return [{ itemId: row.itemId, name: item?.name ?? row.itemId, price }];
  });
  return { shopId, currency: runtime.save.player.currency, stock, sellable };
}

export interface QuestLogEntry {
  readonly questId: string;
  readonly name: string;
  readonly state: string;
}

export function getQuestLogView(runtime: GameRuntime): readonly QuestLogEntry[] {
  const seen = new Set<string>();
  const rows: QuestLogEntry[] = [];
  const add = (questId: string) => {
    const quest = CONTENT_REGISTRY.byId.quest.get(questId);
    if (!quest || seen.has(quest.id)) {
      return;
    }
    const state = questState(runtime.save, quest.id);
    if (state === "unavailable") {
      return;
    }
    seen.add(quest.id);
    rows.push({ questId: quest.id, name: quest.name, state });
  };
  for (const instance of runtime.topology.questInstances) {
    add(instance.questId);
  }
  for (const row of runtime.save.quests) {
    add(row.questId);
  }
  return rows;
}
