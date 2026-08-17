# How to play Tight

Tight is a 16×16 top-down RPG. The clock runs at **one tick per second** on the current plane. Modal screens pause it.

This page is the player-facing loop. World structure is in [universe.md](./universe.md). Formulas are in [systems.md](./systems.md).

## Start

```text
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/). An existing IndexedDB save resumes automatically.

| Query | Effect |
|---|---|
| `/?new=1` | throw away the save and start fresh |
| `/?new=1&seed=0` | fresh game on the canonical demo seed |
| `/?seed=my-seed` | prefills Settings; does **not** replace a save by itself |
| `#seed=my-seed` | same as `?seed=` |

You begin on plane `(0,1)` with a sword, traveller clothes, two healing herbs, all attributes at 4, and 18 HP. Dimensions 0 (Field) and 1 (Wild) are already Known. A Safe Anchor on the starting plane is already activated.

## Controls

Keyboard ignores typing in Settings seed fields except **Esc**.

| Input | Action |
|---|---|
| Arrow keys / WASD | move (hold to keep walking). In Space this is **thrust**, not a walk |
| Space or `.` | wait one tick |
| E | interact (feature, NPC, then pickup if nothing else) |
| F | attack an orthogonally adjacent foe |
| G | pick up a ground item |
| I | inventory (pauses) |
| C | character / AP (pauses) |
| L | map key (pauses) |
| J | quest log (pauses) |
| O | settings (pauses) |
| Esc | close a modal; if none is open, opens settings |

On coarse pointers or a narrow layout, a touch pad exposes the same move / wait / interact / attack / pickup / settings actions.

At most **two** explicit actions sit in the queue. Holding a direction is not a queue of steps.

## Reading the HUD

| Element | Meaning |
|---|---|
| Sixteen gems | dimensional knowledge. Two are always lit (current plane). Shape, marking, and a short label distinguish Unknown / Known / current — colour is not the only cue |
| Plane line | current pair, tick, and seed identity |
| HP | current / max. Max is `10 + 2 × CON` unless equipment changes it |
| Statuses | named timed effects (poisoned, hasted, …) |
| Hints | legal actions right now (interact, attack, …) |
| Log | last few semantic events (`Used healing_herb`, hits, transitions) |
| Canvas | the 16×16 current plane, labelled “Current plane” |

The map key (**L**) is the placeholder legend: what the procedural sprites mean, including exits versus arrivals.

## Inventory

Press **I**. Simulation pauses.

| Region | Behaviour |
|---|---|
| Equipment | six slots: weapon, offhand, body, head, charm, artefact. **Equip** / **Unequip** apply immediately while paused |
| Pack | 12 ordinary slots. Stackables default to 9. **Use** and **Drop** close the modal and become the next tick’s action — they do **not** resolve while paused |
| Key items | separate; they never occupy pack slots and cannot be dropped |
| Coin | universal currency; does not occupy pack slots |

Healing herbs: **I** → **Use** on Healing Herb. The inventory closes. On the next tick the log should show `Used healing_herb` and a heal. If two actions are already queued, Use is refused and the modal stays open.

Pickup (**G**) fails without consuming the ground item if the pack is full.

## Safe Anchors and Advancement Points

Safe Anchors are shrines / inns / camps in the world. Stand on or beside one and press **E**:

- full heal
- this becomes the respawn point
- AP spending unlocks

Press **C** at an active anchor (you must still be on that plane, within Manhattan 1 of the stored anchor) to spend **1 AP → +1** to one attribute, cap 15. Equip/unequip and AP spend do not consume a simulation tick.

Ordinary monster kills do **not** give AP. See [systems.md](./systems.md) for the award table.

## Combat, without a combat screen

**F** attacks an orthogonally adjacent hostile with the equipped weapon’s default attack (unarmed if none). Ranged and ability attacks exist on items and learned abilities; v1’s field key is the default attack.

Hits can miss. Plane family changes how well a channel works (physical vs arcane vs psychic, …). Full HP does not make you safe on lava, vacuum, or Void corruption.

If something is chasing you and you leave through a transition it can use, it may arrive a couple of ticks later. Inactive planes do not otherwise keep simulating.

## Death

HP 0 → respawn at the current Safe Anchor, full HP, temporary statuses cleared, Space velocity cleared, pursuits cancelled. You keep inventory, equipment, AP, discoveries, quests, and world changes. Enemies you already killed stay dead.

## Shops, dialogue, quests

**E** on an NPC opens dialogue (paused). Some NPCs are shopkeepers. Staple goods (herbs, a few basic weapons/armour) can be unlimited; everything else is limited stock that stays sold.

**J** lists quests. Quest completion can grant items, flags, abilities, and AP. No faction meters and no NPC daily schedules.

## Settings, save, New Game

One active save per browser profile. The game autosaves after completed ticks and after paused mutations (equip, AP, confirmed import).

| Settings control | Effect |
|---|---|
| World seed field | typed seed for a confirmed New Game |
| Copy seed | seed plus a shareable `?seed=` URL |
| Random seed | fills the field |
| New Game | asks for replace confirmation |
| Export save | downloads the `SaveRecord` JSON |
| Import save | file picker, then confirmation; rejected if JSON / generator version / topology hash is wrong |
| Audio enabled | Web Audio after a gesture |
| Reduce shake / flash | plus `prefers-reduced-motion` defaults both on for a first launch |
| Clear generation cache | drops cached plane/topology work; does not change the seed |

Starting a New Game **replaces** the save. There are no save slots in v1.

## First hour on `(0,1)`

1. Look around. The opening should feel like a small ordinary RPG.
2. Find the Safe Anchor and remember **E**.
3. Press **L** once so placeholder sprites make sense (especially exits).
4. Talk to people. Mara can start `q_first_crack`; it is not forced at frame 1.
5. Fight only what you mean to fight. Clearing an area is permanent.
6. When you find a transition (door, well, cave, …), **E** on it. You will change **one** dimension. The gems will tell you which.
7. First time you enter a plane that contains dimension 2 or higher, you get 1 AP. Spend it at an anchor, not in a hallway.

You are not expected to visit 120 planes. You are expected to find a route upward.

## Victory

Reach plane `(14,15)` through actual transitions and defeat the Olympian final boss. Discovery of dimension 15 is not victory by itself.

On boss death the game pauses on a victory screen. **Continue** leaves you in the post-victory world (boss stays dead). Confirmed New Game replaces the save.

## What this build looks and sounds like

Tiles, actors, and UI icons are **generated SVG**. Music and SFX are **synthesized Web Audio**. That is a placeholder provider, not the final aesthetic. The rules and the save do not depend on those assets.
