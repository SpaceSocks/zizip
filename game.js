import * as state from './state.js';
import * as graphics from './graphics.js';
import * as input from './input.js';
import * as audio from './audio.js';
import { player, createPlatform } from './entities.js';
import * as ui from './ui.js'; // Import UI
import {
    MIN_VERT_GAP, MAX_VERT_GAP, PLATFORM_BASE_WIDTH,
    PLAYER_GRAVITY, PLAYER_JUMP_POWER, PLAYER_SPEED,
    SCORE_POPUP_LIFETIME, SCORE_POPUP_FADE_DURATION, SCORE_POPUP_SPEED,
    PLATFORM_PROBABILITY, PLATFORM_MIDDLE_THRESHOLD,
    PLATFORM_FLASH_DURATION, PLATFORM_FLASH_INTERVAL_MAX, PLATFORM_FLASH_INTERVAL_MIN,
    PLATFORM_FLASH_START_DELAY, PLAYER_AIR_CONTROL_FACTOR
} from './constants.js';

// DEBUG: Verify state import
console.log("Imported state object:", state);

// --- Game Variables ---
let animationFrameId = null;
let lastTimestamp = 0; // Track last timestamp for delta time

// Add trail properties to the player object upon load
player.trailPositions = []; 
player.maxTrailLength = 5; // Number of ghost images
player.trailUpdateCounter = 0;
player.trailUpdateFrequency = 2; // Update trail every N frames

// --- Main Update Function ---
function update(dt) {
    if (state.getCurrentGameState() !== state.GameState.Playing) return;
    
    state.updateElapsedTime();
    const now = Date.now();
    const difficulty = state.getDifficultyFactor(); 
    const platforms = state.getPlatforms();

    // --- 1. Update ALL Platform Positions ---
    platforms.forEach((platform) => {
        platform.previousY = platform.y; // <<< STORE PREVIOUS Y

        let platformDeltaX = 0;
        let platformDeltaY = 0;
        if (platform.movement) {
            const move = platform.movement.speed * dt;
            if (platform.movement.axis === 'x') {
                platformDeltaX = platform.movement.direction * move;
                platform.x += platformDeltaX;
                
                // Check range relative to originalX first
                if (platform.x > platform.originalX + platform.movement.range || platform.x < platform.originalX - platform.movement.range) {
                    platform.movement.direction *= -1;
                    // Clamp position relative to range
                    platform.x = Math.max(platform.originalX - platform.movement.range, Math.min(platform.x, platform.originalX + platform.movement.range)); 
                    platformDeltaX = 0; // No delta if clamped this way for range
                }

                // >>> NEW: Check screen boundaries AFTER range check <<<
                if (platform.x <= 0) {
                    platform.x = 0; // Clamp to left edge
                    if (platform.movement.direction === -1) { // If moving left...
                        platform.movement.direction = 1; // Bounce right
                        console.log(`Platform ${platform.id} hit left edge, bouncing right.`);
                    }
                    platformDeltaX = 0; // No delta if hit edge
                } else if (platform.x + platform.width >= graphics.canvas.width) {
                    platform.x = graphics.canvas.width - platform.width; // Clamp to right edge
                    if (platform.movement.direction === 1) { // If moving right...
                        platform.movement.direction = -1; // Bounce left
                        console.log(`Platform ${platform.id} hit right edge, bouncing left.`);
                    }
                    platformDeltaX = 0; // No delta if hit edge
                }
                
                platform.middleSection.x = platform.x + platform.width * (0.5 - PLATFORM_MIDDLE_THRESHOLD / 2);
            } else { // Axis 'y'
                platformDeltaY = platform.movement.direction * move;
                platform.y += platformDeltaY;
                // Clamp Y
                if (platform.y > platform.originalY + platform.movement.range || platform.y < platform.originalY - platform.movement.range) {
                    platform.movement.direction *= -1;
                    platform.y = Math.max(platform.originalY - platform.movement.range, Math.min(platform.y, platform.originalY + platform.movement.range));
                    platformDeltaY = 0;
                }
            }
        }
        platform.deltaXThisFrame = platformDeltaX;
        platform.deltaYThisFrame = platformDeltaY;
    });

    // --- 2. Player Vertical Movement & Collision ---
    const wasGrounded = player.isGrounded;
    let landedOnMiddle = false;
    player.isGrounded = false; // Assume not grounded this frame
    let currentLandingPlatform = null; // Platform landed on *this* frame
    
    // Apply vertical movement from the platform the player *was* on
    if (player.groundedOnPlatform) {
        const deltaYToApply = player.groundedOnPlatform.deltaYThisFrame || 0;
        player.y += deltaYToApply;
        if (deltaYToApply !== 0) console.log(`Applying prev platform Y delta ${deltaYToApply.toFixed(2)} to player Y from platform ${player.groundedOnPlatform.id}`);
    }
    
    // Apply gravity (only if not dashing)
    if (!player.isDashing) {
        player.velocityY += player.gravity * dt * 60;
    }
    let previousY = player.y; // Store Y before applying velocity
    player.y += player.velocityY * dt * 60; // Apply player's vertical velocity

    // Collision Check Loop
    platforms.forEach((platform) => {
        // Update platform flashing state (can happen regardless of collision)
        if (platform.landedOn && !platform.isStartingPlatform) {
            // --- Start Flashing Check ---
            if (platform.disappearStartTime && !platform.isFlashing) { 
                if (now >= platform.disappearStartTime) {
                    console.log(`Platform ${platform.id} starting to flash.`);
                    platform.isFlashing = true;
                    platform.flashStartTime = now;
                    platform.lastFlashToggleTime = now;
                    platform.flashVisible = true; // Start visible
                }
            }

            // --- Flashing Update ---
            if (platform.isFlashing) {
                const elapsedFlashTime = now - platform.flashStartTime;

                // Check if flashing duration is over
                if (elapsedFlashTime >= PLATFORM_FLASH_DURATION) {
                    console.log(`Platform ${platform.id} flashing complete, marking for removal.`);
                    platform.remove = true; // Mark for removal
                    platform.isFlashing = false; // Stop flashing state
                } else {
                    // Calculate current flash interval (linear interpolation)
                    const flashProgress = elapsedFlashTime / PLATFORM_FLASH_DURATION;
                    platform.flashInterval = PLATFORM_FLASH_INTERVAL_MAX - 
                                              (PLATFORM_FLASH_INTERVAL_MAX - PLATFORM_FLASH_INTERVAL_MIN) * flashProgress;
                    
                    // Toggle visibility based on interval
                    if (now - platform.lastFlashToggleTime >= platform.flashInterval) {
                        platform.flashVisible = !platform.flashVisible;
                        platform.lastFlashToggleTime = now;
                        // console.log(`Plat ${platform.id} flash interval: ${platform.flashInterval.toFixed(0)}, visible: ${platform.flashVisible}`); // DEBUG
                    }
                }
            }
        }
        
        // --- Grounding Maintenance Check (NEW) ---
        // If player was grounded on THIS platform last frame, check if they are still basically on it
        if (player.groundedOnPlatform === platform) { // Check using reference from previous frame
            const verticalTolerance = 2; // Allow small vertical gap
            // Check horizontal overlap AND vertical proximity
            if (player.x < platform.x + platform.width &&
                player.x + player.width > platform.x &&
                Math.abs((player.y + player.height) - platform.y) <= verticalTolerance) 
            {
                // Maintain grounded state on this platform
                // console.log(`Maintaining ground on platform ${platform.id}`); // DEBUG
                player.isGrounded = true; // Force grounded state
                player.y = platform.y - player.height; // Re-snap position
                player.velocityY = 0; // Reset velocity
                currentLandingPlatform = platform; // Mark this as the platform for this frame
                // Don't reset jumps here, only on initial landing
            }
        }

        // --- Initial Landing Collision Check ---
        // Only run this if the grounding maintenance didn't already confirm grounding
        if (!player.isGrounded || currentLandingPlatform !== platform) { 
            const playerBottom = player.y + player.height;
            const prevPlayerBottom = previousY + player.height; 
            
            if (!platform.isDisappearing &&
                player.x < platform.x + platform.width &&    
                player.x + player.width > platform.x &&
                playerBottom >= platform.y &&               
                prevPlayerBottom <= (platform.previousY ?? platform.y) && 
                player.velocityY >= 0) {                   
                
                // INITIAL LANDING OCCURRED
                console.log(`Initial landing detected on platform ${platform.id}`);
                player.y = platform.y - player.height;
                player.velocityY = 0;
                player.isGrounded = true;
                player.jumpsLeft = 2; // Reset jumps ONLY on initial landing
                player.currentFriction = platform.friction;
                currentLandingPlatform = platform; // Store the platform landed on THIS frame

                // Scoring, Spawning, etc. (only on first landing)
                if (!platform.landedOn) {
                    platform.landedOn = true;
                    state.setLastLandedPlatformId(platform.id);
                    if (!platform.isStartingPlatform) {
                        // SET TIMER FOR FLASH START
                        platform.disappearStartTime = Date.now() + PLATFORM_FLASH_START_DELAY; 
                        // Calculate score
                        const playerCenterX = player.x + player.width / 2;
                        let scoreAwarded = 10;
                        if (playerCenterX >= platform.middleSection.x && playerCenterX <= platform.middleSection.x + platform.middleSection.width) {
                            scoreAwarded = (platform.type === 'moving') ? 25 : 20;
                            landedOnMiddle = true;
                        }
                        state.setScore(state.getScore() + scoreAwarded);
                        state.addScorePopup({
                            x: player.x + player.width / 2, // Start at player center
                            y: player.y - 5, // Start slightly above player
                            text: `+${scoreAwarded}`,
                            creationTime: now,
                            alpha: 0 // Start invisible, fade in
                        });
                    }
                    // Spawn next platform check
                    let isHighest = true;
                    for(let p of platforms) {
                        if (!p.landedOn && p.y < platform.y) {
                            isHighest = false;
                            break;
                        }
                    }
                    if(isHighest) {
                        spawnNewPlatform(platform);
                    }
                }
            } // End Initial Landing Check
        } // End check if already grounded on this plat
    }); // End platforms.forEach
    
    // Update player's grounded platform reference for NEXT frame
    player.groundedOnPlatform = currentLandingPlatform; 

    // Play landing sound
    if (player.isGrounded && !wasGrounded) {
        audio.playLandingSound(landedOnMiddle);
    }

    // --- 4. Player Horizontal Movement (AFTER collision/ground check) --- 
    let targetVelocityX = 0;
    
    // Set correct friction based on CURRENT grounded state
    if (player.isGrounded) {
        // If grounded, friction was set during collision by the platform.
        // We rely on `player.currentFriction` having been set correctly in the collision loop.
    } else {
        // Use air control factor if not grounded
        player.currentFriction = PLAYER_AIR_CONTROL_FACTOR; 
        // console.log("Using air control factor"); // DEBUG
    }
    
    if (!player.isDashing) {
        // Input velocity
        if (input.keys.left) { targetVelocityX = -player.speed; }
        else if (input.keys.right) { targetVelocityX = player.speed; }
        
        // Apply friction/acceleration using the correct currentFriction
        // console.log(`Applying friction: ${player.currentFriction}`); // DEBUG
        if (player.velocityX < targetVelocityX) {
            player.velocityX = Math.min(player.velocityX + player.currentFriction * player.speed, targetVelocityX); 
        } else if (player.velocityX > targetVelocityX) {
            player.velocityX = Math.max(player.velocityX - player.currentFriction * player.speed, targetVelocityX); 
        }
    }
    
    // Apply player's own horizontal velocity
    player.x += player.velocityX * dt * 60;
    
    // Apply horizontal carrying from the platform the player *was* on
    if (player.groundedOnPlatform) { // Check ref from prev frame for carrying
        const deltaXToAdd = player.groundedOnPlatform.deltaXThisFrame || 0;
        player.x += deltaXToAdd;
    }

    // --- 5. Post-Movement Updates & Checks --- 
    // Update Score Popups
    state.filterScorePopups(popup => {
        const age = now - popup.creationTime;
        if (age > SCORE_POPUP_LIFETIME) {
            return false; // Remove expired popups
        }
        // Update position (Scale by dt)
        popup.y -= SCORE_POPUP_SPEED * dt * 60;
        // Update alpha (fade in, stay, fade out)
        if (age < SCORE_POPUP_FADE_DURATION) {
            // Fade in
            popup.alpha = age / SCORE_POPUP_FADE_DURATION;
        } else if (age > SCORE_POPUP_LIFETIME - SCORE_POPUP_FADE_DURATION) {
            // Fade out
            popup.alpha = (SCORE_POPUP_LIFETIME - age) / SCORE_POPUP_FADE_DURATION;
        } else {
            // Stay fully visible
            popup.alpha = 1.0;
        }
        return true;
    });

    // Remove faded platforms
    state.filterPlatforms(platform => !platform.remove);

    // Boundary checks
    if (player.x < 0) {
        player.x = 0;
        if (!player.isDashing) player.velocityX = 0;
    }
    if (player.x + player.width > graphics.canvas.width) {
        player.x = graphics.canvas.width - player.width;
        if (!player.isDashing) player.velocityX = 0;
    }

    // Camera/Scrolling & Height Update 
    let cameraOffset = 0;
    const cameraThreshold = graphics.canvas.height * 0.4;
    if (player.y < cameraThreshold) {
        cameraOffset = cameraThreshold - player.y;
        player.y = cameraThreshold;
        platforms.forEach(platform => {
            platform.y += cameraOffset;
            // Also adjust originalY for vertically moving platforms
            if (platform.movement && platform.movement.axis === 'y') {
                platform.originalY += cameraOffset;
            }
        });
        const currentMaxH = state.getMaxHeight(); 
        state.setMaxHeight(currentMaxH + (cameraOffset / 10));
    }
    graphics.updateStarsVertical(cameraOffset);

    // Remove off-screen platforms
    state.filterPlatforms(platform => platform.y < graphics.canvas.height + 50);

    // Update High Scores 
    const newHeight = state.getMaxHeight();
    if (newHeight > state.getHighestHeight()) {
        state.setHighestHeight(newHeight);
    }
    const newScore = state.getScore();
    if (newScore > state.getTopScore()) {
        state.setTopScore(newScore);
    }

    // --- Update Player Trail ---
    player.trailUpdateCounter++;
    if (player.trailUpdateCounter >= player.trailUpdateFrequency) {
        player.trailUpdateCounter = 0;
        // Add current position to the start of the trail
        player.trailPositions.unshift({ x: player.x, y: player.y });
        // Limit trail length
        if (player.trailPositions.length > player.maxTrailLength) {
            player.trailPositions.pop(); // Remove the oldest position
        }
    }
    
    // Fall detection 
    if (player.y > graphics.canvas.height + player.height) {
        console.log("Fall detected!");
        state.loseLife(); // Call loseLife from state

        if (state.getLives() > 0) {
            respawnPlayer(); // Instead of resetting, call respawn
        } else {
            handleGameOver(); // Trigger game over if no lives left
        }
    }
}

// --- Game Over Handler ---
function handleGameOver() {
    console.log("Game Over triggered!");
    const finalScore = state.getScore();
    const finalHeight = state.getMaxHeight();
    const finalTimeMs = state.getElapsedTime(); // Get time in MS
    const formattedTime = graphics.formatTime(finalTimeMs, false); // <<< FORMAT TIME (MM:SS)

    // Add entry to leaderboard state
    const playerName = state.getDisplayName() || 'Player';
    // Pass the formatted time string to the leaderboard entry function
    state.addLeaderboardEntry(playerName, finalScore, finalHeight, formattedTime);

    // Play game over sound
    // audio.playGameOverSound(); // <<< COMMENTED OUT FOR NOW
    audio.pauseMusic();

    // Update Game State
    state.setCurrentGameState(state.GameState.GameOver);

    // Show Game Over UI elements
    ui.showGameOverControls();
    ui.setupGameOverFocus();

    // --- NO LONGER NEEDED WITH LOCAL LEADERBOARD ---
    // // Get player ID for PlayFab
    // const playerId = state.getPlayerInfo().uid;
    // if (playerId) {
    //     console.log(`Submitting score for player ID: ${playerId}`);
    //     // Submit score to PlayFab
    //     playfab.submitScore(finalScore, (response) => {
    //         console.log('PlayFab Score Submitted:', response);
    //         // Fetch leaderboard after submitting
    //         graphics.fetchLeaderboardData(); 
    //     }, (error) => {
    //         console.error('PlayFab Score Submission Error:', error);
    //         graphics.setLeaderboardError('Failed to submit score.');
    //         graphics.fetchLeaderboardData(); // Still try to fetch leaderboard
    //     });
    // } else {
    //     console.warn('Cannot submit score, player ID not found.');
    //     // Fetch leaderboard even if submission fails/skipped
    //     graphics.fetchLeaderboardData(); 
    // }
}

// --- Platform Spawning ---
function spawnNewPlatform(basePlatform) {
    // Determine type based on probabilities
    let platformType = 'normal';
    const rand = Math.random();
    let cumulativeProb = 0;

    if (rand < (cumulativeProb += PLATFORM_PROBABILITY.NORMAL)) {
        platformType = 'normal';
    } else if (rand < (cumulativeProb += PLATFORM_PROBABILITY.ICE)) {
        platformType = 'ice';
    } else if (rand < (cumulativeProb += PLATFORM_PROBABILITY.MOVING)) {
        platformType = 'moving';
    } 
    // Add more types here if needed
    
    console.log(`Spawning new platform of type: ${platformType} (rand: ${rand.toFixed(2)}) based on platform ${basePlatform.id}`);

    // Vertical position calculation (remains the same)
    const screenHeight = graphics.canvas.height;
    const yOffset = 150 + Math.random() * 100; 
    const newY = basePlatform.y - yOffset;

    // Horizontal position calculation WITH overlap check
    let newX;
    let horizontalOverlap = true;
    let attempts = 0;
    const MAX_SPAWN_ATTEMPTS = 10; // Prevent infinite loops
    const newWidth = PLATFORM_BASE_WIDTH; // Assuming fixed width for now
    const padding = 50;
    const existingPlatforms = state.getPlatforms(); // Get current platforms

    while (horizontalOverlap && attempts < MAX_SPAWN_ATTEMPTS) {
        attempts++;
        horizontalOverlap = false; // Assume no overlap for this attempt

        // Calculate potential X (Increase range significantly)
        const HORIZONTAL_SPAWN_RANGE = 800; // Increased from 400
        newX = basePlatform.x + (Math.random() - 0.5) * HORIZONTAL_SPAWN_RANGE;
        
        // Clamp X within screen bounds (Keep this clamping)
        newX = Math.max(padding, Math.min(newX, graphics.canvas.width - newWidth - padding));

        // Check against existing platforms BELOW the new one
        for (const existingPlatform of existingPlatforms) {
            // Only check platforms visually below the new one (optional, but makes sense)
             if (existingPlatform.y > newY) { 
                // Check for horizontal overlap
                const overlaps = (newX < existingPlatform.x + existingPlatform.width && 
                                  newX + newWidth > existingPlatform.x);
                if (overlaps) {
                    console.log(`Spawn attempt ${attempts}: Proposed X ${newX.toFixed(0)} overlaps with existing platform ${existingPlatform.id} at X ${existingPlatform.x.toFixed(0)}. Retrying.`);
                    horizontalOverlap = true;
                    break; // No need to check other platforms for this attempt
                }
             }
        }
    } // End while loop

    if (attempts >= MAX_SPAWN_ATTEMPTS) {
        console.warn(`Max spawn attempts reached for platform based on ${basePlatform.id}. Placing at last calculated X: ${newX.toFixed(0)}`);
    }

    // Create the platform with the validated/final newX
    console.log(`Final spawn position: X=${newX.toFixed(0)}, Y=${newY.toFixed(0)}`);
    const newPlatform = createPlatform(newX, newY, platformType, newWidth); // Pass width too
    state.addPlatform(newPlatform);
}

// --- Reset Player State ---
function resetPlayerState() {
    console.log("Resetting player object state...");
    // Reset properties of the imported player object
    const startX = graphics.canvas.width / 2 - player.width / 2;
    const startY = graphics.canvas.height - 100; // Calculate start Y
    player.x = startX;
    player.y = startY;
    state.setInitialPlayerY(startY); // <<< STORE INITIAL Y HERE
    player.velocityY = 0;
    player.velocityX = 0;
    player.jumpsLeft = 2;
    player.isGrounded = false;
    player.isDashing = false;
    player.lastDashTime = 0;
    player.gravity = PLAYER_GRAVITY; // Ensure gravity is reset if it changes
    player.speed = PLAYER_SPEED; // Ensure speed is reset if it changes

    // Clear platforms and add a new starting one
    state.setPlatforms([createPlatform(
        graphics.canvas.width / 2 - PLATFORM_BASE_WIDTH / 2, 
        graphics.canvas.height - 50,
        'normal', // type
        PLATFORM_BASE_WIDTH, // width
        true // isStarting = true
    )]);
}

// --- Player Respawn Function (REVISED) ---
function respawnPlayer() {
    console.log("Respawning player...");
    const targetPlatformId = state.getLastLandedPlatformId();
    let respawnPlatform = null;
    const platforms = state.getPlatforms();

    console.log(`Attempting to respawn on targetPlatformId: ${targetPlatformId}`);

    // 1. Try to find the exact last landed platform
    if (targetPlatformId !== null) {
        respawnPlatform = platforms.find(p => p.id === targetPlatformId && !p.remove);
    }

    // 2. Fallback: If exact match not found or removed, find highest *landed on* platform
    if (!respawnPlatform) {
        console.warn(`Target platform ${targetPlatformId} not found/available. Falling back to highest landed platform.`);
        let highestLandedY = Infinity;
        platforms.forEach(p => {
            if (p.landedOn && !p.remove && p.y < highestLandedY) {
                highestLandedY = p.y;
                respawnPlatform = p;
            }
        });
    }
    
    // 3. Final Fallback: If still no platform, find the highest overall platform (usually starting platform)
    if (!respawnPlatform) {
        console.warn(`No landed platform found. Falling back to highest overall platform.`);
        let highestY = Infinity;
        platforms.forEach(p => {
            if (!p.remove && p.y < highestY) {
                highestY = p.y;
                respawnPlatform = p;
            }
        });
    }

    if (respawnPlatform) {
        console.log(`SUCCESS: Chosen respawn platform ID: ${respawnPlatform.id} at y=${respawnPlatform.y.toFixed(0)}`);
        // Restore the platform if it was fading/gone
        respawnPlatform.isDisappearing = false;
        respawnPlatform.disappearStartTime = null;
        respawnPlatform.fadeStartTime = null;
        respawnPlatform.alpha = 1.0;
        respawnPlatform.remove = false; 

        // Reset player state and position
        player.x = respawnPlatform.x + (respawnPlatform.width / 2) - (player.width / 2); 
        player.y = respawnPlatform.y - player.height - 1; // Place just slightly above
        player.velocityY = 0;
        player.velocityX = 0;
        player.isGrounded = false; 
        player.jumpsLeft = 2;
        player.isDashing = false;
        player.gravity = PLAYER_GRAVITY;
        state.setCurrentGameState(state.GameState.Playing); 
        audio.restoreMusicVolume(); 

    } else {
        console.error("CRITICAL: Could not find any platform to respawn on! Triggering Game Over.");
        handleGameOver();
    }
}

// --- Game Loop ---
function gameLoop(timestamp) {
    if (!lastTimestamp) {
        lastTimestamp = timestamp;
    }
    const dt = (timestamp - lastTimestamp) / 1000.0; // Delta time in seconds
    lastTimestamp = timestamp;

    // Always handle gamepad input
    input.handleGamepadInput();

    // Update game state based on current status
    const currentState = state.getCurrentGameState();
    if (currentState === state.GameState.Playing) {
        update(dt); // Pass dt to update
    } else if (currentState === state.GameState.GameOver || currentState === state.GameState.Paused) {
        // Still update horizontal stars in game over or paused
        graphics.updateStarsHorizontal(); 
    }

    // Always draw (draw handles showing different states)
    graphics.draw(player); // <<< PASS PLAYER OBJECT

    animationFrameId = requestAnimationFrame(gameLoop); // Store the ID
}

// --- Initial Game Logic Setup (Called by UI) ---
export function startGame() {
    console.log("Attempting to start game...");
    if (state.getCurrentGameState() === state.GameState.Playing) {
        console.warn("Game already running.");
        return;
    }

    ui.hideLoginScreen();
    state.resetGameStats();
    // INSTEAD of: player = new Player(...);
    // We just reset the state of the existing imported player object:
    resetPlayerState();
    // initializePlatforms(); // This seems redundant now as resetPlayerState creates the first platform
    state.setCurrentGameState(state.GameState.Playing);
    console.log("Game state set to Playing, starting music and loop.");

    audio.startMusic();
    // Reset timestamp for dt calculation
    lastTimestamp = 0; 
    // Only start loop if not already running
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// --- Main Initialization (Runs on script load) ---
function mainInit() {
    console.log("Main Initialization...");
    graphics.resizeCanvas(); // Resize canvas first
    window.addEventListener('resize', graphics.resizeCanvas);

    audio.setupAudioPlayers(); // Setup audio elements and listeners
    
    // Attempt initial audio unlock/start immediately
    // User interaction might still be needed, but try anyway
    audio.initializeAudio(); 

    ui.initializeUI(); // Shows main menu, sets up auth listeners
    input.initializeInput(); // Sets up key/gamepad listeners (also calls initializeAudio)

    console.log("Initialization complete. Waiting for user to start.");
    // Game loop is started by startGameLogic after login/retry
    // requestAnimationFrame(gameLoop); // REMOVE - Don't start game loop here
}

mainInit(); 