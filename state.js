// This file will manage shared game state

import { MAX_LIVES, MAX_PERFECT_COMBO_MULTIPLIER } from './constants.js?v=mobile-portrait-29';
import { getFirebaseServices } from './firebaseConfig.js?v=mobile-portrait-29';

// --- Game States Enum ---
export const GameState = Object.freeze({
    Loading: 'Loading',
    MainMenu: 'MainMenu', // Login Screen
    Playing: 'Playing',
    Dying: 'Dying',
    Paused: 'Paused',
    Replay: 'Replay',
    GameOver: 'GameOver'
});

// --- Core Game State ---
let currentGameState = GameState.Loading;
let score = 0;
let startTime = 0;
let endTime = 0;
let maxHeight = 0;
let audioInitialized = false;

// Add lives back
let lives = 3; // Start with 3 lives

// NEW: Authenticated User Info
let userId = null;
let displayName = null;
let activeLeaderboardSource = 'local';

// NEW: Store last submitted score details for highlighting
let lastSubmittedScore = null;

// NEW: Store current music track info
let currentTrackInfo = "None";

let height = 0;
let difficultyFactor = 0;
let platforms = [];
let lastLandedPlatformId = null; // NEW: Track the last platform landed on
let initialPlayerY = 0; // NEW: Track player's starting Y position
let perfectLandingStreak = 0;
let comboMultiplier = 1;

// --- Effect State ---
let scorePopups = [];

// --- Timer State ---
let elapsedTime = 0;

// --- Persistent State ---
let topScore = Number(localStorage.getItem('topScore')) || 0;
let highestHeight = Number(localStorage.getItem('highestHeight')) || 0;
const BEST_RUN_REPLAY_KEY = 'zipzip_bestRunReplay';
const GHOST_ENABLED_KEY = 'zipzip_bestRunGhostEnabled';
const REPLAY_SAMPLE_INTERVAL_MS = 33;
const MAX_REPLAY_SAMPLES = 9000;
let bestRunReplay = readBestRunReplay();
let currentRunReplay = null;
let lastReplaySampleTime = 0;
let ghostEnabled = localStorage.getItem(GHOST_ENABLED_KEY) !== 'false';
let replayViewer = null;
const pendingPersistentStats = new Map();
let persistentStatsWriteScheduled = false;

function schedulePersistentStatWrite(key, value) {
    pendingPersistentStats.set(key, value);
    if (persistentStatsWriteScheduled) return;
    persistentStatsWriteScheduled = true;

    const writeStats = () => {
        persistentStatsWriteScheduled = false;
        pendingPersistentStats.forEach((queuedValue, queuedKey) => {
            localStorage.setItem(queuedKey, queuedValue);
        });
        pendingPersistentStats.clear();
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(writeStats, { timeout: 1000 });
    } else {
        window.setTimeout(writeStats, 0);
    }
}

function clampReplayRatio(value, fallback = 0.4) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(-3, Math.min(4, value));
}

function readBestRunReplay() {
    try {
        const replay = JSON.parse(localStorage.getItem(BEST_RUN_REPLAY_KEY) || 'null');
        if (!replay || !Array.isArray(replay.samples)) return null;
        return replay;
    } catch (error) {
        console.warn("Could not read best-run ghost data. Resetting it.", error);
        localStorage.removeItem(BEST_RUN_REPLAY_KEY);
        return null;
    }
}

// --- State Accessors/Mutators ---
export const getCurrentGameState = () => currentGameState;
export function setCurrentGameState(newState) {
    console.log(`Game State changing from ${currentGameState} to ${newState}`);
    currentGameState = newState;
    syncDocumentGameClasses(newState);
}

function syncDocumentGameClasses(gameState) {
    if (typeof document === 'undefined' || !document.body) return;
    const gameScreenStates = new Set([
        GameState.Playing,
        GameState.Dying,
        GameState.Paused,
        GameState.Replay,
        GameState.GameOver
    ]);
    document.body.classList.toggle('game-screen-active', gameScreenStates.has(gameState));
    document.body.classList.toggle('touch-controls-active', gameState === GameState.Playing);
}

export const getScore = () => score;
export function setScore(newScore) {
    score = newScore;
}

export function registerPlatformLanding(landedOnMiddle) {
    if (landedOnMiddle) {
        perfectLandingStreak += 1;
        comboMultiplier = Math.min(MAX_PERFECT_COMBO_MULTIPLIER, Math.max(1, perfectLandingStreak));
    } else {
        perfectLandingStreak = 0;
        comboMultiplier = 1;
    }

    return {
        streak: perfectLandingStreak,
        multiplier: comboMultiplier
    };
}

export const getPerfectLandingStreak = () => perfectLandingStreak;
export const getComboMultiplier = () => comboMultiplier;

export const getStartTime = () => startTime;
export function setStartTime(time) {
    startTime = time;
}

export const getEndTime = () => endTime;
export function setEndTime(time) {
    endTime = time;
}

export const getMaxHeight = () => maxHeight;
export function setMaxHeight(height) {
    maxHeight = height;
}

export function getAudioInitialized() { return audioInitialized; }
export function setAudioInitialized(initialized) {
    if (initialized && !audioInitialized) {
        console.log("Audio Context Initialized State: true");
    }
    audioInitialized = initialized;
}

export function getPlatforms() { return platforms; }
export function setPlatforms(newPlatforms) { platforms = newPlatforms; }
export function addPlatform(platform) { platforms.push(platform); }
export function filterPlatforms(predicate) { platforms = platforms.filter(predicate); }

// NEW: Accessor for last landed platform
export function setLastLandedPlatformId(id) {
    lastLandedPlatformId = id;
}
export function getLastLandedPlatformId() {
    return lastLandedPlatformId;
}

// NEW: Accessor for initial Y
export function setInitialPlayerY(y) {
    initialPlayerY = y;
}
export function getInitialPlayerY() {
    return initialPlayerY;
}

// --- Score Popup Accessors ---
export function getScorePopups() { return scorePopups; }
export function addScorePopup(popup) { scorePopups.push(popup); }
export function filterScorePopups(predicate) { scorePopups = scorePopups.filter(predicate); }

// --- Timer Accessors ---
export function startGameTimer() {
    elapsedTime = 0;
}
export function updateElapsedTime() {
    if (startTime > 0 && currentGameState === GameState.Playing) {
        elapsedTime = performance.now() - startTime;
    }
}
export function getElapsedTime() { return elapsedTime; }
export function resetTimer() {
    elapsedTime = 0;
}

// NEW: Getters for Auth Info
export const getUserId = () => userId;
export const getDisplayName = () => displayName;
export const isLoggedIn = () => !!userId; // Helper to check if user is logged in
export const isLocalPlayer = () => userId === 'local-player';
export const getActiveLeaderboardSource = () => activeLeaderboardSource;
export function setActiveLeaderboardSource(source) {
    activeLeaderboardSource = source === 'global' ? 'global' : 'local';
}

// Add back lives getter/setter
export const getLives = () => lives;
export function loseLife() {
    lives--;
    console.log(`Life lost! Lives remaining: ${lives}`); // Log remaining lives
}
export function resetLives() {
    lives = MAX_LIVES;
}

// Add a getter for the last submitted score
export const getLastSubmittedScore = () => lastSubmittedScore;

// NEW: Function to clear the highlight marker specifically
export function clearLastSubmittedScoreHighlight() {
    lastSubmittedScore = null;
}

// Add getters/setters for track info
export const getCurrentTrackInfo = () => currentTrackInfo;
export function setCurrentTrackInfo(trackName) {
    currentTrackInfo = trackName || "None";
}

// --- Game Logic Related State Changes ---
export function resetGameStats() {
    score = 0;
    startTime = performance.now();
    endTime = 0;
    maxHeight = 0;
    resetLives(); // Reset lives when resetting game stats
    lastSubmittedScore = null; // Clear highlight marker
    lastLandedPlatformId = null; // Reset on new game/full reset
    initialPlayerY = 0; // Reset initial Y
    perfectLandingStreak = 0;
    comboMultiplier = 1;
    beginRunReplay();
}

export function beginRunReplay() {
    currentRunReplay = {
        version: 5,
        savedAt: 0,
        score: 0,
        maxHeight: 0,
        time: '00:00',
        duration: 0,
        canvasWidth: 0,
        canvasHeight: 0,
        isMobileRun: false,
        viewportProfile: 'desktop',
        aspectRatio: 0,
        platforms: [],
        samples: [],
        events: []
    };
    lastReplaySampleTime = 0;
}

export function setRunReplayMeta(meta = {}) {
    if (!currentRunReplay) beginRunReplay();
    currentRunReplay.canvasWidth = meta.canvasWidth || currentRunReplay.canvasWidth || 0;
    currentRunReplay.canvasHeight = meta.canvasHeight || currentRunReplay.canvasHeight || 0;
    if (typeof meta.isMobileRun === 'boolean') currentRunReplay.isMobileRun = meta.isMobileRun;
    if (meta.viewportProfile) currentRunReplay.viewportProfile = meta.viewportProfile;
    currentRunReplay.aspectRatio = currentRunReplay.canvasWidth && currentRunReplay.canvasHeight
        ? Math.round((currentRunReplay.canvasWidth / currentRunReplay.canvasHeight) * 10000) / 10000
        : currentRunReplay.aspectRatio || 0;
}

export function recordRunReplayPlatform(platform) {
    if (!currentRunReplay || !platform) return;
    currentRunReplay.platforms.push({
        id: platform.id,
        type: platform.type || 'normal',
        x: Math.round(platform.x),
        width: Math.round(platform.width),
        height: Math.round((platform.replayHeight || 0) * 10) / 10,
        time: Math.round(elapsedTime),
        movement: platform.movement ? {
            axis: platform.movement.axis,
            direction: platform.movement.direction,
            speed: platform.movement.speed,
            range: platform.movement.range
        } : null
    });
}

export function recordRunReplaySample(sample) {
    if (!sample || typeof sample.time !== 'number') return;
    if (!currentRunReplay) beginRunReplay();
    if (!sample.force && sample.time - lastReplaySampleTime < REPLAY_SAMPLE_INTERVAL_MS) return;

    lastReplaySampleTime = sample.time;
    currentRunReplay.samples.push({
        time: Math.round(sample.time),
        height: Math.round(sample.height * 10) / 10,
        xRatio: Math.max(0, Math.min(1, sample.xRatio)),
        yRatio: clampReplayRatio(sample.yRatio, 0.4),
        facing: sample.facing < 0 ? -1 : 1,
        cameraDrop: Math.round((sample.cameraDrop || 0) * 10) / 10,
        groundedPlatformId: Number.isFinite(sample.groundedPlatformId) ? sample.groundedPlatformId : null,
        groundedOffsetRatio: Number.isFinite(sample.groundedOffsetRatio)
            ? Math.max(-1, Math.min(2, Math.round(sample.groundedOffsetRatio * 1000) / 1000))
            : null,
        visible: sample.visible !== false
    });

    if (currentRunReplay.samples.length > MAX_REPLAY_SAMPLES) {
        currentRunReplay.samples = currentRunReplay.samples.filter((_, index) => index === 0 || index % 2 === 1);
    }
}

export function recordRunReplayEvent(event) {
    if (!event || !event.type) return;
    if (!currentRunReplay) beginRunReplay();

    currentRunReplay.events.push({
        ...event,
        time: Math.round(typeof event.time === 'number' ? event.time : elapsedTime)
    });
}

export function buildCurrentRunReplay(finalScore, finalHeight, finalTime) {
    if (!currentRunReplay || currentRunReplay.samples.length < 5) return null;
    const sampleDuration = currentRunReplay.samples[currentRunReplay.samples.length - 1]?.time || elapsedTime;
    const eventDuration = Array.isArray(currentRunReplay.events)
        ? currentRunReplay.events.reduce((max, event) => Math.max(max, event.time || 0), 0)
        : 0;
    return {
        ...currentRunReplay,
        savedAt: Date.now(),
        score: finalScore,
        maxHeight: Math.round(finalHeight * 10) / 10,
        time: finalTime,
        duration: Math.max(sampleDuration, eventDuration),
        platforms: currentRunReplay.platforms.slice(),
        samples: currentRunReplay.samples.slice(),
        events: Array.isArray(currentRunReplay.events) ? currentRunReplay.events.slice() : []
    };
}

function isReplayScoreBetter(replay, previousScore = 0, previousHeight = 0) {
    if (!replay) return false;
    return replay.maxHeight > previousHeight || (replay.maxHeight === previousHeight && replay.score > previousScore);
}

export function maybeSaveBestRunReplay(finalScore, finalHeight, finalTime) {
    const replay = buildCurrentRunReplay(finalScore, finalHeight, finalTime);
    if (!replay) return false;
    const previousBestHeight = bestRunReplay?.maxHeight || 0;
    const previousBestScore = bestRunReplay?.score || 0;

    if (!isReplayScoreBetter(replay, previousBestScore, previousBestHeight)) return false;

    bestRunReplay = replay;
    localStorage.setItem(BEST_RUN_REPLAY_KEY, JSON.stringify(bestRunReplay));
    return true;
}

export function getBestRunReplay() {
    return bestRunReplay;
}

export function getBestRunGhostPoint(timeMs) {
    if (!bestRunReplay || !Array.isArray(bestRunReplay.samples) || bestRunReplay.samples.length === 0) return null;

    const samples = bestRunReplay.samples;
    if (timeMs <= samples[0].time) return samples[0];
    if (timeMs >= samples[samples.length - 1].time) return samples[samples.length - 1];

    let low = 0;
    let high = samples.length - 1;
    while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (samples[mid].time <= timeMs) low = mid;
        else high = mid;
    }

    const a = samples[low];
    const b = samples[high];
    const span = Math.max(1, b.time - a.time);
    const t = (timeMs - a.time) / span;
    return {
        time: timeMs,
        height: a.height + (b.height - a.height) * t,
        xRatio: a.xRatio + (b.xRatio - a.xRatio) * t,
        facing: timeMs - a.time < b.time - timeMs ? (a.facing || 1) : (b.facing || 1)
    };
}

function getReplaySamples(replay) {
    if (!Array.isArray(replay?.samples)) return [];
    return replay.samples.map(sample => Array.isArray(sample) ? {
        time: sample[0],
        height: sample[1],
        xRatio: sample[2],
        yRatio: sample[3],
        facing: sample[4] < 0 ? -1 : 1,
        visible: sample[5] !== 0,
        cameraDrop: sample[6] || 0,
        groundedPlatformId: sample[7] >= 0 ? sample[7] : null,
        groundedOffsetRatio: null
    } : {
        time: sample.time ?? sample.t ?? 0,
        height: sample.height ?? sample.h ?? 0,
        xRatio: sample.xRatio ?? sample.x ?? 0.5,
        yRatio: sample.yRatio ?? sample.y ?? 0.4,
        facing: (sample.facing ?? sample.f ?? 1) < 0 ? -1 : 1,
        visible: sample.visible ?? sample.v !== 0,
        cameraDrop: sample.cameraDrop ?? sample.c ?? 0,
        groundedPlatformId: sample.groundedPlatformId ?? sample.g ?? null,
        groundedOffsetRatio: sample.groundedOffsetRatio ?? sample.o ?? null
    });
}

function pickDiscreteReplayValue(a, b, timeMs, key, fallback = null, edgeMs = 24) {
    const aValue = a?.[key] ?? fallback;
    const bValue = b?.[key] ?? fallback;
    if (aValue === bValue) return aValue;
    if (timeMs <= (a.time || 0) + edgeMs) return aValue;
    if (timeMs >= (b.time || 0) - edgeMs) return bValue;
    return fallback;
}

export function getReplayPlatforms(replay) {
    if (!Array.isArray(replay?.platforms)) return [];
    return replay.platforms.map(platform => Array.isArray(platform) ? {
        id: platform[0],
        type: platform[1],
        x: platform[2],
        width: platform[3],
        height: platform[4],
        time: platform[5],
        movement: platform[6] || null
    } : {
        id: platform.id ?? platform.i,
        type: platform.type ?? platform.p ?? 'normal',
        x: platform.x ?? 0,
        width: platform.width ?? platform.w ?? 0,
        height: platform.height ?? platform.h ?? 0,
        time: platform.time ?? platform.t ?? 0,
        movement: platform.movement ?? platform.m ?? null
    });
}

function compactReplayForStorage(replay) {
    if (!replay) return null;
    const samples = getReplaySamples(replay);
    const maxSamples = 4800;
    const stride = Math.max(1, Math.ceil(samples.length / maxSamples));
    const compactSamples = samples
        .filter((_, index) => index === 0 || index === samples.length - 1 || index % stride === 0)
        .map(sample => ({
            t: Math.round(sample.time || 0),
            h: Math.round((sample.height || 0) * 10) / 10,
            x: Math.round((sample.xRatio || 0) * 10000) / 10000,
            y: Math.round((sample.yRatio ?? 0.4) * 10000) / 10000,
            f: sample.facing < 0 ? -1 : 1,
            v: sample.visible === false ? 0 : 1,
            c: Math.round((sample.cameraDrop || 0) * 10) / 10,
            g: Number.isFinite(sample.groundedPlatformId) ? sample.groundedPlatformId : -1,
            o: Number.isFinite(sample.groundedOffsetRatio)
                ? Math.max(-1, Math.min(2, Math.round(sample.groundedOffsetRatio * 1000) / 1000))
                : null
        }));

    return {
        version: 5,
        savedAt: replay.savedAt,
        score: replay.score,
        maxHeight: replay.maxHeight,
        time: replay.time,
        duration: replay.duration,
        canvasWidth: replay.canvasWidth,
        canvasHeight: replay.canvasHeight,
        isMobileRun: replay.isMobileRun === true || replay.viewportProfile === 'mobile',
        viewportProfile: replay.viewportProfile || (replay.isMobileRun ? 'mobile' : 'desktop'),
        aspectRatio: replay.aspectRatio || (replay.canvasWidth && replay.canvasHeight
            ? Math.round((replay.canvasWidth / replay.canvasHeight) * 10000) / 10000
            : 0),
        platforms: getReplayPlatforms(replay).map(platform => ({
            i: platform.id,
            p: platform.type || 'normal',
            x: Math.round(platform.x || 0),
            w: Math.round(platform.width || 0),
            h: Math.round((platform.height || 0) * 10) / 10,
            t: Math.round(platform.time || 0),
            m: platform.movement || null
        })),
        samples: compactSamples,
        events: Array.isArray(replay.events) ? replay.events : []
    };
}

export function startReplay(entry) {
    const replay = entry?.replay;
    if (!replay || getReplaySamples(replay).length === 0) return false;
    replayViewer = {
        entry,
        replay,
        time: 0,
        previousTime: 0,
        playing: true,
        speed: 1,
        playedEvents: new Set()
    };
    setCurrentGameState(GameState.Replay);
    return true;
}

export function stopReplay() {
    replayViewer = null;
    setCurrentGameState(GameState.GameOver);
}

export function getReplayViewer() {
    return replayViewer;
}

export function getReplayDuration() {
    if (!replayViewer) return 0;
    const samples = getReplaySamples(replayViewer.replay);
    const sampleDuration = samples[samples.length - 1]?.time || 0;
    const eventDuration = Array.isArray(replayViewer.replay.events)
        ? replayViewer.replay.events.reduce((max, event) => Math.max(max, event.time || 0), 0)
        : 0;
    return Math.max(replayViewer.replay.duration || 0, sampleDuration, eventDuration);
}

export function updateReplayPlayback(deltaMs) {
    if (!replayViewer || !replayViewer.playing) return;
    const duration = getReplayDuration();
    replayViewer.previousTime = replayViewer.time;
    replayViewer.time = Math.min(duration, replayViewer.time + deltaMs * replayViewer.speed);
    if (replayViewer.time >= duration) {
        replayViewer.playing = false;
    }
}

export function seekReplay(timeMs) {
    if (!replayViewer) return;
    const nextTime = Math.max(0, Math.min(getReplayDuration(), timeMs));
    replayViewer.previousTime = nextTime;
    replayViewer.playedEvents = new Set();
    replayViewer.time = Math.max(0, Math.min(getReplayDuration(), timeMs));
}

export function seekReplayRatio(ratio) {
    seekReplay(getReplayDuration() * Math.max(0, Math.min(1, ratio)));
}

export function toggleReplayPlaying() {
    if (!replayViewer) return false;
    replayViewer.playing = !replayViewer.playing;
    return replayViewer.playing;
}

export function cycleReplaySpeed() {
    if (!replayViewer) return 1;
    const speeds = [1, 2, 3, 4];
    const currentIndex = speeds.indexOf(replayViewer.speed);
    replayViewer.speed = speeds[(currentIndex + 1) % speeds.length];
    return replayViewer.speed;
}

export function stepReplay(direction) {
    if (!replayViewer) return;
    seekReplay(replayViewer.time + direction * 3000);
}

export function getReplaySampleAt(timeMs) {
    if (!replayViewer) return null;
    const samples = getReplaySamples(replayViewer.replay);
    if (samples.length === 0) return null;
    if (timeMs <= samples[0].time) return samples[0];
    if (timeMs >= samples[samples.length - 1].time) return samples[samples.length - 1];

    let low = 0;
    let high = samples.length - 1;
    while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (samples[mid].time <= timeMs) low = mid;
        else high = mid;
    }

    const a = samples[low];
    const b = samples[high];
    const span = Math.max(1, b.time - a.time);
    const t = (timeMs - a.time) / span;
    const groundedPlatformId = pickDiscreteReplayValue(a, b, timeMs, 'groundedPlatformId', null);
    const visible = pickDiscreteReplayValue(a, b, timeMs, 'visible', true, 36) !== false;
    const facing = pickDiscreteReplayValue(a, b, timeMs, 'facing', 1, 36) < 0 ? -1 : 1;
    return {
        time: timeMs,
        height: a.height + (b.height - a.height) * t,
        xRatio: a.xRatio + (b.xRatio - a.xRatio) * t,
        yRatio: (a.yRatio ?? 0.4) + ((b.yRatio ?? 0.4) - (a.yRatio ?? 0.4)) * t,
        cameraDrop: (a.cameraDrop || 0) + ((b.cameraDrop || 0) - (a.cameraDrop || 0)) * t,
        groundedPlatformId,
        groundedOffsetRatio: groundedPlatformId === null
            ? null
            : pickDiscreteReplayValue(a, b, timeMs, 'groundedOffsetRatio', null),
        visible,
        facing
    };
}

export function consumeReplayEvents() {
    if (!replayViewer || !Array.isArray(replayViewer.replay.events)) return [];

    const start = Math.min(replayViewer.previousTime ?? replayViewer.time, replayViewer.time);
    const end = Math.max(replayViewer.previousTime ?? replayViewer.time, replayViewer.time);
    const events = [];
    replayViewer.replay.events.forEach((event, index) => {
        const id = `${index}:${event.type}:${event.time}`;
        if (replayViewer.playedEvents.has(id)) return;
        if (event.time >= start && event.time <= end) {
            replayViewer.playedEvents.add(id);
            events.push(event);
        }
    });
    return events;
}

export function isGhostEnabled() {
    return ghostEnabled;
}

export function setGhostEnabled(enabled) {
    ghostEnabled = !!enabled;
    localStorage.setItem(GHOST_ENABLED_KEY, ghostEnabled ? 'true' : 'false');
}

// --- Leaderboard Management (Firestore Implementation) --- //

const LEADERBOARD_COLLECTION = 'leaderboard'; // Name of Firestore collection
const LOCAL_LEADERBOARD_KEY = 'zipzip_localLeaderboard';
const LOCAL_PLAYER_ID_KEY = 'zipzip_localPlayerId';
const LEADERBOARD_RESET_VERSION = 'replay-leaderboard-reset-20260430';
const LOCAL_LEADERBOARD_RESET_KEY = `zipzip_${LEADERBOARD_RESET_VERSION}_local`;
const REMOTE_LEADERBOARD_RESET_KEY = `zipzip_${LEADERBOARD_RESET_VERSION}_remote`;
let localLeaderboardCache = null; // Cache results locally
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000; // Cache for 60 seconds

let firestoreApiPromise = null;
let authWaitPromise = null;

function makeLeaderboardError(code, message, cause = null) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
}

async function getAuthApiForLeaderboard() {
    const [{ auth }, authApi] = await Promise.all([
        getFirebaseServices(),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
    ]);
    return { auth, ...authApi };
}

async function waitForLeaderboardAuth(timeoutMs = 8000) {
    const { auth, onAuthStateChanged } = await getAuthApiForLeaderboard();
    if (auth.currentUser) return auth.currentUser;

    if (!authWaitPromise) {
        authWaitPromise = new Promise((resolve) => {
            const timeoutId = window.setTimeout(() => {
                unsubscribe();
                authWaitPromise = null;
                resolve(auth.currentUser || null);
            }, timeoutMs);

            const unsubscribe = onAuthStateChanged(auth, (user) => {
                window.clearTimeout(timeoutId);
                unsubscribe();
                authWaitPromise = null;
                resolve(user || null);
            });
        });
    }

    return authWaitPromise;
}

function convertFirestoreValue(value) {
    if (!value || typeof value !== 'object') return value;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) {
        return (value.arrayValue.values || []).map(convertFirestoreValue);
    }
    if ('mapValue' in value) {
        return convertFirestoreFields(value.mapValue.fields || {});
    }
    return value;
}

function convertFirestoreFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, convertFirestoreValue(value)]));
}

function toFirestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) {
        const values = value.map(toFirestoreValue);
        return values.length ? { arrayValue: { values } } : { arrayValue: {} };
    }
    if (typeof value === 'object') {
        return {
            mapValue: {
                fields: Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, toFirestoreValue(nestedValue)]))
            }
        };
    }
    return { stringValue: String(value) };
}

function toFirestoreFields(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

async function fetchGlobalLeaderboardViaRest(idToken = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await fetch('https://firestore.googleapis.com/v1/projects/zipzip-d8d69/databases/(default)/documents:runQuery?key=AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: LEADERBOARD_COLLECTION }],
                orderBy: [
                    { field: { fieldPath: 'score' }, direction: 'DESCENDING' },
                    { field: { fieldPath: 'timestamp' }, direction: 'ASCENDING' }
                ],
                limit: 40
            }
        })
    });

    if (!response.ok) {
        throw makeLeaderboardError('global-rest-failed', `Global leaderboard REST read failed (${response.status}).`);
    }

    const rows = await response.json();
    return rows
        .filter(row => row.document?.fields)
        .map(row => ({
            id: row.document.name?.split('/').pop() || '',
            ...convertFirestoreFields(row.document.fields)
        }));
}

async function queryGlobalLeaderboardEntryForUserViaRest(idToken, leaderboardUserId) {
    const response = await fetch('https://firestore.googleapis.com/v1/projects/zipzip-d8d69/databases/(default)/documents:runQuery?key=AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: LEADERBOARD_COLLECTION }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'userId' },
                        op: 'EQUAL',
                        value: { stringValue: leaderboardUserId }
                    }
                },
                limit: 10
            }
        })
    });

    if (!response.ok) {
        throw makeLeaderboardError('global-rest-submit-query-failed', `Global leaderboard REST submit lookup failed (${response.status}).`);
    }

    const rows = await response.json();
    const entries = rows
        .filter(row => row.document?.fields)
        .map(row => ({
            id: row.document.name?.split('/').pop() || '',
            name: row.document.name,
            ...convertFirestoreFields(row.document.fields)
        }));
    return dedupeLeaderboardEntries(entries)[0] || null;
}

async function submitGlobalLeaderboardViaRest(idToken, leaderboardUserId, entryData) {
    const existingEntry = await queryGlobalLeaderboardEntryForUserViaRest(idToken, leaderboardUserId);
    const isBetter = !existingEntry || entryData.score > (existingEntry.score || 0) ||
        (entryData.score === (existingEntry.score || 0) && entryData.maxHeight > (existingEntry.maxHeight || 0)) ||
        (entryData.score === (existingEntry.score || 0) && entryData.maxHeight === (existingEntry.maxHeight || 0) && entryData.replay && !existingEntry.replay);

    if (!isBetter) {
        return { skipped: true };
    }

    const documentId = existingEntry?.id || `score-${leaderboardUserId}-${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, '-');
    const documentName = existingEntry?.name || `projects/zipzip-d8d69/databases/(default)/documents/${LEADERBOARD_COLLECTION}/${documentId}`;
    const fieldData = {
        userId: leaderboardUserId,
        displayName: entryData.displayName,
        score: entryData.score,
        maxHeight: entryData.maxHeight,
        time: entryData.time,
        replay: entryData.replay
    };
    const write = {
        update: {
            name: documentName,
            fields: toFirestoreFields(fieldData)
        },
        updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }
        ]
    };

    if (existingEntry) {
        write.updateMask = { fieldPaths: Object.keys(fieldData) };
    } else {
        write.updateTransforms.push({ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' });
    }

    const response = await fetch('https://firestore.googleapis.com/v1/projects/zipzip-d8d69/databases/(default)/documents:commit?key=AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ writes: [write] })
    });

    if (!response.ok) {
        throw makeLeaderboardError('global-rest-submit-failed', `Global leaderboard REST submit failed (${response.status}).`);
    }

    return { skipped: false, id: documentId };
}

async function getFirestoreApi() {
    if (!firestoreApiPromise) {
        firestoreApiPromise = (async () => {
            const [{ db }, firestore] = await Promise.all([
                getFirebaseServices(),
                import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
            ]);
            return { db, ...firestore };
        })().catch((error) => {
            firestoreApiPromise = null;
            throw error;
        });
    }

    return firestoreApiPromise;
}

function getLocalLeaderboard() {
    try {
        const savedEntries = JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_KEY) || '[]');
        return Array.isArray(savedEntries) ? savedEntries : [];
    } catch (error) {
        console.warn("Could not read local leaderboard. Resetting it.", error);
        localStorage.removeItem(LOCAL_LEADERBOARD_KEY);
        return [];
    }
}

function saveLocalLeaderboard(entries) {
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 10)));
}

export function clearLocalLeaderboardForFreshStart() {
    if (localStorage.getItem(LOCAL_LEADERBOARD_RESET_KEY) === 'done') return false;

    localStorage.removeItem(LOCAL_LEADERBOARD_KEY);
    localStorage.removeItem(BEST_RUN_REPLAY_KEY);
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
    lastSubmittedScore = null;
    bestRunReplay = null;
    localStorage.setItem(LOCAL_LEADERBOARD_RESET_KEY, 'done');
    console.log("Local leaderboard and old best-run replay cleared for replay update.");
    return true;
}

export async function clearRemoteLeaderboardForFreshStart() {
    if (localStorage.getItem(REMOTE_LEADERBOARD_RESET_KEY) === 'done') {
        return { skipped: true, deleted: 0 };
    }

    localStorage.setItem(REMOTE_LEADERBOARD_RESET_KEY, 'done');
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
    lastSubmittedScore = null;
    console.log("Remote leaderboard reset migration skipped; client deletes are disabled.");
    return { skipped: true, deleted: 0 };
}

function getLeaderboardUserId() {
    if (userId && userId !== 'local-player') {
        return userId;
    }

    let localId = localStorage.getItem(LOCAL_PLAYER_ID_KEY);
    if (!localId) {
        const randomPart = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localId = `local-${randomPart}`;
        localStorage.setItem(LOCAL_PLAYER_ID_KEY, localId);
    }
    return localId;
}

function sortLeaderboardEntries(entries) {
    return [...entries].sort((a, b) => {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function dedupeLeaderboardEntries(entries) {
    const bestByUser = new Map();
    sortLeaderboardEntries(entries).forEach(entry => {
        const key = entry.userId || entry.displayName || entry.id;
        if (!bestByUser.has(key)) {
            bestByUser.set(key, entry);
        }
    });
    return sortLeaderboardEntries([...bestByUser.values()]);
}

function addLocalLeaderboardEntry(playerName, score, maxHeight, time, replay = null) {
    const leaderboardUserId = getLeaderboardUserId();
    const existingEntries = getLocalLeaderboard();
    const existingForUser = existingEntries.find(entry => entry.userId === leaderboardUserId);
    const isBetter = !existingForUser || score > (existingForUser.score || 0) ||
        (score === (existingForUser.score || 0) && maxHeight > (existingForUser.maxHeight || 0)) ||
        (score === (existingForUser.score || 0) && maxHeight === (existingForUser.maxHeight || 0) && replay && !existingForUser.replay);

    lastSubmittedScore = { score, maxHeight, time, userId: leaderboardUserId };

    if (!isBetter) {
        localLeaderboardCache = null;
        lastFetchTime = Date.now();
        return;
    }

    const entry = {
        id: existingForUser?.id || `local-${Date.now()}`,
        userId: leaderboardUserId,
        displayName: playerName || 'Local Player',
        score,
        maxHeight,
        time,
        replay,
        createdAt: existingForUser?.createdAt || Date.now(),
        updatedAt: Date.now(),
        local: true
    };

    const withoutOldUserEntry = existingEntries.filter(existing => existing.userId !== leaderboardUserId);
    const nextEntries = dedupeLeaderboardEntries([...withoutOldUserEntry, entry]).slice(0, 10);
    saveLocalLeaderboard(nextEntries);
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
}

export async function getLocalLeaderboardEntries() {
    return dedupeLeaderboardEntries(getLocalLeaderboard()).slice(0, 10);
}

export async function getGlobalLeaderboardEntries() {
    const now = Date.now();
    // Use cache if it exists and is not too old
    if (localLeaderboardCache && localLeaderboardCache.source === 'global' && (now - lastFetchTime < CACHE_DURATION)) {
        console.log("Returning cached leaderboard data.");
        return localLeaderboardCache.entries;
    }

    console.log("Fetching leaderboard from Firestore...");
    try {
        const {
            db,
            collection,
            getDocs,
            query,
            orderBy,
            limit
        } = await getFirestoreApi();
        const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
        // Query to get top 10 scores, ordered by score descending, then timestamp ascending
        const q = query(
            leaderboardRef,
            orderBy('score', 'desc'), // Higher scores first
            orderBy('timestamp', 'asc'), // For ties, older scores rank higher
            limit(40) // Fetch extra so one very active player does not crowd out everyone before de-dupe.
        );

        const querySnapshot = await getDocs(q);
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            leaderboardData.push({
                id: doc.id,
                ...doc.data()
            });
        });

        const dedupedLeaderboard = dedupeLeaderboardEntries(leaderboardData).slice(0, 10);
        console.log("Leaderboard fetched successfully:", dedupedLeaderboard);
        localLeaderboardCache = { source: 'global', entries: dedupedLeaderboard }; // Update cache
        lastFetchTime = now; // Update fetch time
        return dedupedLeaderboard;

    } catch (error) {
        console.warn("Firestore SDK leaderboard read failed. Trying authenticated REST fallback.", error);
        try {
            const authUser = await waitForLeaderboardAuth(2000);
            const idToken = authUser ? await authUser.getIdToken() : null;
            const leaderboardData = await fetchGlobalLeaderboardViaRest(idToken);
            const dedupedLeaderboard = dedupeLeaderboardEntries(leaderboardData).slice(0, 10);
            localLeaderboardCache = { source: 'global', entries: dedupedLeaderboard };
            lastFetchTime = now;
            return dedupedLeaderboard;
        } catch (fallbackError) {
            console.warn("Remote leaderboard unavailable.", fallbackError);
            throw fallbackError?.code ? fallbackError : error;
        }
    }
}

// Fetch leaderboard data from Firestore or local storage
export async function getLeaderboard(source = activeLeaderboardSource) {
    if (source === 'local') {
        return getLocalLeaderboardEntries();
    }

    return getGlobalLeaderboardEntries();
}

// Modify addLeaderboardEntry to store the data and accept individual arguments
export async function addLeaderboardEntry(playerName, score, maxHeight, time) {
    let leaderboardUserId = getLeaderboardUserId();
    const replay = compactReplayForStorage(buildCurrentRunReplay(score, maxHeight, time));

    // Store details before sending to Firestore (create an object for storage)
    const entryDataForHighlight = { score, maxHeight, time };
    lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId }; // Store a copy
    console.log("Storing last submitted score for highlighting:", lastSubmittedScore);

    // Always keep a local copy so game-over can show the latest run even if mobile
    // browser auth/network blocks the global board for a moment.
    addLocalLeaderboardEntry(playerName, score, maxHeight, time, replay);

    if (activeLeaderboardSource === 'local') {
        return;
    }

    console.log(`Adding leaderboard entry to Firestore for ${playerName}: Score=${score}, Height=${maxHeight}, Time=${time}`);
    try {
        const authUser = await waitForLeaderboardAuth();
        if (!authUser) {
            throw makeLeaderboardError('global-auth-required', 'Sign in to submit to the global leaderboard.');
        }
        leaderboardUserId = authUser.uid;
        lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId };

        const {
            db,
            collection,
            addDoc,
            doc,
            getDocs,
            query,
            where,
            updateDoc,
            serverTimestamp
        } = await getFirestoreApi();
        const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
        const userQuery = query(leaderboardRef, where('userId', '==', leaderboardUserId));
        const userSnapshot = await getDocs(userQuery);
        let existingDoc = null;
        let existingData = null;
        userSnapshot.docs.forEach(candidateDoc => {
            const candidateData = candidateDoc.data();
            const candidateIsBetter = !existingData ||
                (candidateData.score || 0) > (existingData.score || 0) ||
                ((candidateData.score || 0) === (existingData.score || 0) &&
                    (candidateData.maxHeight || 0) > (existingData.maxHeight || 0));
            if (candidateIsBetter) {
                existingDoc = candidateDoc;
                existingData = candidateData;
            }
        });
        const isBetter = !existingData || score > (existingData.score || 0) ||
            (score === (existingData.score || 0) && maxHeight > (existingData.maxHeight || 0)) ||
            (score === (existingData.score || 0) && maxHeight === (existingData.maxHeight || 0) && replay && !existingData.replay);

        if (isBetter) {
            const entryData = {
                userId: leaderboardUserId,
                displayName: playerName,
                score,
                maxHeight,
                time,
                replay,
                updatedAt: serverTimestamp()
            };

            if (existingDoc) {
                await updateDoc(doc(db, LEADERBOARD_COLLECTION, existingDoc.id), entryData);
                console.log("Leaderboard entry updated successfully!");
            } else {
                await addDoc(leaderboardRef, {
                    ...entryData,
                    timestamp: serverTimestamp()
                });
                console.log("Leaderboard entry added successfully!");
            }
        } else {
            console.log("Run did not beat this player's stored leaderboard run. Keeping old replay.");
        }
        // Invalidate local cache so next fetch gets the new score
        localLeaderboardCache = null;
        lastFetchTime = 0;
    } catch (error) {
        console.warn("Firestore SDK leaderboard submit failed. Trying REST submit fallback.", error);
        try {
            const authUser = await waitForLeaderboardAuth(2000);
            if (!authUser) throw makeLeaderboardError('global-auth-required', 'Sign in to submit to the global leaderboard.');
            leaderboardUserId = authUser.uid;
            const idToken = await authUser.getIdToken();
            const restEntryData = {
                userId: leaderboardUserId,
                displayName: playerName,
                score,
                maxHeight,
                time,
                replay
            };
            await submitGlobalLeaderboardViaRest(idToken, leaderboardUserId, restEntryData);
            localLeaderboardCache = null;
            lastFetchTime = 0;
            lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId };
            console.log("Leaderboard entry submitted through REST fallback.");
        } catch (fallbackError) {
            console.warn("Remote leaderboard submit failed. Keeping this run local-only.", fallbackError);
        }
    }
}

// Function to clear cache if needed (e.g., on logout)
export function clearLeaderboardCache() {
    localLeaderboardCache = null;
    lastFetchTime = 0;
    lastSubmittedScore = null; // Clear highlight marker
    console.log("Local leaderboard cache and highlight cleared.");
}

// --- Persistent State Accessors ---
export function getTopScore() { return topScore; }
export function setTopScore(newScore) {
    topScore = newScore;
    schedulePersistentStatWrite('topScore', topScore);
}

export function getHighestHeight() { return highestHeight; }
export function setHighestHeight(newHeight) {
    highestHeight = Math.round(newHeight);
    schedulePersistentStatWrite('highestHeight', highestHeight);
}

export function getIsGameOver() { return currentGameState === GameState.GameOver; }

export function setGameOver(value) { setCurrentGameState(GameState.GameOver); }

// NEW: Setter for Auth Info (called from ui.js)
export function setPlayerInfo(uid, name) {
    console.log(`Setting player info: UID=${uid}, Name=${name}`);
    userId = uid;
    displayName = name || 'Anon'; // Use Anon if name is null/empty
}

// Add back setter for difficultyFactor
export function setDifficultyFactor(value) {
    difficultyFactor = value;
}

// Optionally, add getter if needed elsewhere (not strictly needed for this error)
export function getDifficultyFactor() {
    return difficultyFactor;
}

// Initialize Game State
setCurrentGameState(GameState.MainMenu); // Start at MainMenu/Login
console.log("Initial game state set.");
