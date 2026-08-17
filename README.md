# Tight

Tight is a compact dimensional exploration RPG. The player lives on **16×16 tile maps** inside a universe with **16 spatial dimensions**. Reality is experienced two dimensions at a time. Each unordered pair of dimensions is a **plane**: a conventional top-down map with its own terrain, physics, monsters, and routes onward.

There are **120 planes**. The starting plane is always `(0,1)`. The last is **Olympus `(14,15)`**. Victory is reaching Olympus and defeating its ruler.

The player cannot teleport by picking a dimension. Travel requires something in the world that can actually do it: a door, ladder, portal, artefact, spell, creature, or other explicit transition. Knowing a dimension exists is not the same as being able to go there.

This repository is the playable v1 implementation: a static TypeScript/Vite browser game with a headless, fully testable rules core. Presentation is currently **procedural placeholder** art and audio, designed to be replaceable later without changing rules, saves, or world generation.

**Play:** [https://tight-bronzearch.house-of-ur.com/](https://tight-bronzearch.house-of-ur.com/) (House of Ur, House of Bronze Arch). Fresh run: [/?new=1&seed=0](https://tight-bronzearch.house-of-ur.com/?new=1&seed=0).

## What the game is trying to be

At first the opening plane should feel almost too ordinary: grass, paths, a village, a sword, a shrine. Then another direction through the same reality becomes available. Then the network of planes becomes the puzzle. Then some things follow. Then the player understands the structure well enough to climb toward Olympus.

The design contradiction is the point:

| Tiny | Enormous |
|---|---|
| 16×16 maps | 120 planes |
| 8 attributes | 16 dimensions |
| 1 action per actor per second | a seeded universe larger than one run can exhaust |
| one viewport | eight families of physics |

The universe is complicated. Individual rules are small. Prefer one clear rule over several special cases.

## Design pillars

| Pillar | Meaning |
|---|---|
| Small maps, enormous universe | Every map is 16×16. A run is not expected to visit all 120 planes. |
| Dimensions are gameplay | A plane’s identity comes from its two dimensions: terrain, physics, monsters, items, combat, hazards, portals, look, and sound. |
| Travel is earned | Discovery reveals possibility. Transitions provide access. |
| Procedural but learnable | A seed produces a stable world. Dimensions have vocabularies a player can learn. Combinations create surprise, not unknowable rules. |
| Increasing strangeness | Dimension number is danger, power, and weirdness. Higher equipment changes rules, not just numbers. |
| No chores | No hunger, durability, ammo, mana, stamina, day/night, or corpse run. |

## The numbers

| Quantity | Value |
|---|---|
| Dimensions | 16, numbered `0–15` |
| Map size | 16×16 (256 cells) |
| Planes | `C(16,2) = 120` unordered pairs `(a,b)` with `a < b` |
| Starting plane | `(0,1)` — Field × Wild, Aboveground |
| Final plane | `(14,15)` — Heaven × Olympus |
| Simulation rate | 1 Hz (one semantic tick per second) |
| Intentional actions | at most one per actor per tick |
| Player input queue | at most 2 explicit actions |
| Attributes | 8, starting at 4, permanent cap 15 |
| Starting HP | `10 + 2 × CON` = 18 |
| Ordinary inventory | 12 slots; stackables default to 9 |
| Generator version | `tight-v1` |

A plane is always stored with `a < b`. The **higher** dimension chooses the dominant physics family. The **lower** dimension colours content. Plane difficulty is `max(a,b)`.

## Spatial model

Every actor exists on **exactly one plane** at `(x, y)`.

There are no hidden coordinates in unused dimensions. Changing planes is an event. A normal transition changes **exactly one** dimension, so source and destination share one dimension:

- `(3,8) → (8,11)` keeps 8
- `(2,7) → (2,12)` keeps 2

The coordinate on the shared dimension is preserved. The transition supplies the coordinate on the newly entered dimension. Transits are normally one-way.

Sixteen gemstones show dimensional knowledge. They are **not** teleport buttons.

| Gem state | Meaning |
|---|---|
| Unknown | this dimension has never been entered |
| Known | visited before, not part of the current plane |
| Lit | one of the two dimensions of the current plane |

Exactly two gems are lit. First entry into a new dimension permanently marks it Known and grants 1 Advancement Point. It does not grant a general ability to return.

## Families of reality

The higher-numbered dimension of a plane picks the family and baseline physics.

| Dimensions | Family | Physics |
|---|---|---|
| 0–1 | Aboveground | ordinary bounded walking |
| 2–3 | Inside | ordinary walking; rooms, doors, furniture |
| 4–5 | Dungeon | ordinary walking; caves, crypts, chokepoints |
| 6–7 | Arcane | **both axes wrap** |
| 8–9 | Ethereal | ghosts and mist; open edges may dump into Void |
| 10–11 | Space | **thrust + velocity**, both axes wrap; velocity discarded on leaving |
| 12–13 | Void | ordinary walking; visibility radius 3 |
| 14–15 | Olympus | ordinary movement; divine content; `(14,15)` holds the final boss |

Full dimension names, combat-channel matrices, hazards, and transition rules are in [docs/universe.md](docs/universe.md) and [docs/systems.md](docs/systems.md).

## Time, pause, and the queue

Tight is a realtime / turn-based hybrid. The **current plane** simulates at about one tick per second. Inactive planes are frozen (statuses, AI, hazards, shops). The only v1 exception is a short **pursuit handoff**: a monster already chasing the player, close enough, and allowed to use that transition may follow after a short delay.

Each actor may take zero or one intentional action per tick: move, wait, attack, use an item, interact, thrust in Space, and so on. Failed legal actions still consume the tick.

Modal screens pause the world: inventory, character, shops, dialogue, map key, quests, settings. There are no timed menu choices.

At most two explicit player actions may be queued. Holding a movement key is continuing intent, not a flood of queued steps. The player should never die because twenty obsolete keypresses are still draining.

## Character and progression

There are no classes, no XP grind, and no level. Everyone uses the same eight attributes:

| ID | Name | Combat role |
|---|---|---|
| STR | Strength | heavy melee, force |
| DEX | Dexterity | precision, ranged, finesse |
| CON | Constitution | HP, poison, endurance |
| SPD | Speed | initiative, evasion, Space |
| WIS | Wisdom | wards, exorcism, divine |
| INT | Intelligence | arcane, devices |
| CHA | Charisma | command, charm |
| PSY | Psyche | mind, fear, dreams |

Starting loadout: sword, traveller clothes, two healing herbs, 0 coin.

**Advancement Points** are the only permanent growth currency. Ordinary kills do not award AP. Spend 1 AP at a Safe Anchor to raise one attribute by 1, up to 15.

| AP source | Amount |
|---|---:|
| First entry into a new dimension (2–15) | 1 |
| Guardian defeat | 1 |
| Major quest | 1 |
| Major (non-final) boss | 2 |

Death respawns at the current Safe Anchor with full HP. Inventory, AP, discoveries, quests, and world mutations are kept. Defeated enemies stay dead. There is no corpse run and no currency penalty.

## Combat in one page

There is no separate combat mode. Attacks resolve on the same 1 Hz tick.

```text
hit chance = clamp(60% + 5% × (attack − defence), 20%, 95%)
raw damage = base power + floor(governing stat / 3)
then: plane channel × resistance × flat armour, floor after each multiply
minimum 1 damage unless blocked or immune
```

Planes modify **attack channels** (physical, finesse, endurance, speed, divine, arcane, social, psychic) as blocked / suppressed / normal / empowered. Targets resist **damage types**. Both apply. A fireball on an Arcane plane is a different proposition from the same fireball in the Void.

Details, statuses, hazards, and equipment tables: [docs/systems.md](docs/systems.md).

## How worlds are made

A world identity is exactly `(generatorVersion, worldSeed)`.

1. Generate abstract **topology** (the graph of transitions and progression gates).
2. Run a **winnability solver** that proves at least one mechanical route from `(0,1)` to the Olympus boss. Combat skill is not simulated; reachability is.
3. If the candidate fails, try the next deterministic attempt (up to 4096). The first passing attempt is canonical for that seed.
4. Realize each 16×16 plane lazily, then repair it so required routes, shops, and entries are usable.

The same seed and generator version always produce the same base world. Player history is stored as mutations on top: deaths, loot, flags, shop stock. Base maps are regenerated from the seed, not stored tile-by-tile.

Generation internals: [docs/generation.md](docs/generation.md).

## How to run it

```text
npm install
npm run dev
```

Then open [http://localhost:5173/](http://localhost:5173/).

| URL | Effect |
|---|---|
| `/` | resume the IndexedDB save if one exists, else New Game with seed `0` |
| `/?new=1` | replace the save with a fresh game |
| `/?new=1&seed=alpha` | fresh game with that seed |
| `/?seed=alpha` | prefills New Game / Settings only; does not overwrite an existing save |
| `#seed=alpha` | same as `?seed=` |

Settings (**O**, or **Esc** when nothing else is open): copy seed, random seed, typed New Game with confirmation, export/import JSON, audio, reduced shake/flash, clear generation cache.

Production build:

```text
npm run build
```

emits a backend-free `dist/` with relative `./assets/` URLs, suitable for ordinary static hosting.

Republish to House of Ur (prod Bronze Arch): `python scripts/publish_hou_site.py --build` (needs `HOU_API_KEY`). Live site: [https://tight-bronzearch.house-of-ur.com/](https://tight-bronzearch.house-of-ur.com/).

Full controls, HUD, inventory Use/Drop, and first-hour notes: [docs/how-to-play.md](docs/how-to-play.md).

### Tests

```text
npm test                 # Vitest, including the locked 8-seed accepted-world sweep
npm run test:browser     # production dist/ via Playwright
npm run seed-sweep:release   # optional 32-seed getAcceptedWorld corpus (slow)
```

Core rules must stay testable under Node without a browser, Pixi, or DOM.

## Implementation status

The game is **mechanically complete for v1**: New Game on `(0,1)` through death, shops, quests, dimensional travel, pursuit, and Olympus victory. Tickets 00–17 and 19 are done.

| Layer | State |
|---|---|
| Headless generator + solver | done (`tight-v1`) |
| Headless simulation | done |
| Browser play (Pixi + DOM HUD) | done |
| Placeholder SVG / Web Audio | done, replaceable |
| IndexedDB save + JSON export/import | done |
| Accessibility (focus trap, reduced motion, touch, labels) | done |
| Browser acceptance tests | done against `dist/` |
| 32-seed accepted-world release sweep | done (retained fixture) |
| Live House of Ur static-site deploy | done — https://tight-bronzearch.house-of-ur.com/ |

Presentation is not final art. The renderer talks to a visual/audio **provider**. Procedural placeholders can be swapped for authored assets without changing `SaveState` or generation.

Software layout: [docs/architecture.md](docs/architecture.md).

## Supporting documents

Read these in order if you want to understand Tight rather than just run it.

| Document | Contents |
|---|---|
| [docs/how-to-play.md](docs/how-to-play.md) | Controls, HUD, inventory, death, seeds, first hour |
| [docs/universe.md](docs/universe.md) | Dimensions, families, planes, gems, transitions, pursuit |
| [docs/systems.md](docs/systems.md) | Tick, combat, statuses, hazards, items, AP, shops |
| [docs/generation.md](docs/generation.md) | Seed, topology, solver, plane repair, persistence |
| [docs/architecture.md](docs/architecture.md) | Repository layout, core vs presentation, commands |

These documents describe **this implementation**. They do not replace the design specifications.

## Canonical specifications

Authoritative design lives in the sibling `docs` repository, under `projects/tight/`. If a README or ticket disagrees with those files, the specification wins. Do not invent mechanics to fill a gap; resolve it against the spec.

| Spec | Role |
|---|---|
| [Game Design](https://github.com/emlynoregan/docs/blob/main/projects/tight/game-design.md) | Player-facing game |
| [Game Engine Spec](https://github.com/emlynoregan/docs/blob/main/projects/tight/game-engine-spec.md) | Simulation contract |
| [Technical Design](https://github.com/emlynoregan/docs/blob/main/projects/tight/technical-design.md) | Software architecture |
| [Data index](https://github.com/emlynoregan/docs/blob/main/projects/tight/data/README.md) | Catalogue ownership |
| [Concrete catalogues](https://github.com/emlynoregan/docs/blob/main/projects/tight/data/catalogues/README.md) | Exhaustive v1 rows |
| [Tickets](https://github.com/emlynoregan/docs/blob/main/projects/tight/tickets/README.md) | Implementation queue |

Local checkout (if present): `../docs/projects/tight/`.

## Deliberately not in v1

No hunger, thirst, encumbrance, durability, ammunition, mana, stamina, day/night, off-plane ecosystem, faction reputation, NPC schedules, crafting, multiple save slots, New Game+, or generic scripting language.

Content is lookup tables, reusable effects, finite states, and explicit conditions. If a new behaviour cannot be expressed that way, the right move is a small engine primitive — not a special case for one item.
