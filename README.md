# Formicarium

A living, low-poly 3D ant farm in Three.js. Nothing is scripted: a queen and a
dozen workers found a colony, and everything after that (foraging highways,
new chambers, brood waves, famines, spider attacks) emerges from simple local
rules. You watch; you don't command.

**Run it:** any static file server from the repo root, e.g.

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

No build step. Three.js is vendored in `vendor/three` and loaded with an import map.
The seed is in the URL (`#seed=QWERTY`), so any colony can be replayed or shared.

## What happens

- **Foraging.** Scouts wander the surface. A scout that finds food carries a piece
  home, laying a food trail whose strength fades with distance from the food, so the
  gradient points at the source. Others follow it, reinforce it, and a highway forms.
  When the food runs out, nobody reinforces the trail and it evaporates.
- **Division of labour.** Every ant picks work with a response-threshold model:
  colony-wide stimuli (food shortage, hungry larvae, unfinished digging, corpses)
  against its own thresholds, which shift with age. Young ants nurse, older ants
  forage, majors defend. Roles change as needs change.
- **Life cycle.** The queen lays eggs at a rate set by her nourishment, the stores,
  the workforce and stress. Eggs → larvae (must be fed; protein-rich larvae can become
  big-headed majors) → pupae → adults. Starving colonies recycle brood.
- **Digging.** Crowding triggers new excavation plans: a meandering tunnel ending in a
  flat-floored chamber (nursery, granary, resting room, refuse chamber) or a new
  entrance. Excavators dig cell by cell and haul every pellet to the surface, where it
  builds the mound. Congested corridors get widened.
- **Environment.** Berries, fruit, dead insects, sugar drops and seeds appear and rot.
  Spiders hunt foragers and trigger alarm pheromone that pulls defenders up the shaft;
  beetles and caterpillars can be overwhelmed and dragged home. Rain washes trails
  away and floods shallow tunnels; heat waves and dry spells change behaviour; tunnels
  occasionally collapse and get re-dug. Slow day/night cycle.

## Controls

Drag to pan, scroll/pinch to zoom, right-drag to tilt. Click an ant, the queen, a
chamber, food or a creature to inspect it; double-click to follow. Space pauses,
1–5 set speed (1×–20×). P pheromones, G tunnel network, R role colours, L labels,
F3 performance stats, Home frames the whole farm, N jumps to the nest.

## Architecture

3D rendering, mostly-2D simulation.

```
src/sim/        pure simulation, no Three.js (runs headless in node)
  sim.js          fixed-timestep orchestrator, queen, brood, colony needs
  colony.js       worker state machines + response-threshold task choice
  movement.js     flow-field following, surface steering, lanes
  nav.js          shared BFS flow fields (exit, royal chamber, nursery, granary,
                  refuse, rest, dig frontier) + LRU cache for per-target fields
  chambers.js     excavation planning, storage stacking, tunnel widening
  pheromones.js   surface (x,z) and underground (x,y) grids with decay/diffusion
  environment.js  food, plants, creatures, weather, random events
  world.js        soil grid, strata, rocks, roots, surface height + dirt mound
  stores.js       structure-of-arrays storage for ants, items, brood
src/render/     Three.js view of the simulation state
  terrain.js      chunked marching-squares soil face, only dirty chunks rebuilt
  antModel.js     procedural ant mesh; gait animated in the vertex shader
  antsView.js     instanced ants, brood and items (a handful of draw calls)
  ...
```

Performance notes:

- Agents live in typed arrays (structure of arrays), not objects.
- The simulation runs at a fixed 20 Hz; rendering interpolates. Ants re-think every
  4th tick (staggered), move every tick. High speeds run more fixed steps per frame
  under a time budget, so 20× stays deterministic and degrades gracefully.
- No per-ant pathfinding: all ants going to the same kind of place share one flow
  field, rebuilt only when tunnels change (throttled).
- All ants are one `InstancedMesh`; legs and antennae animate on the GPU. A low-detail
  mesh takes over when zoomed far out.
- Soil is rebuilt per 24×24 chunk, a few chunks per frame at most.

Tuning/regression without a browser:

```sh
npm run sim -- SEED DAYS     # node tools/headless.mjs QWERTY 16
```
