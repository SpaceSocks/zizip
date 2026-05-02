    // This file will define entity structures (player, platform)
    import {
        R64, PLAYER_SPEED, PLAYER_JUMP_POWER, PLAYER_GRAVITY,
        PLAYER_DASH_POWER, PLAYER_DASH_DURATION, PLAYER_DASH_COOLDOWN,
        PLATFORM_BASE_WIDTH, PLATFORM_HEIGHT, PLATFORM_MIDDLE_THRESHOLD,
        MOVING_PLATFORM_SPEED,
        PLATFORM_FLASH_INTERVAL_MAX
    } from './constants.js?v=mobile-portrait-54';

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
        baseGravity: PLAYER_GRAVITY,
        gravity: PLAYER_GRAVITY,
        dashPower: PLAYER_DASH_POWER,
        dashDuration: PLAYER_DASH_DURATION,
        dashCooldown: PLAYER_DASH_COOLDOWN,
        // State variables
        isGrounded: false,
        visible: true,
        currentFriction: 0.1,
        jumpsLeft: 2,
        isDashing: false,
        lastDashTime: 0,
        facing: 1,
        fallTumbleTime: 0,
        tumbleActive: false,
        tumbleAngle: 0,
        groundedOnPlatform: null // <<< NEW: Reference to the platform player is on
    };

    // --- Platform Creation ---
    let platformIdCounter = 0; // NEW: Counter for unique platform IDs

    // --- Platform Creation Function ---
    export function createPlatform(x, y, type = 'normal', width = PLATFORM_BASE_WIDTH, isStarting = false) { // Added isStarting parameter
        console.log(`createPlatform called: x=${x}, y=${y}, type=${type}, width=${width}, isStarting=${isStarting}`); // LOG PARAMETERS
        const friction = (type === 'ice') ? 0.01 : 0.1;
        let color, middleColor, movement = null; // Add movement property

        if (isStarting) {
            console.log('Applying STARTING platform colors.'); // LOG BRANCH
            color = R64.STARTING_BROWN;
            middleColor = R64.STARTING_BROWN; // Use same color for middle
        } else if (type === 'ice') {
            console.log('Applying ICE platform colors.'); // LOG BRANCH
            color = R64.ICE_BLUE;
            middleColor = R64.LIGHT_ICE_BLUE;
        } else if (type === 'moving') { // <<< ADD MOVING TYPE
            console.log('Applying MOVING platform colors.'); 
            color = R64.MOVING_PLATFORM_ORANGE;
            middleColor = R64.MOVING_PLATFORM_MIDDLE_ORANGE;
            
            // Randomly choose axis
            const axis = Math.random() < 0.5 ? 'x' : 'y'; 
            const range = (axis === 'x') ? 150 : 80; // Different range for x vs y? Adjust as needed

            console.log(`Moving platform axis: ${axis}, range: ${range}`);

            movement = {
                axis: axis, // <<< STORE AXIS
                direction: Math.random() < 0.5 ? 1 : -1, 
                speed: MOVING_PLATFORM_SPEED, 
                range: range
            };
        } else { // Normal platform
            console.log('Applying NORMAL (red) platform colors.'); // LOG BRANCH
            color = R64.BASE_PLATFORM_RED;
            middleColor = R64.MIDDLE_PLATFORM_RED;
        }

        const newId = platformIdCounter++; // Assign and increment ID

        console.log(`Assigned colors: color=${color}, middleColor=${middleColor}, ID=${newId}, Type=${type}`);

        return {
            id: newId,
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
            flashStartTime: null,
            isFlashing: false,
            flashVisible: true,
            lastFlashToggleTime: 0,
            flashInterval: PLATFORM_FLASH_INTERVAL_MAX,
            alpha: 1.0,
            movement: movement, // <<< ADD MOVEMENT PROPERTY
            originalX: x, // <<< STORE ORIGINAL X FOR MOVEMENT RANGE
            originalY: y, // <<< STORE ORIGINAL Y
            middleSection: {
                x: x + width * (0.5 - PLATFORM_MIDDLE_THRESHOLD / 2),
                width: width * PLATFORM_MIDDLE_THRESHOLD
            },
            remove: false // Flag for removal
        };
    }
