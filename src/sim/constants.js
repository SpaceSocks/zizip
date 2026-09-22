// Shared simulation constants. The simulation is a 2D cross-section (x, y)
// for the underground plus a 2D ground plane (x, z) for the surface. The
// renderer turns both into a 3D diorama.

export const TICK = 1 / 20;        // fixed simulation step, seconds
export const THINK_EVERY = 4;      // ants re-evaluate decisions every N ticks (staggered)
export const DAY = 360;            // simulation seconds per in-world day

// Underground grid (1 cell = 1 world unit)
export const W = 240;
export const H = 124;

// Surface plane behind the front glass: x in [0, W], z in [-SURF_D, 0]
export const SURF_D = 24;
export const TUNNEL_D = 2.4;       // how deep tunnels are carved into the front face
export const ENTRANCE_Z = -1.4;    // z of the nest entrance on the surface

// Cell types
export const AIR = 0;
export const TUNNEL = 1;
export const SOIL = 2;
export const CLAY = 3;
export const SAND = 4;
export const ROCK = 5;
export const ROOT = 6;
export const LOOSE = 7;            // collapsed / backfilled soil, easy to dig

// Capacities
export const MAX_ANTS = 2600;
export const MAX_ITEMS = 9000;
export const MAX_BROOD = 1600;

// Castes
export const MINOR = 0;
export const MAJOR = 1;
export const QUEEN = 2;

// Tasks
export const T_IDLE = 0;
export const T_FORAGE = 1;
export const T_DIG = 2;
export const T_NURSE = 3;
export const T_CLEAN = 4;
export const T_DEFEND = 5;
export const T_EAT = 6;
export const T_QUEEN = 7;
export const T_DEAD = 8;

export const TASK_NAMES = ['Resting', 'Forager', 'Excavator', 'Nurse', 'Cleaner', 'Defender', 'Feeding', 'Queen', 'Dead'];

// Item kinds
export const I_SEED = 0;
export const I_BERRY = 1;
export const I_PROTEIN = 2;
export const I_SUGAR = 3;
export const I_FRUIT = 4;
export const I_DIRT = 5;
export const I_CORPSE = 6;
export const I_HUSK = 7;
export const I_EGG = 8;     // only used as a "carried" visual
export const I_LARVA = 9;
export const I_PUPA = 10;

export const ITEM_NAMES = ['Seed', 'Berry chunk', 'Insect meat', 'Sugar drop', 'Fruit chunk', 'Soil pellet', 'Dead ant', 'Insect husk', 'Egg', 'Larva', 'Pupa'];
// [carbohydrate, protein] per item
export const ITEM_FOOD = [
  [1.0, 0.4], [1.4, 0.1], [0.2, 1.5], [1.6, 0], [1.4, 0.1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
];
export const isFood = (k) => k <= I_FRUIT;

// Item states
export const S_FREE = 0;
export const S_SURFACE = 1;
export const S_UNDER = 2;
export const S_CARRIED = 3;
export const S_STORED = 4;

// Chamber roles (bit flags)
export const R_QUEEN = 1;
export const R_BROOD = 2;
export const R_FOOD = 4;
export const R_WASTE = 8;
export const R_REST = 16;
export const ROLE_NAMES = { 1: 'Royal chamber', 2: 'Nursery', 4: 'Granary', 8: 'Refuse chamber', 16: 'Resting chamber' };

// Food source kinds (surface)
export const F_BERRY = 0;
export const F_FRUIT = 1;
export const F_INSECT = 2;
export const F_SUGAR = 3;
export const F_CARCASS = 4;   // large prey, dragged cooperatively
export const SOURCE_NAMES = ['Berry', 'Fallen fruit', 'Dead insect', 'Sugar droplet', 'Carcass'];
export const SOURCE_ITEM = [I_BERRY, I_FRUIT, I_PROTEIN, I_SUGAR, I_PROTEIN];
