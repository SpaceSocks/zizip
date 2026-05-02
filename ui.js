import * as state from './state.js?v=mobile-portrait-62';
import * as audio from './audio.js?v=mobile-portrait-62'; // Import the audio module
// import { canvas } from './graphics.js'; // Removed import
import { ensureGameLoop, startGame as startGameLogic } from './game.js?v=mobile-portrait-62';
// import * as playfab from './playfab.js'; // REMOVED
import { getFirebaseServices } from './firebaseConfig.js?v=mobile-portrait-62';

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const loginStarCanvas = document.getElementById('loginStarCanvas');
const loginStarCtx = loginStarCanvas ? loginStarCanvas.getContext('2d') : null;
const authForm = document.getElementById('authForm');
const localAliasInput = document.getElementById('localAliasInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const aliasInput = document.getElementById('aliasInput'); // Was playerNameInput
const aliasGroup = document.querySelector('.input-group.register-only');
const authButton = document.getElementById('authButton'); // Was startButton
const googleSignInButton = document.getElementById('googleSignInButton');
const appleSignInButton = document.getElementById('appleSignInButton');
const googleAliasPanel = document.getElementById('googleAliasPanel');
const googleAliasInput = document.getElementById('googleAliasInput');
const googleAliasSaveButton = document.getElementById('googleAliasSaveButton');
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
const gameOverLeaderboardPanel = document.getElementById('gameOverLeaderboardPanel');
const gameOverLocalLeaderboardButton = document.getElementById('gameOverLocalLeaderboardButton');
const gameOverGlobalLeaderboardButton = document.getElementById('gameOverGlobalLeaderboardButton');
const gameOverLeaderboardStatus = document.getElementById('gameOverLeaderboardStatus');
const gameOverLeaderboardList = document.getElementById('gameOverLeaderboardList');
const gameOverLeaderboardRefreshButton = document.getElementById('gameOverLeaderboardRefreshButton');
const optionsMenu = document.getElementById('optionsMenu');     // NEW
const optionsBackButton = document.getElementById('optionsBackButton'); // NEW
const aboutButton = document.getElementById('aboutButton');
const aboutPanel = document.getElementById('aboutPanel');
const versionDisplay = document.getElementById('versionDisplay');
const optionsCategoryButtons = Array.from(document.querySelectorAll('.options-category-button'));
const optionsSections = Array.from(document.querySelectorAll('.options-section'));
const musicVolumeSlider = document.getElementById('musicVolumeSlider'); // NEW
const musicVolumeValue = document.getElementById('musicVolumeValue');   // NEW
const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');     // NEW
const sfxVolumeValue = document.getElementById('sfxVolumeValue');       // NEW
const moveControlSizeSlider = document.getElementById('moveControlSizeSlider');
const moveControlSizeValue = document.getElementById('moveControlSizeValue');
const jumpControlSizeSlider = document.getElementById('jumpControlSizeSlider');
const jumpControlSizeValue = document.getElementById('jumpControlSizeValue');
const moveControlTransparencySlider = document.getElementById('moveControlTransparencySlider');
const moveControlTransparencyValue = document.getElementById('moveControlTransparencyValue');
const jumpControlTransparencySlider = document.getElementById('jumpControlTransparencySlider');
const jumpControlTransparencyValue = document.getElementById('jumpControlTransparencyValue');
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
const controllerToast = document.getElementById('controllerToast');

// localStorage Keys
const LAST_EMAIL_KEY = 'zipzip_lastEmail';
const LEGACY_SAVED_PASSWORD_KEY = 'zipzip_savedPassword';
const LOCAL_ALIAS_KEY = 'zipzip_localAlias';
const PLAYER_PROFILES_COLLECTION = 'profiles';
const MOBILE_CONTROL_PREFS = {
    moveSize: 'zipzip_mobileMoveControlSize',
    jumpSize: 'zipzip_mobileJumpControlSize',
    moveTransparency: 'zipzip_mobileMoveControlTransparency',
    jumpTransparency: 'zipzip_mobileJumpControlTransparency'
};
const MOBILE_CONTROL_DEFAULT_MIGRATION_KEY = 'zipzip_mobileControlDefaults_20260502_transparency73';
const MOBILE_CONTROL_DEFAULTS = {
    moveSize: 200,
    jumpSize: 100,
    moveTransparency: 73,
    jumpTransparency: 73
};
const MOBILE_MOVE_BASE_SIZE = 72;
const MOBILE_MOVE_BASE_KNOB_SIZE = 34;
const MOBILE_JUMP_BASE_SIZE = 72;
const APP_VERSION = '0.1.0-alpha';

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
let gameOverLeaderboardSource = 'local';
let gameOverLeaderboardRequestId = 0;
let activeOptionsSection = 'audio';
let controllerToastTimer = null;
let sessionPasswordCache = '';
let sessionPasswordEmail = '';
let redirectResultHandled = false;
let pendingGoogleAliasUser = null;

function clearLegacySavedPassword() {
    localStorage.removeItem(LEGACY_SAVED_PASSWORD_KEY);
}

async function offerBrowserPasswordSave(email, password, displayName = '') {
    if (!email || !password || !window.PasswordCredential || !navigator.credentials?.store) return;
    try {
        const credential = new PasswordCredential({
            id: email,
            name: displayName || email,
            password
        });
        await navigator.credentials.store(credential);
    } catch (error) {
        console.info('Browser password manager did not store credentials.', error);
    }
}

const LOGIN_STAR_VARIANTS = [
    { count: 340, color: '#253039', alphaMin: 0.10, alphaMax: 0.20, sizeMin: 0.98, sizeMax: 1.5, speedMin: 0.030, speedMax: 0.066 },
    { count: 240, color: '#4a5661', alphaMin: 0.16, alphaMax: 0.30, sizeMin: 0.98, sizeMax: 1.65, speedMin: 0.048, speedMax: 0.096 },
    { count: 140, color: '#8a98a2', alphaMin: 0.26, alphaMax: 0.46, sizeMin: 1.05, sizeMax: 1.8, speedMin: 0.078, speedMax: 0.144 },
    { count: 54, color: '#8fd3ff', alphaMin: 0.34, alphaMax: 0.62, sizeMin: 1.13, sizeMax: 1.95, speedMin: 0.120, speedMax: 0.204 },
    { count: 22, color: '#ffffff', alphaMin: 0.62, alphaMax: 0.92, sizeMin: 1.2, sizeMax: 2.18, speedMin: 0.180, speedMax: 0.285 }
];
const LOGIN_STAR_SIZE_SCALE = 2;
const LOGIN_WHITE_STAR_SPEED_SCALE = 3;

export function showControllerToast(message) {
    if (!controllerToast || !message) return;
    controllerToast.textContent = message;
    controllerToast.style.display = 'block';
    controllerToast.classList.add('visible');
    if (controllerToastTimer) clearTimeout(controllerToastTimer);
    controllerToastTimer = setTimeout(() => {
        controllerToast.classList.remove('visible');
        controllerToastTimer = setTimeout(() => {
            controllerToast.style.display = 'none';
        }, 180);
    }, 2600);
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function createLoginStar(variant, startAtRight = false) {
    const size = Math.max(2, Math.round(randomBetween(variant.sizeMin, variant.sizeMax) * LOGIN_STAR_SIZE_SCALE));
    const speedScale = variant.color === '#ffffff' ? LOGIN_WHITE_STAR_SPEED_SCALE : 1;
    return {
        x: startAtRight ? loginStarCanvas.width + size : Math.random() * loginStarCanvas.width,
        y: Math.random() * loginStarCanvas.height,
        size,
        speed: randomBetween(variant.speedMin, variant.speedMax) * speedScale,
        alpha: randomBetween(variant.alphaMin, variant.alphaMax),
        color: variant.color,
        variant
    };
}

function resizeLoginStars() {
    if (!loginStarCanvas) return;
    const viewport = window.visualViewport;
    loginStarCanvas.width = Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || window.innerWidth));
    loginStarCanvas.height = Math.max(1, Math.round(viewport?.height || document.documentElement.clientHeight || window.innerHeight));
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
        loginStarCtx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
    });
    loginStarCtx.globalAlpha = 1;

    loginStarAnimationId = requestAnimationFrame(drawLoginStars);
}

function showLoginStarfield() {
    if (!loginStarCanvas) return;
    loginStarCanvas.style.display = 'block';
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || document.documentElement.clientHeight || window.innerHeight));
    if (loginStars.length === 0 || loginStarCanvas.width !== width || loginStarCanvas.height !== height) {
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

function readControlSetting(key, fallback, min, max) {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null || rawValue === '') return fallback;
    const saved = Number(rawValue);
    if (!Number.isFinite(saved)) return fallback;
    return Math.max(min, Math.min(max, saved));
}

function migrateMobileControlDefaults() {
    if (localStorage.getItem(MOBILE_CONTROL_DEFAULT_MIGRATION_KEY) === 'done') return;

    [
        [MOBILE_CONTROL_PREFS.moveTransparency, MOBILE_CONTROL_DEFAULTS.moveTransparency],
        [MOBILE_CONTROL_PREFS.jumpTransparency, MOBILE_CONTROL_DEFAULTS.jumpTransparency]
    ].forEach(([key, defaultValue]) => {
        const savedValue = localStorage.getItem(key);
        if (savedValue === null || savedValue === '50') {
            localStorage.setItem(key, String(defaultValue));
        }
    });

    localStorage.setItem(MOBILE_CONTROL_DEFAULT_MIGRATION_KEY, 'done');
}

function getMobileControlSettings() {
    return {
        moveSize: readControlSetting(MOBILE_CONTROL_PREFS.moveSize, MOBILE_CONTROL_DEFAULTS.moveSize, 50, 240),
        jumpSize: readControlSetting(MOBILE_CONTROL_PREFS.jumpSize, MOBILE_CONTROL_DEFAULTS.jumpSize, 50, 180),
        moveTransparency: readControlSetting(MOBILE_CONTROL_PREFS.moveTransparency, MOBILE_CONTROL_DEFAULTS.moveTransparency, 0, 100),
        jumpTransparency: readControlSetting(MOBILE_CONTROL_PREFS.jumpTransparency, MOBILE_CONTROL_DEFAULTS.jumpTransparency, 0, 100)
    };
}

function applyMobileControlSettings(settings = getMobileControlSettings()) {
    const root = document.documentElement;
    const moveScale = settings.moveSize / 100;
    const jumpScale = settings.jumpSize / 100;
    root.style.setProperty('--move-stick-size', `${Math.round(MOBILE_MOVE_BASE_SIZE * moveScale)}px`);
    root.style.setProperty('--move-knob-size', `${Math.round(MOBILE_MOVE_BASE_KNOB_SIZE * moveScale)}px`);
    root.style.setProperty('--jump-button-size', `${Math.round(MOBILE_JUMP_BASE_SIZE * jumpScale)}px`);
    root.style.setProperty('--move-control-opacity', `${1 - settings.moveTransparency / 100}`);
    root.style.setProperty('--jump-control-opacity', `${1 - settings.jumpTransparency / 100}`);
}

function syncMobileControlOptions(settings = getMobileControlSettings()) {
    if (moveControlSizeSlider) moveControlSizeSlider.value = settings.moveSize;
    if (moveControlSizeValue) moveControlSizeValue.textContent = `${settings.moveSize}%`;
    if (jumpControlSizeSlider) jumpControlSizeSlider.value = settings.jumpSize;
    if (jumpControlSizeValue) jumpControlSizeValue.textContent = `${settings.jumpSize}%`;
    if (moveControlTransparencySlider) moveControlTransparencySlider.value = settings.moveTransparency;
    if (moveControlTransparencyValue) moveControlTransparencyValue.textContent = `${settings.moveTransparency}%`;
    if (jumpControlTransparencySlider) jumpControlTransparencySlider.value = settings.jumpTransparency;
    if (jumpControlTransparencyValue) jumpControlTransparencyValue.textContent = `${settings.jumpTransparency}%`;
}

function setMobileControlSetting(prefKey, value) {
    localStorage.setItem(prefKey, String(value));
    const settings = getMobileControlSettings();
    applyMobileControlSettings(settings);
    syncMobileControlOptions(settings);
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

function renderLeaderboard(entries = [], targetList = menuLeaderboardList, replayReturnTarget = 'menu') {
    if (!targetList) return;
    targetList.replaceChildren();

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
    targetList.appendChild(header);

    entries.forEach((entry, index) => {
        if (entry.separated) {
            const separator = document.createElement('div');
            separator.className = 'menu-leaderboard-row separator';
            separator.textContent = '...';
            targetList.appendChild(separator);
        }

        const row = document.createElement('div');
        row.className = `menu-leaderboard-row${entry.isCurrentPlayer ? ' current-player' : ''}`;
        const hasReplay = state.hasReplayData(entry.replay);
        const replayButton = document.createElement('button');
        replayButton.className = 'replay-icon-button';
        replayButton.type = 'button';
        replayButton.textContent = hasReplay ? '▶' : '-';
        replayButton.title = hasReplay ? 'Watch replay' : 'No replay saved';
        replayButton.disabled = !hasReplay;
        replayButton.addEventListener('click', () => startLeaderboardReplay(entry, replayReturnTarget));

        row.append(
            makeLeaderboardCell('number', entry.rank ? `${entry.rank}.` : `${index + 1}.`),
            makeLeaderboardCell('name', (entry.displayName || 'Anon').toUpperCase()),
            makeLeaderboardCell('metric score', String(entry.score ?? 0)),
            makeLeaderboardCell('metric height', `${Math.round(entry.maxHeight || 0)} M`),
            makeLeaderboardCell('time', entry.time || '00:00'),
            replayButton
        );
        targetList.appendChild(row);
    });
}

function updateLeaderboardSourceButtons() {
    localLeaderboardButton?.classList.toggle('active', menuLeaderboardSource === 'local');
    globalLeaderboardButton?.classList.toggle('active', menuLeaderboardSource === 'global');
}

function updateGameOverLeaderboardSourceButtons() {
    gameOverLocalLeaderboardButton?.classList.toggle('active', gameOverLeaderboardSource === 'local');
    gameOverGlobalLeaderboardButton?.classList.toggle('active', gameOverLeaderboardSource === 'global');
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
        renderLeaderboard(entries, menuLeaderboardList);
        menuLeaderboardStatus.textContent = entries.length
            ? `${menuLeaderboardSource === 'global' ? 'Global' : 'Local'} top 100 runs`
            : `No ${menuLeaderboardSource === 'global' ? 'global' : 'local'} runs yet.`;
    } catch (error) {
        console.warn("Could not load menu leaderboard.", error);
        menuLeaderboardStatus.textContent = error?.code === 'global-auth-required'
            ? 'Sign in to view the global leaderboard.'
            : `Could not load ${menuLeaderboardSource} leaderboard.`;
    }
}

export function showGameOverLeaderboardLoading(source = state.getActiveLeaderboardSource()) {
    if (!gameOverLeaderboardPanel || !gameOverLeaderboardStatus || !gameOverLeaderboardList) return;
    gameOverLeaderboardSource = source === 'global' ? 'global' : 'local';
    updateGameOverLeaderboardSourceButtons();
    gameOverLeaderboardPanel.style.display = 'flex';
    gameOverLeaderboardStatus.textContent = `Loading ${gameOverLeaderboardSource === 'global' ? 'global' : 'local'} leaderboard...`;
    gameOverLeaderboardList.replaceChildren();
}

export async function showGameOverLeaderboard(force = true, source = gameOverLeaderboardSource || state.getActiveLeaderboardSource()) {
    if (!gameOverLeaderboardPanel || !gameOverLeaderboardStatus || !gameOverLeaderboardList) return;

    const requestId = ++gameOverLeaderboardRequestId;
    gameOverLeaderboardSource = source === 'global' ? 'global' : 'local';
    updateGameOverLeaderboardSourceButtons();
    gameOverLeaderboardPanel.style.display = 'flex';
    gameOverLeaderboardStatus.textContent = `Loading ${gameOverLeaderboardSource === 'global' ? 'global' : 'local'} leaderboard...`;
    gameOverLeaderboardList.replaceChildren();
    if (force) state.clearLeaderboardCache();

    try {
        const entries = await state.getLeaderboard(gameOverLeaderboardSource);
        if (requestId !== gameOverLeaderboardRequestId) return;
        renderLeaderboard(entries, gameOverLeaderboardList, 'gameover');
        gameOverLeaderboardStatus.textContent = entries.length
            ? `${gameOverLeaderboardSource === 'global' ? 'Global' : 'Local'} top 100 runs`
            : `No ${gameOverLeaderboardSource === 'global' ? 'global' : 'local'} runs yet.`;
    } catch (error) {
        if (requestId !== gameOverLeaderboardRequestId) return;
        console.warn("Could not load game-over leaderboard.", error);
        gameOverLeaderboardStatus.textContent = error?.code === 'global-auth-required'
            ? 'Sign in to view the global leaderboard.'
            : `Could not load ${gameOverLeaderboardSource} leaderboard.`;
    }
}

function hideGameOverLeaderboard() {
    gameOverLeaderboardRequestId++;
    if (gameOverLeaderboardPanel) gameOverLeaderboardPanel.style.display = 'none';
}

function startLeaderboardReplay(entry, returnTarget = 'menu') {
    if (!state.startReplay(entry)) return;
    audio.initializeAudio();
    if (returnTarget === 'menu') {
        hideLeaderboardPanel();
        loginScreen.style.display = 'none';
        hideLoginStarfield();
    } else {
        hideGameOverControls();
    }
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'block';
    ensureGameLoop();
    showReplayControls(returnTarget);
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

async function getProfileApi() {
    const [{ db }, firestoreApi] = await Promise.all([
        getFirebaseServices(),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    ]);
    return { db, ...firestoreApi };
}

function cleanAlias(rawAlias) {
    return String(rawAlias || '').trim().replace(/\s+/g, ' ').slice(0, 15);
}

function isValidAlias(alias) {
    return alias.length >= 1 && alias.length <= 15;
}

function requiresManualAlias(user) {
    return Array.isArray(user?.providerData) &&
        user.providerData.some(provider => ['google.com', 'apple.com'].includes(provider?.providerId));
}

function setProviderSignInButtonsDisabled(disabled) {
    if (googleSignInButton) googleSignInButton.disabled = disabled;
    if (appleSignInButton) appleSignInButton.disabled = disabled;
}

async function loadSavedGameAlias(user) {
    if (!user?.uid) return '';
    try {
        const { db, doc, getDoc } = await getProfileApi();
        const profileSnap = await getDoc(doc(db, PLAYER_PROFILES_COLLECTION, user.uid));
        const alias = cleanAlias(profileSnap.exists() ? profileSnap.data()?.alias : '');
        return isValidAlias(alias) ? alias : '';
    } catch (error) {
        console.warn("Could not load saved game alias.", error);
        return '';
    }
}

async function saveGameAlias(user, alias) {
    const cleanedAlias = cleanAlias(alias);
    if (!user?.uid || !isValidAlias(cleanedAlias)) {
        throw new Error('Choose an alias between 1 and 15 characters.');
    }

    const { db, doc, getDoc, setDoc, serverTimestamp } = await getProfileApi();
    const profileRef = doc(db, PLAYER_PROFILES_COLLECTION, user.uid);
    const existingProfile = await getDoc(profileRef);
    const payload = {
        alias: cleanedAlias,
        updatedAt: serverTimestamp()
    };

    if (!existingProfile.exists()) {
        payload.createdAt = serverTimestamp();
    }

    await setDoc(profileRef, payload, { merge: true });

    try {
        const { updateProfile } = await getAuthApi();
        await updateProfile(user, { displayName: cleanedAlias });
    } catch (error) {
        console.warn("Saved alias, but could not mirror it to Firebase Auth profile.", error);
    }

    return cleanedAlias;
}

async function resolveGameAliasForUser(user, preferredAlias = '') {
    const savedAlias = await loadSavedGameAlias(user);
    if (savedAlias) return savedAlias;

    const preferred = cleanAlias(preferredAlias);
    if (isValidAlias(preferred)) {
        return saveGameAlias(user, preferred);
    }

    if (!requiresManualAlias(user)) {
        const fallback = cleanAlias(user?.displayName || (user?.email ? user.email.split('@')[0] : ''));
        if (isValidAlias(fallback)) {
            return saveGameAlias(user, fallback);
        }
    }

    const aliasError = new Error('alias-required');
    aliasError.code = 'alias-required';
    throw aliasError;
}

function showGoogleAliasPrompt(user) {
    pendingGoogleAliasUser = user;
    if (googleAliasPanel) googleAliasPanel.style.display = 'block';
    if (googleAliasInput) {
        googleAliasInput.value = '';
        googleAliasInput.focus();
    }
    infoText.textContent = 'Choose a Cosmic Zip alias before your first online run.';
}

function hideGoogleAliasPrompt() {
    pendingGoogleAliasUser = null;
    if (googleAliasPanel) googleAliasPanel.style.display = 'none';
}

function shouldUseGoogleRedirect() {
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const isMobileViewport = document.body?.classList.contains('mobile-viewport');
    const userAgent = navigator.userAgent || '';
    const isEmbeddedBrowser = /FBAN|FBAV|Instagram|Line|Messenger|wv|WebView/i.test(userAgent);
    return isMobileViewport || isTouch || isEmbeddedBrowser;
}

function shouldUseProviderRedirect() {
    return shouldUseGoogleRedirect();
}

async function startOnlineGameForUser(user, successMessage) {
    let gameAlias;
    try {
        gameAlias = await resolveGameAliasForUser(user, googleAliasInput?.value || aliasInput?.value || '');
    } catch (error) {
        if (error?.code === 'alias-required') {
            authButton.disabled = false;
            setProviderSignInButtonsDisabled(false);
            showGoogleAliasPrompt(user);
            return false;
        }
        throw error;
    }

    hideGoogleAliasPrompt();
    state.setPlayerInfo(user.uid, gameAlias);
    state.setActiveLeaderboardSource('global');
    if (user.email) {
        localStorage.setItem(LAST_EMAIL_KEY, user.email);
        emailInput.value = user.email;
        rememberPasswordCheckbox.checked = true;
    }
    clearLegacySavedPassword();
    infoText.textContent = successMessage;

    await clearFreshStartRemoteLeaderboard();

    setTimeout(() => {
        hideLoginScreen();
        startGameLogic();
        state.setCurrentGameState(state.GameState.Playing);
        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
    }, 1000);
    return true;
}

function buildGoogleProvider(GoogleAuthProvider) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });
    const email = emailInput?.value?.trim();
    if (email) {
        provider.setCustomParameters({
            prompt: 'select_account',
            login_hint: email
        });
    }
    return provider;
}

function buildAppleProvider(OAuthProvider) {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    provider.setCustomParameters({
        locale: 'en'
    });
    return provider;
}

// --- Options Menu Focus Management (NEW) ---
let optionsFocusableItems = []; // Sliders + Back button
let currentOptionsFocusIndex = 0;
const FOCUSED_OPTIONS_ITEM_CLASS = 'focused'; // Class for option items (sliders)
const FOCUSED_BUTTON_CLASS = 'focused-button'; // Existing class for buttons

export function setupOptionsFocus() {
    const activeSection = optionsMenu?.querySelector(`.options-section.is-active`);
    const controls = activeSection ? Array.from(activeSection.querySelectorAll('.options-item')) : [];
    const buttons = [...optionsCategoryButtons, optionsBackButton].filter(Boolean);
    optionsFocusableItems = [...buttons, ...controls];
    currentOptionsFocusIndex = Math.min(currentOptionsFocusIndex, Math.max(0, optionsFocusableItems.length - 1));
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
            } else { // It's a button
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
    if (versionDisplay) versionDisplay.textContent = `Alpha ${APP_VERSION}`;
    loginScreen.scrollTop = 0;
    requestAnimationFrame(() => {
        loginScreen.scrollTop = 0;
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    });
    showLoginStarfield();
    const canvasEl = document.getElementById('gameCanvas');
    if (canvasEl) canvasEl.style.display = 'none';
    // Reset form for display
    if (localAliasInput) localAliasInput.value = localStorage.getItem(LOCAL_ALIAS_KEY) || '';
    const savedEmail = localStorage.getItem(LAST_EMAIL_KEY) || '';
    emailInput.value = savedEmail;
    if (sessionPasswordCache && sessionPasswordEmail === savedEmail) {
        passwordInput.value = sessionPasswordCache;
    } else if (!sessionPasswordCache) {
        passwordInput.value = '';
    }
    rememberPasswordCheckbox.checked = !!savedEmail;
    hideGoogleAliasPrompt();
    clearLegacySavedPassword();
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
    hideGameOverLeaderboard();
}

export function showReplayControls(returnTarget = 'gameover') {
    replayReturnTarget = returnTarget;
    if (replayControls) replayControls.style.display = document.body.classList.contains('mobile-viewport') ? 'grid' : 'flex';
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
    showGameOverLeaderboard(false, gameOverLeaderboardSource || state.getActiveLeaderboardSource());
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
        if (passwordInput) passwordInput.autocomplete = 'new-password';
        toggleAuthLink.textContent = 'Already have an account? Login';
        if (aliasGroup) aliasGroup.style.display = 'flex'; else console.error('aliasGroup not found!'); // Check element exists
        if (resetPasswordLink) resetPasswordLink.style.display = 'none'; else console.error('resetPasswordLink not found!');
        if (rememberGroup) rememberGroup.style.display = 'none'; // Hide remember on register
    } else {
        authButton.textContent = 'Login';
        if (passwordInput) passwordInput.autocomplete = 'current-password';
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
    setProviderSignInButtonsDisabled(true);
    requestMobileFullscreen();
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
            await saveGameAlias(userCredential.user, alias);
            // Store relevant info (UID and Display Name)
            state.setPlayerInfo(userCredential.user.uid, alias);
            state.setActiveLeaderboardSource('global');
            localStorage.setItem(LAST_EMAIL_KEY, email);
            sessionPasswordEmail = email;
            sessionPasswordCache = password;
            await offerBrowserPasswordSave(email, password, alias);
            clearLegacySavedPassword();
            infoText.textContent = 'Registration successful! Starting game...';
        } else {
            // --- Login --- //
            userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Login successful:", userCredential.user);
            const gameAlias = await resolveGameAliasForUser(userCredential.user);
            state.setPlayerInfo(userCredential.user.uid, gameAlias);
            state.setActiveLeaderboardSource('global');
            if (rememberPasswordCheckbox.checked) {
                localStorage.setItem(LAST_EMAIL_KEY, email);
                sessionPasswordEmail = email;
                sessionPasswordCache = password;
            } else {
                localStorage.removeItem(LAST_EMAIL_KEY);
                sessionPasswordEmail = '';
                sessionPasswordCache = '';
            }
            await offerBrowserPasswordSave(email, password, userCredential.user.displayName || email);
            clearLegacySavedPassword();
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
            setProviderSignInButtonsDisabled(false);
        }, 1000);

    } catch (error) {
        console.error("Authentication error:", error);
        infoText.textContent = getFirebaseAuthErrorMessage(error) || 'Online login unavailable. Use Play Local to start now.';
        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
    }
}

async function startProviderSignIn(providerLabel, providerId, providerFactory) {
    hideGoogleAliasPrompt();
    setProviderSignInButtonsDisabled(true);
    authButton.disabled = true;
    requestMobileFullscreen();
    infoText.textContent = `Opening ${providerLabel} sign-in...`;

    try {
        const {
            auth,
            GoogleAuthProvider,
            OAuthProvider,
            signInWithPopup,
            signInWithRedirect
        } = await getAuthApi();
        const provider = providerFactory({ GoogleAuthProvider, OAuthProvider });

        if (shouldUseProviderRedirect()) {
            sessionStorage.setItem('zipzip_providerRedirectPending', providerId);
            await signInWithRedirect(auth, provider);
            return;
        }

        const userCredential = await signInWithPopup(auth, provider);
        await startOnlineGameForUser(userCredential.user, `${providerLabel} sign-in successful! Starting game...`);
    } catch (error) {
        console.error(`${providerLabel} sign-in error:`, error);
        sessionStorage.removeItem('zipzip_providerRedirectPending');
        const canTryRedirect = error?.code === 'auth/popup-blocked' ||
            error?.code === 'auth/popup-closed-by-user' ||
            error?.code === 'auth/cancelled-popup-request' ||
            error?.code === 'auth/operation-not-supported-in-this-environment';

        if (canTryRedirect) {
            try {
                const { auth, GoogleAuthProvider, OAuthProvider, signInWithRedirect } = await getAuthApi();
                sessionStorage.setItem('zipzip_providerRedirectPending', providerId);
                await signInWithRedirect(auth, providerFactory({ GoogleAuthProvider, OAuthProvider }));
                return;
            } catch (redirectError) {
                console.error(`${providerLabel} redirect sign-in error:`, redirectError);
                sessionStorage.removeItem('zipzip_providerRedirectPending');
                infoText.textContent = getFirebaseAuthErrorMessage(redirectError) || `${providerLabel} sign-in could not start.`;
            }
        } else {
            infoText.textContent = getFirebaseAuthErrorMessage(error) || `${providerLabel} sign-in failed. Check that ${providerLabel} is enabled in Firebase.`;
        }

        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
    }
}

async function handleGoogleSignInClick() {
    await startProviderSignIn(
        'Google',
        'google',
        ({ GoogleAuthProvider }) => buildGoogleProvider(GoogleAuthProvider)
    );
}

async function handleAppleSignInClick() {
    await startProviderSignIn(
        'Apple',
        'apple',
        ({ OAuthProvider }) => buildAppleProvider(OAuthProvider)
    );
}

async function handleGoogleAliasSaveClick() {
    if (!pendingGoogleAliasUser) {
        infoText.textContent = 'Start online sign-in first, then choose your alias.';
        return;
    }

    const alias = cleanAlias(googleAliasInput?.value || '');
    if (!isValidAlias(alias)) {
        infoText.textContent = 'Alias must be 1 to 15 characters.';
        googleAliasInput?.focus();
        return;
    }

    if (googleAliasSaveButton) googleAliasSaveButton.disabled = true;
    setProviderSignInButtonsDisabled(true);
    authButton.disabled = true;
    infoText.textContent = 'Saving alias...';

    try {
        await saveGameAlias(pendingGoogleAliasUser, alias);
        await startOnlineGameForUser(pendingGoogleAliasUser, 'Alias saved! Starting game...');
    } catch (error) {
        console.error("Online alias save error:", error);
        infoText.textContent = error?.message || 'Could not save alias. Try again.';
        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
    } finally {
        if (googleAliasSaveButton) googleAliasSaveButton.disabled = false;
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
            return 'That sign-in method is not enabled in Firebase yet.';
        case 'auth/popup-blocked':
            return 'Popup was blocked. Try again or use your browser directly.';
        case 'auth/popup-closed-by-user':
            return 'Sign-in was closed before it finished.';
        case 'auth/unauthorized-domain':
            return 'This domain is not authorized in Firebase Authentication.';
        case 'auth/account-exists-with-different-credential':
            return 'That email already uses another sign-in method. Log in with the original method first.';
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

    const host = window.location.hostname || '';
    const isTemporaryTestHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.trycloudflare.com');

    if (isTemporaryTestHost) {
        return undefined;
    }

    return {
        url: `${window.location.origin}${window.location.pathname}`,
        handleCodeInApp: false
    };
}

async function sendPasswordResetEmailWithFallback(sendPasswordResetEmail, auth, email) {
    const actionSettings = getPasswordResetActionSettings();
    if (!actionSettings) {
        await sendPasswordResetEmail(auth, email);
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email, actionSettings);
    } catch (error) {
        if (error?.code !== 'auth/unauthorized-continue-uri' && error?.code !== 'auth/invalid-continue-uri') {
            throw error;
        }
        console.warn("Password reset continue URL was rejected. Retrying with Firebase default reset link.", error);
        await sendPasswordResetEmail(auth, email);
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

        await sendPasswordResetEmailWithFallback(sendPasswordResetEmail, auth, email);

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
    requestMobileFullscreen();
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
    requestMobileFullscreen();
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
function showOptionsSection(sectionName = 'audio') {
    activeOptionsSection = sectionName;
    optionsSections.forEach(section => {
        const isActive = section.dataset.optionsPanel === sectionName;
        section.classList.toggle('is-active', isActive);
    });
    optionsCategoryButtons.forEach(button => {
        const isActive = button.dataset.optionsSection === sectionName;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
    currentOptionsFocusIndex = Math.max(0, optionsCategoryButtons.findIndex(button =>
        button.dataset?.optionsSection === sectionName
    ));
    setupOptionsFocus();
}

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
    syncMobileControlOptions();
    if (bestGhostToggle) {
        bestGhostToggle.checked = state.isGhostEnabled();
        if (bestGhostValue) bestGhostValue.textContent = bestGhostToggle.checked ? 'On' : 'Off';
    }
    currentOptionsFocusIndex = 0;
    showOptionsSection(activeOptionsSection || 'audio');
}

async function requestMobileFullscreen() {
    const isMobileLike = document.body.classList.contains('mobile-viewport') ||
        window.matchMedia?.('(pointer: coarse)').matches;
    if (!isMobileLike) return false;
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;

    const target = document.documentElement;
    const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
    if (!requestFullscreen) return false;

    try {
        await requestFullscreen.call(target, { navigationUI: 'hide' });
        return true;
    } catch (error) {
        console.info("Fullscreen request was blocked or unavailable in this browser.", error);
        return false;
    }
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
    currentOptionsFocusIndex = 0;
}

async function initializeAuthStateListener() {
    try {
        const { auth, onAuthStateChanged } = await getAuthApi();
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User already signed in:", user);
                if (state.getCurrentGameState() === state.GameState.MainMenu) {
                    const savedAlias = await loadSavedGameAlias(user);
                    if (savedAlias) {
                        state.setPlayerInfo(user.uid, savedAlias);
                        state.setActiveLeaderboardSource('global');
                    }
                }
                await clearFreshStartRemoteLeaderboard();
            } else {
                console.log("No user signed in.");
            }
            authButton.disabled = false;
            setProviderSignInButtonsDisabled(false);
            quitButton.disabled = false;
        });
    } catch (error) {
        console.warn("Online auth unavailable; local play remains available.", error);
        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
        quitButton.disabled = false;
        if (state.getCurrentGameState() === state.GameState.MainMenu) {
            infoText.textContent = 'Online login unavailable. Play Local works offline.';
        }
    }
}

async function handleGoogleRedirectResult() {
    if (redirectResultHandled) return;
    redirectResultHandled = true;

    const pendingProvider = sessionStorage.getItem('zipzip_providerRedirectPending') ||
        (sessionStorage.getItem('zipzip_googleRedirectPending') === '1' ? 'google' : '');
    if (!pendingProvider) return;
    const providerLabel = pendingProvider === 'apple' ? 'Apple' : 'Google';

    try {
        const { auth, getRedirectResult } = await getAuthApi();
        infoText.textContent = `Finishing ${providerLabel} sign-in...`;
        const result = await getRedirectResult(auth);
        sessionStorage.removeItem('zipzip_providerRedirectPending');
        sessionStorage.removeItem('zipzip_googleRedirectPending');

        if (result?.user) {
            setProviderSignInButtonsDisabled(true);
            authButton.disabled = true;
            await startOnlineGameForUser(result.user, `${providerLabel} sign-in successful! Starting game...`);
        } else {
            authButton.disabled = false;
            setProviderSignInButtonsDisabled(false);
        }
    } catch (error) {
        console.error(`${providerLabel} redirect result error:`, error);
        sessionStorage.removeItem('zipzip_providerRedirectPending');
        sessionStorage.removeItem('zipzip_googleRedirectPending');
        infoText.textContent = getFirebaseAuthErrorMessage(error) || `${providerLabel} sign-in did not finish.`;
        authButton.disabled = false;
        setProviderSignInButtonsDisabled(false);
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

function ensureLocalPlayIdentity(localAlias = 'Local Player') {
    state.setPlayerInfo('local-player', localAlias);
}

// --- Initialization ---
export function initializeUI() {
    if (uiInitialized) return;
    uiInitialized = true;
    clearLegacySavedPassword();
    console.log("Initializing UI..."); // LOG
    state.clearLocalLeaderboardForFreshStart();

    // Quick check if elements exist
    if (!authForm) console.error('authForm not found during init!');
    if (!toggleAuthLink) console.error('toggleAuthLink not found during init!');
    if (!localAliasInput) console.error('localAliasInput not found during init!');
    if (!authButton) console.error('authButton not found during init!');
    if (!googleSignInButton) console.error('googleSignInButton not found during init!');
    if (!appleSignInButton) console.error('appleSignInButton not found during init!');
    if (!googleAliasPanel) console.error('googleAliasPanel not found during init!');
    if (!googleAliasInput) console.error('googleAliasInput not found during init!');
    if (!googleAliasSaveButton) console.error('googleAliasSaveButton not found during init!');
    if (!quitButton) console.error('quitButton not found during init!');
    if (!localPlayButton) console.error('localPlayButton not found during init!');
    if (!leaderboardButton) console.error('leaderboardButton not found!');
    if (!leaderboardPanel) console.error('leaderboardPanel not found!');
    if (!gameOverLeaderboardPanel) console.error('gameOverLeaderboardPanel not found!');
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
    if (!aboutButton) console.error('aboutButton not found!');
    if (!aboutPanel) console.error('aboutPanel not found!');
    if (!versionDisplay) console.error('versionDisplay not found!');
    if (optionsCategoryButtons.length === 0) console.error('options category buttons not found!');
    if (!musicVolumeSlider) console.error('musicVolumeSlider not found!');
    if (!musicVolumeValue) console.error('musicVolumeValue not found!');
    if (!sfxVolumeSlider) console.error('sfxVolumeSlider not found!');
    if (!sfxVolumeValue) console.error('sfxVolumeValue not found!');
    if (!bestGhostToggle) console.error('bestGhostToggle not found!');
    if (!bestGhostValue) console.error('bestGhostValue not found!');
    if (!replayControls) console.error('replayControls not found!');

    // Attach Listeners
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (document.activeElement === localAliasInput) {
                handleLocalPlayClick();
            } else if (!authButton.disabled) {
                handleAuthClick();
            }
        });
    }
    authButton.addEventListener('click', handleAuthClick);
    if (googleSignInButton) {
        googleSignInButton.addEventListener('click', handleGoogleSignInClick);
    }
    if (appleSignInButton) {
        appleSignInButton.addEventListener('click', handleAppleSignInClick);
    }
    if (googleAliasSaveButton) {
        googleAliasSaveButton.addEventListener('click', handleGoogleAliasSaveClick);
    }
    quitButton.addEventListener('click', handleQuitClick);
    if (localPlayButton) {
        localPlayButton.addEventListener('click', handleLocalPlayClick);
    }
    if (leaderboardButton) {
        leaderboardButton.addEventListener('click', () => showLeaderboardPanel(true, 'local'));
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
    if (gameOverLeaderboardRefreshButton) {
        gameOverLeaderboardRefreshButton.addEventListener('click', () => showGameOverLeaderboard(true, gameOverLeaderboardSource));
    }
    if (gameOverLocalLeaderboardButton) {
        gameOverLocalLeaderboardButton.addEventListener('click', () => showGameOverLeaderboard(true, 'local'));
    }
    if (gameOverGlobalLeaderboardButton) {
        gameOverGlobalLeaderboardButton.addEventListener('click', () => showGameOverLeaderboard(true, 'global'));
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
    [localAliasInput, emailInput, passwordInput, aliasInput, googleAliasInput].forEach(input => {
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !authButton.disabled) {
                e.preventDefault();
                if (input === localAliasInput) {
                    handleLocalPlayClick();
                } else if (input === googleAliasInput) {
                    handleGoogleAliasSaveClick();
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
    optionsCategoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            showOptionsSection(button.dataset.optionsSection || 'audio');
        });
    });

    if (loginStarCanvas) {
        window.addEventListener('resize', resizeLoginStars);
        window.addEventListener('orientationchange', () => setTimeout(resizeLoginStars, 80));
        window.visualViewport?.addEventListener('resize', resizeLoginStars);
        window.visualViewport?.addEventListener('scroll', resizeLoginStars);
    }

    if (musicVolumeSlider) {
        musicVolumeSlider.addEventListener('input', (e) => {
            audio.initializeAudio();
            const volume = parseInt(e.target.value) / 100;
            audio.setMusicVolume(volume);
            if (musicVolumeValue) musicVolumeValue.textContent = `${e.target.value}%`;
        });
    }

    if (sfxVolumeSlider) {
        sfxVolumeSlider.addEventListener('input', (e) => {
            audio.initializeAudio();
            const volume = parseInt(e.target.value) / 100;
            audio.setSfxVolume(volume);
            if (sfxVolumeValue) sfxVolumeValue.textContent = `${e.target.value}%`;
            // Optionally play a sound effect here as feedback
            // audio.playLandingSound();
        });
    }

    if (moveControlSizeSlider) {
        moveControlSizeSlider.addEventListener('input', (e) => {
            setMobileControlSetting(MOBILE_CONTROL_PREFS.moveSize, parseInt(e.target.value, 10));
        });
    }

    if (jumpControlSizeSlider) {
        jumpControlSizeSlider.addEventListener('input', (e) => {
            setMobileControlSetting(MOBILE_CONTROL_PREFS.jumpSize, parseInt(e.target.value, 10));
        });
    }

    if (moveControlTransparencySlider) {
        moveControlTransparencySlider.addEventListener('input', (e) => {
            setMobileControlSetting(MOBILE_CONTROL_PREFS.moveTransparency, parseInt(e.target.value, 10));
        });
    }

    if (jumpControlTransparencySlider) {
        jumpControlTransparencySlider.addEventListener('input', (e) => {
            setMobileControlSetting(MOBILE_CONTROL_PREFS.jumpTransparency, parseInt(e.target.value, 10));
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
    if (versionDisplay) versionDisplay.textContent = `Alpha ${APP_VERSION}`;
    authButton.disabled = false;
    setProviderSignInButtonsDisabled(false);
    quitButton.disabled = false;
    initializeAuthStateListener();
    handleGoogleRedirectResult();

    setupPauseMenuFocus(); // Initialize focus management

    // Load volume preferences when UI initializes
    audio.loadVolumePreferences();
    migrateMobileControlDefaults();
    applyMobileControlSettings();
    syncMobileControlOptions();

    console.log("UI initialized.");
}
