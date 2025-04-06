    // This file will define entity structures (player, platform)
    import { R64, PLAYER_SPEED, PLAYER_JUMP_POWER, PLAYER_GRAVITY, PLAYER_DASH_POWER, PLAYER_DASH_DURATION, PLAYER_DASH_COOLDOWN, PLATFORM_BASE_WIDTH, PLATFORM_HEIGHT, PLATFORM_MIDDLE_THRESHOLD } from './constants.js';

    // --- Player Definition ---
    export const player = {
        x: 0, // Initial position set in game.js startGame
        y: 0,
        width: 20,
        height: 40,
        color: R64.BRIGHT_GREEN, // Player color
        velocityY: 0,
        velocityX: 0,
        // Constants assigned from import
        speed: PLAYER_SPEED,
        jumpPower: PLAYER_JUMP_POWER,
        gravity: PLAYER_GRAVITY,
        dashPower: PLAYER_DASH_POWER,
        dashDuration: PLAYER_DASH_DURATION,
        dashCooldown: PLAYER_DASH_COOLDOWN,
        // State variables
        isGrounded: false,
        currentFriction: 0.1,
        jumpsLeft: 2,
        isDashing: false,
        lastDashTime: 0
    };

    // --- Platform Creation Function ---
    export function createPlatform(x, y, type = 'normal', width = PLATFORM_BASE_WIDTH, isStarting = false) { // Added isStarting parameter
        console.log(`createPlatform called: x=${x}, y=${y}, type=${type}, width=${width}, isStarting=${isStarting}`); // LOG PARAMETERS
        const friction = (type === 'ice') ? 0.01 : 0.1;
        let color, middleColor;

        if (isStarting) {
            console.log('Applying STARTING platform colors.'); // LOG BRANCH
            color = R64.STARTING_BROWN;
            middleColor = R64.STARTING_BROWN; // Use same color for middle
        } else if (type === 'ice') {
            console.log('Applying ICE platform colors.'); // LOG BRANCH
            color = R64.ICE_BLUE;
            middleColor = R64.LIGHT_ICE_BLUE;
        } else { // Normal platform
            console.log('Applying NORMAL (red) platform colors.'); // LOG BRANCH
            color = R64.BASE_PLATFORM_RED;
            middleColor = R64.MIDDLE_PLATFORM_RED;
        }

        console.log(`Assigned colors: color=${color}, middleColor=${middleColor}`); // LOG ASSIGNED COLORS

        return {
            x: x,
            y: y,
            width: width,
            height: PLATFORM_HEIGHT,
            type: type,
            isStartingPlatform: isStarting, // Store the flag
            friction: friction,
            color: color,
            middleColor: middleColor,
            landedOn: false,
            isDisappearing: false,
            disappearStartTime: null,
            fadeStartTime: null,
            alpha: 1.0,
            middleSection: {
                x: x + width * (0.5 - PLATFORM_MIDDLE_THRESHOLD / 2),
                width: width * PLATFORM_MIDDLE_THRESHOLD
            },
            remove: false // Flag for removal
        };
    }