# Tight

A compact, procedurally generated dimensional exploration RPG played on a 16×16 tile grid.

This repository is a static TypeScript/Vite application. Game rules live in `src/core` and must remain testable under Node without a browser, Pixi, or DOM.

## Commands

```text
npm install
npm test
npm run dev
npm run build
```

`npm run build` emits a self-contained `dist/` directory suitable for ordinary static hosting.
