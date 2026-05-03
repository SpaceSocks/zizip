// This file will handle keyboard and gamepad input 
import * as state from './state.js?v=mobile-portrait-96';
import * as audio from './audio.js?v=mobile-portrait-96';
import * as ui from './ui.js?v=mobile-portrait-96';
import { player } from './entities.js?v=mobile-portrait-96';
import { AXIS_DEADZONE, PLAYER_JUMP_POWER } from './constants.js?v=mobile-portrait-96';
import { getPlatforms } from './state.js?v=mobile-portrait-96'; // Import getPlatforms

// --- Input State (shared within this module) ---
export const keys = {
    left: false,
    right: false,
    up: false
};

const keyboardMoveKeys = {
    left: false,
    right: false
};

const touchMoveKeys = {
    left: false,
    right: false
};

const gamepadMoveKeys = {
    left: false,
    right: false
};

function syncHorizontalInput() {
    const keyboardHasMove = keyboardMoveKeys.left || keyboardMoveKeys.right;
    const touchHasMove = touchMoveKeys.left || touchMoveKeys.right;
    const gamepadHasMove = gamepadMoveKeys.left || gamepadMoveKeys.right;

    if (keyboardHasMove) {
        keys.left = keyboardMoveKeys.left;
        keys.right = keyboardMoveKeys.right;
    } else if (touchHasMove) {
        keys.left = touchMoveKeys.left;
        keys.right = touchMoveKeys.right;
    } else if (gamepadHasMove) {
        keys.left = gamepadMoveKeys.left;
        keys.right = gamepadMoveKeys.right;
    } else {
        keys.left = false;
        keys.right = false;
    }
}

function setKeyboardMove(left, right) {
    keyboardMoveKeys.left = left;
    keyboardMoveKeys.right = right;
    syncHorizontalInput();
}

function setTouchMove(left, right) {
    touchMoveKeys.left = left;
    touchMoveKeys.right = right;
    syncHorizontalInput();
}

function setGamepadMove(left, right) {
    gamepadMoveKeys.left = left;
    gamepadMoveKeys.right = right;
    syncHorizontalInput();
}

function resetHorizontalInput() {
    keyboardMoveKeys.left = false;
    keyboardMoveKeys.right = false;
    touchMoveKeys.left = false;
    touchMoveKeys.right = false;
    gamepadMoveKeys.left = false;
    gamepadMoveKeys.right = false;
    syncHorizontalInput();
}

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
            setKeyboardMove(true, keyboardMoveKeys.right);
            break; 
        case 'ArrowRight': case 'KeyD': 
            setKeyboardMove(keyboardMoveKeys.left, true);
            break;
        case 'ArrowUp': case 'KeyW': case 'Space':
            if (!keys.up) {
                triggerJump();
            }
            keys.up = true;
            break;
        default:
            // Handle other keys if needed
            break;
    }
}

function handleKeyUp(e) {
    if (state.getIsGameOver()) return;
     switch (e.code) {
        case 'ArrowLeft': case 'KeyA': setKeyboardMove(false, keyboardMoveKeys.right); break;
        case 'ArrowRight': case 'KeyD': setKeyboardMove(keyboardMoveKeys.left, false); break;
        case 'ArrowUp': case 'KeyW': case 'Space': keys.up = false; break;
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
    setTouchMove(normalizedX < -0.28, normalizedX > 0.28);
}

function resetJoystick(knob) {
    joystickPointerId = null;
    setTouchMove(false, false);
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
        setTouchMove(false, false);
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
        resetHorizontalInput();
        keys.up = false;
        togglePause();
    });
}

// --- Gamepad Input Handling ---
let wasStartPressed = false; 
let wasJumpPressed = false; 
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
            hint: 'LEFT STICK MOVE   X JUMP   OPTIONS PAUSE'
        };
    }

    if (isXbox) {
        return {
            id,
            index: gamepad.index,
            family: 'xbox',
            label: 'Xbox controller',
            hint: 'LEFT STICK MOVE   A JUMP   MENU PAUSE'
        };
    }

    return {
        id,
        index: gamepad?.index || 0,
        family: 'generic',
        label: 'Controller',
        hint: 'LEFT STICK MOVE   SOUTH BUTTON JUMP   START PAUSE'
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
    setGamepadMove(false, false);
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
    return 'A/D MOVE   SPACE JUMP   ESC PAUSE';
}

window.__cosmicZipGetControlHint = getCurrentControlHint;

export function handleGamepadInput() {
    const gp = getFirstConnectedGamepad();
    if (!gp) {
        wasStartPressed = false;
        wasJumpPressed = false;
        activeGamepadInfo = null;
        setGamepadMove(false, false);
        return;
    }

    updateActiveGamepad(gp, true);
    const startPressed = gp.buttons[9] && gp.buttons[9].pressed;
    const jumpPressed = gp.buttons[0] && gp.buttons[0].pressed;
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

                    const sliderMin = parseFloat(slider.min || '0');
                    const sliderMax = parseFloat(slider.max || '100');
                    if (dpadRight && !optionsNavState.right) {
                        slider.value = Math.min(sliderMax, currentValue + step);
                        changed = true;
                        optionsNavState.right = true; 
                    }
                    if (dpadLeft && !optionsNavState.left) {
                        slider.value = Math.max(sliderMin, currentValue - step);
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
            } else if ((focusedItem.id === 'optionsBackButton' || focusedItem.classList.contains('options-category-button')) && activate) {
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
            setGamepadMove(true, false);
        } else if (dpadRight) {
            setGamepadMove(false, true);
        } else if (Math.abs(axisX) > AXIS_DEADZONE) {
            setGamepadMove(axisX < -AXIS_DEADZONE, axisX > AXIS_DEADZONE);
        } else {
            setGamepadMove(false, false);
        }

        // Jump (Button 0: A / Cross)
        if (jumpPressed && !wasJumpPressed) { 
            triggerJump();
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
