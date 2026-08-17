# Systems

Tight uses a small engine and a large lookup registry. This page is the mechanical handbook for the implemented v1 rules. Content IDs live in `src/core/data/`; the owning design catalogues are in the `docs` repo.

## Simulation tick

Rate: **1 Hz**. No tick advances while a modal is open.

Order of a tick (simplified from `advanceTick`):

1. Capture the player’s action (queue, or held direction, or wait).
2. Choose each other present actor’s action (AI, or a test script).
3. Resolve one action each in **initiative order**: `SPD + initiative modifiers`, then a deterministic tie-break from seed/tick/id.
4. Extra actions from effects, if any, resolve immediately for that actor.
5. Space velocity movement.
6. Periodic status damage/heal.
7. End-of-tick hazards (lava, vacuum, …).
8. Death / respawn / victory.
9. Plane rematerialize if the player moved.
10. Expire statuses and cooldowns.
11. Evaluate pursuit handoffs.
12. `tick += 1`, then persist.

A legal action that fails at resolution (target walked away, pad occupied) still consumes the action.

## Attributes and HP

| ID | Name | Typical use |
|---|---|---|
| `str` | Strength | heavy melee, knockback |
| `dex` | Dexterity | finesse, bows, precision |
| `con` | Constitution | HP, poison, endurance |
| `spd` | Speed | initiative, Space, dash |
| `wis` | Wisdom | wards, exorcism, divine |
| `int` | Intelligence | arcane, devices |
| `cha` | Charisma | command, charm |
| `psy` | Psyche | fear, dreams, mind |

All eight start at **4**. Permanent cap **15**. No class screen.

```text
max HP = 10 + 2 × CON
starting HP = 18
```

The player actor is the sole owner of current HP. There is no second HP field on the player record.

## Combat

No combat mode. Attacks are ordinary tick actions.

### Attack channels vs damage types

**Channel** is how the plane judges the attack. **Damage type** is how the target resists it. They are independent.

| Channel | Meaning |
|---|---|
| `physical` | mundane force |
| `finesse` | precision / mundane ranged |
| `endurance` | body, poison, attrition |
| `speed` | momentum, lightning-fast motion |
| `divine` | faith, wards, sacred force |
| `arcane` | learned magic, runes, devices |
| `social` | command, charm, presence |
| `psychic` | mind, fear, possession |

Damage types: `physical`, `piercing`, `fire`, `cold`, `poison`, `arcane`, `ethereal`, `psychic`, `void`, `divine`, `environmental`.

### Plane channel matrix

Dominant family assigns each channel one of: blocked ×0, suppressed ×0.5, normal ×1, empowered ×1.5.

| Family | Physical | Finesse | Endurance | Speed | Divine | Arcane | Social | Psychic |
|---|---|---|---|---|---|---|---|---|
| Aboveground | normal | normal | normal | normal | normal | normal | normal | normal |
| Inside | normal | empowered | normal | suppressed | normal | normal | empowered | normal |
| Dungeon | empowered | normal | empowered | normal | normal | normal | suppressed | normal |
| Arcane | suppressed | suppressed | normal | normal | normal | empowered | normal | empowered |
| Ethereal | **blocked** | suppressed | normal | empowered | empowered | normal | suppressed | empowered |
| Space | suppressed | normal | empowered | empowered | normal | empowered | suppressed | normal |
| Void | suppressed | suppressed | empowered | normal | suppressed | normal | **blocked** | empowered |
| Olympus | suppressed | suppressed | normal | normal | empowered | normal | empowered | empowered |

No plane is universally safest. Bring the wrong channel to Ethereal or Void and ordinary steel does nothing useful.

### Hit and damage

Governing stat comes from one or two attributes:

| Scaling | Rule |
|---|---|
| `single` | that attribute |
| `average2` | `floor((A+B)/2)` (default hybrid) |
| `max2` / `min2` | max / min |
| `none` | 0 |

```text
attack score = governing stat + accuracy
defence score = defence attribute + modifiers
hit% = clamp(60 + 5 × (attack − defence), 20, 95)

raw = basePower + floor(governing / 3)
then multiply by plane channel, then resistance, then subtract flat armour
floor after each multiply
if not blocked/immune: minimum 1
```

The hit roll is derived from `(worldSeed, tick, attackerId, attackId, targetId)`. It is not `Math.random()`.

Flags `automaticHit`, `automaticMiss`, `noHitRoll` exist and should be rare (hazards often use `noHitRoll`).

Melee is orthogonal adjacency. Ranged needs range and the single supercover LOS algorithm. Actors do not block LOS by default. Opaque tiles block beyond themselves; the endpoint may still be targeted.

### Targeting shapes

| ID | Meaning |
|---|---|
| `self` | the actor |
| `adjacent` | one orthogonal neighbour |
| `single` | one target in range |
| `line` | orthogonal line |
| `cross1` | centre + four neighbours |
| `radius1` / `radius2` | Chebyshev 1 / 2 |
| `tile` | a cell, usually environmental |

## Statuses

Durations are **ticks**, not wall-clock. Reapplying the same id **refreshes** duration; it does not stack unless a row says otherwise.

| ID | Duration | Effect |
|---|---:|---|
| `poisoned` | 5 | 1 poison damage each tick |
| `burning` | 3 | 2 fire damage each tick |
| `chilled` | 4 | SPD −2 |
| `stunned` | 1 | no intentional action |
| `slowed` | 5 | SPD −2 |
| `hasted` | 5 | SPD +2; no extra action |
| `frightened` | 4 | STR −1, DEX −1, CHA −2 |
| `charmed` | 4 | AI will not attack source; player cannot attack source |
| `confused` | 3 | erratic AI; player movement rotates a quarter-turn per tick |
| `silenced` | 4 | no abilities tagged `spell` |
| `anchored` | 4 | no personal dimensional-transition abilities |
| `phased` | 3 | pass `phasePassable` features |
| `hidden` | until broken | cannot be targeted at range; breaks on hostile action |
| `blinded` | 4 | live radius 1 |
| `regenerating` | 5 | heal 1 / tick |
| `stabilised` | 3 | immune to `anchored` |
| `braced` | 3 | +1 flat physical armour |
| `ward_arcane` / `_psychic` / `_void` / `_divine` | 5 | that damage type at least resistant |

Death clears **every** temporary status, including helpful ones (`hasted`, wards, …).

Safe-anchor interact fully heals and drops statuses that are flagged to clear (poison, burn, stun, …). It **keeps** `hasted`, `phased`, `regenerating`, `stabilised`, `braced`, and the four wards.

## Hazards

Hazards are tile effects, not a second combat system. Protection tags are booleans (`vacuumProtected`, `fireProtected`, …), usually from armour.

| ID | When | Effect | Protection |
|---|---|---|---|
| `lava` | enter + end tick | 5 fire | fire |
| `burning_ground` | enter | 2 fire + burning | fire |
| `poison_ground` | enter | poisoned | poison |
| `spikes` | enter | 4 physical | — |
| `hidden_spikes` | enter | 4 physical; revealed and consumed | — |
| `arcane_field` | end tick | 3 arcane | — |
| `spectral_field` | end tick | 3 ethereal | ethereal |
| `vacuum` | end tick | 3 environmental | vacuum |
| `void_corruption` | end tick | 3 void | void |
| `void_confusion` | enter | confused | void |
| `divine_field` | end tick | 4 divine | divine |

No generated ordinary hazard is instant death. Walk, Space velocity, forced move, and in-plane teleport share occupancy checks: `onLeave` at origin, `onEnter` at destination. A blocked forced-move step does not enter the destination.

## Inventory and equipment

| Slot | Typical content |
|---|---|
| `weapon` | sword, bow, phase knife, star lance, … |
| `offhand` | shields, warding tome, spirit mirror |
| `body` | clothes through divine mantle |
| `head` | helmets, command crown |
| `charm` | +1 to one stat, or initiative |
| `artefact` | dimensional tools (Anchor, Echo, Lantern of Nothing, …) |

Pack: **12** slots. Default stack **9**. Key items and coin are separate. Full pack → pickup fails, ground item stays.

Starting loadout:

| Equipped | Pack |
|---|---|
| Sword, Traveller Clothes | Healing Herb ×2 |

**Equip / unequip** while inventory is open: immediate, paused, no tick. **Use / Drop**: enqueue, close modal, resolve on the next tick. Dropping occupies the player’s cell as a ground item.

There is no durability, ammo, weight, or crafting.

### Consumables

| ID | Use |
|---|---|
| Healing Herb | heal 6 |
| Greater Healing Potion | heal 12 |
| Antidote | clear poisoned |
| Cooling Salve | clear burning |
| Stimulant | apply `hasted` |
| Light Orb | reveal tiles, Chebyshev radius 2, for 10 ticks |
| Dimensional Stabiliser | apply `stabilised` (immune to `anchored`) |

### Resources (no use action)

Herb, Ore, Arcane Crystal, Ectoplasm, Star Matter, Void Fragment, Divine Fragment. Quest/gate/shop goods. Some generated gates consume a resource once.

### Key items (examples)

House Key, Mine Key, Rune Sigil, Spirit Token, Station Clearance, Abyss Mark. Generation may lock a door on a key only if a reachable source for that key exists in the accepted topology.

### Weapons (v1 set)

| ID | Name | Governing idea |
|---|---|---|
| `club` | Club | STR physical |
| `sword` | Sword | STR physical, +1 accuracy |
| `great_axe` | Great Axe | heavy STR, grants heavy strike |
| `dagger` | Dagger | DEX finesse / piercing |
| `bow` | Bow | DEX ranged, aimed shot |
| `spear` | Spear | STR+DEX finesse, range 4, piercing |
| `phase_knife` | Phase Knife | ethereal / psychic cut |
| `spell_lattice` | Spell Lattice | arcane bolt + firebolt / force push |
| `soul_bell` | Soul Bell | divine / exorcism |
| `gravity_hammer` | Gravity Hammer | Space / forced move |
| `star_lance` | Star Lance | Space speed |
| `olympian_blade` | Olympian Blade | unique divine |

Later gear changes **rules** (phase, vacuum, void protection, personal transitions), not a +1 sword ladder.

## Advancement Points

No XP. No level.

| Event id | When | AP |
|---|---|---:|
| `ap_dimension_first_entry` | first entry into dimension 2–15 | 1 |
| `ap_guardian_defeat` | first defeat of that guardian actor | 1 |
| `ap_major_quest` | major quest completion | 1 |
| `ap_major_boss` | first defeat of a non-final major boss | 2 |

Awards are one-time, keyed so they cannot be farmed. The final boss ends the game; it does not need a post-victory AP packet.

Spend only at the **stored** Safe Anchor: same plane, Manhattan ≤ 1, 1 unspent AP, attribute < 15. Immediate paused mutation.

A normal run is not expected to max all eight attributes.

## Monsters and AI

Monsters are one-plane actors with behaviour profiles, not inflated HP sponges.

| AI profile | Role |
|---|---|
| `stationary` | no walk |
| `wanderer` | idle roam |
| `brute` | close and hit |
| `skirmisher` | in and out |
| `sniper` | keep range |
| `ambusher` | wait, then commit |
| `controller` | statuses / positioning |
| `supporter` | help allies |
| `coward` | break off |
| `guardian` | hold a gate |
| `dimensional_hunter` | unusually willing to pursue |
| `boss_scripted` | authored boss steps |

Ordinary defeated monsters stay dead (`defeated:{id}`). Loot is ordinary tables plus, for guardians/bosses, solver-visible rewards and AP.

Olympus `(14,15)` places `olympian_final` at the authored boss spawn. Victory is that actor reaching HP 0 through the normal death path.

## NPCs, shops, quests

NPCs are actors. Interact opens paused dialogue. Conditions use a small vocabulary (flag, item, dimension discovered, …) composed with `all` / `any` / `not`. No scripting language.

Shops are physical: entrance, counter, shopkeeper (`{shop.id}.shopkeeper`). Staple rows can be unlimited; limited rows stay sold.

Quests have explicit objectives and rewards (items, flags, abilities, AP). The solver may use a quest as part of a winning route for a given seed; no quest is globally mandatory just because it exists in the catalogue.

## Distance and LOS

| Use | Metric |
|---|---|
| Pathfinding, melee adjacency, pursuit eligibility, AP-anchor range | Manhattan |
| Visibility radius inclusion | Chebyshev |
| LOS | one supercover grid algorithm |

Do not introduce Euclidean comparisons for rules.

## Constants (as implemented)

From `GLOBAL_CONSTANTS` / `tight-v1`:

| Constant | Value |
|---|---|
| dimensions / map / planes | 16 / 16×16 / 120 |
| `simulationHz` | 1 |
| `inputQueueCapacity` | 2 |
| Space velocity clamp | −2…+2 |
| `pursuitEligibilityRadius` | 6 |
| `ordinaryInventorySlots` | 12 |
| `defaultStackSize` | 9 |
| starting attribute / cap | 4 / 15 |
| `maxTopologyAttempts` | 4096 |
| hit baseline / step / clamp | 60% / 5% / 20–95% |
| HP | 10 + 2×CON |
