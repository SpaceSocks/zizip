// This file will hold game constants

// --- Resurrect 64 Palette ---
export const R64 = {
    DARK_PURPLE: '#2e222f',
    MED_PURPLE: '#3e3546',
    LIGHT_PURPLE: '#625565',
    DARK_BROWN_RED: '#6e2727',
    MED_BROWN_RED: '#966c6c',
    LIGHT_BROWN_RED: '#ab947a',
    STARTING_BROWN: '#ab947a', // Added for the starting platform
    DARK_PURPLE_ALT: '#694f62',
    MED_PURPLE_ALT: '#7f708a',
    LIGHT_GRAY_BLUE: '#9babb2',
    PALE_BLUE: '#c7dcd0',
    WHITE: '#ffffff',
    DARK_RED: '#ae2334',
    RED: '#e83b3b',
    ORANGE_RED: '#ea4f36',
    ORANGE: '#f57d4a',
    DARK_ORANGE: '#fb6b1d',
    YELLOW_ORANGE: '#f79617',
    YELLOW: '#f9c22b',
    PLAYER_BLUE: '#4d9be6',
    ICE_BLUE: '#a0d2eb', // Base Ice Platform
    LIGHT_ICE_BLUE: '#d0efff', // Middle Ice Platform
    BASE_PLATFORM_RED: '#e83b3b', // Base Normal Platform
    MIDDLE_PLATFORM_RED: '#f68181', // Middle Normal Platform
    BRIGHT_GREEN: '#34eb4f', // Added for Player
    MOVING_PLATFORM_ORANGE: '#f79617', // NEW
    MOVING_PLATFORM_MIDDLE_ORANGE: '#fbb954', // NEW
};

// --- Physics & Gameplay ---
export const PLAYER_SPEED = 5;
export const PLAYER_JUMP_POWER = 24;
export const PLAYER_GRAVITY = 1.1;
export const PLAYER_AIR_CONTROL_FACTOR = 0.08;

export const PLATFORM_BASE_WIDTH = 100;
export const PLATFORM_START_WIDTH = 160;
export const PLATFORM_EARLY_MIN_WIDTH = 118;
export const PLATFORM_MIN_WIDTH = 62;
export const PLATFORM_WIDTH_DIFFICULTY_HEIGHT = 2600;
export const PLATFORM_HEIGHT = 20;
export const PLATFORM_MIDDLE_THRESHOLD = 0.3;
export const MOVING_PLATFORM_SPEED = 80;

export const MAX_PERFECT_COMBO_MULTIPLIER = 5;

export const MAX_LIVES = 3;

export const MIN_VERT_GAP = 120;
export const MAX_VERT_GAP = 210;

// --- Graphics ---
export const NUM_STARS_VERTICAL = 100;
export const NUM_STARS_SLOW = 150;
export const NUM_STARS_MEDIUM = 75;
export const NUM_STARS_FAST = 25;

// --- Score Popups ---
export const SCORE_POPUP_LIFETIME = 750; // milliseconds
export const SCORE_POPUP_FADE_DURATION = 200; // Fade in/out time
export const SCORE_POPUP_SPEED = 1.5; // Pixels per frame upward movement

// --- Input ---
export const AXIS_DEADZONE = 0.2;

// Platform Type Probabilities (Ensure they add up correctly)
export const PLATFORM_PROBABILITY = {
    NORMAL: 0.75, // Reduced normal chance
    ICE: 0.10,
    MOVING: 0.15 // Added moving chance
    // Total should ideally be close to 1.0
};

// NEW Platform Warning/Removal Timings
export const PLATFORM_FLASH_START_DELAY = 3000; // ms after landing before flashing starts
export const PLATFORM_FLASH_DURATION = 2000; // ms duration of flashing before removal
export const PLATFORM_FLASH_INTERVAL_MAX = 300; // Initial ms between flashes (slow)
export const PLATFORM_FLASH_INTERVAL_MIN = 50;  // Final ms between flashes (fast)
