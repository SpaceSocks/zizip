// This file will handle graphics, drawing, and canvas resizing

import { R64, SCORE_POPUP_LIFETIME, SCORE_POPUP_FADE_DURATION, SCORE_POPUP_SPEED } from './constants.js?v=mobile-portrait-78';
import * as state from './state.js?v=mobile-portrait-78';
import { player } from './entities.js?v=mobile-portrait-78'; // Need player for drawing
import * as ui from './ui.js?v=mobile-portrait-78'; // Import ui module

// --- Canvas Setup ---
export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');
let playfieldScale = 1;

export function getVisibleViewport() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || document.documentElement.clientHeight || window.innerHeight));
    return {
        width,
        height,
        offsetLeft: Math.round(viewport?.offsetLeft || 0),
        offsetTop: Math.round(viewport?.offsetTop || 0)
    };
}

function syncViewportStyles() {
    const viewport = getVisibleViewport();
    const root = document.documentElement;
    root.style.setProperty('--app-width', `${viewport.width}px`);
    root.style.setProperty('--app-height', `${viewport.height}px`);
    root.style.setProperty('--app-left', `${viewport.offsetLeft}px`);
    root.style.setProperty('--app-top', `${viewport.offsetTop}px`);

    const isTouch = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const isMobileViewport = isTouch && Math.min(viewport.width, viewport.height) <= 720;
    document.body?.classList.toggle('mobile-viewport', isMobileViewport);
    document.body?.classList.toggle('landscape-blocked', isMobileViewport && viewport.width > viewport.height);

    return viewport;
}

function getViewportPlayfieldScale(viewport) {
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const isPortraitPhone = isTouch && Math.min(viewport.width, viewport.height) <= 720 && viewport.height >= viewport.width;
    return isPortraitPhone ? 0.8 : 1;
}

export function getPlayfieldScale() {
    return playfieldScale;
}

// --- Starfield State ---
let stars = [];

// --- Leaderboard UI State ---
let leaderboardData = null;
let leaderboardLoading = false;
let leaderboardError = null;
let leaderboardNotice = null;
let leaderboardReplayHitboxes = [];
let replayPlatformPositionCache = new Map();
let replayPlatformPositionCacheKey = '';
let replayPlatformPositionCacheTime = 0;

const REPLAY_PLATFORM_CACHE_MAX_AGE_MS = 180;

canvas.addEventListener('click', (event) => {
    if (state.getCurrentGameState() !== state.GameState.GameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
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
    playerSheet: 'Sprites/game/player-sheet.png?v=player-anim-1',
    normal: 'Sprites/game/platform-normal.png?v=sprite-forge-1',
    ice: 'Sprites/game/platform-ice.png?v=sprite-forge-1',
    moving: 'Sprites/game/platform-moving.png?v=sprite-forge-1'
};

const PLAYER_ANIMATION = {
    frameWidth: 70,
    frameHeight: 110,
    idle: { start: 0, frames: 1, fps: 1 },
    walk: { start: 1, frames: 4, fps: 10 },
    jump: { start: 5, frames: 1, fps: 1 },
    fall: { start: 6, frames: 1, fps: 1 }
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
const STAR_SIZE_SCALE = 2;
const WHITE_STAR_SPEED_SCALE = 3;
const ACHIEVEMENT_TOAST_LIFETIME = 4200;
const ACHIEVEMENT_TOAST_FADE = 350;

let deathParticles = [];

function createStar(variant) {
    const speedScale = variant.color === '#ffffff' ? WHITE_STAR_SPEED_SCALE : 1;
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.max(2, Math.round((Math.random() * (variant.sizeMax - variant.sizeMin) + variant.sizeMin) * STAR_SIZE_SCALE)),
        speed: (Math.random() * (variant.speedMax - variant.speedMin) + variant.speedMin) * speedScale,
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

export function spawnReplayDeathExplosion(event = {}) {
    const replay = state.getReplayViewer()?.replay;
    const view = getReplayView(replay || {});
    const x = view.x + (event.xRatio ?? 0.5) * view.sourceWidth * view.scaleX;
    const y = view.y + (event.yRatio ?? 0.68) * view.sourceHeight * view.scaleY;
    spawnDeathExplosion(x, y);
}

// --- Canvas Resizing ---
export function resizeCanvas() {
    const viewport = syncViewportStyles();
    playfieldScale = getViewportPlayfieldScale(viewport);
    canvas.width = Math.round(viewport.width / playfieldScale);
    canvas.height = Math.round(viewport.height / playfieldScale);
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
    if (isCompactHUD()) {
        drawCompactHUD(player);
        return;
    }

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
    const achievementToastY = trackName !== "None" ? yPos + 28 : yPos + 4;
    drawAchievementToasts(canvas.width / 2, achievementToastY, canvas.width - 80, false);

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

    const controlHint = window.__cosmicZipGetControlHint?.()
        || (document.body?.classList.contains('mobile-viewport') ? '' : 'A/D MOVE   SPACE JUMP   ESC PAUSE');
    if (controlHint && state.getElapsedTime() < 9000 && state.getScore() < 30) {
        ctx.fillStyle = 'rgba(199, 220, 208, 0.88)';
        ctx.font = '18px Petitinho';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(controlHint, canvas.width / 2, canvas.height - 22, canvas.width - 40);
    }

    const comboMultiplier = state.getComboMultiplier();
    const perfectStreak = state.getPerfectLandingStreak();
    if (comboMultiplier > 1) {
        ctx.fillStyle = R64.YELLOW;
        ctx.font = '22px Petitinho';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`PERFECT STREAK ${perfectStreak}  x${comboMultiplier}`, canvas.width / 2, achievementToastY + 36);
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
    leaderboardNotice = null;
    leaderboardLoading = false;
}

function isCompactHUD() {
    return canvas.width <= 720 || (window.matchMedia?.('(pointer: coarse)').matches && canvas.width <= 900);
}

function drawCompactHUD(player) {
    const displayName = state.getDisplayName();
    const elapsedTimeMs = state.getElapsedTime();
    const formattedTime = formatTime(elapsedTimeMs, true);
    const currentHeight = player ? getDisplayedRunHeight(player) : 0;
    const edge = Math.max(10, Math.round(canvas.width * 0.028));
    const top = 14;
    const halfWidth = canvas.width / 2;

    ctx.fillStyle = R64.WHITE;
    ctx.textBaseline = 'top';

    ctx.font = '14px Petitinho';
    ctx.textAlign = 'left';
    if (displayName) {
        ctx.fillText(`PLAYER: ${displayName}`, edge, top, halfWidth - 18);
    }
    ctx.fillText(`LIVES: ${state.getLives()}`, edge, top + 20, halfWidth - 18);

    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${state.getScore()}`, canvas.width - edge, top, halfWidth - 18);
    ctx.fillText(`HEIGHT: ${Math.round(state.getMaxHeight())} M`, canvas.width - edge, top + 20, halfWidth - 18);

    ctx.textAlign = 'center';
    ctx.font = '16px Petitinho';
    ctx.fillText(formattedTime, halfWidth, top + 40, canvas.width - edge * 2);

    const trackName = state.getCurrentTrackInfo();
    if (trackName !== "None" && canvas.height > 620) {
        ctx.fillStyle = 'rgba(199, 220, 208, 0.86)';
        ctx.font = '12px Petitinho';
        ctx.fillText(`Playing: ${trackName}`, halfWidth, top + 60, canvas.width - edge * 2);
    }
    drawAchievementToasts(halfWidth, top + 82, canvas.width - edge * 2, true);

    ctx.fillStyle = R64.WHITE;
    ctx.font = `${Math.min(17, Math.max(14, Math.round(canvas.width * 0.04)))}px Petitinho`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.floor(currentHeight)} M`, canvas.width - edge, Math.round(canvas.height * 0.42), canvas.width * 0.64);

    const comboMultiplier = state.getComboMultiplier();
    const perfectStreak = state.getPerfectLandingStreak();
    if (comboMultiplier > 1) {
        ctx.fillStyle = R64.YELLOW;
        ctx.font = '16px Petitinho';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`PERFECT ${perfectStreak} x${comboMultiplier}`, halfWidth, top + 122, canvas.width - edge * 2);
    }
}

function drawAchievementToasts(centerX, y, maxWidth, compact = false) {
    const now = Date.now();
    const popups = state.getAchievementPopups?.() || [];
    if (!popups.length) return;

    state.filterAchievementPopups?.(popup => now - popup.createdAt <= ACHIEVEMENT_TOAST_LIFETIME);
    const visiblePopups = state.getAchievementPopups?.() || [];
    if (!visiblePopups.length) return;

    const popup = visiblePopups[0];
    const age = now - popup.createdAt;
    const fadeOutStart = ACHIEVEMENT_TOAST_LIFETIME - ACHIEVEMENT_TOAST_FADE;
    const alpha = age < ACHIEVEMENT_TOAST_FADE
        ? age / ACHIEVEMENT_TOAST_FADE
        : age > fadeOutStart
            ? (ACHIEVEMENT_TOAST_LIFETIME - age) / ACHIEVEMENT_TOAST_FADE
            : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const width = Math.min(maxWidth, compact ? 310 : 420);
    const height = compact ? 38 : 46;
    const x = centerX - width / 2;
    ctx.fillStyle = 'rgba(46, 34, 47, 0.92)';
    ctx.strokeStyle = R64.YELLOW;
    ctx.lineWidth = compact ? 2 : 3;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = R64.YELLOW;
    ctx.font = `${compact ? 12 : 15}px Petitinho`;
    ctx.fillText('ACHIEVEMENT UNLOCKED', centerX, y + (compact ? 5 : 6), width - 16);
    ctx.fillStyle = R64.WHITE;
    ctx.font = `${compact ? 15 : 19}px Petitinho`;
    ctx.fillText(String(popup.title || '').toUpperCase(), centerX, y + (compact ? 19 : 24), width - 18);
    ctx.restore();
}

function getDisplayedRunHeight(player) {
    return state.getMaxHeight() + Math.max(0, (state.getInitialPlayerY() - player.y) / 10);
}

function getPlayerSpriteDrawBox(x, y, sizeScale = 1) {
    const bodyWidth = player.width * sizeScale;
    const bodyHeight = player.height * sizeScale;
    const drawWidth = bodyWidth * 1.6;
    const drawHeight = bodyHeight * 1.35;
    return {
        x: x + bodyWidth / 2 - drawWidth / 2,
        y: y + bodyHeight - drawHeight,
        width: drawWidth,
        height: drawHeight
    };
}

function getPlayerAnimationState(playerLike) {
    if (!playerLike?.isGrounded) {
        return playerLike?.velocityY < 0 ? 'jump' : 'fall';
    }
    return Math.abs(playerLike?.velocityX || 0) > 0.35 ? 'walk' : 'idle';
}

function getPlayerAnimationFrame(animationState = 'idle', timeMs = performance.now()) {
    const animation = PLAYER_ANIMATION[animationState] || PLAYER_ANIMATION.idle;
    return animation.start + Math.floor((timeMs / 1000) * animation.fps) % animation.frames;
}

function drawPlayerSpriteAt(x, y, facing = 1, alpha = 1, tint = null, sizeScale = 1, animationState = 'idle', animationFrame = null, rotation = 0) {
    const box = getPlayerSpriteDrawBox(x, y, sizeScale);
    const frameIndex = Number.isFinite(animationFrame)
        ? animationFrame
        : getPlayerAnimationFrame(animationState);

    ctx.save();
    ctx.globalAlpha = alpha;
    const sprite = isSpriteReady(sprites.playerSheet) ? sprites.playerSheet : sprites.player;
    if (tint && isSpriteReady(sprite)) {
        ctx.filter = 'brightness(0.5) saturate(0.75)';
    }

    if (isSpriteReady(sprite)) {
        if (rotation) {
            ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
            ctx.rotate(rotation);
            if (facing < 0) {
                ctx.scale(-1, 1);
            }
            const drawX = -box.width / 2;
            const drawY = -box.height / 2;
            if (sprite === sprites.playerSheet) {
                ctx.drawImage(sprite, frameIndex * PLAYER_ANIMATION.frameWidth, 0, PLAYER_ANIMATION.frameWidth, PLAYER_ANIMATION.frameHeight, drawX, drawY, box.width, box.height);
            } else {
                ctx.drawImage(sprite, drawX, drawY, box.width, box.height);
            }
            ctx.restore();
            return;
        }

        if (facing < 0) {
            ctx.translate(box.x + box.width, box.y);
            ctx.scale(-1, 1);
            if (sprite === sprites.playerSheet) {
                ctx.drawImage(sprite, frameIndex * PLAYER_ANIMATION.frameWidth, 0, PLAYER_ANIMATION.frameWidth, PLAYER_ANIMATION.frameHeight, 0, 0, box.width, box.height);
            } else {
                ctx.drawImage(sprite, 0, 0, box.width, box.height);
            }
        } else {
            if (sprite === sprites.playerSheet) {
                ctx.drawImage(sprite, frameIndex * PLAYER_ANIMATION.frameWidth, 0, PLAYER_ANIMATION.frameWidth, PLAYER_ANIMATION.frameHeight, box.x, box.y, box.width, box.height);
            } else {
                ctx.drawImage(sprite, box.x, box.y, box.width, box.height);
            }
        }
    } else {
        ctx.fillStyle = tint || player.color;
        if (rotation) {
            const width = player.width * sizeScale;
            const height = player.height * sizeScale;
            ctx.translate(x + width / 2, y + height / 2);
            ctx.rotate(rotation);
            ctx.fillRect(-width / 2, -height / 2, width, height);
        } else {
            ctx.fillRect(x, y, player.width * sizeScale, player.height * sizeScale);
        }
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
    if (force) state.clearLeaderboardCache();
    leaderboardLoading = true;
    leaderboardData = null; // Clear old data
    leaderboardError = null;
    leaderboardNotice = null;
    const requestedSource = state.getActiveLeaderboardSource();
    try {
        // Now actually call the async function from state.js
        leaderboardData = await state.getLeaderboard(requestedSource);
        console.log("Leaderboard data received in graphics.js:", leaderboardData);
    } catch (err) {
        console.error("Error fetching leaderboard in graphics.js:", err);
        if (requestedSource === 'global') {
            try {
                leaderboardData = await state.getLeaderboard('local');
                leaderboardNotice = 'Global unavailable - local scores';
                leaderboardError = null;
                return;
            } catch (localError) {
                console.warn("Local leaderboard fallback also failed.", localError);
            }
        }
        leaderboardError = "Failed to load leaderboard.";
    } finally {
        leaderboardLoading = false;
    }
}

// Draw Game Over Screen
function drawGameOver() {
    // drawBackground(); // REMOVED - Background drawn in main draw loop
    if (isCompactHUD()) {
        drawCompactGameOver();
        return;
    }

    ctx.fillStyle = R64.RED;
    ctx.font = '80px Petitinho';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.2);
    leaderboardReplayHitboxes = [];
    ui.showGameOverControls();
    return;

    // Draw Leaderboard Section
    ctx.fillStyle = R64.WHITE;
    ctx.font = '36px Petitinho';
    ctx.fillText('Leaderboard', canvas.width / 2, canvas.height * 0.33);

    // --- Display Leaderboard ---
    const startY = canvas.height * 0.4;
    const lineHeight = 30;
    const maxEntries = 10;
    // Reduce width - use 60% or a max pixel value
    const leaderboardWidth = Math.min(canvas.width * 0.82, 820); // Wider box so headers and stats do not collide.
    const leaderboardHeight = (maxEntries + 1) * lineHeight + 40;
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
    const replayX = leaderboardX + leaderboardWidth - padding - 22;
    const timeEndX = replayX - 64;
    const heightEndX = timeEndX - 98;
    const scoreEndX = heightEndX - 96;
    // Name column max width derived from score start
    const maxNameWidth = scoreEndX - nameX - 20;

    const headerY = startY - lineHeight / 2;
    ctx.fillStyle = 'rgba(199, 220, 208, 0.88)';
    ctx.font = '18px Petitinho';
    ctx.textAlign = 'left';
    ctx.fillText("#", rankX, headerY);
    ctx.fillText("NAME", nameX, headerY);
    ctx.textAlign = 'right';
    ctx.fillText("SCORE", scoreEndX, headerY);
    ctx.fillText("MAX H", heightEndX, headerY);
    ctx.fillText("TIME", timeEndX, headerY);
    ctx.textAlign = 'center';
    ctx.fillText("RUN", replayX, headerY);
    ctx.font = '20px Petitinho';
    ctx.fillStyle = R64.WHITE;

    // --- Loading / Error / Empty States ---
    if (leaderboardNotice) {
        ctx.textAlign = 'center';
        ctx.fillStyle = R64.YELLOW;
        ctx.font = '16px Petitinho';
        ctx.fillText(leaderboardNotice.toUpperCase(), canvas.width / 2, startY - lineHeight * 1.45);
        ctx.font = '20px Petitinho';
        ctx.fillStyle = R64.WHITE;
    }

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
            const y = startY + ((index + 1) * lineHeight); // Position for the current line
            const rank = `${index + 1}.`;
            const displayName = entry.displayName ? entry.displayName.toUpperCase() : 'ANON';
            const score = entry.score !== undefined ? entry.score.toString() : 'N/A'; // Convert score to string
            const maxHeight = entry.maxHeight !== undefined ? `${Math.round(entry.maxHeight)} M` : 'N/A'; // Round height
            const time = entry.time || 'N/A';
            const hasReplay = state.hasReplayData(entry.replay);

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

function drawCompactGameOver() {
    const edge = Math.max(12, Math.round(canvas.width * 0.035));
    const titleY = Math.max(76, Math.round(canvas.height * 0.12));
    const titleFont = Math.min(42, Math.max(30, Math.round(canvas.width * 0.105)));
    const headerFont = Math.min(25, Math.max(18, Math.round(canvas.width * 0.06)));
    const rowFont = Math.min(18, Math.max(14, Math.round(canvas.width * 0.042)));
    const lineHeight = Math.max(24, Math.round(rowFont * 1.55));
    const maxEntries = 5;
    const leaderboardWidth = canvas.width - edge * 2;
    const leaderboardX = edge;
    const startY = titleY + titleFont + 56;
    const leaderboardHeight = lineHeight * (maxEntries + 1) + 20;
    const padding = 10;

    leaderboardReplayHitboxes = [];

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = R64.RED;
    ctx.font = `${titleFont}px Petitinho`;
    ctx.fillText('GAME OVER', canvas.width / 2, titleY, canvas.width - edge * 2);
    leaderboardReplayHitboxes = [];
    ui.showGameOverControls();
    return;

    ctx.fillStyle = R64.WHITE;
    ctx.font = `${headerFont}px Petitinho`;
    ctx.fillText('LEADERBOARD', canvas.width / 2, titleY + titleFont + 28, canvas.width - edge * 2);

    ctx.fillStyle = 'rgba(46, 34, 47, 0.82)';
    ctx.fillRect(leaderboardX, startY, leaderboardWidth, leaderboardHeight);
    ctx.strokeStyle = 'rgba(199, 220, 208, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(leaderboardX, startY, leaderboardWidth, leaderboardHeight);

    ctx.font = `${rowFont}px Petitinho`;
    ctx.fillStyle = 'rgba(199, 220, 208, 0.82)';
    ctx.textBaseline = 'middle';

    const rankX = leaderboardX + padding;
    const nameX = rankX + 34;
    const replayX = leaderboardX + leaderboardWidth - padding - 12;
    const timeEndX = replayX - 34;
    const heightEndX = timeEndX - 62;
    const scoreEndX = heightEndX - 62;
    const maxNameWidth = Math.max(44, scoreEndX - nameX - 12);

    const headerY = startY + lineHeight / 2;
    const bodyFont = ctx.font;
    ctx.font = `${Math.max(12, rowFont - 3)}px Petitinho`;
    ctx.textAlign = 'left';
    ctx.fillText('#', rankX, headerY);
    ctx.fillText('NAME', nameX, headerY, maxNameWidth);
    ctx.textAlign = 'right';
    ctx.fillText('SCORE', scoreEndX, headerY);
    ctx.fillText('MAX H', heightEndX, headerY);
    ctx.fillText('TIME', timeEndX, headerY);
    ctx.textAlign = 'center';
    ctx.fillText('RUN', replayX, headerY);
    ctx.font = bodyFont;

    if (leaderboardNotice) {
        ctx.textAlign = 'center';
        ctx.fillStyle = R64.YELLOW;
        ctx.font = `${Math.max(11, rowFont - 2)}px Petitinho`;
        ctx.fillText(leaderboardNotice.toUpperCase(), canvas.width / 2, startY - 13, leaderboardWidth - padding * 2);
        ctx.font = `${rowFont}px Petitinho`;
    }

    if (leaderboardLoading || leaderboardError || !leaderboardData || leaderboardData.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = leaderboardError ? R64.RED : R64.WHITE;
        const message = leaderboardLoading
            ? 'LOADING...'
            : leaderboardError
                ? leaderboardError.toUpperCase()
                : 'NO RUNS YET';
        ctx.fillText(message, canvas.width / 2, startY + leaderboardHeight / 2, leaderboardWidth - padding * 2);
    } else {
        leaderboardData.slice(0, maxEntries).forEach((entry, index) => {
            const y = startY + lineHeight * (index + 1.5);
            const lastScore = state.getLastSubmittedScore();
            const isCurrentPlayer = lastScore &&
                entry.score === lastScore.score &&
                Math.round(entry.maxHeight || 0) === Math.round(lastScore.maxHeight || 0) &&
                entry.displayName === lastScore.displayName;

            if (isCurrentPlayer) {
                ctx.fillStyle = 'rgba(249, 194, 43, 0.18)';
                ctx.fillRect(leaderboardX + 4, y - lineHeight / 2 + 2, leaderboardWidth - 8, lineHeight - 4);
            }

            const displayName = (entry.displayName || 'ANON').toUpperCase();
            const score = entry.score !== undefined ? String(entry.score) : '-';
            const maxHeight = entry.maxHeight !== undefined ? `${Math.round(entry.maxHeight)}` : '-';
            const time = entry.time || '-';
            const hasReplay = state.hasReplayData(entry.replay);

            ctx.fillStyle = R64.WHITE;
            ctx.textAlign = 'left';
            ctx.fillText(`${index + 1}`, rankX, y);

            let truncatedName = displayName;
            while (ctx.measureText(truncatedName).width > maxNameWidth && truncatedName.length > 1) {
                truncatedName = truncatedName.slice(0, -1);
            }
            if (truncatedName.length < displayName.length) truncatedName = `${truncatedName.slice(0, -3)}...`;
            ctx.fillText(truncatedName, nameX, y, maxNameWidth);

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
        drawPlayerSpriteAt(pos.x, pos.y, pos.facing || player.facing || 1, alpha, null, 1, pos.animationState || 'idle', pos.animationFrame);
        }
        ctx.globalAlpha = 1.0; // Reset alpha for the main player
    }

    // --- Draw Main Player (on top) ---
    drawPlayerSpriteAt(
        player.x,
        player.y,
        player.facing || 1,
        1,
        null,
        1,
        getPlayerAnimationState(player),
        null,
        player.tumbleActive ? (player.tumbleAngle || 0) : 0
    );
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

function getReplayCacheKey(viewer) {
    const replay = viewer?.replay || {};
    const entry = viewer?.entry || {};
    return [
        entry.id || entry.uid || entry.userId || entry.name || '',
        replay.savedAt || '',
        replay.duration || ''
    ].join(':');
}

function syncReplayPlatformPositionCache(viewer) {
    const cacheKey = getReplayCacheKey(viewer);
    const timeMs = viewer?.time || 0;
    if (
        cacheKey !== replayPlatformPositionCacheKey ||
        timeMs < replayPlatformPositionCacheTime - 1 ||
        Math.abs(timeMs - replayPlatformPositionCacheTime) > 1000
    ) {
        replayPlatformPositionCache = new Map();
        replayPlatformPositionCacheKey = cacheKey;
    }
    replayPlatformPositionCacheTime = timeMs;
}

function getReplayPlatformPosition(platform, timeMs, sample = null, positionCache = null) {
    const snapshot = sample?.platformSnapshots?.find(item => item.id === platform.id);
    if (snapshot) {
        const position = { x: snapshot.x, y: snapshot.y, replayHeight: platform.height };
        positionCache?.set(platform.id, { ...position, time: timeMs });
        return position;
    }

    const cached = positionCache?.get(platform.id);
    if (platform.movement && cached && Math.abs(timeMs - cached.time) <= REPLAY_PLATFORM_CACHE_MAX_AGE_MS) {
        return { x: cached.x, y: cached.y, replayHeight: cached.replayHeight };
    }

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

function drawReplayScorePopups(viewer, view) {
    const events = state.getReplayEventsForCurrentViewer();
    const sourceWidth = view.sourceWidth;
    const sourceHeight = view.sourceHeight;
    const scaleX = view.scaleX;
    const scaleY = view.scaleY;

    ctx.save();
    ctx.font = `${Math.max(14, 18 * view.spriteScale)}px Petitinho`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    events.forEach(event => {
        if (event.type !== 'landing' || !event.scoreText) return;
        if (!Number.isFinite(Number(event.xRatio)) || !Number.isFinite(Number(event.yRatio))) return;

        const age = viewer.time - (event.time || 0);
        if (age < 0 || age > SCORE_POPUP_LIFETIME) return;

        let alpha = 1;
        if (age < SCORE_POPUP_FADE_DURATION) {
            alpha = age / SCORE_POPUP_FADE_DURATION;
        } else if (age > SCORE_POPUP_LIFETIME - SCORE_POPUP_FADE_DURATION) {
            alpha = (SCORE_POPUP_LIFETIME - age) / SCORE_POPUP_FADE_DURATION;
        }

        const x = view.x + Number(event.xRatio) * sourceWidth * scaleX;
        const y = view.y + Number(event.yRatio) * sourceHeight * scaleY - SCORE_POPUP_SPEED * (age / 1000) * 60 * scaleY;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = R64.WHITE;
        ctx.fillText(String(event.scoreText).slice(0, 16), x, y);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
}

function getReplayView(replay) {
    const sourceWidth = Math.max(1, replay.canvasWidth || canvas.width);
    const sourceHeight = Math.max(1, replay.canvasHeight || canvas.height);
    const isPhoneViewer = document.body?.classList.contains('mobile-viewport') ||
        (window.matchMedia?.('(pointer: coarse)').matches && canvas.height >= canvas.width && Math.min(canvas.width, canvas.height) <= 900);
    const sourceLooksMobile = sourceHeight > sourceWidth * 1.12 && sourceWidth <= 900;
    const isMobileReplay = replay.isMobileRun === true ||
        replay.viewportProfile === 'mobile' ||
        sourceLooksMobile;

    if (!isMobileReplay || isPhoneViewer) {
        return {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            sourceWidth,
            sourceHeight,
            scaleX: canvas.width / sourceWidth,
            scaleY: canvas.height / sourceHeight,
            spriteScale: Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight),
            isMobileReplay,
            isLetterboxed: false
        };
    }

    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    return {
        x: Math.round((canvas.width - width) / 2),
        y: Math.round((canvas.height - height) / 2),
        width,
        height,
        sourceWidth,
        sourceHeight,
        scaleX: scale,
        scaleY: scale,
        spriteScale: scale,
        isMobileReplay: true,
        isLetterboxed: width < canvas.width - 2 || height < canvas.height - 2
    };
}

function drawReplayLetterbox(view) {
    if (!view.isLetterboxed) return;

    ctx.save();
    ctx.fillStyle = '#000000';
    if (view.x > 0) {
        ctx.fillRect(0, 0, view.x, canvas.height);
        ctx.fillRect(view.x + view.width, 0, canvas.width - view.x - view.width, canvas.height);
    }
    if (view.y > 0) {
        ctx.fillRect(0, 0, canvas.width, view.y);
        ctx.fillRect(0, view.y + view.height, canvas.width, canvas.height - view.y - view.height);
    }
    ctx.strokeStyle = 'rgba(199, 220, 208, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(view.x + 1, view.y + 1, view.width - 2, view.height - 2);
    ctx.restore();
}

function clipToReplayView(view) {
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.width, view.height);
    ctx.clip();
}

function isReplayPlatformTooOld(replayPlatform, sample, timeMs) {
    const currentHeight = sample.height || 0;
    const platformHeight = replayPlatform.height || 0;
    const hasExpiredLikeGameplay = timeMs - (replayPlatform.time || 0) > 6500 && platformHeight < currentHeight - 25;
    return hasExpiredLikeGameplay || platformHeight < currentHeight - 120;
}

function drawReplayFallbackPlatform(view, sample, playerX, playerY, playerDrawWidth, playerDrawHeight) {
    if ((sample.height || 0) > 3 || sample.groundedPlatformId !== null) return;

    const fallbackWidth = Math.min(180 * view.scaleX, Math.max(110, view.width * 0.32));
    const fallbackHeight = 20 * view.scaleY;
    const platformX = Math.max(
        view.x + 12,
        Math.min(view.x + view.width - fallbackWidth - 12, playerX + playerDrawWidth / 2 - fallbackWidth / 2)
    );
    const platformY = Math.min(view.y + view.height - fallbackHeight - 12, playerY + playerDrawHeight + 1);
    drawPlatform({
        type: 'normal',
        x: platformX,
        y: platformY,
        width: fallbackWidth,
        height: fallbackHeight,
        alpha: 1,
        color: R64.BASE_PLATFORM_RED,
        middleColor: R64.MIDDLE_PLATFORM_RED,
        middleSection: {
            x: platformX + fallbackWidth * 0.35,
            width: fallbackWidth * 0.3
        }
    });
}

function getReplayPlayerScreenPosition(
    replaySample,
    view,
    spriteScale,
    replayPlatformScreenX = null,
    replayPlatformScreenY = null,
    replayPlatformData = null
) {
    const sourceWidth = view.sourceWidth;
    const sourceHeight = view.sourceHeight;
    const scaleX = view.scaleX;
    const scaleY = view.scaleY;
    const playerDrawWidth = player.width * spriteScale;
    const playerDrawHeight = player.height * spriteScale;
    let x = view.x + replaySample.xRatio * sourceWidth * scaleX - playerDrawWidth / 2;
    let y = view.y + (replaySample.yRatio ?? 0.4) * sourceHeight * scaleY - playerDrawHeight / 2;

    const compactReplay = isCompactHUD() || view.width < 720;
    if (compactReplay) {
        const topSafe = view.y + 96 * scaleY;
        const bottomSafe = Math.max(topSafe + 60 * scaleY, view.y + view.height - 220 * scaleY);
        y = Math.max(topSafe, Math.min(bottomSafe, y));
    }

    if (
        replaySample.groundedPlatformId !== null &&
        replayPlatformScreenY?.has(replaySample.groundedPlatformId)
    ) {
        const groundedPlatform = replayPlatformData?.get(replaySample.groundedPlatformId);
        const groundedX = replayPlatformScreenX?.get(replaySample.groundedPlatformId);
        const offsetRatio = Number.isFinite(replaySample.groundedOffsetRatio) ? replaySample.groundedOffsetRatio : 0.5;
        if (groundedPlatform && Number.isFinite(groundedX)) {
            x = groundedX + groundedPlatform.width * scaleX * offsetRatio - playerDrawWidth / 2;
        }
        y = replayPlatformScreenY.get(replaySample.groundedPlatformId) - playerDrawHeight - 1;
    }

    return { x, y, width: playerDrawWidth, height: playerDrawHeight };
}

function drawReplayPlayerTrail(viewer, view, spriteScale, replayPlatformScreenX, replayPlatformScreenY, replayPlatformData) {
    const trailOffsets = [360, 260, 170, 90];
    trailOffsets.forEach((offset, index) => {
        const trailTime = viewer.time - offset;
        if (trailTime <= 0) return;

        const trailSample = state.getReplaySampleAt(trailTime);
        if (!trailSample || trailSample.visible === false) return;

        const trailPosition = getReplayPlayerScreenPosition(
            trailSample,
            view,
            spriteScale,
            replayPlatformScreenX,
            replayPlatformScreenY,
            replayPlatformData
        );
        if (trailPosition.y < view.y - player.height || trailPosition.y > view.y + view.height + player.height) return;

        drawPlayerSpriteAt(
            trailPosition.x,
            trailPosition.y,
            trailSample.facing || 1,
            0.08 + index * 0.04,
            '#2b8cc9',
            spriteScale,
            trailSample.animationState || 'idle',
            trailSample.animationFrame
        );
    });
}

function drawReplay() {
    const viewer = state.getReplayViewer();
    const sample = state.getReplaySampleAt(viewer?.time || 0);
    const replay = viewer?.replay;
    if (!viewer || !sample || !replay) return;

    const view = getReplayView(replay);
    syncReplayPlatformPositionCache(viewer);
    drawReplayLetterbox(view);

    const sourceWidth = view.sourceWidth;
    const sourceHeight = view.sourceHeight;
    const scaleX = view.scaleX;
    const scaleY = view.scaleY;
    const spriteScale = Math.max(0.35, view.spriteScale || 1);
    const basePlayerPosition = getReplayPlayerScreenPosition(sample, view, spriteScale);
    const playerDrawWidth = basePlayerPosition.width;
    const playerDrawHeight = basePlayerPosition.height;
    let playerX = basePlayerPosition.x;
    let playerY = basePlayerPosition.y;
    const cameraDrop = (sample.cameraDrop || 0) * scaleY;
    const replayPlatformScreenY = new Map();
    const replayPlatformScreenX = new Map();
    const replayPlatformData = new Map();
    let visiblePlatformCount = 0;

    ctx.save();
    clipToReplayView(view);

    const platforms = state.getReplayPlatforms(replay);
    platforms.forEach(replayPlatform => {
        if (replayPlatform.time > viewer.time + 200) return;
        if (isReplayPlatformTooOld(replayPlatform, sample, viewer.time)) return;

        const moved = getReplayPlatformPosition(replayPlatform, viewer.time, sample, replayPlatformPositionCache);
        const platformY = Number.isFinite(moved.y)
            ? view.y + moved.y * scaleY
            : playerY + playerDrawHeight + (sample.height - moved.replayHeight) * 10 * scaleY - cameraDrop;
        const platformX = view.x + moved.x * scaleX;
        replayPlatformScreenY.set(replayPlatform.id, platformY);
        replayPlatformScreenX.set(replayPlatform.id, platformX);
        replayPlatformData.set(replayPlatform.id, replayPlatform);
        if (platformY < view.y - 60 || platformY > view.y + view.height + 80) return;

        drawPlatform({
            type: replayPlatform.type || 'normal',
            x: platformX,
            y: platformY,
            width: replayPlatform.width * scaleX,
            height: 20 * scaleY,
            alpha: 1,
            color: R64.BASE_PLATFORM_RED,
            middleColor: R64.MIDDLE_PLATFORM_RED,
            middleSection: {
                x: view.x + moved.x * scaleX + replayPlatform.width * scaleX * 0.35,
                width: replayPlatform.width * scaleX * 0.3
            }
        });
        visiblePlatformCount++;
    });

    const playerPosition = getReplayPlayerScreenPosition(sample, view, spriteScale, replayPlatformScreenX, replayPlatformScreenY, replayPlatformData);
    playerX = playerPosition.x;
    playerY = playerPosition.y;

    if (sample.visible !== false) {
        if (visiblePlatformCount === 0) {
            drawReplayFallbackPlatform(view, sample, playerX, playerY, playerDrawWidth, playerDrawHeight);
        }
        drawReplayPlayerTrail(viewer, view, spriteScale, replayPlatformScreenX, replayPlatformScreenY, replayPlatformData);
        drawPlayerSpriteAt(playerX, playerY, sample.facing || 1, 1, null, spriteScale, sample.animationState || 'idle', sample.animationFrame, sample.tumbleAngle || 0);
        drawReplayScorePopups(viewer, view);
    }
    drawDeathParticles();
    ctx.restore();

    const compactReplay = isCompactHUD() || view.width < 720;
    const edge = compactReplay ? 12 : 20;
    const replayFont = compactReplay ? Math.min(17, Math.max(13, Math.round(view.width * 0.04))) : 20;
    const replayLineHeight = compactReplay ? Math.round(replayFont * 1.55) : 28;
    const hudLeft = view.x + edge;
    const hudRight = view.x + view.width - edge;
    const hudWidth = Math.max(1, view.width - edge * 2);

    ctx.fillStyle = 'rgba(199, 220, 208, 0.9)';
    ctx.font = `${replayFont}px Petitinho`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`REPLAY: ${(viewer.entry?.displayName || 'PLAYER').toUpperCase()}`, hudLeft, view.y + edge, hudWidth * 0.58);
    ctx.fillText(`SCORE: ${viewer.entry?.score ?? replay.score ?? 0}`, hudLeft, view.y + edge + replayLineHeight, hudWidth * 0.45);
    ctx.textAlign = 'right';
    ctx.fillText(`HEIGHT: ${Math.round(sample.height)} M`, hudRight, view.y + edge, hudWidth * 0.42);
    ctx.fillText(`${formatTime(viewer.time, true)}`, hudRight, view.y + edge + replayLineHeight, hudWidth * 0.42);
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
            ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
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
    if (currentGameState === state.GameState.Playing || currentGameState === state.GameState.Dying) {
        drawHUD(player);
    }

    // Draw Game Over specifics (leaderboard, etc.)
    if (currentGameState === state.GameState.GameOver) {
        drawGameOver();
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
