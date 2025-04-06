import * as state from './state.js';
import * as audio from './audio.js'; // Import the audio module
// import { canvas } from './graphics.js'; // Removed import
import { startGame as startGameLogic } from './game.js';
// import * as playfab from './playfab.js'; // REMOVED
// Import Firebase auth and necessary functions
import { auth } from './firebaseConfig.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    sendPasswordResetEmail // Import password reset function
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const aliasInput = document.getElementById('aliasInput'); // Was playerNameInput
const aliasGroup = document.querySelector('.input-group.register-only');
const authButton = document.getElementById('authButton'); // Was startButton
const quitButton = document.getElementById('quitButton');
const infoText = document.getElementById('infoText');
const toggleAuthLink = document.getElementById('toggleAuthLink');
const resetPasswordLink = document.getElementById('resetPasswordLink'); // Add reference if needed later
const rememberPasswordCheckbox = document.getElementById('rememberPasswordCheckbox');
const rememberGroup = document.querySelector('.remember-me');
const gameOverControls = document.getElementById('gameOverControls');
const retryButton = document.getElementById('retryButton');
const mainMenuButton = document.getElementById('mainMenuButton');
const pauseMenu = document.getElementById('pauseMenu');
const resumeButton = document.getElementById('resumeButton');
const quitToMenuButton = document.getElementById('quitToMenuButton');
const pauseOptionsButton = document.getElementById('pauseOptionsButton'); // NEW
const optionsButton = document.getElementById('optionsButton');
const optionsMenu = document.getElementById('optionsMenu');     // NEW
const optionsBackButton = document.getElementById('optionsBackButton'); // NEW
const musicVolumeSlider = document.getElementById('musicVolumeSlider'); // NEW
const musicVolumeValue = document.getElementById('musicVolumeValue');   // NEW
const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');     // NEW
const sfxVolumeValue = document.getElementById('sfxVolumeValue');       // NEW

// localStorage Keys
const LAST_EMAIL_KEY = 'zipzip_lastEmail';
const SAVED_PASSWORD_KEY = 'zipzip_savedPassword'; // !! INSECURE !!

// UI State
let isRegisterMode = false; // Start in Login mode
let uiInitialized = false;
let returnToPauseMenu = false; // NEW: Track where to return from Options

// --- Options Menu Focus Management (NEW) ---
let optionsFocusableItems = []; // Sliders + Back button
let currentOptionsFocusIndex = 0;
const FOCUSED_OPTIONS_ITEM_CLASS = 'focused'; // Class for option items (sliders)
const FOCUSED_BUTTON_CLASS = 'focused-button'; // Existing class for buttons

export function setupOptionsFocus() {
    // Get all sliders and the back button
    const sliders = Array.from(optionsMenu.querySelectorAll('.options-item'));
    optionsFocusableItems = [...sliders, optionsBackButton]; 
    currentOptionsFocusIndex = 0; // Default focus to the first slider
    updateOptionsMenuFocus();
}

function updateOptionsMenuFocus() {
    optionsFocusableItems.forEach((item, index) => {
        // Remove existing focus classes first
        item.classList.remove(FOCUSED_OPTIONS_ITEM_CLASS);
        item.classList.remove(FOCUSED_BUTTON_CLASS);

        if (index === currentOptionsFocusIndex) {
            // Add the appropriate focus class based on the element type
            if (item.classList.contains('options-item')) {
                item.classList.add(FOCUSED_OPTIONS_ITEM_CLASS);
            } else { // It's the button
                item.classList.add(FOCUSED_BUTTON_CLASS);
            }
        }
    });
}

export function focusNextOptionsItem() {
    if (optionsFocusableItems.length === 0) return;
    currentOptionsFocusIndex = (currentOptionsFocusIndex + 1) % optionsFocusableItems.length;
    updateOptionsMenuFocus();
}

export function focusPreviousOptionsItem() {
    if (optionsFocusableItems.length === 0) return;
    currentOptionsFocusIndex = (currentOptionsFocusIndex - 1 + optionsFocusableItems.length) % optionsFocusableItems.length;
    updateOptionsMenuFocus();
}

// Get the currently focused options item (needed by input.js to adjust sliders)
export function getFocusedOptionsItem() {
    if (optionsFocusableItems.length === 0) return null;
    return optionsFocusableItems[currentOptionsFocusIndex];
}

// --- Pause Menu Focus Management ---
let pauseMenuButtons = []; // Array to hold button elements
let currentPauseFocusIndex = 0;

export function setupPauseMenuFocus() {
    pauseMenuButtons = [resumeButton, pauseOptionsButton, quitToMenuButton];
    currentPauseFocusIndex = 0; // Default focus to Resume
    updatePauseMenuFocus();
}

function updatePauseMenuFocus() {
    pauseMenuButtons.forEach((button, index) => {
        if (index === currentPauseFocusIndex) {
            button.classList.add(FOCUSED_BUTTON_CLASS);
        } else {
            button.classList.remove(FOCUSED_BUTTON_CLASS);
        }
    });
}

export function focusNextPauseButton() {
    currentPauseFocusIndex = (currentPauseFocusIndex + 1) % pauseMenuButtons.length;
    updatePauseMenuFocus();
}

export function focusPreviousPauseButton() {
    currentPauseFocusIndex = (currentPauseFocusIndex - 1 + pauseMenuButtons.length) % pauseMenuButtons.length;
    updatePauseMenuFocus();
}

export function activateFocusedPauseButton() {
    if (pauseMenuButtons[currentPauseFocusIndex]) {
        console.log(`Activating focused button: ${pauseMenuButtons[currentPauseFocusIndex].id}`);
        pauseMenuButtons[currentPauseFocusIndex].click(); // Simulate a click
    }
}

// --- Game Over Menu Focus Management ---
const gameOverScreen = document.getElementById('gameOverScreen'); // Get Game Over screen
const gameOverButtons = gameOverScreen ? Array.from(gameOverScreen.querySelectorAll('.game-over-button')) : []; // Get Game Over buttons
let currentGameOverFocusIndex = 0; // Track focus for Game Over

export function setupGameOverFocus() {
    if (gameOverButtons.length === 0) return;
    currentGameOverFocusIndex = 0; // Default to Retry (assuming it's first)
    focusGameOverButton(currentGameOverFocusIndex);
}

function focusGameOverButton(index) {
    if (gameOverButtons.length === 0) return;
    // Remove focus from all
    gameOverButtons.forEach(btn => btn.classList.remove('focused'));
    // Add focus to the target button
    gameOverButtons[index].classList.add('focused');
}

export function focusNextGameOverButton() {
    if (gameOverButtons.length === 0) return;
    currentGameOverFocusIndex = (currentGameOverFocusIndex + 1) % gameOverButtons.length;
    focusGameOverButton(currentGameOverFocusIndex);
}

export function focusPreviousGameOverButton() {
    if (gameOverButtons.length === 0) return;
    currentGameOverFocusIndex = (currentGameOverFocusIndex - 1 + gameOverButtons.length) % gameOverButtons.length;
    focusGameOverButton(currentGameOverFocusIndex);
}

export function activateFocusedGameOverButton() {
    if (gameOverButtons.length === 0 || currentGameOverFocusIndex < 0 || currentGameOverFocusIndex >= gameOverButtons.length) return;
    console.log(`Activating Game Over button index: ${currentGameOverFocusIndex}, ID: ${gameOverButtons[currentGameOverFocusIndex].id}`);
    gameOverButtons[currentGameOverFocusIndex].click(); // Simulate a click
}

// --- UI Control ---
export function showLoginScreen() {
    loginScreen.style.display = 'flex';
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'none';
    // Reset form for display
    emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || '';
    const savedPassword = localStorage.getItem(SAVED_PASSWORD_KEY);
    if (savedPassword) {
        passwordInput.value = savedPassword;
        rememberPasswordCheckbox.checked = true;
    } else {
        passwordInput.value = '';
        rememberPasswordCheckbox.checked = false;
    }
    aliasInput.value = '';
    infoText.textContent = 'Enter email & password to Login or Register.';
    setAuthMode(false); // Ensure it starts in Login mode
    if (gameOverControls) gameOverControls.style.display = 'none'; // Hide on login
}

export function hideLoginScreen() {
    loginScreen.style.display = 'none';
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'block';
    if (gameOverControls) gameOverControls.style.display = 'none'; // Hide when starting game
}

// NEW: Show/Hide Game Over Controls
export function showGameOverControls() {
    if (gameOverControls) gameOverControls.style.display = 'flex';
}

export function hideGameOverControls() {
    if (gameOverControls) gameOverControls.style.display = 'none';
}

// NEW: Show/Hide Pause Menu
export function showPauseMenu() {
    if (pauseMenu) pauseMenu.style.display = 'flex';
}

export function hidePauseMenu() {
    if (pauseMenu) {
        console.log("Attempting to hide pause menu..."); // LOG
        pauseMenu.style.display = 'none';
        console.log("Pause menu display style set to none."); // LOG
    } else {
        console.error("hidePauseMenu called, but pauseMenu element not found!"); // LOG Error
    }
}

// --- Auth Mode Toggle ---
function setAuthMode(register) {
    console.log(`setAuthMode called. Setting mode to: ${register ? 'Register' : 'Login'}`); // LOG
    isRegisterMode = register;
    if (isRegisterMode) {
        authButton.textContent = 'Register';
        toggleAuthLink.textContent = 'Already have an account? Login';
        if (aliasGroup) aliasGroup.style.display = 'flex'; else console.error('aliasGroup not found!'); // Check element exists
        if (resetPasswordLink) resetPasswordLink.style.display = 'none'; else console.error('resetPasswordLink not found!');
        if (rememberGroup) rememberGroup.style.display = 'none'; // Hide remember on register
    } else {
        authButton.textContent = 'Login';
        toggleAuthLink.textContent = 'Need to Register?';
        if (aliasGroup) aliasGroup.style.display = 'none'; else console.error('aliasGroup not found!'); // Check element exists
        if (resetPasswordLink) resetPasswordLink.style.display = 'block'; else console.error('resetPasswordLink not found!');
        if (rememberGroup) rememberGroup.style.display = 'flex'; // Show remember on login
    }
    infoText.textContent = ''; // Clear previous messages
    console.log(`setAuthMode finished. Alias group display: ${aliasGroup ? aliasGroup.style.display : 'Not Found'}`); // LOG
}

// --- Event Handlers ---

// Main function for Login/Register button
async function handleAuthClick() {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const alias = aliasInput.value.trim();

    // Basic validation
    if (!email || !password) {
        infoText.textContent = "Email and Password cannot be empty.";
        return;
    }
    if (isRegisterMode && !alias) {
        infoText.textContent = "Display Name cannot be empty during registration.";
        return;
    }
    if (password.length < 6) {
         infoText.textContent = "Password must be at least 6 characters.";
         return;
    }

    authButton.disabled = true;
    infoText.textContent = isRegisterMode ? 'Registering...' : 'Logging in...';

    try {
        let userCredential;
        if (isRegisterMode) {
            // --- Registration --- //
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log("Registration successful:", userCredential.user);
            // Set the display name
            await updateProfile(userCredential.user, { displayName: alias });
            console.log("Display name updated.");
            // Store relevant info (UID and Display Name)
            state.setPlayerInfo(userCredential.user.uid, alias);
            // Always save email on registration
            localStorage.setItem(LAST_EMAIL_KEY, email);
            // Never save password on registration
            localStorage.removeItem(SAVED_PASSWORD_KEY);
            rememberPasswordCheckbox.checked = false;
            infoText.textContent = 'Registration successful! Starting game...';
        } else {
            // --- Login --- //
            userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Login successful:", userCredential.user);
            // Store relevant info (UID and Display Name from profile)
            state.setPlayerInfo(userCredential.user.uid, userCredential.user.displayName || 'Anon'); // Use saved name or default
            // Save email on successful login
            localStorage.setItem(LAST_EMAIL_KEY, email);
            // Save or remove password based on checkbox
            if (rememberPasswordCheckbox.checked) {
                console.warn("Saving password to localStorage (INSECURE!)");
                localStorage.setItem(SAVED_PASSWORD_KEY, password); // Store password
            } else {
                localStorage.removeItem(SAVED_PASSWORD_KEY); // Remove if unchecked
            }
            infoText.textContent = 'Login successful! Starting game...';
        }

        // --- Start Game (Common for both) ---
        // Delay slightly to show success message
        setTimeout(() => {
            hideLoginScreen();
            startGameLogic();
            state.setCurrentGameState(state.GameState.Playing);
            authButton.disabled = false; // Re-enable button for next time
        }, 1000);

    } catch (error) {
        console.error("Authentication error:", error);
        infoText.textContent = getFirebaseAuthErrorMessage(error);
        authButton.disabled = false;
    }
}

// Helper to provide user-friendly error messages
function getFirebaseAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email':
            return 'Invalid email format.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/email-already-in-use':
            return 'This email is already registered.';
        case 'auth/weak-password':
            return 'Password is too weak (must be 6+ characters).';
        case 'auth/operation-not-allowed':
            return 'Email/password accounts are not enabled.'; // Check Firebase console
        case 'auth/network-request-failed':
             return 'Network error. Check connection.';
        default:
            return `Authentication failed: ${error.message}`;
    }
}

// NEW: Handle Password Reset Click
async function handlePasswordReset() {
    const email = emailInput.value.trim();
    if (!email) {
        infoText.textContent = "Please enter your email address first.";
        emailInput.focus();
        return;
    }

    infoText.textContent = "Sending password reset email...";
    authButton.disabled = true; // Disable buttons during process
    quitButton.disabled = true;
    resetPasswordLink.style.pointerEvents = 'none'; // Disable link temporarily

    try {
        await sendPasswordResetEmail(auth, email);
        console.log("Password reset email sent successfully to:", email);
        infoText.textContent = `Password reset email sent to ${email}. Check your inbox (and spam folder).`;
    } catch (error) {
        console.error("Password reset error:", error);
        infoText.textContent = getFirebaseAuthErrorMessage(error); // Use existing helper
    } finally {
        // Re-enable buttons/link regardless of success/failure
        authButton.disabled = false;
        quitButton.disabled = false;
        resetPasswordLink.style.pointerEvents = 'auto';
    }
}

function handleRetryClick() {
    console.log("Retry button clicked");
    hideGameOverControls();
    // Call startGameLogic FIRST - it handles resetting stats and setting the state
    startGameLogic();
}

function handleMainMenuClick() {
    console.log("Main Menu button clicked");
    hideGameOverControls();
    state.clearLeaderboardCache(); 
    audio.restoreMusicVolume(); // Restore volume before going to menu
    showLoginScreen();
    state.setCurrentGameState(state.GameState.MainMenu);
}

function handleQuitClick() {
    infoText.textContent = "Quit action not fully implemented.";
    console.log("Quit button clicked.");
    // Optional: Could try to sign the user out here if desired
    // auth.signOut();
}

// NEW: Handle Pause Menu Buttons
function handleResumeClick() {
    console.log("Resume button clicked");
    if (state.getCurrentGameState() === state.GameState.Paused) {
        state.setCurrentGameState(state.GameState.Playing);
        audio.restoreMusicVolume(); // Restore volume
        hidePauseMenu();
    }
}

function handleQuitToMenuClick() {
    console.log("Quit to Menu button clicked from Pause Menu");
    hidePauseMenu();
    state.clearLeaderboardCache(); 
    audio.restoreMusicVolume(); // Restore volume before going to menu
    
    showLoginScreen(); 
    state.setCurrentGameState(state.GameState.MainMenu);
}

// --- Show/Hide Menus ---
function showOptionsMenu(fromPause = false) {
    returnToPauseMenu = fromPause; // Remember where we came from
    if (optionsMenu) optionsMenu.style.display = 'block';
    if (fromPause) {
        if (pauseMenu) pauseMenu.style.display = 'none'; // Hide pause menu
    } else {
        if (loginScreen) loginScreen.style.display = 'none'; // Hide login screen
    }
    // Initialize slider positions and values based on current audio settings
    if (musicVolumeSlider) {
        const currentMusicVol = audio.getMusicVolume();
        musicVolumeSlider.value = currentMusicVol * 100;
        if (musicVolumeValue) musicVolumeValue.textContent = `${Math.round(currentMusicVol * 100)}%`;
    }
    if (sfxVolumeSlider) {
        const currentSfxVol = audio.getSfxVolume();
        sfxVolumeSlider.value = currentSfxVol * 100;
        if (sfxVolumeValue) sfxVolumeValue.textContent = `${Math.round(currentSfxVol * 100)}%`;
    }
    setupOptionsFocus(); // Initialize focus when shown
}

function hideOptionsMenu() {
    if (optionsMenu) optionsMenu.style.display = 'none';
    if (returnToPauseMenu) {
        showPauseMenu(); // Return to pause menu
        setupPauseMenuFocus(); // Re-initialize focus
    } else {
        showLoginScreen(); // Return to login screen
    }
    returnToPauseMenu = false; // Reset flag
    // Optionally clear focus visuals when hiding
    optionsFocusableItems.forEach(item => {
        item.classList.remove(FOCUSED_OPTIONS_ITEM_CLASS);
        item.classList.remove(FOCUSED_BUTTON_CLASS);
    });
    optionsFocusableItems = []; // Clear array
}

// --- Initialization ---
export function initializeUI() {
    if (uiInitialized) return;
    uiInitialized = true;
    console.log("Initializing UI..."); // LOG

    // Quick check if elements exist
    if (!toggleAuthLink) console.error('toggleAuthLink not found during init!');
    if (!authButton) console.error('authButton not found during init!');
    if (!quitButton) console.error('quitButton not found during init!');
    if (!resetPasswordLink) console.error('resetPasswordLink not found during init!'); // Add check
    if (!rememberPasswordCheckbox) console.error('rememberPasswordCheckbox not found!');
    if (!rememberGroup) console.error('rememberGroup div not found!');
    if (!gameOverControls) console.error('gameOverControls div not found!');
    if (!retryButton) console.error('retryButton not found!');
    if (!mainMenuButton) console.error('mainMenuButton not found!');
    if (!pauseMenu) console.error('pauseMenu div not found!');
    if (!resumeButton) console.error('resumeButton not found!');
    if (!quitToMenuButton) console.error('quitToMenuButton not found!');
    if (!pauseOptionsButton) console.error('pauseOptionsButton not found!'); // NEW check
    if (!optionsButton) console.error('optionsButton not found!');
    if (!optionsMenu) console.error('optionsMenu not found!');
    if (!optionsBackButton) console.error('optionsBackButton not found!');
    if (!musicVolumeSlider) console.error('musicVolumeSlider not found!');
    if (!musicVolumeValue) console.error('musicVolumeValue not found!');
    if (!sfxVolumeSlider) console.error('sfxVolumeSlider not found!');
    if (!sfxVolumeValue) console.error('sfxVolumeValue not found!');

    // Attach Listeners
    authButton.addEventListener('click', handleAuthClick);
    quitButton.addEventListener('click', handleQuitClick);
    toggleAuthLink.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent page jump
        console.log("Toggle Auth Link Clicked!"); // LOG
        try {
             setAuthMode(!isRegisterMode);
        } catch (err) {
             console.error("Error calling setAuthMode:", err); // LOG Error
        }
    });

    // NEW: Add listener for password reset link
    resetPasswordLink.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent page jump
        console.log("Reset Password Link Clicked!"); // LOG
        handlePasswordReset();
    });

    // Optional: Enter key submission
    [emailInput, passwordInput, aliasInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !authButton.disabled) {
                handleAuthClick();
            }
        });
    });

    retryButton.addEventListener('click', handleRetryClick);
    mainMenuButton.addEventListener('click', handleMainMenuClick);
    resumeButton.addEventListener('click', handleResumeClick);
    quitToMenuButton.addEventListener('click', handleQuitToMenuClick);

    // NEW: Options button listener (from login screen)
    if (optionsButton) {
        optionsButton.addEventListener('click', () => showOptionsMenu(false)); // came from login
    }

    // NEW: Options button listener (from pause menu)
    if (pauseOptionsButton) {
        pauseOptionsButton.addEventListener('click', () => showOptionsMenu(true)); // came from pause
    }

    // Options menu listeners (Back button now uses hideOptionsMenu)
    if (optionsBackButton) {
        optionsBackButton.addEventListener('click', hideOptionsMenu);
    }

    if (musicVolumeSlider) {
        musicVolumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            audio.setMusicVolume(volume);
            if (musicVolumeValue) musicVolumeValue.textContent = `${e.target.value}%`;
        });
    }

    if (sfxVolumeSlider) {
        sfxVolumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            audio.setSfxVolume(volume);
            if (sfxVolumeValue) sfxVolumeValue.textContent = `${e.target.value}%`;
            // Optionally play a sound effect here as feedback
            // audio.playLandingSound(); 
        });
    }

    // Check initial auth state (user might already be logged in from previous session)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            console.log("User already signed in:", user);
            state.setPlayerInfo(user.uid, user.displayName || 'Anon');
            // Optionally skip login screen and go straight to game or menu
            // hideLoginScreen();
            // startGameLogic(); // Or show a logged-in menu
            // For now, we still show the login screen, but could change this
            showLoginScreen(); // Keep showing login for now

        } else {
            // User is signed out
            console.log("No user signed in.");
            showLoginScreen();
        }
        // Enable button once auth check is done
        authButton.disabled = false;
        quitButton.disabled = false;
    });

    setupPauseMenuFocus(); // Initialize focus management

    // Load volume preferences when UI initializes
    audio.loadVolumePreferences();

    console.log("UI Initialized and Firebase auth listener attached.");
} 