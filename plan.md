## VR Isometric Game Plan

### Goals
- Recreate the feel of 1980s isometric adventures with modern Three.js + WebXR.
- Keep scope tight: single-level prototype with modular systems ready for extension.
- Prioritise robust movement, collisions, and puzzle interactions over visual polish.

### Tech & Tooling
- Runtime: `three.js`, WebXR, vanilla ES modules (bundler optional later).
- Tooling: ESLint + Prettier, Vitest for logic tests, Vite dev server if/when bundling is needed.
- Asset strategy: code-generated primitives + single texture atlas stub.

### Architecture Overview
- `engine/`: game loop, input, physics/collision resolution.
- `render/`: scene setup, camera rig, lighting, HUD overlay.
- `game/`: entities (player, crate, pickups), room controller, interaction logic.
- `data/`: JSON room definitions, texture atlas metadata, save slots.
- `utils/`: shared helpers (math, events, logging).

### Milestones
- [x] **M0 — Scaffold**
  - Create basic project structure with `src/`, `public/`, `plan.md`.
  - HTML entry point loading main module; set up simple dev script.
  - Utility stubs: input manager, logger, tick loop.
- [x] **M1 — Core Scene & Controls**
  - Fixed-perspective isometric camera rig tied to room origin.
  - Render 8×8 floor grid, player cube, single blocking cube.
  - Keyboard movement mapped to isometric axes; jumping placeholder.
  - Simple axis-aligned collision against floor bounds + one block.
- [ ] **M2 — Room System**
  - [x] JSON room loader; convert tiles to instances and collision volumes.
  - [x] Doorway definitions and room switching placeholder hooks.
- [ ] **M3 — Interactions**
  - [x] Implement pushable crate with constraints and simple physics.
  - [ ] Falling behaviour for unsupported objects.
  - [ ] Inventory and trigger system (e.g. screwdriver fixes lift).
- [ ] **M4 — Polishing Pass**
  - HUD overlay for score/items, basic animations, lighting polish.
  - WebXR session toggle; confirm desktop & VR camera pipeline.
  - Save/load snapshot serialization tests.
- [ ] **Stretch — Map Editor**
  - [x] Separate `editor/` bundle using shared data schema.
  - [x] Block palette UI, 3D placement with snapping, export to JSON.

### Testing Strategy
- Unit tests for collision solver, movement edge cases, room loader.
- Snapshot tests for save/load data integrity.
- Manual VR test checklist maintained in repo.

### Immediate Next Steps
1. Add unit tests covering static/collision solver + crate pushing edge cases.
2. Prototype door-driven room transitions between two JSON rooms.
