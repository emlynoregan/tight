import { DIALOGUE_NODES, NPC_DIALOGUE_ROOT } from "../data/dialogue";
import type { DialogueCondition, DialogueEffect, DialogueNode } from "../model/content-types";
import type { ConditionExpr } from "../model/conditions";
import type { GameRuntime } from "../runtime/game-runtime";
import { playerActor } from "../runtime/game-runtime";
import { applyHeal } from "./apply-effects";
import { evaluateCondition } from "./conditions";
import { applyGrantTokens, learnAbility } from "./grants";
import { completeQuest, questState, startQuest } from "./quests";
import { shopInstanceForNpc } from "./shops";
import type { TickEvent } from "./tick-events";

export function dialogueNodeById(id: string): DialogueNode | undefined {
  return DIALOGUE_NODES.find((node) => node.id === id);
}

export function dialogueRootForActor(runtime: GameRuntime, actorId: string): string {
  const actor = runtime.save.actors.find((row) => row.id === actorId);
  const storyId = actor?.definitionId ?? "";
  if (NPC_DIALOGUE_ROOT[storyId]) {
    return NPC_DIALOGUE_ROOT[storyId]!;
  }
  if (shopInstanceForNpc(runtime, actorId)) {
    return "dlg_shopkeeper";
  }
  return "dlg_shopkeeper";
}

function toExpr(condition: DialogueCondition): ConditionExpr {
  switch (condition.type) {
    case "flag":
      return { type: "flag", flag: condition.flag, equals: condition.equals ?? true };
    case "questState":
      return { type: "questState", questId: condition.questId, state: condition.state };
    case "itemOwned":
      return { type: "itemOwned", itemId: condition.itemId, owned: true };
    case "dimensionDiscovered":
      return { type: "dimensionDiscovered", dimension: condition.dimension };
    case "attributeAtLeast":
      return { type: "attributeAtLeast", attribute: condition.attribute, value: condition.value };
    case "currencyAtLeast":
      return { type: "currencyAtLeast", amount: condition.amount };
    default:
      return { type: "all", of: [] };
  }
}

export function dialogueConditionsMet(runtime: GameRuntime, conditions: readonly DialogueCondition[] | undefined): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }
  return evaluateCondition(runtime, { type: "all", of: conditions.map(toExpr) });
}

function applyDialogueEffects(
  runtime: GameRuntime,
  _actorId: string,
  effects: readonly DialogueEffect[] | undefined,
  events: TickEvent[],
): "end" | "shop" | null {
  if (!effects) {
    return null;
  }
  let result: "end" | "shop" | null = null;
  const player = playerActor(runtime);
  for (const effect of effects) {
    if (effect.type === "setFlag") {
      applyGrantTokens(runtime.save, [`flag:${effect.flag}`], events);
    } else if (effect.type === "startQuest") {
      startQuest(runtime, effect.questId, events);
    } else if (effect.type === "completeQuest") {
      if (questState(runtime.save, effect.questId) !== "complete") {
        startQuest(runtime, effect.questId, events);
        completeQuest(runtime, effect.questId, events);
      }
    } else if (effect.type === "giveItem") {
      applyGrantTokens(runtime.save, [`item:${effect.itemId}`], events, { x: player.x, y: player.y }, effect.quantity ?? 1);
    } else if (effect.type === "giveCurrency") {
      applyGrantTokens(runtime.save, [`currency:${effect.amount}`], events);
    } else if (effect.type === "teachAbility") {
      learnAbility(runtime.save, effect.abilityId, events);
    } else if (effect.type === "heal") {
      applyHeal(player, player.maxHp, events);
    } else if (effect.type === "openShop") {
      result = "shop";
    } else if (effect.type === "end") {
      result = "end";
    }
  }
  return result;
}

export function openDialogue(runtime: GameRuntime, actorId: string, events: TickEvent[]): string {
  const rootId = dialogueRootForActor(runtime, actorId);
  let node = dialogueNodeById(rootId);
  if (node?.id === "dlg_mara_intro" && questState(runtime.save, "q_first_crack") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_first_crack") === "complete" ? "dlg_mara_done" : "dlg_mara_wait") ?? node;
  }
  if (node?.id === "dlg_torren_guardian" && questState(runtime.save, "q_stone_warden") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_stone_warden") === "complete" ? "dlg_torren_thanks" : "dlg_torren_wait") ?? node;
  }
  if (node?.id === "dlg_vesa_gate" && questState(runtime.save, "q_arcane_gate") === "complete") {
    node = dialogueNodeById("dlg_vesa_taught") ?? node;
  }
  if (node?.id === "dlg_enid_pursuit" && questState(runtime.save, "q_spirit_path") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_spirit_path") === "complete" ? "dlg_enid_thanks" : "dlg_enid_wait") ?? node;
  }
  if (node?.id === "dlg_orik_space" && questState(runtime.save, "q_star_road") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_star_road") === "complete" ? "dlg_orik_thanks" : "dlg_orik_wait") ?? node;
  }
  if (node?.id === "dlg_nox_void" && questState(runtime.save, "q_abyss_gate") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_abyss_gate") === "complete" ? "dlg_nox_thanks" : "dlg_nox_wait") ?? node;
  }
  if (node?.id === "dlg_aelia_olympus" && questState(runtime.save, "q_olympus") !== "unavailable") {
    node = dialogueNodeById(questState(runtime.save, "q_olympus") === "complete" ? "dlg_aelia_thanks" : "dlg_aelia_wait") ?? node;
  }
  const nodeId = node?.id ?? rootId;
  if (node?.entryEffects) {
    applyDialogueEffects(runtime, actorId, node.entryEffects, events);
  }
  runtime.save.modal = `dialogue:${actorId}:${nodeId}`;
  events.push({ type: "modal_opened", detail: runtime.save.modal });
  return runtime.save.modal;
}

export function parseDialogueModal(modal: string | null): { actorId: string; nodeId: string } | null {
  if (!modal?.startsWith("dialogue:")) {
    return null;
  }
  const rest = modal.slice("dialogue:".length);
  const split = rest.indexOf(":");
  if (split <= 0) {
    return { actorId: rest, nodeId: "dlg_shopkeeper" };
  }
  return { actorId: rest.slice(0, split), nodeId: rest.slice(split + 1) };
}

export function chooseDialogue(runtime: GameRuntime, choiceId: string, events: TickEvent[]): boolean {
  const parsed = parseDialogueModal(runtime.save.modal);
  if (!parsed) {
    return false;
  }
  const node = dialogueNodeById(parsed.nodeId);
  const choice = node?.choices.find((row) => row.id === choiceId);
  if (!choice || !dialogueConditionsMet(runtime, choice.conditions)) {
    return false;
  }
  const outcome = applyDialogueEffects(runtime, parsed.actorId, choice.effects, events);
  if (outcome === "end") {
    runtime.save.modal = null;
    return true;
  }
  if (outcome === "shop") {
    const shop = shopInstanceForNpc(runtime, parsed.actorId);
    runtime.save.modal = shop ? `shop:${shop.id}` : null;
    return true;
  }
  if (choice.next) {
    const next = dialogueNodeById(choice.next);
    if (next?.entryEffects) {
      applyDialogueEffects(runtime, parsed.actorId, next.entryEffects, events);
    }
    runtime.save.modal = `dialogue:${parsed.actorId}:${choice.next}`;
    return true;
  }
  runtime.save.modal = null;
  return true;
}
