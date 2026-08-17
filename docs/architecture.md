# Architecture

Tight is a **static** TypeScript application. There is no Tight-specific backend. Production output is a `dist/` folder of HTML/CSS/JS (and generated-at-runtime SVG/audio, not shipped bitmaps).

The architectural rule:

> Game rules live in `src/core` and must remain testable under Node without a browser, Pixi, or DOM.

If a change cannot be unit-tested that way, it is probably in the wrong layer.

## Layers

```text
┌─────────────────────────────────────────────┐
│  Browser app                                │
│  bootstrap, clock, GameController, HUD,     │
│  Pixi world renderer, IndexedDB, input      │
├─────────────────────────────────────────────┤
│  Presentation providers                     │
│  VisualProvider / AudioProvider             │
│  (procedural SVG + Web Audio today;         │
│   authored assets later)                    │
├─────────────────────────────────────────────┤
│  Core (Node-safe)                           │
│  catalogues, generation, solver,            │
│  tick, combat, AI, transitions, save shape  │
└─────────────────────────────────────────────┘
```

Pixi draws. It does not own entities, time, or persistence. The DOM owns modals and HUD text. Core owns truth.

## Repository map

| Path | Responsibility |
|---|---|
| `src/core/model/` | IDs, constants, save-state types, planes |
| `src/core/data/` | concrete catalogues compiled into `CONTENT_REGISTRY` |
| `src/core/generation/` | semantic RNG, topology, solver, plane stamps/repair, accepted world |
| `src/core/runtime/` | `GameRuntime`, new game, load, plane materialize, witness execution |
| `src/core/rules/` | commands, tick, combat, AI, inventory, death, shops, quests, … |
| `src/core/queries/` | read models: plane view, HUD, inventory, dialogue, shop |
| `src/presentation/` | provider contracts + procedural placeholders |
| `src/renderer/` | Pixi adapter (textures from SVG strings) |
| `src/ui/` | shell, HUD, modals, legend, error screen |
| `src/input/` | keyboard map and hold-direction adapter |
| `src/persistence/` | IndexedDB + memory fallback |
| `src/app/` | `GameController`, 1 Hz clock, seed URLs, bootstrap |
| `tests/unit/` | Vitest / Node |
| `tests/browser/` | Playwright against `vite preview` of `dist/` |

## Runtime objects

**`GameRuntime`** is the live simulation: `SaveState` plus reconstructed topology/plane bases and caches.

**`GameController`** is the app boundary: open/new/import, `handleIntent`, `command`, `tick`, `snapshot`, persist, preferences, diagnostics. Browser code should not poke save fields except through it (tests may).

**`SimulationClock`** converts `requestAnimationFrame` time into at most one 1 Hz step, and discards catch-up after tab hide.

**Read models** (`getVisiblePlaneView`, `getHudView`, `getInventoryView`, …) are the only thing the HUD/renderer should consume. Do not duplicate HP or inventory in the UI.

## Tick vs pause vs persist

| Kind | Examples | Clock | Persist |
|---|---|---|---|
| Intentional action | move, F, E, G, queued Use/Drop | next tick | after that tick completes |
| Paused mutation | equip, unequip, spend AP, dialogue choice, buy/sell | no tick | immediately after the mutation |
| App/UI | settings audio, seed field, export file | no tick | preferences store / download |

Inventory **Use** and **Drop** look like buttons on a paused screen but they are queued actions. That is deliberate: healing while the world is frozen would be an exploit.

The animation-frame loop re-renders HUD every frame. Management modals reuse DOM when markup is unchanged so buttons remain clickable.

## Presentation contract

Visual and audio IDs are **semantic** (`terrain.grass`, `sfx.item.use`, …). Providers map ids to SVG or synth graphs. Hybrid/asset providers exist so real art can land incrementally. Save data never stores sprite paths.

Audio starts after a user gesture (`resume`). Reduce flash / reduce shake skip `flash`/`pulse` and `jitter`. `prefers-reduced-motion` seeds both flags on first launch.

## Determinism and tests

Authoritative randomness is `src/core/generation/semantic-random.ts` (SHA-256). Do not use `Math.random()` for rules.

Headless tests create a world, apply commands, `advanceTick`, and assert events/hashes. Playwright covers boot, New Game, modal pause, save transfer, inventory Use, a real transition, ordinary F combat, and a QA-hooked Olympus victory that still uses the real boss HP=0 path.

`?qa=1` exposes `window.__tightQa.controller` for those browser tests only. It is not a player cheat menu.

## Commands

```text
npm install
npm run dev              # Vite, typically http://localhost:5173/
npm test                 # vitest run (includes 8-seed accepted-world snapshot)
npm run test:watch
npm run build            # tsc --noEmit && vite build → dist/
npm run preview          # serve dist/
npm run test:browser     # build + Playwright
npm run seed-sweep       # 8-seed headless accepted-world
npm run seed-sweep:release   # 32-seed full getAcceptedWorld (set TIGHT_SEED_SWEEP_RELEASE)
python scripts/publish_hou_site.py --build   # upload dist/ to House of Ur Library + static Site
```

On Windows PowerShell, `npm.ps1` may be blocked; use `npm.cmd` / `npx.cmd`.

## Deployment shape

`vite` `base: "./"` so `dist/` works on a subpath or object-storage origin. No SPA router, no service worker, no Tight API.

Intended host is House of Ur Sites (static) on **dev** first. That publish is not part of this repo’s default workflow and still requires credentials.

## What not to do in this codebase

- Do not invent a mechanic because a plane “needs something cool”. Add a catalogue row or stop.
- Do not put rule branches on dimension numbers in the renderer.
- Do not store a second copy of HP, inventory, or topology in the UI.
- Do not use locale-dependent string sort for anything that affects state; use canonical id / `(y,x)` / `(a,b)` orders.
- Do not treat tickets as specs. Specs win.
