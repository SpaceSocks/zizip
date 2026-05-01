// This file will manage shared game state

import { MAX_LIVES, MAX_PERFECT_COMBO_MULTIPLIER } from './constants.js';
import { getFirebaseServices } from './firebaseConfig.js';

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
const REPLAY_SAMPLE_INTERVAL_MS = 100;
const MAX_REPLAY_SAMPLES = 6000;
let bestRunReplay = readBestRunReplay();
let currentRunReplay = null;
let lastReplaySampleTime = 0;
let ghostEnabled = localStorage.getItem(GHOST_ENABLED_KEY) !== 'false';
let replayViewer = null;

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
    // Potentially add logic here based on state transitions
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
    console.log(`Last landed platform ID set to: ${id}`);
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
        version: 3,
        savedAt: 0,
        score: 0,
        maxHeight: 0,
        time: '00:00',
        duration: 0,
        canvasWidth: 0,
        canvasHeight: 0,
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
        groundedPlatformId: sample[7] >= 0 ? sample[7] : null
    } : sample);
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
    } : platform);
}

function compactReplayForStorage(replay) {
    if (!replay) return null;
    const samples = getReplaySamples(replay);
    const maxSamples = 2600;
    const stride = Math.max(1, Math.ceil(samples.length / maxSamples));
    const compactSamples = samples
        .filter((_, index) => index === 0 || index === samples.length - 1 || index % stride === 0)
        .map(sample => [
            Math.round(sample.time || 0),
            Math.round((sample.height || 0) * 10) / 10,
            Math.round((sample.xRatio || 0) * 10000) / 10000,
            Math.round((sample.yRatio ?? 0.4) * 10000) / 10000,
            sample.facing < 0 ? -1 : 1,
            sample.visible === false ? 0 : 1,
            Math.round((sample.cameraDrop || 0) * 10) / 10,
            Number.isFinite(sample.groundedPlatformId) ? sample.groundedPlatformId : -1
        ]);

    return {
        version: 4,
        savedAt: replay.savedAt,
        score: replay.score,
        maxHeight: replay.maxHeight,
        time: replay.time,
        duration: replay.duration,
        canvasWidth: replay.canvasWidth,
        canvasHeight: replay.canvasHeight,
        platforms: getReplayPlatforms(replay).map(platform => [
            platform.id,
            platform.type || 'normal',
            Math.round(platform.x || 0),
            Math.round(platform.width || 0),
            Math.round((platform.height || 0) * 10) / 10,
            Math.round(platform.time || 0),
            platform.movement || null
        ]),
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
    return {
        time: timeMs,
        height: a.height + (b.height - a.height) * t,
        xRatio: a.xRatio + (b.xRatio - a.xRatio) * t,
        yRatio: (a.yRatio ?? 0.4) + ((b.yRatio ?? 0.4) - (a.yRatio ?? 0.4)) * t,
        cameraDrop: (a.cameraDrop || 0) + ((b.cameraDrop || 0) - (a.cameraDrop || 0)) * t,
        groundedPlatformId: timeMs - a.time < b.time - timeMs ? a.groundedPlatformId : b.groundedPlatformId,
        visible: timeMs - a.time < b.time - timeMs ? a.visible !== false : b.visible !== false,
        facing: timeMs - a.time < b.time - timeMs ? (a.facing || 1) : (b.facing || 1)
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

    const {
        db,
        collection,
        getDocs,
        deleteDoc
    } = await getFirestoreApi();

    const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
    const snapshot = await getDocs(leaderboardRef);
    await Promise.all(snapshot.docs.map(entryDoc => deleteDoc(entryDoc.ref)));

    localStorage.setItem(REMOTE_LEADERBOARD_RESET_KEY, 'done');
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
    lastSubmittedScore = null;
    console.log(`Remote leaderboard cleared for replay update. Deleted ${snapshot.size} entries.`);
    return { skipped: false, deleted: snapshot.size };
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
        console.warn("Remote leaderboard unavailable.", error);
        throw error;
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
    const leaderboardUserId = getLeaderboardUserId();
    const replay = compactReplayForStorage(buildCurrentRunReplay(score, maxHeight, time));

    // Store details before sending to Firestore (create an object for storage)
    const entryDataForHighlight = { score, maxHeight, time };
    lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId }; // Store a copy
    console.log("Storing last submitted score for highlighting:", lastSubmittedScore);

    if (activeLeaderboardSource === 'local') {
        addLocalLeaderboardEntry(playerName, score, maxHeight, time, replay);
        return;
    }

    console.log(`Adding leaderboard entry to Firestore for ${playerName}: Score=${score}, Height=${maxHeight}, Time=${time}`);
    try {
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
        console.warn("Remote leaderboard submit failed. Keeping this run out of the local-only board.", error);
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
    localStorage.setItem('topScore', topScore);
}

export function getHighestHeight() { return highestHeight; }
export function setHighestHeight(newHeight) {
    highestHeight = Math.round(newHeight);
    localStorage.setItem('highestHeight', highestHeight);
}

export function getIsGameOver() { return currentGameState === GameState.GameOver; }

export function setGameOver(value) { currentGameState = GameState.GameOver; }

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
