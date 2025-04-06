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
    ICE_BLUE: '#8fd3ff', // Base Ice Platform
    LIGHT_ICE_BLUE: '#8ff8e2', // Middle Ice Platform
    BASE_PLATFORM_RED: '#e83b3b', // Base Normal Platform
    MIDDLE_PLATFORM_RED: '#f68181', // Middle Normal Platform
    BRIGHT_GREEN: '#1ebc73', // Added for Player
};

// --- Physics & Gameplay ---
export const PLAYER_SPEED = 5;
export const PLAYER_JUMP_POWER = 16;
export const PLAYER_GRAVITY = 1.1;
export const PLAYER_DASH_POWER = 15;
export const PLAYER_DASH_DURATION = 150;
export const PLAYER_DASH_COOLDOWN = 500;

export const PLATFORM_BASE_WIDTH = 100;
export const PLATFORM_HEIGHT = 15;
export const PLATFORM_MIDDLE_THRESHOLD = 0.2;
export const PLATFORM_DISAPPEAR_TIME = 3000;
export const PLATFORM_FADE_DURATION = 500;

export const MAX_LIVES = 3;

export const MIN_VERT_GAP = 80;
export const MAX_VERT_GAP = 150;

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