# Universe

Tight’s world is not a stack of “levels”. It is 16 spatial dimensions, experienced two at a time.

## Planes

A **plane** is an unordered pair of distinct dimensions `(a, b)` with `0 ≤ a < b ≤ 15`.

```text
C(16, 2) = 120 planes
```

The player (and every other actor) occupies exactly one plane and a cell `(x, y)` on its 16×16 map. There are no stored coordinates in dimensions the actor is not currently using. Changing planes is always an event caused by a transition effect.

Plane IDs are always stored with `a < b`. Display may still talk about “keeping dimension 8” when travelling `(3,8) → (8,11)`.

| Rule | Value |
|---|---|
| Starting plane | `(0,1)` — always Aboveground, always a legal spawn and Safe Anchor, always at least one route toward dimension 2 |
| Final plane | `(14,15)` — Olympus proper, always contains the final boss |
| Dominant dimension | the **higher** number: physics, primary terrain, primary monsters, difficulty, palette |
| Secondary dimension | the **lower** number: structures, flavour, extra tags, hybrid content |
| Difficulty tier | `max(a, b)` — `(0,10)` and `(9,10)` are both tier 10, but Dream+Orbit is nastier flavour than Field+Orbit |

Pair-specific overrides are rare. Required v1 overrides are only `(0,1)` and `(14,15)`. Everything else is composition from the two dimension vocabularies, plus optional hybrid rows.

Cosmetic plane names (`The Haunted Hearth`) are deterministic and mean nothing mechanically. The pair is the identity.

## The sixteen dimensions

| # | Name | Family | Core idea | Favoured stats |
|---:|---|---|---|---|
| 0 | Field | Aboveground | cultivated, ordinary land | — |
| 1 | Wild | Aboveground | untamed life | CON, DEX |
| 2 | Hearth | Inside | homes, inns, shops | CHA, WIS |
| 3 | Order | Inside | libraries, temples, systems | DEX, INT |
| 4 | Stone | Dungeon | caves, mines, ore | STR, CON |
| 5 | Ruin | Dungeon | crypts, traps, decay | STR, DEX |
| 6 | Sorcery | Arcane | learned, intelligible magic | INT, WIS |
| 7 | Flux | Arcane | unstable transformation | INT, PSY |
| 8 | Spirit | Ethereal | ghosts, memory, graves | WIS, PSY |
| 9 | Dream | Ethereal | illusion, mirrors, doubles | PSY, CHA |
| 10 | Orbit | Space | stations, hulls, machinery | SPD, INT |
| 11 | Deep Space | Space | vacuum, asteroids, aliens | SPD, CON |
| 12 | Shadow | Void | darkness and predation | PSY, CON |
| 13 | Abyss | Void | anti-reality, ancient things | CON, PSY |
| 14 | Heaven | Olympus | celestial order | WIS, CHA |
| 15 | Olympus | Olympus | ultimate divine reality | WIS, CHA, PSY |

A player should be able to learn a dimension the way they learn a biome. Ghosts whenever 8 is involved. Vacuum whenever 11 is involved. Stone+Orbit should feel like a mine that forgot which way “down” is.

## Families and physics

The dominant (higher) dimension selects the family unless a pair override says otherwise.

| Family | Dimensions | Movement | Edges | Visibility |
|---|---|---|---|---|
| Aboveground | 0–1 | walk 1 tile | blocked / natural | unlimited |
| Inside | 2–3 | walk | blocked | unlimited |
| Dungeon | 4–5 | walk | blocked | radius 6 (`dim`) |
| Arcane | 6–7 | walk | **wrap X and Y** | unlimited |
| Ethereal | 8–9 | walk | mixed; open edges may be Void transitions | radius 6 |
| Space | 10–11 | **thrust → velocity** | **wrap X and Y** | unlimited |
| Void | 12–13 | walk | blocked | radius 3 (`void`) |
| Olympus | 14–15 | walk | blocked | unlimited |

### Space

Entering a Space-dominant plane sets velocity to `(0,0)`. A move is ±1 thrust on one axis, clamped to `−2…+2` per component. During the tick’s environment phase, velocity is applied one cell at a time. Collision zeroes velocity. Leaving Space discards it. There is no off-plane momentum.

Monsters use the same thrust model. They do not secretly step to the desired cell.

### Void

Void mainly tightens **visibility radius** (Chebyshev). Line of sight is still the single grid algorithm used everywhere. Remembered terrain may stay on the UI; live actors and items exist only in currently visible cells.

### Ethereal edges

Open Ethereal map edges can themselves be dangerous transitions into associated Void territory. That is a transition, not a wrap.

## Gemstones

Sixteen stones, one per dimension.

| State | Player meaning |
|---|---|
| Unknown | never entered any plane containing this dimension |
| Known | entered it before |
| Lit | this dimension is one of the current plane’s two |

Gems never move you. First entry into dimensions 2–15 grants 1 AP (`ap_dimension_first_entry`) and is permanent through death. Dimensions 0 and 1 start discovered and grant no AP.

**Discovery reveals possibility. Transitions provide access.** Once dimension `n` is Known, all pairings with lower dimensions conceptually exist, but each still needs a real route.

## Transitions

There is no free dimensional movement. Every plane change is the same generic transition effect, whether the source is a world fixture, a spell, an item, a monster, or the environment.

### Ordinary rule

A normal transition changes **exactly one** dimension. Source and destination share exactly one dimension.

If the actor is on `(a,b)` at visible coordinates and the destination is `(b,c)`:

- the coordinate on preserved dimension `b` stays
- the coordinate on new dimension `c` comes from the transition (fixed cell, copy, or seed-derived — never rolled at use time)

### Validity

A transition succeeds only if the mechanism is usable, the destination plane is legal, the destination cell is intrinsically occupiable, no actor is blocking it, and the actor meets conditions (key, flag, ability, …). A failed attempt still spends the action.

If generation finds that a destination cell is intrinsically illegal, the fixture is **born broken** (collapsed ladder, dead portal). That is a valid world result, not a crash. A monster standing on the pad is only a temporary block.

Resource/key gates consume once and set a flag; later traversals honour the flag without needing the item still in inventory.

### Forms (examples)

Doors, ladders, stairs, holes, wells, lifts, cave mouths, mirrors, portals, circles, cracks, whirlpools, airlocks, wormholes, graves, spells, artefacts, monster abilities. Presentation varies by dimension vocabulary; the engine path does not.

## Inactive planes and pursuit

Only the player’s current plane runs ordinary simulation. When you leave:

- actors freeze
- hazards freeze
- cooldowns and status clocks freeze
- NPCs freeze

Nothing “catches up” when you return.

**Exception:** if a monster was already chasing, was within 6 tiles (Manhattan), and its pursuit profile allows that transition, it enters a tiny abstract handoff and either follows after a short delay or gives up. It is not fully simulated on the abandoned plane.

| Pursuit profile | Typical delay (ticks) | Same transition required |
|---|---:|---|
| none | — | — |
| mundane slow | 3 | yes |
| mundane / ethereal / arcane / space | 2 | yes |
| void | 1 | no |
| divine | 1 | no |

Late-game predators are scary because they can **move between planes**, not because they secretly occupy many at once.

## What a seed actually contains

From `(generatorVersion, worldSeed)` the game derives:

- which of the 120 planes are connected, and by what gates
- at least one solver-proven route to Olympus
- deterministic 16×16 geometry for each plane when first entered
- NPCs, shops, encounters, loot, names, hybrids

Player history sits on top as mutations: this monster is dead, this chest is open, this key is owned, this shop row is sold. Clearing a dangerous plane stays meaningful. Ordinary enemies do not respawn.

How that pipeline works: [generation.md](./generation.md).
