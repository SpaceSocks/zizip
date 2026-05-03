import * as state from './state.js?v=mobile-portrait-91';
import * as graphics from './graphics.js?v=mobile-portrait-91';
import * as input from './input.js?v=mobile-portrait-91';
import * as audio from './audio.js?v=mobile-portrait-91';
import { player, createPlatform } from './entities.js?v=mobile-portrait-91';
import * as ui from './ui.js?v=mobile-portrait-91'; // Import UI
import {
    MIN_VERT_GAP, MAX_VERT_GAP, PLATFORM_START_WIDTH, PLATFORM_EARLY_MIN_WIDTH, PLATFORM_MIN_WIDTH,
    PLATFORM_WIDTH_DIFFICULTY_HEIGHT, PLAYER_GRAVITY, PLAYER_JUMP_POWER, PLAYER_SPEED,
    SCORE_POPUP_LIFETIME, SCORE_POPUP_FADE_DURATION, SCORE_POPUP_SPEED,
    PLATFORM_PROBABILITY, PLATFORM_MIDDLE_THRESHOLD,
    PLATFORM_FLASH_DURATION, PLATFORM_FLASH_INTERVAL_MAX, PLATFORM_FLASH_INTERVAL_MIN,
    PLATFORM_FLASH_START_DELAY, PLAYER_AIR_CONTROL_FACTOR
} from './constants.js?v=mobile-portrait-91';

// --- Game Variables ---
let animationFrameId = null;
let lastTimestamp = 0; // Track last timestamp for delta time
let deathSequence = null;
let lastDeathReplayTime = 0;

const DEATH_CAMERA_FOLLOW_Y_FACTOR = 0.68;
const DEATH_EXPLODE_DELAY = 1.05;
const DEATH_RESPAWN_DELAY = 0.65;
const TUMBLE_FALL_DELAY = 0.46;
const TUMBLE_MIN_FALL_SPEED = 7.5;
const TUMBLE_START_Y_FACTOR = 0.66;
const TUMBLE_ROTATION_SPEED = Math.PI * 2.15;
const STARTING_PLATFORM_BOTTOM_OFFSET = 115;
const RESPAWN_PLATFORM_BOTTOM_OFFSET = 150;
const SPAWN_PADDING = 50;
const MAX_SPAWN_ATTEMPTS = 24;
const MAX_REPLAY_PLATFORM_SNAPSHOTS = 16;
const DISAPPEARING_PLATFORM_TYPES = new Set(['normal', 'ice', 'moving']);

function isMobilePlayfield() {
    return graphics.canvas.width <= 720 || window.matchMedia?.('(pointer: coarse)').matches;
}

function getStartingPlatformBottomOffset() {
    if (!isMobilePlayfield()) return STARTING_PLATFORM_BOTTOM_OFFSET;
    return Math.max(170, Math.min(230, Math.round(graphics.canvas.height * 0.22)));
}

function getRespawnPlatformBottomOffset() {
    if (!isMobilePlayfield()) return RESPAWN_PLATFORM_BOTTOM_OFFSET;
    return Math.max(190, Math.min(250, Math.round(graphics.canvas.height * 0.24)));
}

function getPlayerAnimationState() {
    if (!player.isGrounded) {
        return player.velocityY < 0 ? 'jump' : 'fall';
    }
    return Math.abs(player.velocityX || 0) > 0.35 ? 'walk' : 'idle';
}

function getPlayerAnimationFrame(animationState, timeMs = state.getElapsedTime()) {
    if (animationState !== 'walk') {
        if (animationState === 'jump') return 5;
        if (animationState === 'fall') return 6;
        return 0;
    }
    return 1 + Math.floor((timeMs / 1000) * 10) % 4;
}

function shouldPlatformDisappear(platform) {
    return platform &&
        !platform.isStartingPlatform &&
        DISAPPEARING_PLATFORM_TYPES.has(platform.type || 'normal');
}

function schedulePlatformDisappear(platform, now) {
    if (!shouldPlatformDisappear(platform) || platform.disappearStartTime) return;
    platform.disappearStartTime = now + PLATFORM_FLASH_START_DELAY;
    platform.isFlashing = false;
    platform.flashVisible = true;
    platform.lastFlashToggleTime = now;
}

function updatePlatformDisappearState(platform, now) {
    if (!platform.landedOn || !shouldPlatformDisappear(platform)) return;

    schedulePlatformDisappear(platform, now);

    if (platform.disappearStartTime && !platform.isFlashing && now >= platform.disappearStartTime) {
        platform.isFlashing = true;
        platform.flashStartTime = now;
        platform.lastFlashToggleTime = now;
        platform.flashVisible = true;
    }

    if (!platform.isFlashing) return;

    const elapsedFlashTime = now - platform.flashStartTime;
    if (elapsedFlashTime >= PLATFORM_FLASH_DURATION) {
        platform.remove = true;
        platform.isFlashing = false;
        platform.flashVisible = false;
        return;
    }

    const flashProgress = elapsedFlashTime / PLATFORM_FLASH_DURATION;
    platform.flashInterval = PLATFORM_FLASH_INTERVAL_MAX -
        (PLATFORM_FLASH_INTERVAL_MAX - PLATFORM_FLASH_INTERVAL_MIN) * flashProgress;

    if (now - platform.lastFlashToggleTime >= platform.flashInterval) {
        platform.flashVisible = !platform.flashVisible;
        platform.lastFlashToggleTime = now;
    }
}

function recordCurrentReplaySample(force = false, timeOverride = null) {
    const groundedPlatform = player.groundedOnPlatform || null;
    const replayTime = typeof timeOverride === 'number' ? timeOverride : state.getElapsedTime();
    const animationState = getPlayerAnimationState();
    const playerCenterY = player.y + player.height / 2;
    const platformSnapshots = state.getPlatforms()
        .filter(platform => platform.movement && !platform.remove)
        .sort((a, b) => {
            const aGrounded = groundedPlatform?.id === a.id ? -100000 : 0;
            const bGrounded = groundedPlatform?.id === b.id ? -100000 : 0;
            const aVisible = a.y > -120 && a.y < graphics.canvas.height + 140 ? -50000 : 0;
            const bVisible = b.y > -120 && b.y < graphics.canvas.height + 140 ? -50000 : 0;
            const aDistance = Math.abs((a.y + a.height / 2) - playerCenterY);
            const bDistance = Math.abs((b.y + b.height / 2) - playerCenterY);
            return (aGrounded + aVisible + aDistance) - (bGrounded + bVisible + bDistance);
        })
        .slice(0, MAX_REPLAY_PLATFORM_SNAPSHOTS)
        .map(platform => ({
            id: platform.id,
            x: platform.x,
            y: platform.y
        }));

    state.recordRunReplaySample({
        time: replayTime,
        height: getCurrentRunHeight(),
        xRatio: (player.x + player.width / 2) / graphics.canvas.width,
        yRatio: (player.y + player.height / 2) / graphics.canvas.height,
        facing: player.facing || 1,
        animationState,
        animationFrame: getPlayerAnimationFrame(animationState, replayTime),
        tumbleAngle: player.tumbleActive ? (player.tumbleAngle || 0) : 0,
        visible: player.visible !== false,
        cameraDrop: deathSequence?.cameraDrop || 0,
        groundedPlatformId: groundedPlatform?.id ?? null,
        groundedOffsetRatio: groundedPlatform
            ? ((player.x + player.width / 2) - groundedPlatform.x) / Math.max(1, groundedPlatform.width)
            : null,
        platformSnapshots,
        force
    });
}

// Add trail properties to the player object upon load
player.trailPositions = [];
player.maxTrailLength = 5; // Number of ghost images
player.trailUpdateCounter = 0;
player.trailUpdateFrequency = 2; // Update trail every N frames

function updatePlayerTrail() {
    if (player.visible === false) return;

    player.trailUpdateCounter++;
    if (player.trailUpdateCounter >= player.trailUpdateFrequency) {
        player.trailUpdateCounter = 0;
        const animationState = getPlayerAnimationState();
        player.trailPositions.unshift({
            x: player.x,
            y: player.y,
            facing: player.facing || 1,
            animationState,
            animationFrame: getPlayerAnimationFrame(animationState)
        });
        if (player.trailPositions.length > player.maxTrailLength) {
            player.trailPositions.pop();
        }
    }
}

function resetPlayerTumble() {
    player.fallTumbleTime = 0;
    player.tumbleActive = false;
    player.tumbleAngle = 0;
}

function updatePlayerTumble(dt) {
    const isFallingDown = !player.isGrounded && player.velocityY > TUMBLE_MIN_FALL_SPEED;
    const isLowEnoughToBeDangerous = player.y > graphics.canvas.height * TUMBLE_START_Y_FACTOR;

    if (!isFallingDown || !isLowEnoughToBeDangerous || player.visible === false) {
        resetPlayerTumble();
        return;
    }

    player.fallTumbleTime = (player.fallTumbleTime || 0) + dt;
    if (player.fallTumbleTime >= TUMBLE_FALL_DELAY) {
        player.tumbleActive = true;
    }

    if (player.tumbleActive) {
        const spinDirection = player.facing < 0 ? -1 : 1;
        player.tumbleAngle = ((player.tumbleAngle || 0) + TUMBLE_ROTATION_SPEED * spinDirection * dt) % (Math.PI * 2);
    }
}

function shiftWorldForDeathCamera(offsetY) {
    if (offsetY <= 0) return;

    player.y -= offsetY;
    player.trailPositions.forEach(position => {
        position.y -= offsetY;
    });
    shiftPlatforms(-offsetY);
}

function shiftPlatforms(offsetY) {
    state.getPlatforms().forEach(platform => {
        const previousY = platform.previousY ?? platform.y;
        platform.y += offsetY;
        platform.previousY = previousY + offsetY;
        platform.originalY += offsetY;
        platform.middleSection.x = platform.x + platform.width * (0.5 - PLATFORM_MIDDLE_THRESHOLD / 2);
    });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCurrentDifficultyFactor() {
    const heightWeight = state.getMaxHeight() / PLATFORM_WIDTH_DIFFICULTY_HEIGHT;
    const scoreWeight = state.getScore() / 6500;
    return clamp(Math.max(heightWeight, scoreWeight), 0, 1);
}

function getPlatformWidthForDifficulty(difficulty) {
    const eased = difficulty * difficulty * (3 - 2 * difficulty);
    const smallestAllowed = Math.round(PLATFORM_EARLY_MIN_WIDTH - (PLATFORM_EARLY_MIN_WIDTH - PLATFORM_MIN_WIDTH) * eased);
    const widestAllowed = Math.round(PLATFORM_START_WIDTH - 22 * eased);
    const bias = Math.pow(state.runRandom(), 1.4 + (1 - difficulty) * 1.8);
    return Math.round(smallestAllowed + (widestAllowed - smallestAllowed) * bias);
}

function getMovingPlatformSpeedForDifficulty(difficulty) {
    const eased = difficulty * difficulty * (3 - 2 * difficulty);
    const minSpeed = 52 + eased * 26;
    const maxSpeed = 76 + eased * 66;
    const speed = minSpeed + state.runRandom() * (maxSpeed - minSpeed);
    return Math.round(speed);
}

function getMobilePhysicsScale() {
    if (!isMobilePlayfield()) return 1;
    return Math.max(0.74, Math.min(0.84, graphics.canvas.height / 920));
}

function getPlayerJumpPower() {
    return PLAYER_JUMP_POWER * getMobilePhysicsScale();
}

function getPlayerGravity() {
    if (!isMobilePlayfield()) return PLAYER_GRAVITY;
    return PLAYER_GRAVITY * 1.08;
}

function getPlayerSpeed() {
    return PLAYER_SPEED * (isMobilePlayfield() ? 0.92 : 1);
}

function getVerticalPlatformGap() {
    const scale = isMobilePlayfield() ? getMobilePhysicsScale() : 1;
    return (MIN_VERT_GAP + state.runRandom() * (MAX_VERT_GAP - MIN_VERT_GAP)) * scale;
}

function getReachableEdgeGap(yOffset, difficulty) {
    const jumpPower = getPlayerJumpPower();
    const gravity = getPlayerGravity();
    const speed = getPlayerSpeed();
    const discriminant = (jumpPower * jumpPower) - (2 * gravity * yOffset);
    const jumpAirFrames = discriminant > 0
        ? (jumpPower + Math.sqrt(discriminant)) / gravity
        : jumpPower / gravity;
    const runReach = speed * jumpAirFrames;

    // Keep the spawn window a little inside the theoretical max so every new block feels fair.
    const minReach = isMobilePlayfield() ? 125 : 175;
    return Math.max(minReach, runReach * (0.9 - difficulty * 0.08));
}

function getCurrentRunHeight() {
    return state.getMaxHeight() + Math.max(0, (state.getInitialPlayerY() - player.y) / 10);
}

function preparePlatformForReplay(platform, replayHeight = 0) {
    platform.replayHeight = replayHeight;
    state.recordRunReplayPlatform(platform);
}

function beginDeathSequence() {
    if (deathSequence) return;

    console.log("Starting Unity-style death fall sequence.");
    deathSequence = {
        elapsed: 0,
        cameraDrop: 0,
        exploded: false,
        finished: false
    };

    player.isGrounded = false;
    player.groundedOnPlatform = null;
    player.tumbleActive = true;
    player.velocityX *= 0.35;
    state.setCurrentGameState(state.GameState.Dying);
}

function updateDeathSequence(dt) {
    if (!deathSequence || deathSequence.finished) return;

    deathSequence.elapsed += dt;
    const replayTime = state.getElapsedTime() + deathSequence.elapsed * 1000;
    lastDeathReplayTime = replayTime;
    player.velocityY += player.gravity * dt * 60;
    player.y += player.velocityY * dt * 60;
    player.x += player.velocityX * dt * 60;
    player.velocityX *= 0.985;
    player.tumbleActive = true;
    player.tumbleAngle = ((player.tumbleAngle || 0) + TUMBLE_ROTATION_SPEED * dt) % (Math.PI * 2);
    if (Math.abs(player.velocityX) > 0.1) {
        player.facing = Math.sign(player.velocityX);
    }
    updatePlayerTrail();

    const followY = graphics.canvas.height * DEATH_CAMERA_FOLLOW_Y_FACTOR;
    if (player.y > followY) {
        const cameraOffset = player.y - followY;
        deathSequence.cameraDrop += cameraOffset;
        shiftWorldForDeathCamera(cameraOffset);
    }

    graphics.updateStarsHorizontal();
    recordCurrentReplaySample(false, replayTime);

    if (!deathSequence.exploded && deathSequence.elapsed >= DEATH_EXPLODE_DELAY) {
        deathSequence.exploded = true;
        state.loseLife();
        player.visible = false;
        player.velocityX = 0;
        player.velocityY = 0;
        state.recordRunReplayEvent({
            type: 'death',
            time: replayTime,
            xRatio: (player.x + player.width / 2) / graphics.canvas.width,
            yRatio: (player.y + player.height / 2) / graphics.canvas.height
        });
        recordCurrentReplaySample(true, replayTime);
        graphics.spawnDeathExplosion(player.x + player.width / 2, player.y + player.height / 2);
        audio.playPlayerDeathSound();
    }

    if (deathSequence.exploded && deathSequence.elapsed >= DEATH_EXPLODE_DELAY + DEATH_RESPAWN_DELAY) {
        deathSequence.finished = true;
        deathSequence = null;
        if (state.getLives() > 0) {
            respawnPlayer();
        } else {
            handleGameOver();
        }
    }
}

function playReplayEvents() {
    state.consumeReplayEvents().forEach(event => {
        if (event.type === 'landing') {
            audio.playLandingSound(!!event.middle);
        } else if (event.type === 'death') {
            graphics.spawnReplayDeathExplosion(event);
            audio.playPlayerDeathSound();
        } else if (event.type === 'gameover') {
            audio.playGameOverSound();
        }
    });
}

// --- Main Update Function ---
function update(dt) {
    if (state.getCurrentGameState() !== state.GameState.Playing) return;

    state.updateElapsedTime();
    const now = Date.now();
    const difficulty = getCurrentDifficultyFactor();
    state.setDifficultyFactor(difficulty);
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
    let landingScorePopup = null;

    // Apply vertical movement from the platform the player *was* on
    if (player.groundedOnPlatform) {
        const deltaYToApply = player.groundedOnPlatform.deltaYThisFrame || 0;
        player.y += deltaYToApply;
    }

    player.velocityY += player.gravity * dt * 60;
    let previousY = player.y; // Store Y before applying velocity
    player.y += player.velocityY * dt * 60; // Apply player's vertical velocity

    // Collision Check Loop
    platforms.forEach((platform) => {
        updatePlatformDisappearState(platform, now);
        if (platform.remove) return;

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
            const landingTolerance = Math.max(4, Math.abs(player.velocityY * dt * 60) + 2);

            if (!platform.isDisappearing &&
                player.x < platform.x + platform.width &&
                player.x + player.width > platform.x &&
                playerBottom >= platform.y &&
                prevPlayerBottom <= (platform.previousY ?? platform.y) + landingTolerance &&
                player.velocityY >= 0) {

                // INITIAL LANDING OCCURRED
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
                        schedulePlatformDisappear(platform, now);
                        // Calculate score
                        const playerCenterX = player.x + player.width / 2;
                        landedOnMiddle = playerCenterX >= platform.middleSection.x && playerCenterX <= platform.middleSection.x + platform.middleSection.width;
                        const comboInfo = state.registerPlatformLanding(landedOnMiddle);
                        let scoreAwarded = 10;
                        if (landedOnMiddle) {
                            const baseScore = (platform.type === 'moving') ? 25 : 20;
                            scoreAwarded = baseScore * comboInfo.multiplier;
                        }
                        state.setScore(state.getScore() + scoreAwarded);
                        const comboSuffix = landedOnMiddle && comboInfo.multiplier > 1 ? ` x${comboInfo.multiplier}` : '';
                        landingScorePopup = {
                            x: player.x + player.width / 2, // Start at player center
                            y: player.y - 5, // Start slightly above player
                            text: `+${scoreAwarded}${comboSuffix}`,
                            creationTime: now,
                            alpha: 0 // Start invisible, fade in
                        };
                        state.addScorePopup(landingScorePopup);
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
        resetPlayerTumble();
        state.recordRunReplayEvent({
            type: 'landing',
            middle: landedOnMiddle,
            time: state.getElapsedTime(),
            platformId: currentLandingPlatform?.id ?? null,
            scoreText: landingScorePopup?.text || '',
            xRatio: landingScorePopup ? landingScorePopup.x / graphics.canvas.width : null,
            yRatio: landingScorePopup ? landingScorePopup.y / graphics.canvas.height : null
        });
        audio.playLandingSound(landedOnMiddle);
    }

    updatePlayerTumble(dt);

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

    if (input.keys.left) { targetVelocityX = -player.speed; }
    else if (input.keys.right) { targetVelocityX = player.speed; }
    if (targetVelocityX !== 0) {
        player.facing = Math.sign(targetVelocityX);
    }

    if (player.velocityX < targetVelocityX) {
        player.velocityX = Math.min(player.velocityX + player.currentFriction * player.speed, targetVelocityX);
    } else if (player.velocityX > targetVelocityX) {
        player.velocityX = Math.max(player.velocityX - player.currentFriction * player.speed, targetVelocityX);
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

    // Remove disappeared platforms and drop the player if the floor just vanished.
    const groundedPlatformRemoved = player.groundedOnPlatform?.remove === true;
    state.filterPlatforms(platform => !platform.remove);
    if (groundedPlatformRemoved) {
        player.groundedOnPlatform = null;
        player.isGrounded = false;
        player.currentFriction = PLAYER_AIR_CONTROL_FACTOR;
    }

    // Boundary checks
    if (player.x < 0) {
        player.x = 0;
        player.velocityX = 0;
    }
    if (player.x + player.width > graphics.canvas.width) {
        player.x = graphics.canvas.width - player.width;
        player.velocityX = 0;
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

    recordCurrentReplaySample();

    // --- Update Player Trail ---
    updatePlayerTrail();

    // Fall detection
    if (player.y > graphics.canvas.height + player.height) {
        console.log("Fall detected!");
        beginDeathSequence();
    }
}

// --- Game Over Handler ---
function handleGameOver() {
    console.log("Game Over triggered!");
    const finalScore = state.getScore();
    const finalHeight = state.getMaxHeight();
    const finalTimeMs = state.getElapsedTime(); // Get time in MS
    const formattedTime = graphics.formatTime(finalTimeMs, false); // <<< FORMAT TIME (MM:SS)
    state.recordRunReplayEvent({
        type: 'gameover',
        time: lastDeathReplayTime || finalTimeMs
    });
    const savedBestGhost = state.maybeSaveBestRunReplay(finalScore, finalHeight, formattedTime);
    if (savedBestGhost) {
        console.log("Saved new best-run ghost replay.");
    }

    // Play game over sound
    audio.playGameOverSound();

    // Update Game State
    state.setCurrentGameState(state.GameState.GameOver);

    // Show Game Over UI elements
    ui.showGameOverControls();
    ui.showGameOverLeaderboardLoading(state.getActiveLeaderboardSource());
    ui.setupGameOverFocus();

    // Add entry to leaderboard state, then force-refresh the displayed board.
    const playerName = state.getDisplayName() || 'Player';
    state.addLeaderboardEntry(playerName, finalScore, finalHeight, formattedTime)
        .finally(() => ui.showGameOverLeaderboard(true, state.getActiveLeaderboardSource()));

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
    const difficulty = getCurrentDifficultyFactor();
    state.setDifficultyFactor(difficulty);

    // Determine type based on probabilities
    let platformType = 'normal';
    const rand = state.runRandom();
    let cumulativeProb = 0;

    if (rand < (cumulativeProb += PLATFORM_PROBABILITY.NORMAL)) {
        platformType = 'normal';
    } else if (rand < (cumulativeProb += PLATFORM_PROBABILITY.ICE)) {
        platformType = 'ice';
    } else if (rand < (cumulativeProb += PLATFORM_PROBABILITY.MOVING)) {
        platformType = 'moving';
    }
    // Add more types here if needed

    // Vertical position calculation (remains the same)
    const screenHeight = graphics.canvas.height;
    const yOffset = getVerticalPlatformGap();
    const newY = basePlatform.y - yOffset;

    // Horizontal position calculation WITH overlap/reachability checks
    let newX;
    let needsRetry = true;
    let attempts = 0;
    const newWidth = getPlatformWidthForDifficulty(difficulty);
    const reachableEdgeGap = getReachableEdgeGap(yOffset, difficulty);
    const spawnPadding = isMobilePlayfield() ? Math.min(32, SPAWN_PADDING) : SPAWN_PADDING;
    const minX = spawnPadding;
    const maxX = graphics.canvas.width - newWidth - spawnPadding;
    const reachableMinX = basePlatform.x - reachableEdgeGap - newWidth;
    const reachableMaxX = basePlatform.x + basePlatform.width + reachableEdgeGap;
    const spawnMinX = clamp(reachableMinX, minX, maxX);
    const spawnMaxX = clamp(reachableMaxX, minX, maxX);
    const minimumEdgeGap = 18 + difficulty * 34;
    const existingPlatforms = state.getPlatforms(); // Get current platforms

    while (needsRetry && attempts < MAX_SPAWN_ATTEMPTS) {
        attempts++;
        needsRetry = false; // Assume no overlap for this attempt

        if (spawnMaxX > spawnMinX) {
            newX = spawnMinX + state.runRandom() * (spawnMaxX - spawnMinX);
        } else {
            newX = clamp(basePlatform.x + basePlatform.width / 2 - newWidth / 2, minX, maxX);
        }

        const edgeGapFromBase = newX > basePlatform.x + basePlatform.width
            ? newX - (basePlatform.x + basePlatform.width)
            : basePlatform.x > newX + newWidth
                ? basePlatform.x - (newX + newWidth)
                : 0;

        if (edgeGapFromBase > reachableEdgeGap) {
            needsRetry = true;
            continue;
        }

        if (edgeGapFromBase < minimumEdgeGap && attempts < MAX_SPAWN_ATTEMPTS / 2) {
            needsRetry = true;
            continue;
        }

        // Check against existing platforms BELOW the new one
        for (const existingPlatform of existingPlatforms) {
            // Only check platforms visually below the new one (optional, but makes sense)
             if (existingPlatform.y > newY) {
                // Check for horizontal overlap
                const overlaps = (newX < existingPlatform.x + existingPlatform.width &&
                                  newX + newWidth > existingPlatform.x);
                if (overlaps) {
                    needsRetry = true;
                    break; // No need to check other platforms for this attempt
                }
             }
        }
    } // End while loop

    if (attempts >= MAX_SPAWN_ATTEMPTS) {
        const fallbackDirection = basePlatform.x + basePlatform.width / 2 < graphics.canvas.width / 2 ? 1 : -1;
        newX = clamp(
            basePlatform.x + (fallbackDirection * Math.min(reachableEdgeGap * 0.65, 180)),
            minX,
            maxX
        );
        console.warn(`Max spawn attempts reached for platform based on ${basePlatform.id}. Using reachable fallback X: ${newX.toFixed(0)}`);
    }

    // Create the platform with the validated/final newX
    const platformOptions = platformType === 'moving'
        ? {
            movingSpeed: getMovingPlatformSpeedForDifficulty(difficulty),
            movingAxis: state.runRandom() < 0.5 ? 'x' : 'y',
            movingDirection: state.runRandom() < 0.5 ? 1 : -1
        }
        : {};
    const newPlatform = createPlatform(newX, newY, platformType, newWidth, false, platformOptions); // Pass width too
    preparePlatformForReplay(newPlatform, (basePlatform.replayHeight || 0) + yOffset / 10);
    state.addPlatform(newPlatform);
}

// --- Reset Player State ---
function resetPlayerState() {
    console.log("Resetting player object state...");
    // Reset properties of the imported player object
    const startingPlatform = createPlatform(
        graphics.canvas.width / 2 - PLATFORM_START_WIDTH / 2,
        graphics.canvas.height - getStartingPlatformBottomOffset(),
        'normal',
        PLATFORM_START_WIDTH,
        true
    );
    startingPlatform.landedOn = true;
    startingPlatform.replayHeight = 0;

    const startX = startingPlatform.x + (startingPlatform.width / 2) - (player.width / 2);
    const startY = startingPlatform.y - player.height - 1;
    player.x = startX;
    player.y = startY;
    state.setInitialPlayerY(startY); // <<< STORE INITIAL Y HERE
    player.velocityY = 0;
    player.velocityX = 0;
    player.jumpsLeft = 2;
    player.isGrounded = true;
    player.visible = true;
    player.facing = 1;
    resetPlayerTumble();
    player.jumpPower = getPlayerJumpPower();
    player.baseGravity = getPlayerGravity();
    player.gravity = player.baseGravity;
    player.speed = getPlayerSpeed();
    player.groundedOnPlatform = startingPlatform;
    state.setLastLandedPlatformId(startingPlatform.id);
    deathSequence = null;
    lastDeathReplayTime = 0;

    // Clear platforms and add a new starting one
    state.setPlatforms([startingPlatform]);
    state.setRunReplayMeta({
        canvasWidth: graphics.canvas.width,
        canvasHeight: graphics.canvas.height,
        isMobileRun: isMobilePlayfield(),
        viewportProfile: isMobilePlayfield() ? 'mobile' : 'desktop'
    });
    state.recordRunReplayPlatform(startingPlatform);
    spawnNewPlatform(startingPlatform);
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
        const desiredRespawnPlatformY = graphics.canvas.height - getRespawnPlatformBottomOffset();
        shiftPlatforms(desiredRespawnPlatformY - respawnPlatform.y);

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
        player.isGrounded = true;
        player.visible = true;
        player.jumpsLeft = 2;
    player.facing = 1;
    resetPlayerTumble();
    player.jumpPower = getPlayerJumpPower();
        player.baseGravity = getPlayerGravity();
        player.gravity = player.baseGravity;
        player.speed = getPlayerSpeed();
        player.groundedOnPlatform = respawnPlatform;
        state.setLastLandedPlatformId(respawnPlatform.id);
        recordCurrentReplaySample(true, (lastDeathReplayTime || state.getElapsedTime()) + 1);
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
    } else if (currentState === state.GameState.Dying) {
        updateDeathSequence(dt);
    } else if (currentState === state.GameState.GameOver || currentState === state.GameState.Paused) {
        // Still update horizontal stars in game over or paused
        graphics.updateStarsHorizontal();
    } else if (currentState === state.GameState.Replay) {
        const replayWasPlaying = state.getReplayViewer()?.playing;
        state.updateReplayPlayback(dt * 1000);
        if (replayWasPlaying) {
            playReplayEvents();
        }
        graphics.updateStarsHorizontal();
        ui.updateReplayControls();
    }

    // Always draw (draw handles showing different states)
    graphics.draw(player); // <<< PASS PLAYER OBJECT

    animationFrameId = requestAnimationFrame(gameLoop); // Store the ID
}

export function ensureGameLoop() {
    if (!animationFrameId) {
        lastTimestamp = 0;
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// --- Initial Game Logic Setup (Called by UI) ---
export function startGame() {
    console.log("Attempting to start game...");
    if (state.getCurrentGameState() === state.GameState.Playing) {
        console.warn("Game already running.");
        return;
    }

    ui.hideLoginScreen();
    state.ensureRunSeedReady();
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
    ensureGameLoop();
}

// --- Main Initialization (Runs on script load) ---
function mainInit() {
    console.log("Main Initialization...");
    graphics.resizeCanvas(); // Resize canvas first
    window.addEventListener('resize', graphics.resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(graphics.resizeCanvas, 80));
    window.visualViewport?.addEventListener('resize', graphics.resizeCanvas);
    window.visualViewport?.addEventListener('scroll', graphics.resizeCanvas);

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
