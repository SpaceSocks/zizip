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
function drawHUD() {
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
    const elapsedTime = state.getElapsedTime(); // Get time in ms
    ctx.fillText(`TIME: ${formatTime(elapsedTime, true)}`, canvas.width / 2, yPos);
    yPos += lineHeight;
    const trackName = state.getCurrentTrackInfo(); // Get from state
    if (trackName !== "None") {
        ctx.font = '20px Petitinho'; // Slightly smaller for track name
        ctx.fillText(`Playing: ${trackName}`, canvas.width / 2, yPos);
        ctx.font = '24px Petitinho'; // Reset font size
    }
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
    const leaderboardHeight = 10 * lineHeight + 40; // Approx height for 10 entries + padding
    const leaderboardWidth = canvas.width * 0.8; // Example width
    const leaderboardX = (canvas.width - leaderboardWidth) / 2;

    // Draw semi-transparent background box
    ctx.fillStyle = 'rgba(46, 34, 47, 0.8)'; // Dark Purple with 80% opacity
    ctx.fillRect(leaderboardX, startY - lineHeight, leaderboardWidth, leaderboardHeight);

    ctx.font = '20px Petitinho';
    ctx.fillStyle = R64.WHITE; // Reset color for text

    if (leaderboardLoading) {
        ctx.textAlign = 'center';
        ctx.fillText("Loading Leaderboard...", canvas.width / 2, startY + 40);
    } else if (leaderboardError) {
        ctx.fillStyle = R64.RED; // Show errors in red
        ctx.fillText(leaderboardError, canvas.width / 2, startY + 40);
        ctx.fillStyle = R64.WHITE; // Reset color
    } else if (leaderboardData && leaderboardData.length > 0) {
        // --- Draw Entries --- 
        // Define column widths - Adjust these percentages/values as needed for appearance
        const rankWidth = leaderboardWidth * 0.08; // e.g., 8% of the box width
        const nameWidth = leaderboardWidth * 0.27; // 27%
        const scoreWidth = leaderboardWidth * 0.20; // 20%
        const heightWidth = leaderboardWidth * 0.20; // 20%
        const timeWidth = leaderboardWidth * 0.20; // 20%
        const padding = leaderboardWidth * 0.01; // Small padding between columns

        // Calculate X positions relative to the start of the background box
        const startXRank = leaderboardX + padding;
        const startXName = startXRank + rankWidth + padding;
        const startXScore = startXName + nameWidth + padding;
        const startXHeight = startXScore + scoreWidth + padding;
        const startXTime = startXHeight + heightWidth + padding;

        const lastScore = state.getLastSubmittedScore(); 

        leaderboardData.forEach((entry, index) => { 
            const yPos = startY + (index + 1) * lineHeight;
            const rank = `${index + 1}.`;
            const name = (entry.displayName || 'ANON').toUpperCase();
            const scoreLabel = "SCORE:";
            const scoreValue = `${entry.score || 0}`;
            const heightLabel = "HEIGHT:";
            const heightValue = `${entry.maxHeight !== undefined ? Math.round(entry.maxHeight) : 0} M`;
            const timeLabel = "TIME:";
            const timeValue = `${entry.time || '00:00:00'}`;

            // Check if this entry matches the last submitted score
            let isLastSubmitted = false;
            if (lastScore && 
                entry.score === lastScore.score && 
                entry.maxHeight === lastScore.maxHeight && 
                entry.time === lastScore.time &&
                entry.userId === state.getUserId()) { 
                isLastSubmitted = true;
                state.clearLastSubmittedScoreHighlight();
            }
            ctx.fillStyle = isLastSubmitted ? R64.YELLOW : R64.WHITE;

            // Rank (Left Aligned)
            ctx.textAlign = 'left';
            ctx.fillText(rank, startXRank, yPos);
            
            // Name (Left Aligned)
            ctx.textAlign = 'left';
            ctx.fillText(name, startXName, yPos);

            // Score (Label Left, Value Right in column)
            ctx.textAlign = 'left';
            ctx.fillText(scoreLabel, startXScore, yPos);
            ctx.textAlign = 'right';
            ctx.fillText(scoreValue, startXScore + scoreWidth - padding, yPos); // Align to right edge of column width

            // Height (Label Left, Value Right in column)
            ctx.textAlign = 'left';
            ctx.fillText(heightLabel, startXHeight, yPos);
            ctx.textAlign = 'right';
            ctx.fillText(heightValue, startXHeight + heightWidth - padding, yPos);

            // Time (Label Left, Value Right in column)
            ctx.textAlign = 'left';
            ctx.fillText(timeLabel, startXTime, yPos);
            ctx.textAlign = 'right';
            ctx.fillText(timeValue, startXTime + timeWidth - padding, yPos);
        });
    } else {
        // Leaderboard is loaded but empty
        ctx.font = '28px Petitinho';
        ctx.fillText("Leaderboard is Empty", canvas.width / 2, startY + 40);
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

// --- Main Draw Function ---
export function draw() {
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
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);

        // Draw Platforms
        state.getPlatforms().forEach(platform => {
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
        drawHUD();
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