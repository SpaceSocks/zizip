import * as state from './state.js';
import * as graphics from './graphics.js';
import * as input from './input.js';
import * as audio from './audio.js';
import { player, createPlatform } from './entities.js';
import * as ui from './ui.js'; // Import UI
import {
    MIN_VERT_GAP, MAX_VERT_GAP, PLATFORM_BASE_WIDTH,
    PLATFORM_DISAPPEAR_TIME, PLATFORM_FADE_DURATION,
    PLAYER_GRAVITY, PLAYER_JUMP_POWER, PLAYER_SPEED,
    SCORE_POPUP_LIFETIME, SCORE_POPUP_FADE_DURATION, SCORE_POPUP_SPEED
} from './constants.js';

// --- Game Variables ---
let animationFrameId = null;
let lastTimestamp = 0; // Track last timestamp for delta time

// --- Main Update Function ---
function update(dt) { // Accept dt as parameter
    // Only run gameplay logic updates if in Playing state
    if (state.getCurrentGameState() === state.GameState.Playing) {
        // Update Timer
        state.updateElapsedTime();

        // Difficulty Scaling
        const currentMaxHeight = state.getMaxHeight();
        const difficulty = Math.min(currentMaxHeight / 5000, 0.5);
        state.setDifficultyFactor(difficulty);

        // --- Player Horizontal Movement ---
        let targetVelocityX = 0;
        if (!player.isDashing) {
            if (input.keys.left) {
                targetVelocityX = -player.speed;
            } else if (input.keys.right) {
                targetVelocityX = player.speed;
            }
            // Apply friction / acceleration (Scale by dt? Maybe not for friction/accel)
            // Let's keep acceleration frame-based for now, adjust base speed later if needed
            if (player.velocityX < targetVelocityX) {
                player.velocityX = Math.min(player.velocityX + player.currentFriction * player.speed, targetVelocityX);
            } else if (player.velocityX > targetVelocityX) {
                player.velocityX = Math.max(player.velocityX - player.currentFriction * player.speed, targetVelocityX);
            }
            player.x += player.velocityX * dt * 60; // Scale position change by dt (normalize to 60fps)
        } else {
            player.x += player.velocityX * dt * 60; // Scale dash movement by dt
        }

        // --- Player Vertical Movement & State Reset ---
        const wasGrounded = player.isGrounded;
        player.isGrounded = false;
        if (!player.isDashing) {
            player.velocityY += player.gravity * dt * 60; // Scale gravity by dt
        }
        let previousY = player.y;
        player.y += player.velocityY * dt * 60; // Scale position change by dt
        player.currentFriction = 0.1;

        // --- Platform Update and Collision ---
        let highestPlatformY = graphics.canvas.height;
        const now = Date.now();
        let platforms = state.getPlatforms(); // Get current platforms
        let landedOnMiddle = false; // Flag to check for middle landing SFX

        platforms.forEach((platform) => {
            // Platform Disappearance Timer Logic
            if (state.getCurrentGameState() === state.GameState.Playing) {
                // Platform Disappearance Trigger
                if (platform.disappearStartTime && !platform.isDisappearing) {
                    if (now >= platform.disappearStartTime) {
                        platform.isDisappearing = true;
                        platform.fadeStartTime = now; // <<< SET FADE START TIME HERE
                        console.log(`Platform ${platform.id} starting to disappear at ${now.toFixed(0)}`);
                    }
                }
                // Platform Fading Calculation
                if (platform.isDisappearing) {
                    // Use the fadeStartTime for accurate alpha calculation
                    const timeElapsedSinceFadeStart = now - (platform.fadeStartTime || platform.disappearStartTime); // Fallback just in case
                    platform.alpha = Math.max(0, 1 - (PLATFORM_FADE_DURATION ? (timeElapsedSinceFadeStart / PLATFORM_FADE_DURATION) : 0)); 
                    if (platform.alpha <= 0) {
                        platform.remove = true;
                    }
                }
            }

            // Collision check
            const playerBottom = player.y + player.height;
            const prevPlayerBottom = previousY + player.height;

            if (!platform.isDisappearing &&
                player.x < platform.x + platform.width &&
                player.x + player.width > platform.x &&
                playerBottom >= platform.y &&
                prevPlayerBottom <= platform.y &&
                player.velocityY >= 0) {

                player.y = platform.y - player.height;
                player.velocityY = 0;
                player.isGrounded = true;
                player.jumpsLeft = 2;
                player.currentFriction = platform.friction;

                // Score, Disappear Timer, Spawn Next, Create Score Popup
                if (!platform.landedOn) {
                    platform.landedOn = true; // Mark as landed on immediately
                    
                    // --- Only perform scoring/disappearing/popup on NON-starting platforms ---
                    if (!platform.isStartingPlatform) {
                        // Set disappear timer
                        const disappearDelay = PLATFORM_DISAPPEAR_TIME * (1 - difficulty * 0.5);
                        platform.disappearStartTime = now + disappearDelay;

                        // Calculate score
                        const playerCenterX = player.x + player.width / 2;
                        let scoreAwarded = 10;
                        if (playerCenterX >= platform.middleSection.x &&
                            playerCenterX <= platform.middleSection.x + platform.middleSection.width) {
                            scoreAwarded = 20;
                            landedOnMiddle = true; // Set flag for SFX
                        }
                        state.setScore(state.getScore() + scoreAwarded);

                        // Create Score Popup
                        state.addScorePopup({
                            x: player.x + player.width / 2, // Start at player center
                            y: player.y - 5, // Start slightly above player
                            text: `+${scoreAwarded}`,
                            creationTime: now,
                            alpha: 0 // Start invisible, fade in
                        });
                    } // --- End if (!platform.isStartingPlatform) ---

                    // --- Spawn next platform (check happens for ALL platforms landed on first time) ---
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
            }
            if(platform.y < highestPlatformY && !platform.isDisappearing) {
                highestPlatformY = platform.y;
            }
        });

        // Play landing sound (AFTER checking all platforms)
        if (player.isGrounded && !wasGrounded) {
            // console.log("Landing detected! Requesting landing sound.");
            audio.playLandingSound(landedOnMiddle); // Pass middle flag
        }

        // --- Update Score Popups ---
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

        // --- Remove faded platforms ---
        state.filterPlatforms(platform => !platform.remove);

        // --- Boundary checks ---
        if (player.x < 0) {
            player.x = 0;
            if (!player.isDashing) player.velocityX = 0;
        }
        if (player.x + player.width > graphics.canvas.width) {
            player.x = graphics.canvas.width - player.width;
            if (!player.isDashing) player.velocityX = 0;
        }

        // --- Camera/Scrolling & Height Update ---
        let cameraOffset = 0;
        const cameraThreshold = graphics.canvas.height * 0.4;
        if (player.y < cameraThreshold) {
            cameraOffset = cameraThreshold - player.y;
            player.y = cameraThreshold;
            state.getPlatforms().forEach(platform => {
                platform.y += cameraOffset;
            });
            const currentMaxH = state.getMaxHeight(); // Use different var name
            state.setMaxHeight(currentMaxH + (cameraOffset / 10));
        }
        // Move star vertical update here, linked to camera
        graphics.updateStarsVertical(cameraOffset);

        // --- Remove off-screen platforms ---
        state.filterPlatforms(platform => platform.y < graphics.canvas.height + 50);

        // --- Update High Scores (using local storage for now) ---
        const newHeight = state.getMaxHeight();
        if (newHeight > state.getHighestHeight()) {
            state.setHighestHeight(newHeight);
        }
        const newScore = state.getScore();
        if (newScore > state.getTopScore()) {
            state.setTopScore(newScore);
        }

        // --- Fall detection (Game Over - Reinstate Lives Logic) ---
        if (player.y > graphics.canvas.height + player.height) {
            console.log("Fall detected!");
            state.loseLife(); // Call loseLife from state

            if (state.getLives() > 0) {
                resetPlayerState(); // Only reset player if lives remain
            } else {
                handleGameOver(); // Trigger game over if no lives left
            }
        }
    } // End of if (state is Playing)

    // --- Updates that run even when paused or game over ---
    // Update horizontal stars regardless of playing state for background movement
    graphics.updateStarsHorizontal();
} // End of update()

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

// --- Spawn New Platform ---
function spawnNewPlatform(previousPlatform) {
    const difficulty = state.getDifficultyFactor();
    // Vertical positioning
    const vertGapRange = MAX_VERT_GAP - MIN_VERT_GAP;
    const scaledMinGap = MIN_VERT_GAP + 30 * difficulty;
    const scaledGapRange = vertGapRange + 50 * difficulty;
    const newY = previousPlatform.y - scaledMinGap - Math.random() * scaledGapRange;

    // Width scaling
    const newWidth = Math.max(PLATFORM_BASE_WIDTH * (1 - difficulty * 0.6), PLATFORM_BASE_WIDTH * 0.4);

    // Horizontal Placement
    const prevX = previousPlatform.x;
    const prevWidth = previousPlatform.width;
    const prevCenterX = prevX + prevWidth / 2;

    const maxDoubleJumpAirTime = 2 * (PLAYER_JUMP_POWER / PLAYER_GRAVITY) * 2;
    const maxHorizontalReach = PLAYER_SPEED * maxDoubleJumpAirTime * 0.9;
    const maxCenterOffset = maxHorizontalReach + 100 * difficulty;

    const minCenterX = prevCenterX - maxCenterOffset;
    const maxCenterX = prevCenterX + maxCenterOffset;

    const clampedMinCenterX = Math.max(newWidth / 2, minCenterX);
    const clampedMaxCenterX = Math.min(graphics.canvas.width - newWidth / 2, maxCenterX);

    let randomCenterX;
    if (clampedMaxCenterX > clampedMinCenterX) {
        randomCenterX = clampedMinCenterX + Math.random() * (clampedMaxCenterX - clampedMinCenterX);
    } else {
        randomCenterX = Math.max(newWidth / 2, Math.min(prevCenterX, graphics.canvas.width - newWidth / 2));
    }
    let newX = randomCenterX - newWidth / 2;
    newX = Math.max(0, Math.min(newX, graphics.canvas.width - newWidth));

    // Type randomization
    let type = 'normal';
    const iceChance = 0.1 + 0.15 * difficulty;
    if (Math.random() < iceChance) {
        type = 'ice';
    }

    state.addPlatform(createPlatform(newX, newY, type, newWidth));
}

// --- Reset Player State ---
function resetPlayerState() {
    console.log("Resetting player object state...");
    // Reset properties of the imported player object
    player.x = graphics.canvas.width / 2 - player.width / 2;
    player.y = graphics.canvas.height - 100; // Start position
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
    graphics.draw();

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