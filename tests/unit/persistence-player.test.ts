import { describe, expect, it } from "vitest";
import {
  advanceTick,
  applyPlayerCommand,
  cloneSaveState,
  createAcceptedWorldCache,
  createNewGame,
  createRuntimeFromSave,
  createRuntimeFromSaveRecord,
  getCharacterView,
  getInventoryView,
  hashSaveState,
  makeSaveRecord,
  parseSaveJson,
  playerActor,
  playerAtSafeAnchor,
  spendAdvancementPoint,
  tryAddItem,
  validateSaveRecord,
  SAVE_FORMAT_VERSION,
} from "../../src/core";
import { GameController } from "../../src/app/game-controller";
import { MemoryPersistence } from "../../src/persistence";
import { PresentationFacade, ProceduralVisualProvider, SilentAudioProvider } from "../../src/presentation";
import { mapKeydown } from "../../src/input/input-map";

function newGame() {
  return createNewGame("tight-v1", "0", { cache: createAcceptedWorldCache() });
}

describe("inventory and equipment", () => {
  it("keeps key items and coin out of the 12 ordinary slots", () => {
    const runtime = newGame();
    expect(getInventoryView(runtime).slotsUsed).toBe(1);
    expect(tryAddItem(runtime.save, "house_key", 1)).toBe(true);
    expect(tryAddItem(runtime.save, "coin", 7)).toBe(true);
    expect(runtime.save.player.currency).toBe(7);
    expect(runtime.save.player.keyItems.some((row) => row.itemId === "house_key")).toBe(true);
    expect(getInventoryView(runtime).slotsUsed).toBe(1);
    expect(getInventoryView(runtime).keyItems[0]?.itemId).toBe("house_key");
  });

  it("rejects ordinary pickup when 12 slots are full without consuming the ground item", () => {
    const runtime = newGame();
    runtime.save.player.inventory = Array.from({ length: 12 }, () => ({ itemId: "ore", quantity: 1 }));
    runtime.save.groundItems.push({
      id: "ground.test.club",
      itemId: "club",
      quantity: 1,
      plane: runtime.save.plane,
      x: playerActor(runtime).x,
      y: playerActor(runtime).y,
    });
    applyPlayerCommand(runtime, { type: "queue", action: { type: "pickup" } });
    advanceTick(runtime);
    expect(runtime.save.groundItems).toHaveLength(1);
    expect(runtime.save.player.inventory).toHaveLength(12);
    expect(runtime.save.player.inventory.every((row) => row.itemId === "ore")).toBe(true);
  });

  it("equips, unequips, drops and picks up through paused modals and actions", () => {
    const runtime = newGame();
    applyPlayerCommand(runtime, { type: "openModal", modal: "inventory" });
    const pausedTick = runtime.save.tick;
    expect(advanceTick(runtime).advanced).toBe(false);
    expect(runtime.save.tick).toBe(pausedTick);
    expect(applyPlayerCommand(runtime, { type: "unequip", slot: "weapon" }).ok).toBe(true);
    expect(runtime.save.player.equipment.weapon).toBeNull();
    expect(runtime.save.player.inventory.some((row) => row.itemId === "sword")).toBe(true);
    expect(applyPlayerCommand(runtime, { type: "equip", itemId: "sword" }).ok).toBe(true);
    expect(runtime.save.player.equipment.weapon).toBe("sword");
    expect(applyPlayerCommand(runtime, { type: "modalDrop", itemId: "healing_herb" }).ok).toBe(true);
    expect(runtime.save.groundItems).toHaveLength(1);
    applyPlayerCommand(runtime, { type: "closeModal" });
    applyPlayerCommand(runtime, { type: "queue", action: { type: "pickup" } });
    advanceTick(runtime);
    expect(runtime.save.groundItems).toHaveLength(0);
    expect(runtime.save.player.inventory.some((row) => row.itemId === "healing_herb")).toBe(true);
  });
});

describe("advancement", () => {
  it("spends AP only at a safe anchor and never above the cap", () => {
    const runtime = newGame();
    const anchor = runtime.save.player.safeAnchor;
    playerActor(runtime).x = anchor.x;
    playerActor(runtime).y = anchor.y;
    expect(playerAtSafeAnchor(runtime)).toBe(true);
    runtime.save.player.unspentAp = 1;
    applyPlayerCommand(runtime, { type: "openModal", modal: "character" });
    expect(runtime.save.modal).toBe("character");
    const spent = spendAdvancementPoint(runtime, "str");
    expect(spent.ok).toBe(true);
    expect(runtime.save.player.attributes.str).toBe(5);
    expect(runtime.save.player.unspentAp).toBe(0);
    runtime.save.player.unspentAp = 1;
    runtime.save.player.attributes.str = 15;
    expect(spendAdvancementPoint(runtime, "str").ok).toBe(false);
    playerActor(runtime).x = (anchor.x + 8) % 16;
    playerActor(runtime).y = (anchor.y + 8) % 16;
    expect(playerAtSafeAnchor(runtime)).toBe(false);
    expect(spendAdvancementPoint(runtime, "dex").ok).toBe(false);
    expect(getCharacterView(runtime).atSafeAnchor).toBe(false);
  });
});

describe("save round trip", () => {
  it("serializes and reloads semantic state after a move", () => {
    const runtime = newGame();
    applyPlayerCommand(runtime, { type: "queue", action: { type: "wait" } });
    advanceTick(runtime);
    const before = hashSaveState(runtime.save);
    const record = makeSaveRecord(runtime.save, "2026-08-15T00:00:00.000Z");
    expect(record.saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
    const parsed = parseSaveJson(JSON.stringify(record));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const loaded = createRuntimeFromSaveRecord(parsed.record, { cache: createAcceptedWorldCache() });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(hashSaveState(loaded.runtime.save)).toBe(before);
    expect(loaded.runtime.save.tick).toBe(runtime.save.tick);
  });

  it("fails loudly on topology hash mismatch and ignores cache contents", () => {
    const runtime = newGame();
    const save = cloneSaveState(runtime.save);
    save.topologyHash = "not-the-real-hash";
    const mismatch = createRuntimeFromSave(save, { cache: createAcceptedWorldCache() });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) {
      return;
    }
    expect(mismatch.code).toBe("TOPOLOGY_MISMATCH");
    const store = new MemoryPersistence();
    store.save = makeSaveRecord(runtime.save);
    store.cache.set("junk", { hello: "world" });
    void store.clearCache();
    expect(store.cache.size).toBe(0);
    expect(store.save?.saveState.topologyHash).toBe(runtime.save.topologyHash);
    expect(validateSaveRecord({ ...store.save, saveFormatVersion: 99 }).ok).toBe(false);
  });

  it("refuses to open a stored save with the wrong format version", async () => {
    const store = new MemoryPersistence();
    store.save = { ...makeSaveRecord(newGame().save), saveFormatVersion: 99 };
    await expect(
      GameController.open({
        persistence: store,
        presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
      }),
    ).rejects.toThrow(/SAVE_FORMAT/);
  });

  it("reloads a persisted controller save without a renderer", async () => {
    const store = new MemoryPersistence();
    const first = new GameController({
      seed: "0",
      persistence: store,
      presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
    });
    first.handleIntent({ type: "wait" });
    first.tick();
    await first.persist();
    const second = await GameController.open({
      persistence: store,
      presentation: new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider()),
    });
    expect(hashSaveState(second.runtime.save)).toBe(hashSaveState(first.runtime.save));
    expect(second.runtime.save.tick).toBe(first.runtime.save.tick);
  });
});

describe("input mapping", () => {
  it("opens inventory and character modals from the keyboard map", () => {
    expect(mapKeydown("KeyI", false)).toEqual({ type: "inventory" });
    expect(mapKeydown("KeyC", false)).toEqual({ type: "character" });
    expect(mapKeydown("KeyG", false)).toEqual({ type: "pickup" });
  });
});
