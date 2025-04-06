const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Adjust canvas size dynamically
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Reset star positions to fit new screen size
    starsVertical = [];
    starsHorizontalSlow = [];
    starsHorizontalMedium = [];
    starsHorizontalFast = [];
    for (let i = 0; i < numStarsVertical; i++) {
        starsVertical.push(createStarVertical());
    }
    for (let i = 0; i < numStarsSlow; i++) {
        starsHorizontalSlow.push(createStarHorizontal(0.1, 0.3, 0.5, 1.0, 0.2, 0.5)); // Slow, small, dim
    }
    for (let i = 0; i < numStarsMedium; i++) {
        starsHorizontalMedium.push(createStarHorizontal(0.4, 0.7, 0.8, 1.5, 0.4, 0.8)); // Medium speed, size, alpha
    }
    for (let i = 0; i < numStarsFast; i++) {
        starsHorizontalFast.push(createStarHorizontal(0.9, 1.5, 1.2, 2.0, 0.7, 1.0)); // Fast, larger, brighter
    }
    console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
    // Note: Existing game state (player/platforms) isn't reset on resize,
    // which might lead to temporary visual oddities if resizing during gameplay.
    initializeStars();
}

// --- Resurrect 64 Palette ---
const R64 = {
    DARK_PURPLE: '#2e222f',
    MED_PURPLE: '#3e3546',
    LIGHT_PURPLE: '#625565',
    DARK_BROWN_RED: '#6e2727',
    MED_BROWN_RED: '#966c6c',
    LIGHT_BROWN_RED: '#ab947a',
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
    MIDDLE_PLATFORM_RED: '#f68181', // Middle Normal Platform (was BONUS_PINK)
    // BONUS_PINK: '#f04f78' // No longer used for platforms
};

// Game variables
let score = 0;
let height = 0;
let topScore = localStorage.getItem('topScore') || 0;
let highestHeight = localStorage.getItem('highestHeight') || 0;
let difficultyFactor = 0; // Increases with height
let gameRunning = false; // To track if game logic should run
let audioInitialized = false; // To prevent multiple audio starts

// --- Lives ---  // NEW
const maxLives = 3;
let lives = maxLives;
let isGameOver = false; // NEW flag for game over state

// --- Starfield --- (Vertical parallax stars)
let starsVertical = [];
const numStarsVertical = 100;

function createStarVertical() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 0.5 + 0.1 // Parallax speed (vertical)
    };
}

// --- Starfield --- (Horizontal scrolling stars)
let starsHorizontalSlow = [];
let starsHorizontalMedium = [];
let starsHorizontalFast = [];
const numStarsSlow = 150; // Dense
const numStarsMedium = 75;  // Medium density
const numStarsFast = 25;   // Sparse

function createStarHorizontal(speedMin, speedMax, sizeMin, sizeMax, alphaMin, alphaMax) {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * (sizeMax - sizeMin) + sizeMin,
        speed: Math.random() * (speedMax - speedMin) + speedMin, // Horizontal speed
        alpha: Math.random() * (alphaMax - alphaMin) + alphaMin
    };
}

// Function to populate all star arrays (called after initial resize)
function initializeStars() {
    console.log("Initializing stars...");
    starsVertical = [];
    starsHorizontalSlow = [];
    starsHorizontalMedium = [];
    starsHorizontalFast = [];

    for (let i = 0; i < numStarsVertical; i++) {
        starsVertical.push(createStarVertical());
    }
    for (let i = 0; i < numStarsSlow; i++) {
        starsHorizontalSlow.push(createStarHorizontal(0.1, 0.3, 0.5, 1.0, 0.2, 0.5)); // Slow, small, dim
    }
    for (let i = 0; i < numStarsMedium; i++) {
        starsHorizontalMedium.push(createStarHorizontal(0.4, 0.7, 0.8, 1.5, 0.4, 0.8)); // Medium speed, size, alpha
    }
    for (let i = 0; i < numStarsFast; i++) {
        starsHorizontalFast.push(createStarHorizontal(0.9, 1.5, 1.2, 2.0, 0.7, 1.0)); // Fast, larger, brighter
    }
    console.log("Stars initialized.");
}

// Initial resize and event listener
resizeCanvas(); // Set initial size & stars
window.addEventListener('resize', resizeCanvas);


// --- Player Setup ---
const player = {
    x: canvas.width / 2 - 10,
    y: canvas.height - 60,
    width: 20,
    height: 40,
    color: R64.PLAYER_BLUE,
    velocityY: 0,
    velocityX: 0,
    speed: 5,
    jumpPower: 13,
    gravity: 0.7,
    isGrounded: false,
    currentFriction: 0.1,
    jumpsLeft: 2,
    isDashing: false,
    dashPower: 15,
    dashDuration: 150,
    dashCooldown: 500,
    lastDashTime: 0
};

// --- Platform Setup ---
let platforms = [];
const platformBaseWidth = 100;
const platformHeight = 15;
// const platformDefaultColor = R64.LIGHT_GRAY_BLUE; // Old
// const platformIceColor = R64.ICE_BLUE;        // Old
// const platformMiddleBonusColor = R64.MIDDLE_PLATFORM_RED; // Old - Bonus Pink
const platformMiddleThreshold = 0.2; // Land within 20% of the center for bonus
const platformDisappearTime = 3000; // ms before platform starts disappearing
const platformFadeDuration = 500; // ms for fade out

function createPlatform(x, y, type = 'normal', width = platformBaseWidth) {
    const friction = (type === 'ice') ? 0.01 : 0.1;
    let color, middleColor;

    if (type === 'ice') {
        color = R64.ICE_BLUE;
        middleColor = R64.LIGHT_ICE_BLUE;
    } else { // Normal platform
        color = R64.BASE_PLATFORM_RED;
        middleColor = R64.MIDDLE_PLATFORM_RED;
    }

    return {
        x: x,
        y: y,
        width: width,
        height: platformHeight,
        type: type,
        friction: friction,
        color: color,
        middleColor: middleColor, // Store middle color
        landedOn: false,
        isDisappearing: false,
        disappearStartTime: null,
        alpha: 1.0,
        middleSection: {
            x: x + width * (0.5 - platformMiddleThreshold / 2),
            width: width * platformMiddleThreshold
        }
    };
}

platforms.push(createPlatform(canvas.width / 2 - platformBaseWidth / 2, canvas.height - 50));

// --- Input Handling ---
const keys = {
    left: false,
    right: false,
    up: false,
    dash: false
};

// --- Gamepad Thresholds ---
const AXIS_DEADZONE = 0.2;

// --- Input Handling (Keyboard) ---
window.addEventListener('keydown', (e) => {
    if (isGameOver) return; // Ignore input if game over
    if (!audioInitialized) {
        initializeAudio();
    }
    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
            keys.left = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            keys.right = true;
            break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
            keys.up = true;
             // Handle jump initiation
            if (player.jumpsLeft > 0) {
                player.velocityY = -player.jumpPower;
                player.isGrounded = false;
                player.jumpsLeft--;
            }
            break;
        case 'ShiftLeft':
        case 'KeyX':
            keys.dash = true;
            // Handle dash initiation
            const now = Date.now();
            if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
                player.isDashing = true;
                player.lastDashTime = now;
                // Dash direction based on held keys or last non-zero velocity, defaults right
                let dashDir = (keys.right ? 1 : keys.left ? -1 : (player.velocityX !== 0 ? Math.sign(player.velocityX) : 1));
                player.velocityX = dashDir * player.dashPower;
                player.gravity = 0; // Ignore gravity while dashing
                player.velocityY = 0;
                setTimeout(() => {
                    player.isDashing = false;
                    player.gravity = 0.7; // Restore gravity
                    player.velocityX = 0; // Stop horizontal dash movement unless keys are pressed
                }, player.dashDuration);
            }
            break;
    }
});

window.addEventListener('keyup', (e) => {
    if (isGameOver) return;
    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
            keys.left = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            keys.right = false;
            break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
             keys.up = false;
            break;
         case 'ShiftLeft':
         case 'KeyX':
            keys.dash = false;
            break;
    }
});

// --- Input Handling (Gamepad) --- // NEW
function handleGamepadInput() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads || !gamepads[0]) {
        return; // No gamepad connected or detected
    }

    const gp = gamepads[0];

    // --- Movement (Left Stick & D-Pad) ---
    let axisX = gp.axes[0] || 0;
    let dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
    let dpadRight = gp.buttons[15] && gp.buttons[15].pressed;

    // Combine axis and D-pad, prioritize D-pad
    if (dpadLeft) {
        keys.left = true;
        keys.right = false;
    } else if (dpadRight) {
        keys.left = false;
        keys.right = true;
    } else if (Math.abs(axisX) > AXIS_DEADZONE) {
        keys.left = axisX < -AXIS_DEADZONE;
        keys.right = axisX > AXIS_DEADZONE;
    } else {
        keys.left = false;
        keys.right = false;
    }

    // --- Jump (Button 0: A / Cross) ---
    let jumpPressed = gp.buttons[0] && gp.buttons[0].pressed;
    if (jumpPressed && !keys.up) { // Trigger on press (rising edge)
        keys.up = true;
        if (player.jumpsLeft > 0) {
            player.velocityY = -player.jumpPower;
            player.isGrounded = false;
            player.jumpsLeft--;
        }
    } else if (!jumpPressed && keys.up) { // Trigger on release (falling edge)
        keys.up = false;
    }

    // --- Dash (Button 2: X / Square) ---
    let dashPressed = gp.buttons[2] && gp.buttons[2].pressed;
     if (dashPressed && !keys.dash) { // Trigger on press
        keys.dash = true;
        const now = Date.now();
        if (!player.isDashing && now - player.lastDashTime > player.dashCooldown) {
             player.isDashing = true;
             player.lastDashTime = now;
             let dashDir = (keys.right ? 1 : keys.left ? -1 : (player.velocityX !== 0 ? Math.sign(player.velocityX) : 1));
             player.velocityX = dashDir * player.dashPower;
             player.gravity = 0;
             player.velocityY = 0;
             setTimeout(() => {
                 player.isDashing = false;
                 player.gravity = 0.7;
                 player.velocityX = 0;
             }, player.dashDuration);
         }
    } else if (!dashPressed && keys.dash) { // Trigger on release
        keys.dash = false;
    }
}

// --- Game Loop ---
function gameLoop() {
    if (!isGameOver) { // Only update game state if not game over
        handleGamepadInput(); // Check gamepad state each frame
        update();
    }
    draw(); // Always draw (to show game over screen etc.)
    requestAnimationFrame(gameLoop);
}

// --- Update Function ---
function update() {
    if (isGameOver) return; // Extra safety check

    // Difficulty Scaling based on height
    difficultyFactor = Math.min(height / 5000, 0.5);

    // --- Player Movement ---
    let targetVelocityX = 0;
    if (!player.isDashing) {
        if (keys.left) {
            targetVelocityX = -player.speed;
        } else if (keys.right) {
            targetVelocityX = player.speed;
        }

        // Apply friction / acceleration
         if (player.velocityX < targetVelocityX) {
             player.velocityX = Math.min(player.velocityX + player.currentFriction * player.speed, targetVelocityX);
         } else if (player.velocityX > targetVelocityX) {
             player.velocityX = Math.max(player.velocityX - player.currentFriction * player.speed, targetVelocityX);
         }

        player.x += player.velocityX;
    } else {
        // Apply dash velocity (no friction during dash)
        player.x += player.velocityX;
    }

    // Vertical Movement
    const wasGrounded = player.isGrounded; // Check if grounded last frame
    player.isGrounded = false; // Assume not grounded until collision check proves otherwise
    if (!player.isDashing) {
         player.velocityY += player.gravity;
    }
    let previousY = player.y;
    player.y += player.velocityY;
    player.currentFriction = 0.1; // Reset friction

    // --- Platform Update and Collision ---
    let highestPlatformY = canvas.height;
    const now = Date.now();

    platforms.forEach((platform, index) => {
        // Platform Disappearance Logic
        if (platform.disappearStartTime && !platform.isDisappearing) {
             if (now >= platform.disappearStartTime) {
                 platform.isDisappearing = true;
                 platform.disappearStartTime = now;
             }
        }
        if (platform.isDisappearing) {
            const timeElapsed = now - platform.disappearStartTime;
            platform.alpha = Math.max(0, 1 - (timeElapsed / platformFadeDuration));
            if (platform.alpha <= 0) {
                 platform.remove = true;
            }
        }

        // Collision check
        const playerBottom = player.y + player.height;
        const prevPlayerBottom = previousY + player.height;

        if (!platform.isDisappearing &&
            player.x < platform.x + platform.width &&
            player.x + player.width > platform.x &&
            playerBottom >= platform.y &&          // Player bottom is at or below platform top
            prevPlayerBottom <= platform.y &&      // Player bottom was above platform top last frame
            player.velocityY >= 0) {             // Player is moving downwards or still

            player.y = platform.y - player.height;
            player.velocityY = 0;
            player.isGrounded = true; // Set grounded state for THIS frame
            player.jumpsLeft = 2;
            player.currentFriction = platform.friction;

            // Score & Disappear Timer Start & Spawn Next
            if (!platform.landedOn) {
                platform.landedOn = true;
                const disappearDelay = platformDisappearTime * (1 - difficultyFactor * 0.5);
                platform.disappearStartTime = now + disappearDelay;

                const playerCenterX = player.x + player.width / 2;
                if (playerCenterX >= platform.middleSection.x &&
                    playerCenterX <= platform.middleSection.x + platform.middleSection.width) {
                    score += 20;
                } else {
                    score += 10;
                }

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

    // Play landing sound AFTER checking all platforms, if state changed to grounded
    if (player.isGrounded && !wasGrounded) { // Check if we JUST became grounded
        if (audioInitialized) {
            sfxLand.currentTime = 0; // Rewind sound
            sfxLand.play().catch(e => console.error("Error playing landing SFX:", e));
        }
    }

    platforms = platforms.filter(platform => !platform.remove);

    // --- Boundary checks ---
    if (player.x < 0) {
        player.x = 0;
        if (!player.isDashing) player.velocityX = 0;
    }
    if (player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
         if (!player.isDashing) player.velocityX = 0;
    }

    // --- Camera/Scrolling ---
    let cameraOffset = 0;
    const cameraThreshold = canvas.height * 0.4;
    if (player.y < cameraThreshold) {
        cameraOffset = cameraThreshold - player.y;
        player.y = cameraThreshold;

        platforms.forEach(platform => {
            platform.y += cameraOffset;
        });
        // Update vertical stars with parallax
        starsVertical.forEach(star => {
             star.y += cameraOffset * star.speed;
             if (star.y > canvas.height) {
                 star.y = 0 - star.size;
                 star.x = Math.random() * canvas.width;
             }
        });
        height += cameraOffset / 10;
    } else {
        // Update vertical stars with slight drift even when camera isn't moving
         starsVertical.forEach(star => {
             star.y += 0.1 * star.speed; // Minimal downward drift
             if (star.y > canvas.height) {
                 star.y = 0 - star.size;
                 star.x = Math.random() * canvas.width;
             }
         });
    }

    // Update horizontal stars (always scroll left)
    function updateHorizontalStars(starArray) {
        starArray.forEach(star => {
            star.x -= star.speed;
            if (star.x < 0 - star.size) {
                star.x = canvas.width + star.size;
                star.y = Math.random() * canvas.height; // Reposition vertically too
            }
        });
    }
    updateHorizontalStars(starsHorizontalSlow);
    updateHorizontalStars(starsHorizontalMedium);
    updateHorizontalStars(starsHorizontalFast);

    // Remove platforms below the screen
    platforms = platforms.filter(platform => platform.y < canvas.height + 50);

    // --- Update highest height and score ---
    if (height > highestHeight) {
        highestHeight = Math.round(height);
        localStorage.setItem('highestHeight', highestHeight);
    }
    if (score > topScore) {
        topScore = score;
        localStorage.setItem('topScore', topScore);
    }

    // --- Fall detection (Lose Life / Game Over) --- // UPDATED
    if (player.y > canvas.height + player.height) {
        lives--; // Lose a life
        console.log(`Life lost! Lives remaining: ${lives}`);

        if (lives > 0) {
            resetPlayerState(); // Reset position, keep playing
        } else {
            // Game Over
            isGameOver = true;
            console.log("Game Over!");
            if(audioInitialized) musicPlayer.pause(); // Pause music only on final game over
            // Player controls are now disabled via the isGameOver flag in update() and input handlers
        }
    }
}

// --- Spawn New Platform ---
function spawnNewPlatform(previousPlatform) {
    // Vertical positioning (based on previous platform's Y)
    const minVertGap = 80;
    const maxVertGap = 150;
    const vertGapRange = maxVertGap - minVertGap;
    const scaledMinGap = minVertGap + 30 * difficultyFactor;
    const scaledGapRange = vertGapRange + 50 * difficultyFactor;
    const newY = previousPlatform.y - scaledMinGap - Math.random() * scaledGapRange;

    // Width scaling
    const newWidth = Math.max(platformBaseWidth * (1 - difficultyFactor * 0.6), platformBaseWidth * 0.4);

    // --- Horizontal Placement (Ensure Reachability) ---
    const prevX = previousPlatform.x;
    const prevWidth = previousPlatform.width;
    const prevCenterX = prevX + prevWidth / 2;

    // Estimate max horizontal distance player can cover with double jump
    const maxDoubleJumpAirTime = 2 * (player.jumpPower / player.gravity) * 2;
    const maxHorizontalReach = player.speed * maxDoubleJumpAirTime * 0.9;

    // Define the maximum allowed offset between the centers of the platforms
    const maxCenterOffset = maxHorizontalReach + 100 * difficultyFactor;

    // Calculate the min/max possible center X for the new platform
    const minCenterX = prevCenterX - maxCenterOffset;
    const maxCenterX = prevCenterX + maxCenterOffset;

    // Clamp the center range to stay within screen bounds (considering half new width)
    const clampedMinCenterX = Math.max(newWidth / 2, minCenterX);
    const clampedMaxCenterX = Math.min(canvas.width - newWidth / 2, maxCenterX);

    // Generate a random center X within the clamped & reachable range
    let randomCenterX;
    if (clampedMaxCenterX > clampedMinCenterX) {
        randomCenterX = clampedMinCenterX + Math.random() * (clampedMaxCenterX - clampedMinCenterX);
    } else {
        randomCenterX = Math.max(newWidth / 2, Math.min(prevCenterX, canvas.width - newWidth / 2));
    }

    // Calculate the final newX (top-left corner)
    let newX = randomCenterX - newWidth / 2;

    // Final safety clamp for newX itself (should be redundant but safe)
    newX = Math.max(0, Math.min(newX, canvas.width - newWidth));

    // Platform Type randomization
    let type = 'normal';
    const iceChance = 0.1 + 0.15 * difficultyFactor;
    if (Math.random() < iceChance) {
        type = 'ice';
    }

    platforms.push(createPlatform(newX, newY, type, newWidth));
}


// --- Draw Function ---
function draw() {
    // Clear canvas with black background
    ctx.fillStyle = '#000000'; // Black background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Starfield Layers
    ctx.fillStyle = R64.WHITE; // Base star color

    // Function to draw a star layer with specific alpha
    function drawStars(starArray) {
        starArray.forEach(star => {
            ctx.globalAlpha = star.alpha; // Set star's brightness
            ctx.fillRect(star.x, star.y, star.size, star.size);
        });
    }

    // Draw horizontal stars (slowest/dimmest first)
    drawStars(starsHorizontalSlow);
    drawStars(starsHorizontalMedium);
    drawStars(starsHorizontalFast);

    // Draw vertical parallax stars (drawn last among stars, appearing closest)
    drawStars(starsVertical);

    ctx.globalAlpha = 1.0; // Reset alpha for other elements

    // Draw Player (no glow)
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Draw Platforms (no glow) with updated colors
    platforms.forEach(platform => {
        ctx.globalAlpha = platform.alpha; // Apply fade effect

        // Draw base platform color
        ctx.fillStyle = platform.color;
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

        // Draw middle bonus section with the lighter color (for ALL types)
        ctx.fillStyle = platform.middleColor; // Use the stored middleColor
        ctx.fillRect(platform.middleSection.x, platform.y, platform.middleSection.width, platform.height);

        ctx.globalAlpha = 1.0; // Reset alpha
    });

    // Draw UI (Score, Height, Lives)
    ctx.fillStyle = R64.WHITE;
    ctx.font = '24px Petitinho';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 10, 30);
    ctx.fillText(`Height: ${Math.round(height)}m`, 10, 60);
    ctx.fillText(`Lives: ${lives}`, 10, 90); // Display lives

    ctx.textAlign = 'right';
    ctx.fillText(`Top Score: ${topScore}`, canvas.width - 10, 30);
    ctx.fillText(`Max Height: ${highestHeight}m`, canvas.width - 10, 60);

    // Draw Game Over message if applicable // NEW
    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = R64.RED;
        ctx.font = '60px Petitinho';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        // Could add instructions to refresh/restart later
    }
}

// --- Audio Setup ---
const musicTracks = [
    'Audio/Music/Warp Speed.mp3',
    'Audio/Music/Stellar Confrontation.mp3',
    'Audio/Music/Galactic Wonder.mp3',
    'Audio/Music/Galactic Showdown.mp3',
    'Audio/Music/Cosmic Journey.mp3'
];
let currentTrackIndex = Math.floor(Math.random() * musicTracks.length);
const musicPlayer = new Audio();
musicPlayer.volume = 0.8; // Increased volume
musicPlayer.loop = false; // We handle looping manually

const sfxLand = new Audio('Audio/SFX/Landing1.wav');
sfxLand.volume = 1.0;

function playNextTrack() {
    if (musicTracks.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
    musicPlayer.src = musicTracks[currentTrackIndex];
    musicPlayer.play().catch(e => console.error("Error playing music:", e));
    console.log("Playing music:", musicTracks[currentTrackIndex]);
}

// Play next track when the current one ends
musicPlayer.addEventListener('ended', playNextTrack);

// Function to start audio context (requires user interaction)
function initializeAudio() {
    if (audioInitialized) return;
    console.log("Initializing audio...");
    // Play landing sound muted once to potentially unlock audio context
    sfxLand.play().then(() => {
        sfxLand.pause();
        sfxLand.currentTime = 0;
        // Start playing the first random track
        musicPlayer.src = musicTracks[currentTrackIndex];
        return musicPlayer.play();
    }).then(() => {
        console.log("Music started successfully.");
        audioInitialized = true;
    }).catch(e => {
        console.error("Audio initialization failed. Needs user interaction.", e);
        // We might need a click handler to start audio if this fails
    });
}

// --- Reset Player Function (Used after losing a life) --- // NEW
function resetPlayerState() {
    console.log("Resetting player position...");
    player.x = canvas.width / 2 - player.width / 2;
    player.y = canvas.height - 100; // Start a bit higher
    player.velocityY = 0;
    player.velocityX = 0;
    player.jumpsLeft = 2;
    player.isGrounded = false;
    player.isDashing = false;
    player.gravity = 0.7; // Ensure gravity is on
    // Clear existing platforms and add a new starting one
    platforms = [createPlatform(canvas.width / 2 - platformBaseWidth / 2, canvas.height - 50)];
    // Keep score, height, difficultyFactor, music playing
}

// --- Initial Setup ---
function startGame() {
    console.log("Starting Game Setup...")
    isGameOver = false;
    lives = maxLives;
    score = 0;
    height = 0;
    difficultyFactor = 0;
    platforms = []; // Clear platforms before resize
    resizeCanvas(); // Set initial size & stars
    platforms.push(createPlatform(canvas.width / 2 - platformBaseWidth / 2, canvas.height - 50)); // Add initial platform
    resetPlayerState(); // Set initial player state
    console.log("Game setup complete. Starting loop.");
    if (!audioInitialized) {
         console.log("Press any key to initialize audio.");
    }
    // Start the loop if not already running (or handle restart logic here)
    requestAnimationFrame(gameLoop);
}

startGame(); // Initialize game state on load 