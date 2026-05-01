// This file will handle graphics, drawing, and canvas resizing

import { R64 } from './constants.js';
import * as state from './state.js';
import { player } from './entities.js'; // Need player for drawing
import * as ui from './ui.js'; // Import ui module

// --- Canvas Setup ---
export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');

// --- Starfield State ---
let stars = [];

// --- Leaderboard UI State ---
let leaderboardData = null;
let leaderboardLoading = false;
let leaderboardError = null;
let leaderboardReplayHitboxes = [];

canvas.addEventListener('click', (event) => {
    if (state.getCurrentGameState() !== state.GameState.GameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hitbox = leaderboardReplayHitboxes.find(box =>
        x >= box.x && x <= box.x + box.width &&
        y >= box.y && y <= box.y + box.height
    );
    if (hitbox && state.startReplay(hitbox.entry)) {
        ui.showReplayControls('gameover');
    }
});

const spriteSources = {
    player: 'Sprites/game/player.png?v=sprite-forge-1',
    normal: 'Sprites/game/platform-normal.png?v=sprite-forge-1',
    ice: 'Sprites/game/platform-ice.png?v=sprite-forge-1',
    moving: 'Sprites/game/platform-moving.png?v=sprite-forge-1'
};

const sprites = Object.fromEntries(
    Object.entries(spriteSources).map(([key, src]) => {
        const image = new Image();
        image.src = src;
        return [key, image];
    })
);

function isSpriteReady(image) {
    return image && image.complete && image.naturalWidth > 0;
}

const STAR_VARIANTS = [
    { count: 360, color: '#253039', alphaMin: 0.10, alphaMax: 0.20, sizeMin: 0.98, sizeMax: 1.5, speedMin: 0.030, speedMax: 0.066 },
    { count: 250, color: '#4a5661', alphaMin: 0.16, alphaMax: 0.30, sizeMin: 0.98, sizeMax: 1.65, speedMin: 0.048, speedMax: 0.096 },
    { count: 150, color: '#8a98a2', alphaMin: 0.26, alphaMax: 0.46, sizeMin: 1.05, sizeMax: 1.8, speedMin: 0.078, speedMax: 0.144 },
    { count: 58, color: '#8fd3ff', alphaMin: 0.34, alphaMax: 0.62, sizeMin: 1.13, sizeMax: 1.95, speedMin: 0.120, speedMax: 0.204 },
    { count: 24, color: '#ffffff', alphaMin: 0.62, alphaMax: 0.92, sizeMin: 1.2, sizeMax: 2.18, speedMin: 0.180, speedMax: 0.285 }
];

let deathParticles = [];

function createStar(variant) {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * (variant.sizeMax - variant.sizeMin) + variant.sizeMin,
        speed: Math.random() * (variant.speedMax - variant.speedMin) + variant.speedMin,
        alpha: Math.random() * (variant.alphaMax - variant.alphaMin) + variant.alphaMin,
        color: variant.color
    };
}

export function initializeStars() {
    console.log("Initializing stars...");
    stars = STAR_VARIANTS.flatMap(variant =>
        Array.from({ length: variant.count }, () => createStar(variant))
    );
    console.log("Stars initialized.");
}

// --- Star Updates (called from main update loop) ---
function updateStars() {
    stars.forEach(star => {
        star.x -= star.speed;
        if (star.x < 0 - star.size) {
            star.x = canvas.width + star.size;
            star.y = Math.random() * canvas.height;
        }
    });
}

export function updateStarsVertical() {
    updateStars();
}

export function updateStarsHorizontal() {
    updateStars();
}

export function spawnDeathExplosion(x, y) {
    const colors = ['#ffffff', '#f9c22b', '#f57d4a', '#ff3f3f', '#8fd3ff'];
    deathParticles = Array.from({ length: 64 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4.5 + 1.4;
        return {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 5 + 2,
            life: Math.random() * 28 + 32,
            maxLife: 0,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
    });
    deathParticles.forEach(particle => particle.maxLife = particle.life);
}

// --- Canvas Resizing ---
export function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
    initializeStars();
}

// --- Utility Functions ---

// Function to format time in milliseconds to MM:SS or MM:SS:ms
export function formatTime(milliseconds, includeMilliseconds = true) {
    if (typeof milliseconds !== 'number' || isNaN(milliseconds)) {
        return '00:00';
    }
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10); // Get hundredths of a second

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');
    const paddedMs = String(ms).padStart(2, '0');

    if (includeMilliseconds) {
        return `${paddedMinutes}:${paddedSeconds}:${paddedMs}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
}

// --- Drawing Functions ---

// Draw HUD (Heads Up Display)
function drawHUD(player) {
    ctx.fillStyle = R64.WHITE;
    ctx.font = '24px Petitinho';
    const lineHeight = 30;
    let yPos;

    // Top Left: Player, Lives
    ctx.textAlign = 'left';
    yPos = 30;
    const displayName = state.getDisplayName();
    if (displayName) {
        ctx.fillText(`PLAYER: ${displayName}`, 20, yPos);
        yPos += lineHeight;
    }
    ctx.fillText(`LIVES: ${state.getLives()}`, 20, yPos);

    // Top Right: Score, Height
    ctx.textAlign = 'right';
    yPos = 30;
    ctx.fillText(`SCORE: ${state.getScore()}`, canvas.width - 20, yPos);
    yPos += lineHeight;
    ctx.fillText(`HEIGHT: ${Math.round(state.getMaxHeight())} M`, canvas.width - 20, yPos);

    // Top Center: Time, Current Track
    ctx.textAlign = 'center';
    yPos = 30;
    const elapsedTimeMs = state.getElapsedTime();
    const formattedTime = formatTime(elapsedTimeMs, true);
    ctx.fillStyle = R64.WHITE;
    ctx.font = '26px Petitinho';
    ctx.textBaseline = 'top';
    ctx.fillText(formattedTime, canvas.width / 2, 20);
    yPos += lineHeight;
    const trackName = state.getCurrentTrackInfo(); // Get from state
    if (trackName !== "None") {
        ctx.font = '20px Petitinho'; // Slightly smaller for track name
        ctx.fillText(`Playing: ${trackName}`, canvas.width / 2, yPos);
        ctx.font = '24px Petitinho'; // Reset font size
    }

    // --- Real-time Height Meter (Center Right) ---
    // Calculate current height relative to starting position
    const currentHeight = player ? getDisplayedRunHeight(player) : 0;

    const meterText = `${Math.floor(currentHeight)} METERS`;
    const meterX = canvas.width - 30;
    const meterY = canvas.height / 2;

    // Draw Text
    ctx.fillStyle = R64.WHITE;
    ctx.font = '28px Petitinho';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(meterText, meterX, meterY);

    if (state.getElapsedTime() < 9000 && state.getScore() < 30) {
        ctx.fillStyle = 'rgba(199, 220, 208, 0.88)';
        ctx.font = '18px Petitinho';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('A/D MOVE   SPACE JUMP   Q/E DASH   ESC PAUSE', canvas.width / 2, canvas.height - 22);
    }

    const comboMultiplier = state.getComboMultiplier();
    const perfectStreak = state.getPerfectLandingStreak();
    if (comboMultiplier > 1) {
        ctx.fillStyle = R64.YELLOW;
        ctx.font = '22px Petitinho';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`PERFECT STREAK ${perfectStreak}  x${comboMultiplier}`, canvas.width / 2, 78);
    }

    // REMOVED STATIC Indicator Lines
    /*
    const INDICATOR_COUNT = 5;
    const INDICATOR_LENGTH = 10;
    const INDICATOR_SPACING = 8;
    const INDICATOR_X_OFFSET = 15;
    const indicatorX = meterX - INDICATOR_X_OFFSET - (ctx.measureText(meterText).width);
    ctx.strokeStyle = R64.WHITE;
    ctx.lineWidth = 2;

    for (let i = 0; i < INDICATOR_COUNT; i++) {
        const lineY = meterY + (i - Math.floor(INDICATOR_COUNT / 2)) * INDICATOR_SPACING;
        ctx.beginPath();
        ctx.moveTo(indicatorX - INDICATOR_LENGTH / 2, lineY);
        ctx.lineTo(indicatorX + INDICATOR_LENGTH / 2, lineY);
        ctx.stroke();
    }
    */
}

// --- Fetch Leaderboard Data ---
// Called when game state enters GameOver
export function invalidateLeaderboard() {
    leaderboardData = null;
    leaderboardError = null;
    leaderboardLoading = false;
}

function getDisplayedRunHeight(player) {
    return state.getMaxHeight() + Math.max(0, (state.getInitialPlayerY() - player.y) / 10);
}

function getPlayerSpriteDrawBox(x, y) {
    const drawWidth = player.width * 1.6;
    const drawHeight = player.height * 1.35;
    return {
        x: x + player.width / 2 - drawWidth / 2,
        y: y + player.height - drawHeight,
        width: drawWidth,
        height: drawHeight
    };
}

function drawPlayerSpriteAt(x, y, facing = 1, alpha = 1, tint = null) {
    const box = getPlayerSpriteDrawBox(x, y);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (tint && isSpriteReady(sprites.player)) {
        ctx.filter = 'brightness(0.5) saturate(0.75)';
    }

    if (isSpriteReady(sprites.player)) {
        if (facing < 0) {
            ctx.translate(box.x + box.width, box.y);
            ctx.scale(-1, 1);
            ctx.drawImage(sprites.player, 0, 0, box.width, box.height);
        } else {
            ctx.drawImage(sprites.player, box.x, box.y, box.width, box.height);
        }
    } else {
        ctx.fillStyle = tint || player.color;
        ctx.fillRect(x, y, player.width, player.height);
    }

    ctx.restore();
}

function drawBestRunGhost(player) {
    if (!state.isGhostEnabled()) return;
    if (state.getCurrentGameState() !== state.GameState.Playing) return;

    const ghostPoint = state.getBestRunGhostPoint(state.getElapsedTime());
    if (!ghostPoint) return;

    const currentHeight = getDisplayedRunHeight(player);
    const ghostX = ghostPoint.xRatio * canvas.width - player.width / 2;
    const ghostY = player.y + (currentHeight - ghostPoint.height) * 10;

    if (ghostY < -player.height * 2 || ghostY > canvas.height + player.height * 2) return;

    const trailSpacingMs = 130;
    for (let i = 4; i >= 1; i--) {
        const trailPoint = state.getBestRunGhostPoint(state.getElapsedTime() - i * trailSpacingMs);
        if (!trailPoint) continue;
        const trailX = trailPoint.xRatio * canvas.width - player.width / 2;
        const trailY = player.y + (currentHeight - trailPoint.height) * 10;
        if (trailY < -player.height * 2 || trailY > canvas.height + player.height * 2) continue;
        drawPlayerSpriteAt(trailX, trailY, trailPoint.facing || ghostPoint.facing || 1, 0.08 + (4 - i) * 0.035, '#2b8cc9');
    }

    drawPlayerSpriteAt(ghostX, ghostY, ghostPoint.facing || 1, 0.28, '#57b8ff');
}

export async function fetchLeaderboard(force = false) {
    if (leaderboardLoading && !force) return; // Don't fetch if already loading

    console.log("Requesting leaderboard data fetch...");
    leaderboardLoading = true;
    leaderboardData = null; // Clear old data
    leaderboardError = null;
    try {
        // Now actually call the async function from state.js
        leaderboardData = await state.getLeaderboard(state.getActiveLeaderboardSource());
        console.log("Leaderboard data received in graphics.js:", leaderboardData);
    } catch (err) {
        console.error("Error fetching leaderboard in graphics.js:", err);
        leaderboardError = "Failed to load leaderboard.";
    } finally {
        leaderboardLoading = false;
    }
}

// Draw Game Over Screen
function drawGameOver() {
    // drawBackground(); // REMOVED - Background drawn in main draw loop

    ctx.fillStyle = R64.RED;
    ctx.font = '80px Petitinho';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.2);

    // Draw Leaderboard Section
    ctx.fillStyle = R64.WHITE;
    ctx.font = '36px Petitinho';
    ctx.fillText('Leaderboard', canvas.width / 2, canvas.height * 0.33);

    // --- Display Leaderboard ---
    const startY = canvas.height * 0.4;
    const lineHeight = 30;
    const maxEntries = 10;
    // Reduce width - use 60% or a max pixel value
    const leaderboardWidth = Math.min(canvas.width * 0.7, 700); // Max width of 700px, or 70% of screen
    const leaderboardHeight = maxEntries * lineHeight + 40;
    const leaderboardX = (canvas.width - leaderboardWidth) / 2; // Center the narrower box
    const padding = 20; // Reset padding maybe
    leaderboardReplayHitboxes = [];

    // Draw background box (using new width)
    ctx.fillStyle = 'rgba(46, 34, 47, 0.8)';
    ctx.fillRect(leaderboardX, startY - lineHeight, leaderboardWidth, leaderboardHeight);

    ctx.font = '20px Petitinho';
    ctx.fillStyle = R64.WHITE;
    ctx.textBaseline = 'middle';

    // --- Define Column START/END Positions based on new width ---
    const rankX = leaderboardX + padding;
    const nameX = rankX + 50;
    // End points from right edge
    const replayX = leaderboardX + leaderboardWidth - padding - 16;
    const timeEndX = replayX - 44;
    const heightEndX = timeEndX - 112; // <<< INCREASED SPACE FROM 100
    const scoreEndX = heightEndX - 100;
    // Name column max width derived from score start
    const maxNameWidth = scoreEndX - nameX - 20;

    // Optional: Draw Headers (Positions might need slight tweak)
    /*
    ctx.fillStyle = '#aaaaaa'; // Lighter color for headers
    ctx.textAlign = 'left';
    ctx.fillText("RANK", rankX, startY - lineHeight / 2);
    ctx.fillText("NAME", nameX, startY - lineHeight / 2);
    ctx.textAlign = 'right';
    ctx.fillText("SCORE", scoreEndX, startY - lineHeight / 2);
    ctx.fillText("HEIGHT", heightEndX, startY - lineHeight / 2);
    ctx.fillText("TIME", timeEndX, startY - lineHeight / 2);
    ctx.fillStyle = R64.WHITE; // Reset color
    */

    // --- Loading / Error / Empty States ---
    if (leaderboardLoading) {
        ctx.textAlign = 'center';
        ctx.fillText("Loading Leaderboard...", canvas.width / 2, startY + leaderboardHeight / 2);
    } else if (leaderboardError) {
        ctx.textAlign = 'center';
        ctx.fillStyle = R64.RED;
        ctx.fillText(leaderboardError, canvas.width / 2, startY + leaderboardHeight / 2);
    } else if (!leaderboardData || leaderboardData.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillText("Leaderboard is empty!", canvas.width / 2, startY + leaderboardHeight / 2);
    } else {
        // --- Draw Entries ---
        leaderboardData.slice(0, maxEntries).forEach((entry, index) => {
            const y = startY + (index * lineHeight); // Position for the current line
            const rank = `${index + 1}.`;
            const displayName = entry.displayName ? entry.displayName.toUpperCase() : 'ANON';
            const score = entry.score !== undefined ? entry.score.toString() : 'N/A'; // Convert score to string
            const maxHeight = entry.maxHeight !== undefined ? `${Math.round(entry.maxHeight)} M` : 'N/A'; // Round height
            const time = entry.time || 'N/A';
            const hasReplay = entry.replay && Array.isArray(entry.replay.samples) && entry.replay.samples.length > 0;

            // Highlight the last submitted score
            const lastScore = state.getLastSubmittedScore();
            if (lastScore &&
                entry.score === lastScore.score &&
                entry.maxHeight === lastScore.maxHeight &&
                entry.time === lastScore.time &&
                entry.userId === lastScore.userId) {
                ctx.fillStyle = '#f9c22b'; // Yellow highlight
            } else {
                ctx.fillStyle = R64.WHITE;
            }

            // Draw Columns
            ctx.textAlign = 'left';
            ctx.fillText(rank, rankX, y);

            // Draw Name (truncated based on new maxNameWidth)
            let truncatedName = displayName;
            if (ctx.measureText(displayName).width > maxNameWidth) {
                while (ctx.measureText(truncatedName + '...').width > maxNameWidth && truncatedName.length > 1) {
                    truncatedName = truncatedName.slice(0, -1);
                }
                truncatedName += '...';
            }
            ctx.fillText(truncatedName, nameX, y);

            // Draw Values Right-Aligned
            ctx.textAlign = 'right';
            ctx.fillText(score, scoreEndX, y);
            ctx.fillText(maxHeight, heightEndX, y);
            ctx.fillText(time, timeEndX, y);
            ctx.textAlign = 'center';
            ctx.fillStyle = hasReplay ? '#8fd3ff' : 'rgba(155, 171, 178, 0.45)';
            ctx.fillText(hasReplay ? '▶' : '-', replayX, y);

            if (hasReplay) {
                leaderboardReplayHitboxes.push({
                    x: replayX - 18,
                    y: y - lineHeight / 2,
                    width: 36,
                    height: lineHeight,
                    entry
                });
            }
        });
    }

    // Retry / Exit instructions - NOW HANDLED BY HTML BUTTONS
    /* REMOVED:
    ctx.fillStyle = R64.YELLOW_ORANGE;
    ctx.font = '24px Petitinho';
    ctx.textAlign = 'center';
    // Calculate bottom Y based on loading state or number of entries
    const numEntriesDrawn = leaderboardData ? Math.min(leaderboardData.length, 10) : 0;
    const contentHeight = (leaderboardLoading || leaderboardError || !leaderboardData || leaderboardData.length === 0) ? 80 : (numEntriesDrawn + 1) * lineHeight;
    const leaderboardBottomY = startY + contentHeight;
    ctx.fillText('Refresh (F5) to Retry / Go Back', canvas.width / 2, leaderboardBottomY + 40);
    */
   // Show the HTML buttons instead
   ui.showGameOverControls();
}

// --- Draw Player ---
function drawPlayer(player) {
    if (player.visible === false) return;

    // --- Draw Trail First (behind main player) ---
    if (player.trailPositions && player.trailPositions.length > 0) {
        const trailColor = player.color; // Use player color or a custom one
        const maxAlpha = 0.3; // Max transparency of the ghosts

        for (let i = 0; i < player.trailPositions.length; i++) {
            const pos = player.trailPositions[i];
            // Fade the trail out the older it gets
            const alpha = maxAlpha * (1 - (i / player.maxTrailLength));
            drawPlayerSpriteAt(pos.x, pos.y, pos.facing || player.facing || 1, alpha, null);
        }
        ctx.globalAlpha = 1.0; // Reset alpha for the main player
    }

    // --- Draw Main Player (on top) ---
    drawPlayerSpriteAt(player.x, player.y, player.facing || 1, 1, null);
}

function drawPlatform(platform) {
    const sprite = sprites[platform.type] || sprites.normal;
    if (isSpriteReady(sprite)) {
        const drawHeight = Math.min(34, Math.max(24, platform.height * 1.45));
        const drawY = platform.y + platform.height - drawHeight;
        ctx.globalAlpha = platform.alpha;
        ctx.drawImage(sprite, platform.x, drawY, platform.width, drawHeight);
        ctx.globalAlpha = 1.0;
        return;
    }

    ctx.globalAlpha = platform.alpha;
    ctx.fillStyle = platform.color;
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = platform.middleColor;
    ctx.fillRect(platform.middleSection.x, platform.y, platform.middleSection.width, platform.height);
    ctx.globalAlpha = 1.0;
}

function getReplayPlatformPosition(platform, timeMs) {
    let x = platform.x;
    let replayHeight = platform.height;
    const movement = platform.movement;
    if (movement && timeMs >= platform.time) {
        const range = movement.range || 0;
        const speed = movement.speed || 0;
        if (range > 0 && speed > 0) {
            const distance = ((timeMs - platform.time) / 1000 * speed) % (range * 2);
            const offset = (distance <= range ? distance : (range * 2 - distance)) * (movement.direction || 1);
            if (movement.axis === 'x') {
                x += offset;
            } else if (movement.axis === 'y') {
                replayHeight -= offset / 10;
            }
        }
    }
    return { x, replayHeight };
}

function drawReplay() {
    const viewer = state.getReplayViewer();
    const sample = state.getReplaySampleAt(viewer?.time || 0);
    const replay = viewer?.replay;
    if (!viewer || !sample || !replay) return;

    const sourceWidth = replay.canvasWidth || canvas.width;
    const sourceHeight = replay.canvasHeight || canvas.height;
    const scaleX = canvas.width / sourceWidth;
    const scaleY = canvas.height / sourceHeight;
    const playerX = sample.xRatio * canvas.width - player.width / 2;
    let playerY = (sample.yRatio ?? 0.4) * canvas.height - player.height / 2;
    const cameraDrop = (sample.cameraDrop || 0) * scaleY;
    const replayPlatformScreenY = new Map();

    const platforms = state.getReplayPlatforms(replay);
    platforms.forEach(replayPlatform => {
        if (replayPlatform.time > viewer.time + 200) return;

        const moved = getReplayPlatformPosition(replayPlatform, viewer.time);
        const platformY = playerY + player.height + (sample.height - moved.replayHeight) * 10 - cameraDrop;
        replayPlatformScreenY.set(replayPlatform.id, platformY);
        if (platformY < -60 || platformY > canvas.height + 80) return;

        drawPlatform({
            type: replayPlatform.type || 'normal',
            x: moved.x * scaleX,
            y: platformY,
            width: replayPlatform.width * scaleX,
            height: 20,
            alpha: 1,
            color: R64.BASE_PLATFORM_RED,
            middleColor: R64.MIDDLE_PLATFORM_RED,
            middleSection: {
                x: moved.x * scaleX + replayPlatform.width * scaleX * 0.35,
                width: replayPlatform.width * scaleX * 0.3
            }
        });
    });

    if (sample.groundedPlatformId !== null && replayPlatformScreenY.has(sample.groundedPlatformId)) {
        playerY = replayPlatformScreenY.get(sample.groundedPlatformId) - player.height - 1;
    }

    if (sample.visible !== false) {
        drawPlayerSpriteAt(playerX, playerY, sample.facing || 1, 1, null);
    }
    drawDeathParticles();

    ctx.fillStyle = 'rgba(199, 220, 208, 0.9)';
    ctx.font = '20px Petitinho';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`REPLAY: ${(viewer.entry?.displayName || 'PLAYER').toUpperCase()}`, 20, 20);
    ctx.fillText(`SCORE: ${viewer.entry?.score ?? replay.score ?? 0}`, 20, 48);
    ctx.textAlign = 'right';
    ctx.fillText(`HEIGHT: ${Math.round(sample.height)} M`, canvas.width - 20, 20);
    ctx.fillText(`${formatTime(viewer.time, true)}`, canvas.width - 20, 48);
}

function drawDeathParticles() {
    if (deathParticles.length === 0) return;

    deathParticles = deathParticles.filter(particle => particle.life > 0);
    deathParticles.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.035;
        particle.life--;

        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        ctx.fillRect(
            particle.x - particle.size / 2,
            particle.y - particle.size / 2,
            particle.size,
            particle.size
        );
    });
    ctx.globalAlpha = 1.0;
}

// --- Main Draw Function ---
export function draw(player) {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const currentGameState = state.getCurrentGameState();

    // Draw Background (Starfield) - Always draw unless maybe MainMenu/Loading
    if (currentGameState !== state.GameState.MainMenu && currentGameState !== state.GameState.Loading) {
        stars.forEach(star => {
            ctx.globalAlpha = star.alpha;
            ctx.fillStyle = star.color;
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        ctx.globalAlpha = 1.0;
    }

    if (currentGameState === state.GameState.Replay) {
        drawReplay();
        return;
    }

    // Draw Playing-specific elements? No, draw even if paused/game over for visual context
    // if (currentGameState === state.GameState.Playing) { // REMOVE This check

        drawBestRunGhost(player);

        // Draw Player
        drawPlayer(player);

        // Draw Platforms
        state.getPlatforms().forEach(platform => {
            if (platform.isFlashing && !platform.flashVisible) {
                return;
            }
            drawPlatform(platform);
        });

        drawDeathParticles();

        // Draw Score Popups (Only if playing)
        if (currentGameState === state.GameState.Playing) {
            ctx.fillStyle = R64.WHITE;
            ctx.font = '18px Petitinho';
            ctx.textAlign = 'center';
            state.getScorePopups().forEach(popup => {
                ctx.globalAlpha = popup.alpha;
                ctx.fillText(popup.text, popup.x, popup.y);
            });
            ctx.globalAlpha = 1.0;
        }
    // } // REMOVE Corresponding closing brace

    // Draw HUD if Playing or GameOver
    if (currentGameState === state.GameState.Playing || currentGameState === state.GameState.Dying || currentGameState === state.GameState.GameOver) {
        drawHUD(player);
    }

    // Draw Game Over specifics (leaderboard, etc.)
    if (currentGameState === state.GameState.GameOver) {
        // Trigger fetch if needed
        if (!leaderboardLoading && leaderboardData === null && leaderboardError === null) {
             fetchLeaderboard();
        }
        drawGameOver(); // This function draws the Game Over text & leaderboard box/content
    } else {
        // Hide HTML controls if not in game over state
        ui.hideGameOverControls();
    }

    // Handle Loading state drawing
    if (currentGameState === state.GameState.Loading) {
         ctx.fillStyle = R64.WHITE;
         ctx.font = '40px Petitinho';
         ctx.textAlign = 'center';
         ctx.fillText('LOADING...', canvas.width / 2, canvas.height / 2);
    }
}
