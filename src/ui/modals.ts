import type {
  CharacterView,
  DialogueView,
  InventoryView,
  PlaneView,
  PlayerCommand,
  QuestLogEntry,
  ShopView,
} from "../core";
import type { EquipmentSlotId } from "../core/model/ids";
import type { PresentationFacade } from "../presentation";
import { legendMarkup } from "./legend";
import type { ShellElements } from "./shell";

const SLOTS: readonly EquipmentSlotId[] = ["weapon", "offhand", "body", "head", "charm", "artefact"];
const ATTRS = ["str", "dex", "con", "spd", "wis", "int", "cha", "psy"] as const;

export function bindModalCommands(shell: ShellElements, dispatch: (command: PlayerCommand) => void): void {
  shell.modal.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-cmd]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const cmd = target.dataset.cmd;
    const itemId = target.dataset.item;
    const slot = target.dataset.slot as EquipmentSlotId | undefined;
    const attribute = target.dataset.attr;
    const choiceId = target.dataset.choice;
    const sourceId = target.dataset.source;
    if (cmd === "close") {
      dispatch({ type: "closeModal" });
      return;
    }
    if (cmd === "newGame") {
      dispatch({ type: "newGame" });
      return;
    }
    if (cmd === "choice" && choiceId) {
      dispatch({ type: "dialogueChoice", choiceId });
      return;
    }
    if (cmd === "buy" && sourceId) {
      dispatch({ type: "buy", sourceId });
      return;
    }
    if (cmd === "sell" && itemId) {
      dispatch({ type: "sell", itemId });
      return;
    }
    if (cmd === "equip" && itemId) {
      dispatch({ type: "equip", itemId });
      return;
    }
    if (cmd === "unequip" && slot) {
      dispatch({ type: "unequip", slot });
      return;
    }
    if (cmd === "drop" && itemId) {
      dispatch({ type: "queueFromModal", action: { type: "drop", itemId } });
      return;
    }
    if (cmd === "use" && itemId) {
      dispatch({ type: "queueFromModal", action: { type: "item", itemId } });
      return;
    }
    if (cmd === "spend" && attribute) {
      dispatch({ type: "spendAp", attribute: attribute as (typeof ATTRS)[number] });
    }
  });
}

export function renderManagementModal(
  shell: ShellElements,
  modal: string | null,
  inventory: InventoryView,
  character: CharacterView,
  extras?: {
    readonly plane: PlaneView;
    readonly presentation: PresentationFacade;
    readonly dialogue?: DialogueView | null;
    readonly shop?: ShopView | null;
    readonly quests?: readonly QuestLogEntry[];
  },
): void {
  if (modal === "inventory") {
    shell.modal.hidden = false;
    shell.modal.innerHTML = inventoryMarkup(inventory);
    return;
  }
  if (modal === "character") {
    shell.modal.hidden = false;
    shell.modal.innerHTML = characterMarkup(character);
    return;
  }
  if (modal === "legend" && extras) {
    shell.modal.hidden = false;
    shell.modal.innerHTML = legendMarkup(extras.plane, extras.presentation);
    return;
  }
  if (modal === "questlog") {
    shell.modal.hidden = false;
    shell.modal.innerHTML = questLogMarkup(extras?.quests ?? []);
    return;
  }
  if (modal?.startsWith("dialogue:") && extras?.dialogue) {
    shell.modal.hidden = false;
    shell.modal.innerHTML = dialogueMarkup(extras.dialogue);
    return;
  }
  if (modal?.startsWith("shop:") && extras?.shop) {
    shell.modal.hidden = false;
    shell.modal.innerHTML = shopMarkup(extras.shop);
    return;
  }
  if (modal === "victory") {
    shell.modal.hidden = false;
    shell.modal.innerHTML = `
      <h2>Olympus conquered</h2>
      <p>The final boss is defeated. The world remains as you left it.</p>
      <p><button type="button" data-cmd="close">Continue</button> <button type="button" data-cmd="newGame">New Game</button></p>
    `;
    return;
  }
  if (modal === "confirm-new-game") {
    shell.modal.hidden = false;
    shell.modal.innerHTML = `
      <h2>Start a New Game?</h2>
      <p>This replaces the current save. The same world seed will be used.</p>
      <p><button type="button" data-cmd="newGame">Replace save</button> <button type="button" data-cmd="close">Cancel</button></p>
    `;
    return;
  }
  if (modal) {
    shell.modal.hidden = false;
    shell.modal.innerHTML = `<p>Paused: ${modal}. Esc to close.</p><button type="button" data-cmd="close">Close</button>`;
    return;
  }
  shell.modal.hidden = true;
  shell.modal.replaceChildren();
}

function inventoryMarkup(view: InventoryView): string {
  const equipment = SLOTS.map((slot) => {
    const name = view.equipmentNames[slot];
    const id = view.equipment[slot];
    const unequip = id ? `<button type="button" data-cmd="unequip" data-slot="${slot}">Unequip</button>` : "";
    return `<li><strong>${slot}</strong> ${name ?? "empty"} ${unequip}</li>`;
  }).join("");
  const pack = view.inventory
    .map((row) => {
      const use = row.usable ? `<button type="button" data-cmd="use" data-item="${row.itemId}">Use</button>` : "";
      const equip = row.equippable ? `<button type="button" data-cmd="equip" data-item="${row.itemId}">Equip</button>` : "";
      const drop = `<button type="button" data-cmd="drop" data-item="${row.itemId}">Drop</button>`;
      return `<li>${row.name} ×${row.quantity} ${use}${equip}${drop}</li>`;
    })
    .join("");
  const keys = view.keyItems.map((row) => `<li>${row.name} ×${row.quantity}</li>`).join("") || "<li>None</li>";
  return `
    <h2>Inventory</h2>
    <p>Coin ${view.currency} · Slots ${view.slotsUsed}/${view.slotsMax}</p>
    <h3>Equipment</h3>
    <ul>${equipment}</ul>
    <h3>Pack</h3>
    <ul>${pack || "<li>Empty</li>"}</ul>
    <h3>Key items</h3>
    <ul>${keys}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}

function characterMarkup(view: CharacterView): string {
  const rows = ATTRS.map((id) => {
    const value = view.attributes[id] ?? 0;
    const canSpend = view.atSafeAnchor && view.unspentAp > 0 && value < view.attributeCap;
    const spend = canSpend ? `<button type="button" data-cmd="spend" data-attr="${id}">+1 AP</button>` : "";
    return `<li>${id.toUpperCase()} ${value} ${spend}</li>`;
  }).join("");
  const where = view.atSafeAnchor ? "Safe Anchor — AP spend available." : "AP can be spent only at a Safe Anchor.";
  return `
    <h2>Character</h2>
    <p>Unspent AP ${view.unspentAp}. ${where}</p>
    <ul>${rows}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}

function dialogueMarkup(view: DialogueView): string {
  const choices = view.choices
    .map((choice) => {
      const disabled = choice.available ? "" : " disabled";
      return `<li><button type="button" data-cmd="choice" data-choice="${choice.id}"${disabled}>${choice.label}</button></li>`;
    })
    .join("");
  return `
    <h2>${view.speaker}</h2>
    <p>${view.text}</p>
    <ul>${choices}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}

function shopMarkup(view: ShopView): string {
  const stock = view.stock
    .map((row) => {
      const label = row.unlimited ? "staple" : row.remaining > 0 ? "limited" : "sold out";
      const buy = row.remaining > 0 || row.unlimited
        ? `<button type="button" data-cmd="buy" data-source="${row.sourceId}">Buy ${row.price}</button>`
        : "";
      return `<li>${row.name} (${label}) ${buy}</li>`;
    })
    .join("");
  const sell = view.sellable
    .map((row) => `<li>${row.name} <button type="button" data-cmd="sell" data-item="${row.itemId}">Sell ${row.price}</button></li>`)
    .join("");
  return `
    <h2>Shop</h2>
    <p>Coin ${view.currency}</p>
    <h3>Stock</h3>
    <ul>${stock || "<li>None</li>"}</ul>
    <h3>Sell</h3>
    <ul>${sell || "<li>Nothing sellable</li>"}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}

function questLogMarkup(quests: readonly QuestLogEntry[]): string {
  const rows = quests.map((row) => `<li>${row.name} — ${row.state}</li>`).join("") || "<li>No active or completed quests.</li>";
  return `
    <h2>Quests</h2>
    <ul>${rows}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}
