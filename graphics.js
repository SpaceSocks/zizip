// This file will handle graphics, drawing, and canvas resizing 

import { R64, NUM_STARS_VERTICAL, NUM_STARS_SLOW, NUM_STARS_MEDIUM, NUM_STARS_FAST } from './constants.js';
import * as state from './state.js';
import { player } from './entities.js'; // Need player for drawing
import * as ui from './ui.js'; // Import ui module

// --- Canvas Setup ---
export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');

// --- Starfield State ---
let starsVertical = [];
let starsHorizontalSlow = [];
let starsHorizontalMedium = [];
let starsHorizontalFast = [];

// --- Leaderboard UI State ---
let leaderboardData = null;
let leaderboardLoading = false;
let leaderboardError = null;

// --- Starfield Creation ---
function createStarVertical() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 0.5 + 0.1 // Parallax speed (vertical)
    };
}

function createStarHorizontal(speedMin, speedMax, sizeMin, sizeMax, alphaMin, alphaMax) {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * (sizeMax - sizeMin) + sizeMin,
        speed: Math.random() * (speedMax - speedMin) + speedMin, // Horizontal speed
        alpha: Math.random() * (alphaMax - alphaMin) + alphaMin
    };
}

export function initializeStars() {
    console.log("Initializing stars...");
    starsVertical = [];
    starsHorizontalSlow = [];
    starsHorizontalMedium = [];
    starsHorizontalFast = [];

    for (let i = 0; i < NUM_STARS_VERTICAL; i++) {
        starsVertical.push(createStarVertical());
    }
    for (let i = 0; i < NUM_STARS_SLOW; i++) {
        starsHorizontalSlow.push(createStarHorizontal(0.1, 0.3, 0.5, 1.0, 0.2, 0.5));
    }
    for (let i = 0; i < NUM_STARS_MEDIUM; i++) {
        starsHorizontalMedium.push(createStarHorizontal(0.4, 0.7, 0.8, 1.5, 0.4, 0.8));
    }
    for (let i = 0; i < NUM_STARS_FAST; i++) {
        starsHorizontalFast.push(createStarHorizontal(0.9, 1.5, 1.2, 2.0, 0.7, 1.0));
    }
    console.log("Stars initialized.");
}

// --- Star Updates (called from main update loop) ---
export function updateStarsVertical(cameraOffset) {
     starsVertical.forEach(star => {
        star.y += (cameraOffset * star.speed) + (0.1 * star.speed); // Apply camera parallax + slight drift
        if (star.y > canvas.height) {
            star.y = 0 - star.size;
            star.x = Math.random() * canvas.width;
        }
    });
}

export function updateStarsHorizontal() {
    function updateLayer(starArray) {
        starArray.forEach(star => {
            star.x -= star.speed;
            if (star.x < 0 - star.size) {
                star.x = canvas.width + star.size;
                star.y = Math.random() * canvas.height;
            }
        });
    }
    updateLayer(starsHorizontalSlow);
    updateLayer(starsHorizontalMedium);
    updateLayer(starsHorizontalFast);
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
    const startY = state.getInitialPlayerY();
    const currentY = player ? player.y : startY;
    // Calculate difference and scale (e.g., 10 pixels = 1 meter)
    const currentHeight = Math.max(0, (startY - currentY) / 10);

    const meterText = `${Math.floor(currentHeight)} METERS`;
    const meterX = canvas.width - 30;
    const meterY = canvas.height / 2;

    // Draw Text
    ctx.fillStyle = R64.WHITE;
    ctx.font = '28px Petitinho';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(meterText, meterX, meterY);

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
export async function fetchLeaderboard() {
    if (leaderboardLoading) return; // Don't fetch if already loading

    console.log("Requesting leaderboard data fetch...");
    leaderboardLoading = true;
    leaderboardData = null; // Clear old data
    leaderboardError = null;
    try {
        // Now actually call the async function from state.js
        leaderboardData = await state.getLeaderboard();
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
    const timeEndX = leaderboardX + leaderboardWidth - padding;
    const heightEndX = timeEndX - 120; // <<< INCREASED SPACE FROM 100
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

            // Highlight the last submitted score
            const lastScore = state.getLastSubmittedScore();
            if (lastScore && 
                entry.score === lastScore.score && 
                entry.maxHeight === lastScore.maxHeight && 
                entry.time === lastScore.time &&
                entry.userId === state.getUserId()) {
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
    // --- Draw Trail First (behind main player) ---
    if (player.trailPositions && player.trailPositions.length > 0) {
        const trailColor = player.color; // Use player color or a custom one
        const maxAlpha = 0.3; // Max transparency of the ghosts

        for (let i = 0; i < player.trailPositions.length; i++) {
            const pos = player.trailPositions[i];
            // Fade the trail out the older it gets
            const alpha = maxAlpha * (1 - (i / player.maxTrailLength)); 
            
            ctx.globalAlpha = alpha;
            ctx.fillStyle = trailColor;
            ctx.fillRect(pos.x, pos.y, player.width, player.height);
        }
        ctx.globalAlpha = 1.0; // Reset alpha for the main player
    }

    // --- Draw Main Player (on top) ---
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
}

// --- Main Draw Function ---
export function draw(player) {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const currentGameState = state.getCurrentGameState();

    // Draw Background (Starfield) - Always draw unless maybe MainMenu/Loading
    if (currentGameState !== state.GameState.MainMenu && currentGameState !== state.GameState.Loading) {
        ctx.fillStyle = R64.WHITE;
        function drawStarLayer(starArray) {
            starArray.forEach(star => {
                ctx.globalAlpha = star.alpha;
                ctx.fillRect(star.x, star.y, star.size, star.size);
            });
        }
        drawStarLayer(starsHorizontalSlow);
        drawStarLayer(starsHorizontalMedium);
        drawStarLayer(starsHorizontalFast);
        drawStarLayer(starsVertical);
        ctx.globalAlpha = 1.0;
    }

    // Draw Playing-specific elements? No, draw even if paused/game over for visual context
    // if (currentGameState === state.GameState.Playing) { // REMOVE This check

        // Draw Player
        drawPlayer(player);

        // Draw Platforms
        state.getPlatforms().forEach(platform => {
            if (platform.isFlashing && !platform.flashVisible) {
                return;
            }
            
            ctx.globalAlpha = platform.alpha;
            ctx.fillStyle = platform.color;
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
            ctx.fillStyle = platform.middleColor;
            ctx.fillRect(platform.middleSection.x, platform.y, platform.middleSection.width, platform.height);
            ctx.globalAlpha = 1.0;
        });

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
    if (currentGameState === state.GameState.Playing || currentGameState === state.GameState.GameOver) {
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