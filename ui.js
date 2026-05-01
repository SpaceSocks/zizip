import * as state from './state.js';
import * as audio from './audio.js'; // Import the audio module
// import { canvas } from './graphics.js'; // Removed import
import { ensureGameLoop, startGame as startGameLogic } from './game.js';
// import * as playfab from './playfab.js'; // REMOVED
import { getFirebaseServices } from './firebaseConfig.js';

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const loginStarCanvas = document.getElementById('loginStarCanvas');
const loginStarCtx = loginStarCanvas ? loginStarCanvas.getContext('2d') : null;
const localAliasInput = document.getElementById('localAliasInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const aliasInput = document.getElementById('aliasInput'); // Was playerNameInput
const aliasGroup = document.querySelector('.input-group.register-only');
const authButton = document.getElementById('authButton'); // Was startButton
const quitButton = document.getElementById('quitButton');
const localPlayButton = document.getElementById('localPlayButton');
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
const leaderboardButton = document.getElementById('leaderboardButton');
const leaderboardPanel = document.getElementById('leaderboardPanel');
const leaderboardRefreshButton = document.getElementById('leaderboardRefreshButton');
const leaderboardBackButton = document.getElementById('leaderboardBackButton');
const localLeaderboardButton = document.getElementById('localLeaderboardButton');
const globalLeaderboardButton = document.getElementById('globalLeaderboardButton');
const menuLeaderboardStatus = document.getElementById('menuLeaderboardStatus');
const menuLeaderboardList = document.getElementById('menuLeaderboardList');
const optionsMenu = document.getElementById('optionsMenu');     // NEW
const optionsBackButton = document.getElementById('optionsBackButton'); // NEW
const musicVolumeSlider = document.getElementById('musicVolumeSlider'); // NEW
const musicVolumeValue = document.getElementById('musicVolumeValue');   // NEW
const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');     // NEW
const sfxVolumeValue = document.getElementById('sfxVolumeValue');       // NEW
const bestGhostToggle = document.getElementById('bestGhostToggle');
const bestGhostValue = document.getElementById('bestGhostValue');
const replayControls = document.getElementById('replayControls');
const replayBackButton = document.getElementById('replayBackButton');
const replayRewindButton = document.getElementById('replayRewindButton');
const replayPlayPauseButton = document.getElementById('replayPlayPauseButton');
const replayForwardButton = document.getElementById('replayForwardButton');
const replaySpeedButton = document.getElementById('replaySpeedButton');
const replayTimeline = document.getElementById('replayTimeline');
const replayTimeLabel = document.getElementById('replayTimeLabel');

// localStorage Keys
const LAST_EMAIL_KEY = 'zipzip_lastEmail';
const SAVED_PASSWORD_KEY = 'zipzip_savedPassword'; // !! INSECURE !!
const LOCAL_ALIAS_KEY = 'zipzip_localAlias';

// UI State
let isRegisterMode = false; // Start in Login mode
let uiInitialized = false;
let returnToPauseMenu = false; // NEW: Track where to return from Options
let authApiPromise = null;
let lastPasswordResetEmail = '';
let loginStars = [];
let loginStarAnimationId = null;
let replayReturnTarget = 'gameover';
let menuLeaderboardSource = 'local';

const LOGIN_STAR_VARIANTS = [
    { count: 340, color: '#253039', alphaMin: 0.10, alphaMax: 0.20, sizeMin: 0.98, sizeMax: 1.5, speedMin: 0.030, speedMax: 0.066 },
    { count: 240, color: '#4a5661', alphaMin: 0.16, alphaMax: 0.30, sizeMin: 0.98, sizeMax: 1.65, speedMin: 0.048, speedMax: 0.096 },
    { count: 140, color: '#8a98a2', alphaMin: 0.26, alphaMax: 0.46, sizeMin: 1.05, sizeMax: 1.8, speedMin: 0.078, speedMax: 0.144 },
    { count: 54, color: '#8fd3ff', alphaMin: 0.34, alphaMax: 0.62, sizeMin: 1.13, sizeMax: 1.95, speedMin: 0.120, speedMax: 0.204 },
    { count: 22, color: '#ffffff', alphaMin: 0.62, alphaMax: 0.92, sizeMin: 1.2, sizeMax: 2.18, speedMin: 0.180, speedMax: 0.285 }
];

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function createLoginStar(variant, startAtRight = false) {
    return {
        x: startAtRight ? loginStarCanvas.width + variant.sizeMax : Math.random() * loginStarCanvas.width,
        y: Math.random() * loginStarCanvas.height,
        size: randomBetween(variant.sizeMin, variant.sizeMax),
        speed: randomBetween(variant.speedMin, variant.speedMax),
        alpha: randomBetween(variant.alphaMin, variant.alphaMax),
        color: variant.color,
        variant
    };
}

function resizeLoginStars() {
    if (!loginStarCanvas) return;
    loginStarCanvas.width = window.innerWidth;
    loginStarCanvas.height = window.innerHeight;
    loginStars = LOGIN_STAR_VARIANTS.flatMap(variant =>
        Array.from({ length: variant.count }, () => createLoginStar(variant))
    );
}

function drawLoginStars() {
    if (!loginStarCanvas || !loginStarCtx) return;

    loginStarCtx.clearRect(0, 0, loginStarCanvas.width, loginStarCanvas.height);
    loginStars.forEach(star => {
        star.x -= star.speed;
        if (star.x < -star.size) {
            Object.assign(star, createLoginStar(star.variant, true));
        }

        loginStarCtx.globalAlpha = star.alpha;
        loginStarCtx.fillStyle = star.color;
        loginStarCtx.fillRect(star.x, star.y, star.size, star.size);
    });
    loginStarCtx.globalAlpha = 1;

    loginStarAnimationId = requestAnimationFrame(drawLoginStars);
}

function showLoginStarfield() {
    if (!loginStarCanvas) return;
    loginStarCanvas.style.display = 'block';
    if (loginStars.length === 0 || loginStarCanvas.width !== window.innerWidth || loginStarCanvas.height !== window.innerHeight) {
        resizeLoginStars();
    }
    if (!loginStarAnimationId) {
        loginStarAnimationId = requestAnimationFrame(drawLoginStars);
    }
}

function hideLoginStarfield() {
    if (!loginStarCanvas) return;
    loginStarCanvas.style.display = 'none';
    if (loginStarAnimationId) {
        cancelAnimationFrame(loginStarAnimationId);
        loginStarAnimationId = null;
    }
}

function hideLeaderboardPanel() {
    if (leaderboardPanel) leaderboardPanel.style.display = 'none';
}

function makeLeaderboardCell(className, text) {
    const cell = document.createElement('div');
    cell.className = className;
    cell.textContent = text;
    return cell;
}

function renderMenuLeaderboard(entries = []) {
    if (!menuLeaderboardList) return;
    menuLeaderboardList.replaceChildren();

    const header = document.createElement('div');
    header.className = 'menu-leaderboard-row header';
    header.append(
        makeLeaderboardCell('number', '#'),
        makeLeaderboardCell('name', 'Player'),
        makeLeaderboardCell('metric', 'Score'),
        makeLeaderboardCell('metric', 'Height'),
        makeLeaderboardCell('time', 'Time'),
        makeLeaderboardCell('replay', 'Run')
    );
    menuLeaderboardList.appendChild(header);

    entries.slice(0, 10).forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'menu-leaderboard-row';
        const hasReplay = entry.replay && Array.isArray(entry.replay.samples) && entry.replay.samples.length > 0;
        const replayButton = document.createElement('button');
        replayButton.className = 'replay-icon-button';
        replayButton.type = 'button';
        replayButton.textContent = hasReplay ? '▶' : '-';
        replayButton.title = hasReplay ? 'Watch replay' : 'No replay saved';
        replayButton.disabled = !hasReplay;
        replayButton.addEventListener('click', () => startMenuReplay(entry));

        row.append(
            makeLeaderboardCell('number', `${index + 1}.`),
            makeLeaderboardCell('name', (entry.displayName || 'Anon').toUpperCase()),
            makeLeaderboardCell('metric', String(entry.score ?? 0)),
            makeLeaderboardCell('metric', `${Math.round(entry.maxHeight || 0)} M`),
            makeLeaderboardCell('time', entry.time || '00:00'),
            replayButton
        );
        menuLeaderboardList.appendChild(row);
    });
}

function updateLeaderboardSourceButtons() {
    localLeaderboardButton?.classList.toggle('active', menuLeaderboardSource === 'local');
    globalLeaderboardButton?.classList.toggle('active', menuLeaderboardSource === 'global');
}

async function showLeaderboardPanel(force = true, source = menuLeaderboardSource || state.getActiveLeaderboardSource()) {
    if (!leaderboardPanel || !menuLeaderboardStatus || !menuLeaderboardList) return;

    menuLeaderboardSource = source === 'global' ? 'global' : 'local';
    updateLeaderboardSourceButtons();
    leaderboardPanel.style.display = 'flex';
    menuLeaderboardStatus.textContent = `Loading ${menuLeaderboardSource === 'global' ? 'global' : 'local'} leaderboard...`;
    menuLeaderboardList.replaceChildren();
    if (force) state.clearLeaderboardCache();

    try {
        const entries = await state.getLeaderboard(menuLeaderboardSource);
        renderMenuLeaderboard(entries);
        menuLeaderboardStatus.textContent = entries.length
            ? `${menuLeaderboardSource === 'global' ? 'Global' : 'Local'} top runs`
            : `No ${menuLeaderboardSource === 'global' ? 'global' : 'local'} runs yet.`;
    } catch (error) {
        console.warn("Could not load menu leaderboard.", error);
        menuLeaderboardStatus.textContent = `Could not load ${menuLeaderboardSource} leaderboard.`;
    }
}

function startMenuReplay(entry) {
    if (!state.startReplay(entry)) return;
    audio.initializeAudio();
    hideLeaderboardPanel();
    loginScreen.style.display = 'none';
    hideLoginStarfield();
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'block';
    ensureGameLoop();
    showReplayControls('menu');
}

async function getAuthApi() {
    if (!authApiPromise) {
        authApiPromise = (async () => {
            const [{ auth }, authApi] = await Promise.all([
                getFirebaseServices(),
                import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
            ]);
            return { auth, ...authApi };
        })().catch((error) => {
            authApiPromise = null;
            throw error;
        });
    }

    return authApiPromise;
}

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
const gameOverButtons = [retryButton, mainMenuButton].filter(Boolean);
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
    showLoginStarfield();
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'none';
    // Reset form for display
    if (localAliasInput) localAliasInput.value = localStorage.getItem(LOCAL_ALIAS_KEY) || '';
    emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || '';
    passwordInput.value = localStorage.getItem(SAVED_PASSWORD_KEY) || '';
    rememberPasswordCheckbox.checked = !!passwordInput.value;
    aliasInput.value = '';
    setAuthMode(false); // Ensure it starts in Login mode
    infoText.textContent = 'Play locally now, or sign in for the online leaderboard.';
    if (gameOverControls) gameOverControls.style.display = 'none'; // Hide on login
    hideLeaderboardPanel();
    hideReplayControls();
}

export function hideLoginScreen() {
    loginScreen.style.display = 'none';
    hideLoginStarfield();
    hideLeaderboardPanel();
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'block';
    if (gameOverControls) gameOverControls.style.display = 'none'; // Hide when starting game
    hideReplayControls();
}

// NEW: Show/Hide Game Over Controls
export function showGameOverControls() {
    if (gameOverControls) gameOverControls.style.display = 'flex';
}

export function hideGameOverControls() {
    if (gameOverControls) gameOverControls.style.display = 'none';
}

export function showReplayControls(returnTarget = 'gameover') {
    replayReturnTarget = returnTarget;
    if (replayControls) replayControls.style.display = 'flex';
    hideGameOverControls();
    hideLeaderboardPanel();
    updateReplayControls();
}

export function hideReplayControls() {
    if (replayControls) replayControls.style.display = 'none';
}

export function exitReplay() {
    hideReplayControls();
    state.stopReplay();

    if (replayReturnTarget === 'menu') {
        hideLoginScreen();
        showLoginScreen();
        state.setCurrentGameState(state.GameState.MainMenu);
        showLeaderboardPanel(false);
        return;
    }

    showGameOverControls();
    setupGameOverFocus();
}

export function updateReplayControls() {
    const viewer = state.getReplayViewer?.();
    if (!viewer || !replayControls || replayControls.style.display === 'none') return;

    const duration = state.getReplayDuration();
    const ratio = duration > 0 ? viewer.time / duration : 0;
    if (replayTimeline && document.activeElement !== replayTimeline) {
        replayTimeline.value = Math.round(ratio * 1000);
    }
    if (replayPlayPauseButton) replayPlayPauseButton.textContent = viewer.playing ? 'Pause' : 'Play';
    if (replaySpeedButton) replaySpeedButton.textContent = `${viewer.speed}x`;
    if (replayTimeLabel) replayTimeLabel.textContent = `${formatReplayTime(viewer.time)} / ${formatReplayTime(duration)}`;
}

function formatReplayTime(timeMs) {
    const totalSeconds = Math.max(0, Math.floor((timeMs || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
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
    const password = passwordInput.value;
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
        const {
            auth,
            createUserWithEmailAndPassword,
            signInWithEmailAndPassword,
            updateProfile
        } = await getAuthApi();
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
            state.setActiveLeaderboardSource('global');
            localStorage.setItem(LAST_EMAIL_KEY, email);
            localStorage.removeItem(SAVED_PASSWORD_KEY);
            infoText.textContent = 'Registration successful! Starting game...';
        } else {
            // --- Login --- //
            userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Login successful:", userCredential.user);
            // Store relevant info (UID and Display Name from profile)
            state.setPlayerInfo(userCredential.user.uid, userCredential.user.displayName || 'Anon'); // Use saved name or default
            state.setActiveLeaderboardSource('global');
            localStorage.setItem(LAST_EMAIL_KEY, email);
            if (rememberPasswordCheckbox.checked) {
                localStorage.setItem(SAVED_PASSWORD_KEY, password);
            } else {
                localStorage.removeItem(SAVED_PASSWORD_KEY);
            }
            infoText.textContent = 'Login successful! Starting game...';
        }

        await clearFreshStartRemoteLeaderboard();

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
        infoText.textContent = getFirebaseAuthErrorMessage(error) || 'Online login unavailable. Use Play Local to start now.';
        authButton.disabled = false;
    }
}

// Helper to provide user-friendly error messages
function getFirebaseAuthErrorMessage(error) {
    if (!error || !error.code) {
        return 'Online login unavailable. Use Play Local to start now.';
    }

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
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a bit, then resend the reset email.';
        case 'auth/invalid-continue-uri':
            return 'Password reset link settings are invalid.';
        case 'auth/unauthorized-continue-uri':
            return 'This site is not authorized for password reset links in Firebase.';
        case 'auth/missing-android-pkg-name':
        case 'auth/missing-ios-bundle-id':
        case 'auth/invalid-dynamic-link-domain':
            return 'Password reset email link settings need to be fixed in Firebase.';
        default:
            return `Authentication failed: ${error.message}`;
    }
}

function getPasswordResetActionSettings() {
    if (!window.location || !/^https?:$/.test(window.location.protocol)) {
        return undefined;
    }

    return {
        url: `${window.location.origin}${window.location.pathname}`,
        handleCodeInApp: false
    };
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
        const { auth, fetchSignInMethodsForEmail, sendPasswordResetEmail } = await getAuthApi();
        let signInMethods = null;

        try {
            signInMethods = await fetchSignInMethodsForEmail(auth, email);
        } catch (verifyError) {
            console.warn("Could not verify email sign-in methods before reset:", verifyError);
        }

        if (Array.isArray(signInMethods) && signInMethods.length > 0 && !signInMethods.includes('password')) {
            infoText.textContent = `That email is registered with ${signInMethods.join(', ')}, not a password login.`;
            return;
        }

        const actionSettings = getPasswordResetActionSettings();
        if (actionSettings) {
            await sendPasswordResetEmail(auth, email, actionSettings);
        } else {
            await sendPasswordResetEmail(auth, email);
        }

        lastPasswordResetEmail = email;
        resetPasswordLink.textContent = 'Resend reset email';
        console.log("Password reset email sent successfully to:", email);
        infoText.textContent = `If ${email} has a password account, Firebase sent a reset link. Check inbox, spam, and promotions.`;
    } catch (error) {
        console.error("Password reset error:", error);
        infoText.textContent = getFirebaseAuthErrorMessage(error); // Use existing helper
    } finally {
        // Re-enable buttons/link regardless of success/failure
        authButton.disabled = false;
        quitButton.disabled = false;
        resetPasswordLink.style.pointerEvents = 'auto';
        if (!lastPasswordResetEmail) {
            resetPasswordLink.textContent = 'Forgot Password?';
        }
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

function handleLocalPlayClick() {
    console.log("Starting local play without Firebase auth.");
    const localAlias = localAliasInput ? localAliasInput.value.trim() : '';
    if (!localAlias) {
        infoText.textContent = 'Enter an alias for the leaderboard first.';
        localAliasInput?.focus();
        return;
    }

    localStorage.setItem(LOCAL_ALIAS_KEY, localAlias);
    audio.initializeAudio();
    state.setActiveLeaderboardSource('local');
    ensureLocalPlayIdentity(localAlias);
    infoText.textContent = 'Starting local game...';
    hideLoginScreen();
    startGameLogic();
    state.setCurrentGameState(state.GameState.Playing);
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
    if (bestGhostToggle) {
        bestGhostToggle.checked = state.isGhostEnabled();
        if (bestGhostValue) bestGhostValue.textContent = bestGhostToggle.checked ? 'On' : 'Off';
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

async function initializeAuthStateListener() {
    try {
        const { auth, onAuthStateChanged } = await getAuthApi();
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User already signed in:", user);
                if (state.getCurrentGameState() === state.GameState.MainMenu) {
                    state.setPlayerInfo(user.uid, user.displayName || 'Anon');
                    state.setActiveLeaderboardSource('global');
                }
                await clearFreshStartRemoteLeaderboard();
            } else {
                console.log("No user signed in.");
            }
            authButton.disabled = false;
            quitButton.disabled = false;
        });
    } catch (error) {
        console.warn("Online auth unavailable; local play remains available.", error);
        authButton.disabled = false;
        quitButton.disabled = false;
        if (state.getCurrentGameState() === state.GameState.MainMenu) {
            infoText.textContent = 'Online login unavailable. Play Local works offline.';
        }
    }
}

async function clearFreshStartRemoteLeaderboard() {
    try {
        const result = await state.clearRemoteLeaderboardForFreshStart();
        if (!result.skipped && state.getCurrentGameState() === state.GameState.MainMenu) {
            infoText.textContent = `Leaderboard reset complete. Removed ${result.deleted} online entries.`;
        }
    } catch (error) {
        console.warn("Could not clear remote leaderboard from this session.", error);
        if (state.getCurrentGameState() === state.GameState.MainMenu) {
            infoText.textContent = 'Local leaderboard cleared. Sign in with delete permission to clear online scores.';
        }
    }
}

async function ensureLocalPlayIdentity(localAlias = 'Local Player') {
    if (state.getUserId() && !state.isLocalPlayer()) {
        state.setPlayerInfo(state.getUserId(), localAlias);
        await clearFreshStartRemoteLeaderboard();
        return;
    }

    state.setPlayerInfo('local-player', localAlias);

    try {
        const { auth, signInAnonymously } = await getAuthApi();
        const userCredential = await signInAnonymously(auth);
        state.setPlayerInfo(userCredential.user.uid, localAlias);
        await clearFreshStartRemoteLeaderboard();
        console.log("Anonymous Firebase session ready for local play leaderboard.");
    } catch (error) {
        console.warn("Anonymous Firebase sign-in unavailable. Local play will use fallback leaderboard id.", error);
    }
}

// --- Initialization ---
export function initializeUI() {
    if (uiInitialized) return;
    uiInitialized = true;
    console.log("Initializing UI..."); // LOG
    state.clearLocalLeaderboardForFreshStart();

    // Quick check if elements exist
    if (!toggleAuthLink) console.error('toggleAuthLink not found during init!');
    if (!localAliasInput) console.error('localAliasInput not found during init!');
    if (!authButton) console.error('authButton not found during init!');
    if (!quitButton) console.error('quitButton not found during init!');
    if (!localPlayButton) console.error('localPlayButton not found during init!');
    if (!leaderboardButton) console.error('leaderboardButton not found!');
    if (!leaderboardPanel) console.error('leaderboardPanel not found!');
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
    if (!bestGhostToggle) console.error('bestGhostToggle not found!');
    if (!bestGhostValue) console.error('bestGhostValue not found!');
    if (!replayControls) console.error('replayControls not found!');

    // Attach Listeners
    authButton.addEventListener('click', handleAuthClick);
    quitButton.addEventListener('click', handleQuitClick);
    if (localPlayButton) {
        localPlayButton.addEventListener('click', handleLocalPlayClick);
    }
    if (leaderboardButton) {
        leaderboardButton.addEventListener('click', () => showLeaderboardPanel(true, state.getActiveLeaderboardSource()));
    }
    if (leaderboardRefreshButton) {
        leaderboardRefreshButton.addEventListener('click', () => showLeaderboardPanel(true, menuLeaderboardSource));
    }
    if (leaderboardBackButton) {
        leaderboardBackButton.addEventListener('click', hideLeaderboardPanel);
    }
    if (localLeaderboardButton) {
        localLeaderboardButton.addEventListener('click', () => showLeaderboardPanel(true, 'local'));
    }
    if (globalLeaderboardButton) {
        globalLeaderboardButton.addEventListener('click', () => showLeaderboardPanel(true, 'global'));
    }
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
    [localAliasInput, emailInput, passwordInput, aliasInput].forEach(input => {
        if (!input) return;
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !authButton.disabled) {
                if (input === localAliasInput) {
                    handleLocalPlayClick();
                } else {
                    handleAuthClick();
                }
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

    if (loginStarCanvas) {
        window.addEventListener('resize', resizeLoginStars);
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

    if (bestGhostToggle) {
        bestGhostToggle.addEventListener('change', (e) => {
            state.setGhostEnabled(e.target.checked);
            if (bestGhostValue) bestGhostValue.textContent = e.target.checked ? 'On' : 'Off';
        });
    }

    if (replayBackButton) {
        replayBackButton.addEventListener('click', () => {
            exitReplay();
        });
    }

    if (replayRewindButton) {
        replayRewindButton.addEventListener('click', () => {
            state.stepReplay(-1);
            updateReplayControls();
        });
    }

    if (replayForwardButton) {
        replayForwardButton.addEventListener('click', () => {
            state.stepReplay(1);
            updateReplayControls();
        });
    }

    if (replayPlayPauseButton) {
        replayPlayPauseButton.addEventListener('click', () => {
            state.toggleReplayPlaying();
            updateReplayControls();
        });
    }

    if (replaySpeedButton) {
        replaySpeedButton.addEventListener('click', () => {
            state.cycleReplaySpeed();
            updateReplayControls();
        });
    }

    if (replayTimeline) {
        replayTimeline.addEventListener('input', (e) => {
            state.seekReplayRatio(parseInt(e.target.value, 10) / 1000);
            updateReplayControls();
        });
    }

    showLoginScreen();
    authButton.disabled = false;
    quitButton.disabled = false;
    initializeAuthStateListener();

    setupPauseMenuFocus(); // Initialize focus management

    // Load volume preferences when UI initializes
    audio.loadVolumePreferences();

    console.log("UI initialized.");
}
