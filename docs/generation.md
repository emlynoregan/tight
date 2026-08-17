# Generation

Tight does not pick a “fun layout” at runtime. A world is a pure function of identity, then a thin mutation log of what the player did.

```text
WorldIdentity = (generatorVersion, worldSeed)
```

Implemented generator version: **`tight-v1`**. Changing the semantic RNG, topology rules, or catalogue rows that affect proof **requires** a new generator version. Old saves must not be silently reinterpreted.

## Pipeline

```text
(generatorVersion, worldSeed)
        │
        ▼
 topology attempt 0, 1, 2, …  (≤ 4096)
        │
        ▼
 structural validation
        │
        ▼
 resolve deterministic progression sources (drops, keys, shops, quests)
        │
        ▼
 winnability solver
    PASS ──► accepted topology (canonical for this identity)
    FAIL ──► next attempt
        │
        ▼
 lazy 16×16 plane generation + validation + repair
        │
        ▼
 runtime: reconstructed base + mutation history
```

The accepted attempt index is **derived**, not part of the player-facing seed. The same identity always selects the same accepted attempt. If all 4096 fail, generation errors with `TOPOLOGY_ATTEMPT_LIMIT_EXCEEDED`. It must never accept the last unwinnable graph or quietly change the user’s seed.

## Topology

Topology is the **abstract graph**: which planes connect, by which transition class, with which gates (item, resource, ability, quest flag, guardian dead, …).

It does **not** decide the 16×16 art. Plane generation must realize topology objects. It must not invent, delete, or redirect a proof-required edge.

A normal edge still obeys the one-dimension-change rule. Optional broken transits and dead ends are allowed. Shortcuts via artefacts and learned abilities are allowed when the solver can see them.

There is **no fixed staircase** of planes. Seed A may route through a stone guardian; seed B through a key; seed C through a learned dimensional ability. The invariant is only:

> At least one mechanically satisfiable route from `(0,1)` to `olympian_final` on `(14,15)`.

## Winnability solver

The solver is a monotone fixed-point over **abstract** state. It does not play the game, does not pathfind tiles, and does not prove the player is good at combat.

It tracks, at least:

- reachable planes
- discovered dimensions
- obtainable keys / resources (with consumption accounting)
- learnable abilities
- defeatable guardian/boss flags (if the encounter is reachable)
- quest / world flags
- usable transitions

A candidate **passes** when `(14,15)` is reachable **and** the final boss is defeatable in that abstract sense.

Probabilities never count. Only resolved sources in that world count. If a gate consumes 3 `star_matter`, the solver must prove 3 reachable units without double-counting mutually exclusive spends. Shop stock counts only if the currency is also provable.

Ordinary combat difficulty and “is this build pleasant?” are **not** solver concerns.

## Semantic randomness

There is no global `Math.random()` stream for rules or generation.

Each decision has a **semantic key** (typed fields: strings, ints, planes, coordinates, …). The canonical PRF is:

```text
SHA-256(semanticKey) → first 8 bytes as uint64
```

Bounded integers use rejection sampling. Weighted choice sorts by stable id, then walks weights. Independent decisions do not perturb each other. Adding an unrelated roll in shops does not reshuffle dungeon walls.

The same API is used at runtime for hit rolls, loot already resolved at generation, and AI ties.

## Plane geometry

When a plane is first needed, generators stamp **shapes** onto the 16×16 grid, then repair:

| Primitive | Typical use |
|---|---|
| blob | forest, swamp, lava, mist |
| line | walls, rivers, fences |
| rectangle | rooms, plazas |
| strip | tables, counters |
| path | corridors, tunnels |
| cluster | rocks, graves, crystals |
| stamp | shop, shrine, portal chamber, boss arena |

Usability is part of generation. Unreachable required areas, sealed shops, blocked mandatory routes, and illegal entry cells are repaired deterministically. The same seed always yields the same repaired map.

Encounters then scatter/cluster/line/guard according to family and density. They must not spawn on player-entry cells, must sit at least Manhattan 2 from entry, and must not sit on required transition cells except `guard_door` posts. If an ordinary encounter cannot be placed legally, it is omitted — unless the solver’s proof needed its reward, in which case that source was already placed as a progression object.

## Persistence

Saves do **not** store 120 full maps.

A `SaveRecord` stores:

- `saveFormatVersion` (currently 1)
- `generatorVersion` (`tight-v1`)
- `worldSeed`
- `topologyHash` (integrity of the accepted topology)
- `SaveState`: player, actors on the current concern, flags, inventory, AP, quests, ground items, defeated ids, collected sources, tick, plane, modal, preferences-adjacent runtime, …

Base content is always reconstructed. Mutations (`defeated:…`, opened containers, sold stock, unlocked gates) hang off **stable ids** derived from semantic origin, not creation order.

Autosave semantics: after every completed unpaused tick, and after every authoritative paused mutation, the latest complete state is durable before another action is accepted. Never restore a half-resolved tick.

JSON **export** is that `SaveRecord`. **Import** parses, validates schema / generator version / topology hash, then replaces the active save only after confirmation. A mismatch is a hard reject, not a guessed regen.

One save per browser profile. IndexedDB is preferred; if it cannot open, the game falls back to memory and shows a banner.

## Regression corpus

| Corpus | What it proves | When |
|---|---|---|
| 8-seed CI sweep | `getAcceptedWorld` for a locked snapshot of seeds | every `npm test` |
| 32-seed release sweep | same path, larger set, metrics retained in `tests/unit/fixtures/accepted-world-sweep-32.json` | `npm run seed-sweep:release` |
| Canonical hashes | seeds `0` and `1` (and `seed-alpha` in the 3-seed lock) must not drift | CI |

The 32-seed run recorded 32/32 accepted on attempt 0, no reject codes, ~1.5 s/seed, canonical hashes for `0` and `1` unchanged. That is a **reachability** corpus, not a “every seed is well balanced” corpus.

Topology also has an older structural 100-seed sweep from early tickets; it does not replace accepted-world proof.
