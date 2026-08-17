import type { SettingsView } from "../app/game-controller";
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
const STATIC_MODALS = new Set(["settings", "confirm-new-game", "confirm-import", "victory"]);
const modalMarkup = new WeakMap<HTMLElement, string>();

export interface AppUiHandlers {
  exportSave(): void;
  importSave(text: string): void;
  confirmImport(): void;
  requestNewGame(seed: string): void;
  randomSeed(): string;
  copySeed(seed: string): void;
  setAudioEnabled(enabled: boolean): void;
  setReducedShake(enabled: boolean): void;
  setReducedFlash(enabled: boolean): void;
  clearCache(): void;
}

export function bindModalCommands(
  shell: ShellElements,
  dispatch: (command: PlayerCommand) => void,
  app?: AppUiHandlers,
): void {
  shell.modal.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-cmd], [data-app]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const appCmd = target.dataset.app;
    if (appCmd && app) {
      handleAppCommand(shell, app, appCmd);
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
      const seedInput = shell.modal.querySelector<HTMLInputElement>("[data-seed-input]");
      if (seedInput && app) {
        app.requestNewGame(seedInput.value);
        return;
      }
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
  shell.modal.addEventListener("change", (event) => {
    if (!app) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.app === "audio") {
      app.setAudioEnabled(target.checked);
      return;
    }
    if (target.dataset.app === "shake") {
      app.setReducedShake(target.checked);
      return;
    }
    if (target.dataset.app === "flash") {
      app.setReducedFlash(target.checked);
    }
  });
  shell.modal.addEventListener("keydown", (event) => trapFocus(shell.modal, event));
}

function handleAppCommand(shell: ShellElements, app: AppUiHandlers, appCmd: string): void {
  if (appCmd === "export") {
    app.exportSave();
    return;
  }
  if (appCmd === "import") {
    const file = shell.modal.querySelector<HTMLInputElement>("[data-import-file]");
    file?.click();
    return;
  }
  if (appCmd === "confirmImport") {
    app.confirmImport();
    return;
  }
  if (appCmd === "copy") {
    const seed = shell.modal.querySelector<HTMLInputElement>("[data-seed-input]")?.value ?? "";
    app.copySeed(seed);
    return;
  }
  if (appCmd === "random") {
    const input = shell.modal.querySelector<HTMLInputElement>("[data-seed-input]");
    if (input) {
      input.value = app.randomSeed();
    }
    return;
  }
  if (appCmd === "newGame") {
    const seed = shell.modal.querySelector<HTMLInputElement>("[data-seed-input]")?.value ?? "";
    app.requestNewGame(seed);
    return;
  }
  if (appCmd === "clearCache") {
    app.clearCache();
  }
}

export function bindSettingsFileInput(shell: ShellElements, app: AppUiHandlers): void {
  shell.modal.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.importFile === undefined) {
      return;
    }
    const file = target.files?.[0];
    if (!file) {
      return;
    }
    void file.text().then((text) => app.importSave(text));
    target.value = "";
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
    readonly settings?: SettingsView;
  },
): void {
  if (!modal) {
    shell.modal.hidden = true;
    shell.modal.replaceChildren();
    delete shell.modal.dataset.rendered;
    shell.modal.removeAttribute("aria-labelledby");
    modalMarkup.delete(shell.modal);
    return;
  }
  if (STATIC_MODALS.has(modal) && shell.modal.dataset.rendered === modal && !shell.modal.hidden) {
    return;
  }
  if (modal === "inventory") {
    setModal(shell, modal, inventoryMarkup(inventory), "Inventory");
    return;
  }
  if (modal === "character") {
    setModal(shell, modal, characterMarkup(character), "Character");
    return;
  }
  if (modal === "legend" && extras) {
    setModal(shell, modal, legendMarkup(extras.plane, extras.presentation), "Map key");
    return;
  }
  if (modal === "questlog") {
    setModal(shell, modal, questLogMarkup(extras?.quests ?? []), "Quests");
    return;
  }
  if (modal?.startsWith("dialogue:") && extras?.dialogue) {
    setModal(shell, modal, dialogueMarkup(extras.dialogue), extras.dialogue.speaker);
    return;
  }
  if (modal?.startsWith("shop:") && extras?.shop) {
    setModal(shell, modal, shopMarkup(extras.shop), "Shop");
    return;
  }
  if (modal === "victory") {
    const seed = extras?.settings?.worldSeed ?? "";
    const version = extras?.settings?.generatorVersion ?? "";
    setModal(
      shell,
      modal,
      `
      <h2 id="tight-modal-title">Olympus conquered.</h2>
      <p>The final boss is defeated. The world remains as you left it.</p>
      <p>World seed <code>${escapeHtml(seed)}</code> · Generator ${escapeHtml(version)}</p>
      <p><button type="button" data-cmd="close">Continue</button> <button type="button" data-cmd="newGame">New Game</button></p>
    `,
      "Olympus conquered.",
    );
    return;
  }
  if (modal === "confirm-new-game") {
    const seed = extras?.settings?.pendingNewGameSeed ?? extras?.settings?.worldSeed ?? "";
    setModal(
      shell,
      modal,
      `
      <h2 id="tight-modal-title">Start a New Game?</h2>
      <p>This replaces the current save. Seed <code>${escapeHtml(seed)}</code> will be used.</p>
      <p><button type="button" data-cmd="newGame">Replace save</button> <button type="button" data-cmd="close">Cancel</button></p>
    `,
      "Start a New Game?",
    );
    return;
  }
  if (modal === "confirm-import") {
    const seed = extras?.settings?.pendingImportSeed ?? "";
    setModal(
      shell,
      modal,
      `
      <h2 id="tight-modal-title">Import this save?</h2>
      <p>This replaces the current save with imported seed <code>${escapeHtml(seed)}</code>.</p>
      <p><button type="button" data-app="confirmImport">Replace save</button> <button type="button" data-cmd="close">Cancel</button></p>
    `,
      "Import this save?",
    );
    return;
  }
  if (modal === "settings" && extras?.settings) {
    setModal(shell, modal, settingsMarkup(extras.settings), "Settings");
    return;
  }
  setModal(shell, modal, `<p>Paused: ${escapeHtml(modal)}. Esc to close.</p><button type="button" data-cmd="close">Close</button>`, "Paused");
}

function setModal(shell: ShellElements, modal: string, html: string, label: string): void {
  const next = html.includes("id=\"tight-modal-title\"") ? html : `<h2 id="tight-modal-title">${escapeHtml(label)}</h2>${html}`;
  // The rAF loop re-renders HUD every frame. Replacing innerHTML here would destroy
  // buttons between mousedown and mouseup, so inventory Use/Drop/Equip never fire.
  if (!shell.modal.hidden && shell.modal.dataset.rendered === modal && modalMarkup.get(shell.modal) === next) {
    return;
  }
  shell.modal.hidden = false;
  shell.modal.dataset.rendered = modal;
  shell.modal.setAttribute("aria-labelledby", "tight-modal-title");
  modalMarkup.set(shell.modal, next);
  shell.modal.innerHTML = next;
  firstFocusable(shell.modal)?.focus();
}

function settingsMarkup(view: SettingsView): string {
  const warning = view.persistError
    ? `<p class="tight-warn">Save failed: ${escapeHtml(view.persistError)}</p>`
    : view.storageWarning
      ? `<p class="tight-warn">${escapeHtml(view.storageWarning)}</p>`
      : "";
  return `
    <h2 id="tight-modal-title">Settings</h2>
    ${warning}
    <p>Generator <code>${escapeHtml(view.generatorVersion)}</code> · App ${escapeHtml(view.appVersion)}</p>
    <p>Topology <code>${escapeHtml(view.topologyHash.slice(0, 12))}…</code> · Plane ${escapeHtml(view.plane)}</p>
    <label>World seed
      <input type="text" data-seed-input value="${escapeHtml(view.worldSeed)}" autocomplete="off" spellcheck="false">
    </label>
    <p>
      <button type="button" data-app="copy">Copy seed</button>
      <button type="button" data-app="random">Random seed</button>
      <button type="button" data-app="newGame">New Game</button>
    </p>
    <p>
      <button type="button" data-app="export">Export save</button>
      <button type="button" data-app="import">Import save</button>
      <input type="file" accept="application/json,.json" data-import-file hidden>
    </p>
    <p>
      <label><input type="checkbox" data-app="audio"${view.audioEnabled ? " checked" : ""}> Audio enabled</label>
    </p>
    <p>
      <label><input type="checkbox" data-app="shake"${view.reducedShake ? " checked" : ""}> Reduce shake</label>
    </p>
    <p>
      <label><input type="checkbox" data-app="flash"${view.reducedFlash ? " checked" : ""}> Reduce flashing</label>
    </p>
    <p><button type="button" data-app="clearCache">Clear generation cache</button></p>
    <p><button type="button" data-cmd="close">Close</button></p>
  `;
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
    <h2 id="tight-modal-title">Inventory</h2>
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
    <h2 id="tight-modal-title">Character</h2>
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
    <h2 id="tight-modal-title">${view.speaker}</h2>
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
    <h2 id="tight-modal-title">Shop</h2>
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
    <h2 id="tight-modal-title">Quests</h2>
    <ul>${rows}</ul>
    <button type="button" data-cmd="close">Close</button>
  `;
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]");
}

function trapFocus(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab" || root.hidden) {
    return;
  }
  const nodes = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]")];
  if (nodes.length === 0) {
    return;
  }
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
