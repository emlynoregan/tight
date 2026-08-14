import type { CharacterView, InventoryView, PlaneView, PlayerCommand } from "../core";
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
    if (cmd === "close") {
      dispatch({ type: "closeModal" });
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
  extras?: { readonly plane: PlaneView; readonly presentation: PresentationFacade },
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
