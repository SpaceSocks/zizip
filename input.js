// This file will handle keyboard and gamepad input 
import * as state from './state.js?v=mobile-portrait-61';
import * as audio from './audio.js?v=mobile-portrait-61';
import * as ui from './ui.js?v=mobile-portrait-61';
import { player } from './entities.js?v=mobile-portrait-61';
import { AXIS_DEADZONE, PLAYER_JUMP_POWER, PLAYER_DASH_POWER, PLAYER_DASH_DURATION, PLAYER_DASH_COOLDOWN, PLAYER_GRAVITY } from './constants.js?v=mobile-portrait-61';
import { getPlatforms } from './state.js?v=mobile-portrait-61'; // Import getPlatforms

// --- Input State (shared within this module) ---
export const keys = {
    left: false,
    right: false,
    up: false,
    dash: false
};

let pauseStartTime = 0; // Track when pause began
let joystickPointerId = null;
let jumpPointerId = null;
let orientationLockRequested = false;

// Navigation state for pause menu
const gamepadNavState = {
    left: false,
    right: false,
    up: false, // If needed for vertical menus
    down: false // If needed for vertical menus
};

// Navigation state specifically for Game Over screen
const gameOverNavState = {
    left: false,
    right: false
};

// NEW: Navigation state specifically for Options Menu
const optionsNavState = {
    up: false,
    down: false,
    left: false,
    right: false
};

// --- Keyboard Input Handling ---
function handleKeyDown(e) {
    if (state.getIsGameOver()) return;

    // Only attempt audio initialization (unlock context)
    if (!state.getAudioInitialized()) {
        console.log("Input detected, attempting to initialize audio context...");
        audio.initializeAudio();
    }

    // Pause Toggle (Escape Key)
    if (e.code === 'Escape') {
        if (state.getCurrentGameState() === state.GameState.Replay) {
            ui.exitReplay();
            return;
        }
        togglePause();
        return;
    }

    // Don't process gameplay keys if paused or game over
    if (state.getCurrentGameState() !== state.GameState.Playing) return;

    switch (e.code) {
        case 'ArrowLeft': case 'KeyA': 
            keys.left = true; 
            break; 
        case 'ArrowRight': case 'KeyD': 
            keys.right = true; 
            break;
        case 'ArrowUp': case 'KeyW': case 'Space':
            if (!keys.up) {
                triggerJump();
            }
            keys.up = true;
            break;
        // NEW: Dash controls
        case 'KeyQ':
            console.log("Q key detected for left dash!");
            triggerDash('left');
            break;
        case 'KeyE':
            console.log("E key detected for right dash!");
            triggerDash('right');
            break;
        default:
            // Handle other keys if needed
            break;
    }
}

function handleKeyUp(e) {
    if (state.getIsGameOver()) return;
     switch (e.code) {
        case 'ArrowLeft': case 'KeyA': keys.left = false; break;
        case 'ArrowRight': case 'KeyD': keys.right = false; break;
        case 'ArrowUp': case 'KeyW': case 'Space': keys.up = false; break;
        // Key up for Q and E don't need specific actions for dash
        case 'KeyQ': break; 
        case 'KeyE': break;
    }
}

function isTouchGameplayActive() {
    return state.getCurrentGameState() === state.GameState.Playing;
}

function requestPortraitLock() {
    if (orientationLockRequested) return;
    orientationLockRequested = true;
    try {
        screen.orientation?.lock?.('portrait-primary')?.catch(() => {});
    } catch (error) {
        // Browser support varies, especially on iPhone Safari.
    }
}

function unlockAudioFromTouch() {
    if (!state.getAudioInitialized()) {
        audio.initializeAudio();
    }
}

function updateJoystickFromPointer(event, stick, knob) {
    const rect = stick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = rect.width * 0.34;
    const rawDx = event.clientX - centerX;
    const rawDy = event.clientY - centerY;
    const distance = Math.hypot(rawDx, rawDy);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const dx = rawDx * scale;
    const dy = rawDy * scale;
    const normalizedX = dx / maxDistance;

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    keys.left = normalizedX < -0.28;
    keys.right = normalizedX > 0.28;
}

function resetJoystick(knob) {
    joystickPointerId = null;
    keys.left = false;
    keys.right = false;
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
}

function setupFirstTouchAudioUnlock() {
    const unlock = () => {
        unlockAudioFromTouch();
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
}

function setupTouchControls() {
    const stick = document.getElementById('moveStick');
    const knob = document.getElementById('moveStickKnob');
    const jumpButton = document.getElementById('jumpButton');
    const pauseButton = document.getElementById('mobilePauseButton');
    const mobileControls = document.getElementById('mobileControls');
    if (!stick || !knob || !jumpButton || !mobileControls) return;

    mobileControls.addEventListener('contextmenu', (event) => event.preventDefault());

    stick.addEventListener('pointerdown', (event) => {
        if (!isTouchGameplayActive() || joystickPointerId !== null) return;
        event.preventDefault();
        requestPortraitLock();
        unlockAudioFromTouch();
        joystickPointerId = event.pointerId;
        stick.setPointerCapture?.(event.pointerId);
        updateJoystickFromPointer(event, stick, knob);
    });

    stick.addEventListener('pointermove', (event) => {
        if (event.pointerId !== joystickPointerId) return;
        event.preventDefault();
        updateJoystickFromPointer(event, stick, knob);
    });

    const endJoystick = (event) => {
        if (event.pointerId !== joystickPointerId) return;
        event.preventDefault();
        stick.releasePointerCapture?.(event.pointerId);
        joystickPointerId = null;
        keys.left = false;
        keys.right = false;
        knob.style.transform = 'translate(-50%, -50%)';
    };

    stick.addEventListener('pointerup', endJoystick);
    stick.addEventListener('pointercancel', endJoystick);
    stick.addEventListener('lostpointercapture', () => resetJoystick(knob));

    jumpButton.addEventListener('pointerdown', (event) => {
        if (!isTouchGameplayActive() || jumpPointerId !== null) return;
        event.preventDefault();
        requestPortraitLock();
        unlockAudioFromTouch();
        jumpPointerId = event.pointerId;
        jumpButton.setPointerCapture?.(event.pointerId);
        jumpButton.classList.add('is-pressed');
        keys.up = true;
        triggerJump();
    });

    const endJump = (event) => {
        if (event.pointerId !== jumpPointerId) return;
        event.preventDefault();
        jumpButton.releasePointerCapture?.(event.pointerId);
        jumpPointerId = null;
        keys.up = false;
        jumpButton.classList.remove('is-pressed');
    };

    jumpButton.addEventListener('pointerup', endJump);
    jumpButton.addEventListener('pointercancel', endJump);
    jumpButton.addEventListener('lostpointercapture', () => {
        jumpPointerId = null;
        keys.up = false;
        jumpButton.classList.remove('is-pressed');
    });

    pauseButton?.addEventListener('pointerdown', (event) => {
        if (state.getCurrentGameState() !== state.GameState.Playing) return;
        event.preventDefault();
        unlockAudioFromTouch();
        keys.left = false;
        keys.right = false;
        keys.up = false;
        togglePause();
    });
}

// --- Gamepad Input Handling ---
let wasStartPressed = false; 
let wasJumpPressed = false; 
let wasL1Pressed = false; // NEW: Track L1 (Button 4)
let wasR1Pressed = false; // NEW: Track R1 (Button 5)
let activeGamepadInfo = null;
let lastAnnouncedGamepadKey = '';

function getFirstConnectedGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    return Array.from(gamepads || []).find(Boolean) || null;
}

function classifyGamepad(gamepad) {
    const id = gamepad?.id || '';
    const normalizedId = id.toLowerCase();
    const isPlayStation = /dualsense|dualshock|playstation|wireless controller|sony|ps5|ps4/.test(normalizedId);
    const isXbox = /xbox|xinput|microsoft/.test(normalizedId);

    if (isPlayStation) {
        return {
            id,
            index: gamepad.index,
            family: 'playstation',
            label: /dualsense|ps5/.test(normalizedId) ? 'PS5 controller' : 'PlayStation controller',
            hint: 'LEFT STICK MOVE   X JUMP   L1/R1 DASH   OPTIONS PAUSE'
        };
    }

    if (isXbox) {
        return {
            id,
            index: gamepad.index,
            family: 'xbox',
            label: 'Xbox controller',
            hint: 'LEFT STICK MOVE   A JUMP   LB/RB DASH   MENU PAUSE'
        };
    }

    return {
        id,
        index: gamepad?.index || 0,
        family: 'generic',
        label: 'Controller',
        hint: 'LEFT STICK MOVE   SOUTH BUTTON JUMP   SHOULDERS DASH   START PAUSE'
    };
}

function getGamepadKey(gamepad) {
    return gamepad ? `${gamepad.index}:${gamepad.id || 'controller'}` : '';
}

function updateActiveGamepad(gamepad, announce = false) {
    if (!gamepad) {
        activeGamepadInfo = null;
        return null;
    }

    activeGamepadInfo = classifyGamepad(gamepad);
    const key = getGamepadKey(gamepad);
    if (announce && key && key !== lastAnnouncedGamepadKey) {
        lastAnnouncedGamepadKey = key;
        ui.showControllerToast(`${activeGamepadInfo.label} connected`);
    }
    return activeGamepadInfo;
}

function handleGamepadConnected(event) {
    updateActiveGamepad(event.gamepad, true);
}

function handleGamepadDisconnected(event) {
    const info = classifyGamepad(event.gamepad);
    if (activeGamepadInfo?.index === event.gamepad?.index) {
        activeGamepadInfo = null;
    }
    if (lastAnnouncedGamepadKey === getGamepadKey(event.gamepad)) {
        lastAnnouncedGamepadKey = '';
    }
    ui.showControllerToast(`${info.label} disconnected`);
}

export function getActiveGamepadInfo() {
    return updateActiveGamepad(getFirstConnectedGamepad(), false);
}

export function getCurrentControlHint() {
    const gamepadInfo = getActiveGamepadInfo();
    if (gamepadInfo) return gamepadInfo.hint;
    if (document.body?.classList.contains('mobile-viewport')) return '';
    return 'A/D MOVE   SPACE JUMP   Q/E DASH   ESC PAUSE';
}

window.__cosmicZipGetControlHint = getCurrentControlHint;

export function handleGamepadInput() {
    const gp = getFirstConnectedGamepad();
    if (!gp) {
        wasStartPressed = false;
        wasJumpPressed = false;
        wasL1Pressed = false; // Reset if controller disconnects
        wasR1Pressed = false; // Reset if controller disconnects
        activeGamepadInfo = null;
        return;
    }

    updateActiveGamepad(gp, true);
    const startPressed = gp.buttons[9] && gp.buttons[9].pressed;
    const jumpPressed = gp.buttons[0] && gp.buttons[0].pressed;
    const l1Pressed = gp.buttons[4] && gp.buttons[4].pressed; // L1
    const r1Pressed = gp.buttons[5] && gp.buttons[5].pressed; // R1
    const currentGameState = state.getCurrentGameState();

    // --- Audio Initialization (if needed) ---
    if (!state.getAudioInitialized()) {
        // Check if any button is pressed to trigger audio init
        let buttonPressed = false;
        for(let i = 0; i < gp.buttons.length; i++) {
            if (gp.buttons[i].pressed) {
                buttonPressed = true;
                break;
            }
        }
        if(buttonPressed || Math.abs(gp.axes[0]) > AXIS_DEADZONE) {
             console.log("Gamepad input detected, attempting to initialize audio context...");
             audio.initializeAudio();
        }
    }

    // --- Pause Toggle Check (Happens regardless of current state, before gameplay/menu checks) ---
    if (startPressed && !wasStartPressed && (currentGameState === state.GameState.Playing || currentGameState === state.GameState.Paused)) {
        togglePause();
        wasStartPressed = true; // Set immediately to prevent re-trigger in this frame
        return; // IMPORTANT: Return early to prevent pause menu logic running immediately
    }

    // --- Options Menu Navigation (Check if visible FIRST) ---
    // Check optionsMenu existence and visibility
    const optionsMenuActive = document.getElementById('optionsMenu')?.style.display === 'block';

    if (optionsMenuActive) {
        console.log('--- Handling Options Menu Input ---');
        let activate = (jumpPressed && !wasJumpPressed); // A button

        // Navigation Up/Down
        const dpadUp = gp.buttons[12] && gp.buttons[12].pressed;
        const dpadDown = gp.buttons[13] && gp.buttons[13].pressed;
        const dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
        const dpadRight = gp.buttons[15] && gp.buttons[15].pressed;

        if (dpadDown && !optionsNavState.down) {
            console.log('  Navigate Down (Options)!');
            ui.focusNextOptionsItem();
            optionsNavState.down = true;
        }
        if (dpadUp && !optionsNavState.up) {
            console.log('  Navigate Up (Options)!');
            ui.focusPreviousOptionsItem();
            optionsNavState.up = true;
        }

        // Slider Adjustment Left/Right OR Button Activation
        const focusedItem = ui.getFocusedOptionsItem();
        if (focusedItem) {
            if (focusedItem.classList.contains('options-item')) {
                // It's a slider container
                const slider = focusedItem.querySelector('input[type="range"]');
                const checkbox = focusedItem.querySelector('input[type="checkbox"]');
                if (slider) {
                    let step = 5; // Adjust slider by 5% increments
                    let currentValue = parseInt(slider.value);
                    let changed = false;

                    if (dpadRight && !optionsNavState.right) {
                        slider.value = Math.min(100, currentValue + step);
                        changed = true;
                        optionsNavState.right = true; 
                    }
                    if (dpadLeft && !optionsNavState.left) {
                        slider.value = Math.max(0, currentValue - step);
                        changed = true;
                        optionsNavState.left = true;
                    }
                    if (changed) {
                        console.log(`Slider ${slider.id} changed to ${slider.value}`);
                        slider.dispatchEvent(new Event('input', { bubbles:true }));
                    }
                } else if (checkbox && activate) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles:true }));
                }
            } else if ((focusedItem.id === 'optionsBackButton' || focusedItem.id === 'aboutButton' || focusedItem.id === 'aboutCloseButton') && activate) {
                console.log('  Activate Button (Options)!');
                focusedItem.click(); 
            }
        }

        // Update nav state for Options menu AFTER checks
        optionsNavState.up = dpadUp;
        optionsNavState.down = dpadDown;
        optionsNavState.left = dpadLeft;
        optionsNavState.right = dpadRight;
        
        // Update wasJumpPressed state for activation button
        wasJumpPressed = jumpPressed;
        // Keep wasStartPressed updated
        wasStartPressed = startPressed;

        return; // IMPORTANT: Don't process other menus/gameplay if options is open

    } // --- End Options Menu --- 

    // --- Pause Menu Navigation (Only When Paused and Options NOT active) ---
    else if (currentGameState === state.GameState.Paused) {
        // --- Detailed Controller Logging --- 
        console.log('[Paused Input] Checking Gamepad...');
        console.log(`  Axis 0: ${gp.axes[0]?.toFixed(2)}`);
        console.log(`  Button 0 (A): ${gp.buttons[0]?.pressed} (wasPressed: ${gp.buttons[0]?.wasPressed})`);
        console.log(`  Button 9 (Start): ${gp.buttons[9]?.pressed} (wasPressed: ${gp.buttons[9]?.wasPressed})`);
        console.log(`  Button 14 (DPad L): ${gp.buttons[14]?.pressed} (navState: ${gamepadNavState.dpadLeftPressed})`);
        console.log(`  Button 15 (DPad R): ${gp.buttons[15]?.pressed} (navState: ${gamepadNavState.dpadRightPressed})`);
        // console.log(`  Nav Stick State: ${gamepadNavState.stickMovedX}`); // REMOVED Stick Logging
        // --- End Detailed Logging ---

        // Read D-Pad states for Pause Menu
        const dpadUpPressed = gp.buttons[12] && gp.buttons[12].pressed;
        const dpadDownPressed = gp.buttons[13] && gp.buttons[13].pressed;
        
        let activate = (jumpPressed && !wasJumpPressed); // A button

        console.log(`  Calculated (Paused) - dpadU:${dpadUpPressed}, dpadD:${dpadDownPressed}, activate:${activate}`);

        if (activate) {
            console.log('  Activate condition met (Paused)!');
            ui.activateFocusedPauseButton();
        }

        let focusChanged = false; 
        // Handle Up Navigation
        if (dpadUpPressed && !gamepadNavState.up) { // Check Up state
            console.log('  Navigate Up (Paused)!'); 
            ui.focusPreviousPauseButton(); // Focus previous item
            focusChanged = true;
            gamepadNavState.up = true; // Set wasPressed for Up
        }
        // Handle Down Navigation
        if (dpadDownPressed && !gamepadNavState.down) { // Check Down state
            console.log('  Navigate Down (Paused)!'); 
            ui.focusNextPauseButton(); // Focus next item
            focusChanged = true;
            gamepadNavState.down = true; // Set wasPressed for Down
        }

        /* REMOVED Left/Right D-Pad logic for Pause Menu
        if (dpadLeft && !gamepadNavState.dpadLeftPressed) {
            console.log('  Left condition met (D-Pad)!'); 
            ui.focusPreviousPauseButton();
            focusChanged = true;
        }
        gamepadNavState.dpadLeftPressed = dpadLeft;

        if (dpadRight && !gamepadNavState.dpadRightPressed) {
            console.log('  Right condition met (D-Pad)!'); 
            ui.focusNextPauseButton();
            focusChanged = true;
        }
        gamepadNavState.dpadRightPressed = dpadRight;
        */
        
        // Update wasPressed states for D-Pad Up/Down
        gamepadNavState.up = dpadUpPressed;
        gamepadNavState.down = dpadDownPressed;

    } 
    // --- Game Over Menu Navigation (Only When GameOver and Options NOT active) ---
    else if (currentGameState === state.GameState.GameOver) {
        console.log('--- Handling Game Over Input ---');
        let dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
        let dpadRight = gp.buttons[15] && gp.buttons[15].pressed;
        // Allow both A (0) and Start (9) to activate on Game Over
        let activate = (jumpPressed && !wasJumpPressed) ||
                       (startPressed && !wasStartPressed); // Use the startPressed from top

        console.log(`  Calculated (GameOver) - dpadL:${dpadLeft}, dpadR:${dpadRight}, activate:${activate}`);

        if (activate) {
            console.log('  Activate condition met (GameOver)!');
            ui.activateFocusedGameOverButton();
        }

        // Navigation (Left/Right)
        if (dpadRight && !gameOverNavState.right) {
            console.log('  Navigate Right (GameOver)!');
            ui.focusNextGameOverButton();
            gameOverNavState.right = true;
        }
        if (dpadLeft && !gameOverNavState.left) {
            console.log('  Navigate Left (GameOver)!');
            ui.focusPreviousGameOverButton();
            gameOverNavState.left = true;
        }

        // Update nav state for Game Over menu
        gameOverNavState.right = dpadRight;
        gameOverNavState.left = dpadLeft;

    }
    // --- Gameplay Input (Only When Playing and Options NOT active) ---
    else if (currentGameState === state.GameState.Playing) {
        // Movement (Left Stick & D-Pad)
        let axisX = gp.axes[0] || 0;
        let dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
        let dpadRight = gp.buttons[15] && gp.buttons[15].pressed;

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

        // Jump (Button 0: A / Cross)
        if (jumpPressed && !wasJumpPressed) { 
            triggerJump();
        }

        // Dash Left (Button 4: L1)
        if (l1Pressed && !wasL1Pressed) {
            console.log("Gamepad L1 detected!");
            triggerDash('left');
        }
        
        // Dash Right (Button 5: R1)
        if (r1Pressed && !wasR1Pressed) {
            console.log("Gamepad R1 detected!");
            triggerDash('right');
        }

        // Reset nav states when playing
        gamepadNavState.left = gamepadNavState.right = false;
        gamepadNavState.up = gamepadNavState.down = false; // Reset pause state
        gameOverNavState.left = gameOverNavState.right = false;
        optionsNavState.up = optionsNavState.down = optionsNavState.left = optionsNavState.right = false; // Reset options state
    }
    // --- Main Menu State (No Options Open) ---
    else if (currentGameState === state.GameState.MainMenu) {
        // Reset nav states if needed, handle any main menu specific gamepad input
        gamepadNavState.left = gamepadNavState.right = false;
        gameOverNavState.left = gameOverNavState.right = false;
        optionsNavState.up = optionsNavState.down = optionsNavState.left = optionsNavState.right = false; // Reset options state
    }

    // --- Update wasPressed states AFTER all checks for the current frame ---
    wasStartPressed = startPressed;
    wasJumpPressed = jumpPressed;
    wasL1Pressed = l1Pressed; // Update L1 state
    wasR1Pressed = r1Pressed; // Update R1 state
}

// --- Toggle Pause Function ---
export function togglePause() {
    const currentState = state.getCurrentGameState();
    const now = performance.now(); // Use performance.now() for higher precision timing

    if (currentState === state.GameState.Playing) {
        state.setCurrentGameState(state.GameState.Paused);
        pauseStartTime = now; // Record pause start time
        audio.lowerMusicVolume();
        ui.showPauseMenu();
        ui.setupPauseMenuFocus();
        console.log(`Paused at: ${pauseStartTime}`); // Log pause time
    } else if (currentState === state.GameState.Paused) {
        const pauseDuration = now - pauseStartTime; // Calculate how long pause lasted
        console.log(`Resuming. Pause duration: ${pauseDuration.toFixed(2)}ms`); // Log duration

        // RE-ADD: Adjust platform disappear timers to account for pause duration
        const platforms = getPlatforms(); 
        platforms.forEach(platform => {
            if (platform.disappearStartTime) {
                // Only adjust if the platform hasn't already started disappearing
                // or if the disappear time is still in the future after adjustment
                 if (!platform.isDisappearing) { 
                    const originalStartTime = platform.disappearStartTime;
                    platform.disappearStartTime += pauseDuration;
                    console.log(`  Platform Adjusted: ID=${platform.id}, Original=${originalStartTime?.toFixed(0)}, New=${platform.disappearStartTime?.toFixed(0)}`); 
                 }
            }
        });

        state.setCurrentGameState(state.GameState.Playing);
        audio.restoreMusicVolume();
        ui.hidePauseMenu();
        pauseStartTime = 0; // Reset pause start time
    }
    // Ignore if in other states like GameOver or MainMenu
}

// --- Action Triggers (called by both keyboard/gamepad) ---
function triggerJump() {
    if (player.jumpsLeft > 0) {
        player.velocityY = -(player.jumpPower || PLAYER_JUMP_POWER);
        player.isGrounded = false;
        player.jumpsLeft--;
    }
}

function triggerDash(direction) {
    const now = Date.now();
    if (!player.isDashing && now - player.lastDashTime > PLAYER_DASH_COOLDOWN) {
        player.isDashing = true;
        player.lastDashTime = now;
        // Dash direction based on trigger or fallback
        let dashDir = (direction === 'right' ? 1 : direction === 'left' ? -1 : (player.velocityX !== 0 ? Math.sign(player.velocityX) : 1));
        player.facing = dashDir;
        player.velocityX = dashDir * PLAYER_DASH_POWER;
        player.gravity = 0; // Temporarily disable gravity
        player.velocityY = 0; // Also reset vertical velocity on dash

        console.log(`Dash triggered: Dir=${dashDir}, VelX=${player.velocityX}`);

        // Set timeout to end dash
        setTimeout(() => {
            player.isDashing = false;
            player.gravity = player.baseGravity || PLAYER_GRAVITY; // Restore gravity
            player.velocityX = 0; // <<< ADD THIS LINE TO STOP HORIZONTAL MOVEMENT
            console.log("Dash ended.");
        }, PLAYER_DASH_DURATION);
    }
}

// --- Setup Input Listeners ---
export function initializeInput() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    setupFirstTouchAudioUnlock();
    setupTouchControls();
    console.log("Input listeners initialized.");
} 
