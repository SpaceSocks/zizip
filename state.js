// This file will manage shared game state

import { MAX_LIVES, MAX_PERFECT_COMBO_MULTIPLIER } from './constants.js?v=mobile-portrait-98';
import { getFirebaseServices } from './firebaseConfig.js?v=mobile-portrait-98';

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
let seedConfig = {
    seed: '',
    random: true
};
let currentRunSeed = '';
let currentRunRandom = true;
let seededRandomFn = null;

// NEW: Store last submitted score details for highlighting
let lastSubmittedScore = null;
let lastGlobalSubmitStatus = null;

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
const MAX_STORED_REPLAY_SAMPLES = 1800;
const MAX_STORED_REPLAY_PLATFORMS = 1200;
const MAX_STORED_REPLAY_EVENTS = 500;
const MAX_REPLAY_READ_SAMPLES = 9000;
const MAX_REPLAY_READ_PLATFORMS = 1500;
const MAX_REPLAY_READ_EVENTS = 750;
const MAX_RUN_SEED_LENGTH = 24;
let bestRunReplay = null;
let bestRunReplayOwnerId = null;
let currentRunReplay = null;
let lastReplaySampleTime = 0;
let ghostEnabled = localStorage.getItem(GHOST_ENABLED_KEY) !== 'false';
let replayViewer = null;
const pendingPersistentStats = new Map();
let persistentStatsWriteScheduled = false;
const ACHIEVEMENT_STORAGE_PREFIX = 'zipzip_achievements';
const ACHIEVEMENTS_COLLECTION = 'achievements';
const ACHIEVEMENTS = Object.freeze([
    { id: 'first_run', title: 'First Zip', description: 'Start your first run.', metric: 'runs', target: 1 },
    { id: 'runs_10', title: 'Again Again', description: 'Start 10 runs.', metric: 'runs', target: 10 },
    { id: 'runs_50', title: 'Orbit Habit', description: 'Start 50 runs.', metric: 'runs', target: 50 },
    { id: 'first_death', title: 'Space Oops', description: 'Fall for the first time.', metric: 'deaths', target: 1 },
    { id: 'deaths_10', title: 'Helmet Tester', description: 'Fall 10 times.', metric: 'deaths', target: 10 },
    { id: 'deaths_50', title: 'Crash Course', description: 'Fall 50 times.', metric: 'deaths', target: 50 },
    { id: 'deaths_100', title: 'Gravity Scholar', description: 'Fall 100 times.', metric: 'deaths', target: 100 },
    { id: 'height_100', title: 'Low Orbit', description: 'Reach 100 meters.', metric: 'bestHeight', target: 100, suffix: 'm' },
    { id: 'height_500', title: 'Cloud Piercer', description: 'Reach 500 meters.', metric: 'bestHeight', target: 500, suffix: 'm' },
    { id: 'height_1000', title: 'Kilometer Club', description: 'Reach 1,000 meters.', metric: 'bestHeight', target: 1000, suffix: 'm' },
    { id: 'height_5000', title: 'Star Ladder', description: 'Reach 5,000 meters.', metric: 'bestHeight', target: 5000, suffix: 'm' },
    { id: 'height_10000', title: 'Signal Breaker', description: 'Reach 10,000 meters.', metric: 'bestHeight', target: 10000, suffix: 'm' },
    { id: 'height_25000', title: 'Moon Elevator', description: 'Reach 25,000 meters.', metric: 'bestHeight', target: 25000, suffix: 'm' },
    { id: 'height_50000', title: 'Starline Rider', description: 'Reach 50,000 meters.', metric: 'bestHeight', target: 50000, suffix: 'm' },
    { id: 'height_100000', title: 'Deep Space', description: 'Reach 100,000 meters.', metric: 'bestHeight', target: 100000, suffix: 'm' },
    { id: 'height_1000000', title: 'Million Meter Dream', description: 'Reach 1,000,000 meters.', metric: 'bestHeight', target: 1000000, suffix: 'm' },
    { id: 'height_100000000', title: 'Beyond The Board', description: 'Reach 100,000,000 meters.', metric: 'bestHeight', target: 100000000, suffix: 'm' },
    { id: 'score_500', title: 'Score Spark', description: 'Score 500 points.', metric: 'bestScore', target: 500 },
    { id: 'score_1000', title: 'Point Pilot', description: 'Score 1,000 points.', metric: 'bestScore', target: 1000 },
    { id: 'score_5000', title: 'Score Comet', description: 'Score 5,000 points.', metric: 'bestScore', target: 5000 },
    { id: 'score_10000', title: 'Score Supernova', description: 'Score 10,000 points.', metric: 'bestScore', target: 10000 },
    { id: 'score_20000', title: 'Score Quasar', description: 'Score 20,000 points.', metric: 'bestScore', target: 20000 },
    { id: 'score_30000', title: 'Point Meteor', description: 'Score 30,000 points.', metric: 'bestScore', target: 30000 },
    { id: 'score_40000', title: 'Orbit Bank', description: 'Score 40,000 points.', metric: 'bestScore', target: 40000 },
    { id: 'score_50000', title: 'Score Nebula', description: 'Score 50,000 points.', metric: 'bestScore', target: 50000 },
    { id: 'perfect_3', title: 'Clean Chain', description: 'Land 3 perfect jumps in a row.', metric: 'bestPerfectStreak', target: 3 },
    { id: 'perfect_10', title: 'Dead Center', description: 'Land 10 perfect jumps in a row.', metric: 'bestPerfectStreak', target: 10 },
    { id: 'perfect_25', title: 'Perfect Orbit', description: 'Land 25 perfect jumps in a row.', metric: 'bestPerfectStreak', target: 25 },
    { id: 'perfect_50', title: 'Laser Feet', description: 'Land 50 perfect jumps in a row.', metric: 'bestPerfectStreak', target: 50 },
    { id: 'perfect_100', title: 'Centerline Legend', description: 'Land 100 perfect jumps in a row.', metric: 'bestPerfectStreak', target: 100 }
]);
const DEFAULT_ACHIEVEMENT_STATS = Object.freeze({
    runs: 0,
    deaths: 0,
    bestHeight: 0,
    bestScore: 0,
    bestPerfectStreak: 0
});
let achievementStateOwnerId = null;
let achievementState = {
    stats: { ...DEFAULT_ACHIEVEMENT_STATS },
    unlocked: {}
};
let achievementPopups = [];
let runStartBestHeight = 0;
let heightRecordPopupQueued = false;
let cloudAchievementWriteTimer = null;
let cloudAchievementWriteInFlight = false;

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

function finiteReplayNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(min, Math.min(max, numberValue));
}

function finiteReplayInteger(value, fallback = 0, min = -Infinity, max = Infinity) {
    return Math.round(finiteReplayNumber(value, fallback, min, max));
}

function firstDefined(...values) {
    return values.find(value => value !== null && value !== undefined);
}

function sanitizeReplayAnimationState(value) {
    const animationState = String(value || 'idle').toLowerCase();
    return ['idle', 'walk', 'jump', 'fall'].includes(animationState) ? animationState : 'idle';
}

function sanitizeStorageKeyPart(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
}

function sanitizeRunSeed(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9_-]+/g, '')
        .slice(0, MAX_RUN_SEED_LENGTH);
}

function generateRandomRunSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint32Array(2);
        globalThis.crypto.getRandomValues(bytes);
        return `${bytes[0].toString(36)}${bytes[1].toString(36)}`.toUpperCase().slice(0, 12);
    }

    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 12);
}

function hashRunSeed(seed) {
    let hash = 2166136261;
    const text = String(seed || 'COSMIC-ZIP');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed) {
    let value = hashRunSeed(seed) || 0x9E3779B9;
    return function seededRandom() {
        value += 0x6D2B79F5;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}

export function setRunSeedConfig(seed, random = true) {
    seedConfig = {
        seed: sanitizeRunSeed(seed),
        random: random !== false
    };
    return { ...seedConfig };
}

export function getRunSeedConfig() {
    return { ...seedConfig };
}

export function prepareNextRunSeed() {
    currentRunRandom = seedConfig.random;
    currentRunSeed = currentRunRandom
        ? generateRandomRunSeed()
        : (seedConfig.seed || generateRandomRunSeed());
    seededRandomFn = createSeededRandom(currentRunSeed);
    return currentRunSeed;
}

export function ensureRunSeedReady() {
    if (!currentRunSeed || !seededRandomFn) {
        return prepareNextRunSeed();
    }
    return currentRunSeed;
}

export function getCurrentRunSeed() {
    return currentRunSeed || seedConfig.seed || '';
}

export function runRandom() {
    if (!seededRandomFn) ensureRunSeedReady();
    return seededRandomFn();
}

function getAchievementOwnerId() {
    if (activeLeaderboardSource === 'local') {
        return getLocalLeaderboardUserId(displayName);
    }

    if (userId && userId !== 'local-player') {
        return `global-${userId}`;
    }

    return getLocalLeaderboardUserId(displayName);
}

function getAchievementStorageKey(ownerId = getAchievementOwnerId()) {
    const safeOwnerId = sanitizeStorageKeyPart(ownerId);
    return safeOwnerId ? `${ACHIEVEMENT_STORAGE_PREFIX}:${safeOwnerId}` : null;
}

function sanitizeAchievementSave(saveData = {}) {
    const rawStats = saveData && typeof saveData.stats === 'object' ? saveData.stats : {};
    const stats = { ...DEFAULT_ACHIEVEMENT_STATS };
    Object.keys(stats).forEach(key => {
        const value = Number(rawStats[key]);
        stats[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    const unlocked = {};
    const rawUnlocked = saveData && typeof saveData.unlocked === 'object' ? saveData.unlocked : {};
    ACHIEVEMENTS.forEach(achievement => {
        if (rawUnlocked[achievement.id]) {
            unlocked[achievement.id] = Number(rawUnlocked[achievement.id]) || Date.now();
        }
    });

    return { stats, unlocked };
}

function mergeAchievementSaves(...saves) {
    const merged = sanitizeAchievementSave();
    saves.forEach(saveData => {
        const safeSave = sanitizeAchievementSave(saveData);
        Object.keys(DEFAULT_ACHIEVEMENT_STATS).forEach(metric => {
            merged.stats[metric] = Math.max(merged.stats[metric] || 0, safeSave.stats[metric] || 0);
        });
        ACHIEVEMENTS.forEach(achievement => {
            const unlockedAt = safeSave.unlocked[achievement.id];
            if (!unlockedAt) return;
            merged.unlocked[achievement.id] = merged.unlocked[achievement.id]
                ? Math.min(merged.unlocked[achievement.id], unlockedAt)
                : unlockedAt;
        });
    });
    return merged;
}

function isOnlineAchievementOwner(ownerId = achievementStateOwnerId || getAchievementOwnerId()) {
    return activeLeaderboardSource === 'global'
        && userId
        && userId !== 'local-player'
        && ownerId === `global-${userId}`;
}

function loadAchievementStateForCurrentPlayer() {
    const ownerId = getAchievementOwnerId();
    if (achievementStateOwnerId === ownerId) return achievementState;

    achievementStateOwnerId = ownerId;
    achievementPopups = [];
    const storageKey = getAchievementStorageKey(ownerId);
    if (!storageKey) {
        achievementState = sanitizeAchievementSave();
        return achievementState;
    }

    try {
        achievementState = sanitizeAchievementSave(JSON.parse(localStorage.getItem(storageKey) || 'null') || {});
    } catch (error) {
        console.warn("Could not read achievements. Resetting this player's achievement save.", error);
        localStorage.removeItem(storageKey);
        achievementState = sanitizeAchievementSave();
    }

    return achievementState;
}

function saveAchievementState() {
    const storageKey = getAchievementStorageKey(achievementStateOwnerId || getAchievementOwnerId());
    if (!storageKey) return;
    schedulePersistentStatWrite(storageKey, JSON.stringify(achievementState));
    scheduleCloudAchievementWrite();
}

function buildCloudAchievementPayload(saveData = achievementState) {
    const safeSave = sanitizeAchievementSave(saveData);
    return {
        stats: safeSave.stats,
        unlocked: safeSave.unlocked
    };
}

async function readCloudAchievementState(onlineUserId = userId) {
    if (!onlineUserId || onlineUserId === 'local-player') return sanitizeAchievementSave();
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, ACHIEVEMENTS_COLLECTION, onlineUserId));
    return snapshot.exists() ? sanitizeAchievementSave(snapshot.data()) : sanitizeAchievementSave();
}

async function writeCloudAchievementState(saveData = achievementState, onlineUserId = userId) {
    if (!onlineUserId || onlineUserId === 'local-player') return;
    const { db, doc, setDoc, serverTimestamp } = await getFirestoreApi();
    await setDoc(doc(db, ACHIEVEMENTS_COLLECTION, onlineUserId), {
        ...buildCloudAchievementPayload(saveData),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

function scheduleCloudAchievementWrite() {
    if (!isOnlineAchievementOwner()) return;
    if (cloudAchievementWriteTimer) window.clearTimeout(cloudAchievementWriteTimer);
    cloudAchievementWriteTimer = window.setTimeout(async () => {
        cloudAchievementWriteTimer = null;
        if (cloudAchievementWriteInFlight || !isOnlineAchievementOwner()) return;
        cloudAchievementWriteInFlight = true;
        try {
            await writeCloudAchievementState(achievementState);
        } catch (error) {
            console.warn("Could not sync achievements to the cloud.", error);
        } finally {
            cloudAchievementWriteInFlight = false;
        }
    }, 650);
}

export async function syncOnlineAchievementsForCurrentPlayer() {
    if (!userId || userId === 'local-player' || activeLeaderboardSource !== 'global') {
        loadAchievementStateForCurrentPlayer();
        return getAchievementProgress();
    }

    const ownerId = getAchievementOwnerId();
    const localState = loadAchievementStateForCurrentPlayer();
    try {
        const cloudState = await readCloudAchievementState(userId);
        achievementStateOwnerId = ownerId;
        achievementState = mergeAchievementSaves(localState, cloudState);
        saveAchievementState();
        await writeCloudAchievementState(achievementState, userId);
    } catch (error) {
        console.warn("Could not load online achievements. Using local cached achievements.", error);
    }
    return getAchievementProgress();
}

function formatAchievementProgress(value, achievement) {
    const rounded = Math.floor(value);
    return achievement.suffix ? `${rounded.toLocaleString()}${achievement.suffix}` : rounded.toLocaleString();
}

function queueNotificationPopup(popup) {
    achievementPopups.push({
        id: popup.id,
        type: popup.type || 'achievement',
        label: popup.label || 'ACHIEVEMENT UNLOCKED',
        title: popup.title,
        description: popup.description || '',
        createdAt: Date.now(),
        alpha: 0
    });
    if (achievementPopups.length > 4) achievementPopups = achievementPopups.slice(-4);

    window.dispatchEvent(new CustomEvent('zipzip:achievement-unlocked', {
        detail: {
            id: popup.id,
            title: popup.title,
            type: popup.type || 'achievement'
        }
    }));
}

function queueAchievementPopup(achievement) {
    queueNotificationPopup({
        id: achievement.id,
        type: 'achievement',
        label: 'ACHIEVEMENT UNLOCKED',
        title: achievement.title,
        description: achievement.description
    });
}

function queueHeightRecordPopup(height) {
    queueNotificationPopup({
        id: `height-record-${Math.floor(height)}`,
        type: 'record',
        label: 'NEW HEIGHT RECORD',
        title: `${Math.floor(height).toLocaleString()} M`,
        description: 'Beat your previous best height.'
    });
}

function evaluateAchievements() {
    loadAchievementStateForCurrentPlayer();
    const now = Date.now();
    let changed = false;

    ACHIEVEMENTS.forEach(achievement => {
        if (achievementState.unlocked[achievement.id]) return;
        const value = achievementState.stats[achievement.metric] || 0;
        if (value >= achievement.target) {
            achievementState.unlocked[achievement.id] = now;
            queueAchievementPopup(achievement);
            changed = true;
        }
    });

    if (changed) saveAchievementState();
}

function updateAchievementStat(metric, value, mode = 'max') {
    loadAchievementStateForCurrentPlayer();
    const currentValue = achievementState.stats[metric] || 0;
    const nextValue = mode === 'add'
        ? currentValue + value
        : Math.max(currentValue, value);
    if (nextValue === currentValue) return;
    achievementState.stats[metric] = nextValue;
    saveAchievementState();
    evaluateAchievements();
}

export function getAchievementDefinitions() {
    return ACHIEVEMENTS;
}

function buildAchievementProgress(saveData) {
    const safeAchievementState = sanitizeAchievementSave(saveData);
    const items = ACHIEVEMENTS.map(achievement => {
        const value = safeAchievementState.stats[achievement.metric] || 0;
        const unlockedAt = safeAchievementState.unlocked[achievement.id] || null;
        const clampedValue = Math.min(value, achievement.target);
        return {
            ...achievement,
            value,
            unlocked: !!unlockedAt,
            unlockedAt,
            progressText: `${formatAchievementProgress(clampedValue, achievement)} / ${formatAchievementProgress(achievement.target, achievement)}`,
            percent: Math.max(0, Math.min(100, Math.round((clampedValue / achievement.target) * 100)))
        };
    });
    const unlockedCount = items.filter(item => item.unlocked).length;
    return {
        items,
        unlockedCount,
        totalCount: items.length,
        percent: items.length ? Math.round((unlockedCount / items.length) * 100) : 0,
        stats: { ...safeAchievementState.stats }
    };
}

export function getAchievementProgress() {
    loadAchievementStateForCurrentPlayer();
    return buildAchievementProgress(achievementState);
}

export function getLockedAchievementProgress() {
    return buildAchievementProgress();
}

export function getAchievementPopups() {
    return achievementPopups;
}

export function filterAchievementPopups(predicate) {
    achievementPopups = achievementPopups.filter(predicate);
}

export function recordRunStartedAchievement() {
    updateAchievementStat('runs', 1, 'add');
}

export function recordDeathAchievement() {
    updateAchievementStat('deaths', 1, 'add');
}

function getBestRunReplayOwnerId() {
    if (activeLeaderboardSource === 'local') {
        return getLocalLeaderboardUserId(displayName);
    }

    if (userId && userId !== 'local-player') {
        return `global-${userId}`;
    }

    return null;
}

function getBestRunReplayStorageKey(ownerId = getBestRunReplayOwnerId()) {
    const safeOwnerId = sanitizeStorageKeyPart(ownerId);
    return safeOwnerId ? `${BEST_RUN_REPLAY_KEY}:${safeOwnerId}` : null;
}

function readBestRunReplay(ownerId = getBestRunReplayOwnerId()) {
    const storageKey = getBestRunReplayStorageKey(ownerId);
    if (!storageKey) return null;

    try {
        const replay = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (!hasReplayData(replay)) return null;
        if (replay.ownerId && replay.ownerId !== ownerId) {
            localStorage.removeItem(storageKey);
            return null;
        }
        return replay;
    } catch (error) {
        console.warn("Could not read best-run ghost data. Resetting it.", error);
        localStorage.removeItem(storageKey);
        return null;
    }
}

function loadBestRunReplayForCurrentPlayer() {
    const ownerId = getBestRunReplayOwnerId();
    bestRunReplayOwnerId = ownerId;
    bestRunReplay = ownerId ? readBestRunReplay(ownerId) : null;
    return bestRunReplay;
}

function getCurrentPlayerBestRunReplay() {
    const ownerId = getBestRunReplayOwnerId();
    if (ownerId !== bestRunReplayOwnerId) {
        return loadBestRunReplayForCurrentPlayer();
    }
    return bestRunReplay;
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
    updateAchievementStat('bestScore', score);
}

export function registerPlatformLanding(landedOnMiddle) {
    if (landedOnMiddle) {
        perfectLandingStreak += 1;
        comboMultiplier = Math.min(MAX_PERFECT_COMBO_MULTIPLIER, Math.max(1, perfectLandingStreak));
    } else {
        perfectLandingStreak = 0;
        comboMultiplier = 1;
    }

    updateAchievementStat('bestPerfectStreak', perfectLandingStreak);

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
    if (!heightRecordPopupQueued && runStartBestHeight > 0 && maxHeight > runStartBestHeight) {
        heightRecordPopupQueued = true;
        queueHeightRecordPopup(maxHeight);
    }
    updateAchievementStat('bestHeight', maxHeight);
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
    loadBestRunReplayForCurrentPlayer();
    achievementStateOwnerId = null;
    loadAchievementStateForCurrentPlayer();
}
export const getLastGlobalSubmitStatus = () => lastGlobalSubmitStatus;

// Add back lives getter/setter
export const getLives = () => lives;
export function loseLife() {
    lives--;
    recordDeathAchievement();
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
    loadAchievementStateForCurrentPlayer();
    runStartBestHeight = Number(achievementState.stats.bestHeight) || 0;
    heightRecordPopupQueued = false;
    score = 0;
    startTime = performance.now();
    elapsedTime = 0;
    endTime = 0;
    maxHeight = 0;
    resetLives(); // Reset lives when resetting game stats
    lastSubmittedScore = null; // Clear highlight marker
    lastLandedPlatformId = null; // Reset on new game/full reset
    initialPlayerY = 0; // Reset initial Y
    perfectLandingStreak = 0;
    comboMultiplier = 1;
    beginRunReplay();
    recordRunStartedAchievement();
}

export function beginRunReplay() {
    currentRunReplay = {
        version: 5,
        seed: getCurrentRunSeed(),
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
    currentRunReplay.seed = sanitizeRunSeed(meta.seed || currentRunReplay.seed || getCurrentRunSeed());
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
        animationState: sanitizeReplayAnimationState(sample.animationState),
        animationFrame: finiteReplayInteger(sample.animationFrame, 0, 0, 6),
        tumbleAngle: Math.round(finiteReplayNumber(sample.tumbleAngle, 0, -Math.PI * 4, Math.PI * 4) * 1000) / 1000,
        cameraDrop: Math.round((sample.cameraDrop || 0) * 10) / 10,
        groundedPlatformId: Number.isFinite(sample.groundedPlatformId) ? sample.groundedPlatformId : null,
        groundedOffsetRatio: Number.isFinite(sample.groundedOffsetRatio)
            ? Math.max(-1, Math.min(2, Math.round(sample.groundedOffsetRatio * 1000) / 1000))
            : null,
        platformSnapshots: Array.isArray(sample.platformSnapshots)
            ? sample.platformSnapshots.slice(0, 16).map(snapshot => ({
                id: finiteReplayInteger(snapshot.id, -1, -1, 1000000),
                x: Math.round(finiteReplayNumber(snapshot.x, 0, -5000, 5000) * 10) / 10,
                y: Math.round(finiteReplayNumber(snapshot.y, 0, -5000, 15000) * 10) / 10
            })).filter(snapshot => snapshot.id >= 0)
            : [],
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
        seed: sanitizeRunSeed(currentRunReplay.seed || getCurrentRunSeed()),
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
    const ownerId = getBestRunReplayOwnerId();
    if (!ownerId) return false;

    const replay = buildCurrentRunReplay(finalScore, finalHeight, finalTime);
    if (!replay) return false;
    const previousReplay = getCurrentPlayerBestRunReplay();
    const previousBestHeight = previousReplay?.maxHeight || 0;
    const previousBestScore = previousReplay?.score || 0;

    if (!isReplayScoreBetter(replay, previousBestScore, previousBestHeight)) return false;

    bestRunReplayOwnerId = ownerId;
    bestRunReplay = {
        ...replay,
        ownerId,
        ownerName: displayName || 'Anon',
        leaderboardSource: activeLeaderboardSource
    };
    localStorage.setItem(getBestRunReplayStorageKey(ownerId), JSON.stringify(bestRunReplay));
    return true;
}

export function getBestRunReplay() {
    return getCurrentPlayerBestRunReplay();
}

export function getBestRunGhostPoint(timeMs) {
    const replay = getCurrentPlayerBestRunReplay();
    const samples = getReplaySamples(replay);
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
        facing: timeMs - a.time < b.time - timeMs ? (a.facing || 1) : (b.facing || 1)
    };
}

function normalizeReplayCollection(value, maxItems) {
    if (Array.isArray(value)) {
        return value.length <= maxItems ? value : [];
    }
    if (!value || typeof value !== 'object') return [];

    const entries = Object.entries(value);
    if (entries.length > maxItems) return [];

    return entries
        .sort(([a], [b]) => {
            const numberA = Number(a);
            const numberB = Number(b);
            if (Number.isFinite(numberA) && Number.isFinite(numberB)) return numberA - numberB;
            return String(a).localeCompare(String(b));
        })
        .map(([, item]) => item)
        .filter(item => item !== null && item !== undefined);
}

function sanitizeReplayPlatformSnapshot(snapshot) {
    if (Array.isArray(snapshot)) {
        return {
            id: finiteReplayInteger(snapshot[0], -1, -1, 1000000),
            x: finiteReplayNumber(snapshot[1], 0, -5000, 5000),
            y: finiteReplayNumber(snapshot[2], 0, -5000, 15000)
        };
    }

    return {
        id: finiteReplayInteger(firstDefined(snapshot?.id, snapshot?.i), -1, -1, 1000000),
        x: finiteReplayNumber(firstDefined(snapshot?.x, snapshot?.sx), 0, -5000, 5000),
        y: finiteReplayNumber(firstDefined(snapshot?.y, snapshot?.sy), 0, -5000, 15000)
    };
}

function decodeReplayPlatformSnapshots(value, maxSnapshots = 16) {
    if (typeof value === 'string') {
        return value
            .split(';')
            .slice(0, maxSnapshots)
            .map(part => part.split(',').map(Number))
            .map(sanitizeReplayPlatformSnapshot)
            .filter(snapshot => snapshot.id >= 0);
    }

    if (!Array.isArray(value)) return [];

    if (value.every(item => typeof item === 'number')) {
        const snapshots = [];
        for (let index = 0; index + 2 < value.length && snapshots.length < maxSnapshots; index += 3) {
            snapshots.push(sanitizeReplayPlatformSnapshot([
                value[index],
                value[index + 1],
                value[index + 2]
            ]));
        }
        return snapshots.filter(snapshot => snapshot.id >= 0);
    }

    return normalizeReplayCollection(value, maxSnapshots)
        .map(sanitizeReplayPlatformSnapshot)
        .filter(snapshot => snapshot.id >= 0);
}

function encodeReplayPlatformSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) return '';

    return snapshots
        .slice(0, 16)
        .map(sanitizeReplayPlatformSnapshot)
        .filter(snapshot => snapshot.id >= 0)
        .map(snapshot => [
            snapshot.id,
            Math.round(snapshot.x * 10) / 10,
            Math.round(snapshot.y * 10) / 10
        ].join(','))
        .join(';');
}

function getReplaySamples(replay) {
    const rawSamples = normalizeReplayCollection(replay?.samples, MAX_REPLAY_READ_SAMPLES);
    if (rawSamples.length === 0) return [];

    return rawSamples.map(sample => {
        if (Array.isArray(sample)) {
            return {
                time: finiteReplayInteger(sample[0], 0, 0, 3600000),
                height: finiteReplayNumber(sample[1], 0, 0, 100000),
                xRatio: finiteReplayNumber(sample[2], 0.5, -1, 2),
                yRatio: finiteReplayNumber(sample[3], 0.4, -3, 4),
                facing: sample[4] < 0 ? -1 : 1,
                animationState: 'idle',
                animationFrame: 0,
                visible: sample[5] !== 0,
                cameraDrop: finiteReplayNumber(sample[6], 0, -100000, 100000),
                groundedPlatformId: sample[7] >= 0 ? sample[7] : null,
                groundedOffsetRatio: null,
                platformSnapshots: []
            };
        }

        const visibleValue = firstDefined(sample.visible, sample.v);
        const groundedOffset = firstDefined(sample.groundedOffsetRatio, sample.o);
        const rawPlatformSnapshots = decodeReplayPlatformSnapshots(firstDefined(sample.platformSnapshots, sample.p), 16);
        return {
            time: finiteReplayInteger(firstDefined(sample.time, sample.t), 0, 0, 3600000),
            height: finiteReplayNumber(firstDefined(sample.height, sample.h), 0, 0, 100000),
            xRatio: finiteReplayNumber(firstDefined(sample.xRatio, sample.x), 0.5, -1, 2),
            yRatio: finiteReplayNumber(firstDefined(sample.yRatio, sample.y), 0.4, -3, 4),
            facing: firstDefined(sample.facing, sample.f, 1) < 0 ? -1 : 1,
            animationState: sanitizeReplayAnimationState(firstDefined(sample.animationState, sample.z)),
            animationFrame: finiteReplayInteger(firstDefined(sample.animationFrame, sample.r), 0, 0, 6),
            tumbleAngle: finiteReplayNumber(firstDefined(sample.tumbleAngle, sample.u), 0, -Math.PI * 4, Math.PI * 4),
            visible: visibleValue === undefined ? true : visibleValue !== 0 && visibleValue !== false,
            cameraDrop: finiteReplayNumber(firstDefined(sample.cameraDrop, sample.c), 0, -100000, 100000),
            groundedPlatformId: firstDefined(sample.groundedPlatformId, sample.g, null),
            groundedOffsetRatio: Number.isFinite(Number(groundedOffset))
                ? finiteReplayNumber(groundedOffset, 0, -1, 2)
                : null,
            platformSnapshots: rawPlatformSnapshots
        };
    }).filter(sample => Number.isFinite(sample.time) && Number.isFinite(sample.height));
}

export function hasReplayData(replay) {
    return getReplaySamples(replay).length > 0;
}

function pickDiscreteReplayValue(a, b, timeMs, key, fallback = null, edgeMs = 24) {
    const aValue = a?.[key] ?? fallback;
    const bValue = b?.[key] ?? fallback;
    if (aValue === bValue) return aValue;
    if (timeMs <= (a.time || 0) + edgeMs) return aValue;
    if (timeMs >= (b.time || 0) - edgeMs) return bValue;
    return fallback;
}

function interpolateReplayPlatformSnapshots(a = {}, b = {}, t = 0, timeMs = 0) {
    const snapshotsById = new Map();
    (a.platformSnapshots || []).forEach(snapshot => {
        snapshotsById.set(snapshot.id, { a: snapshot, b: null });
    });
    (b.platformSnapshots || []).forEach(snapshot => {
        const existing = snapshotsById.get(snapshot.id) || { a: null, b: null };
        existing.b = snapshot;
        snapshotsById.set(snapshot.id, existing);
    });

    return Array.from(snapshotsById.values()).map(pair => {
        if (pair.a && pair.b) {
            return {
                id: pair.a.id,
                x: pair.a.x + (pair.b.x - pair.a.x) * t,
                y: pair.a.y + (pair.b.y - pair.a.y) * t
            };
        }
        const fallbackSnapshot = timeMs - (a.time || 0) < (b.time || 0) - timeMs ? pair.a : pair.b;
        return fallbackSnapshot ? { ...fallbackSnapshot } : null;
    }).filter(Boolean);
}

function sanitizeReplayMovement(movement) {
    if (!movement || typeof movement !== 'object') return null;
    const axis = movement.axis === 'y' ? 'y' : 'x';
    const direction = finiteReplayNumber(movement.direction, 1, -1, 1) < 0 ? -1 : 1;
    const speed = finiteReplayNumber(movement.speed, 0, 0, 500);
    const range = finiteReplayNumber(movement.range, 0, 0, 1000);
    if (speed <= 0 || range <= 0) return null;
    return { axis, direction, speed, range };
}

export function getReplayPlatforms(replay) {
    const rawPlatforms = normalizeReplayCollection(replay?.platforms, MAX_REPLAY_READ_PLATFORMS);
    if (rawPlatforms.length === 0) return [];

    return rawPlatforms.map(platform => {
        if (Array.isArray(platform)) {
            return {
                id: finiteReplayInteger(platform[0], 0, 0, 1000000),
                type: String(platform[1] || 'normal').slice(0, 24),
                x: finiteReplayNumber(platform[2], 0, -5000, 5000),
                width: finiteReplayNumber(platform[3], 0, 0, 2000),
                height: finiteReplayNumber(platform[4], 0, 0, 100000),
                time: finiteReplayInteger(platform[5], 0, 0, 3600000),
                movement: sanitizeReplayMovement(platform[6])
            };
        }

        return {
            id: finiteReplayInteger(firstDefined(platform.id, platform.i), 0, 0, 1000000),
            type: String(firstDefined(platform.type, platform.p, 'normal')).slice(0, 24),
            x: finiteReplayNumber(platform.x, 0, -5000, 5000),
            width: finiteReplayNumber(firstDefined(platform.width, platform.w), 0, 0, 2000),
            height: finiteReplayNumber(firstDefined(platform.height, platform.h), 0, 0, 100000),
            time: finiteReplayInteger(firstDefined(platform.time, platform.t), 0, 0, 3600000),
            movement: sanitizeReplayMovement(firstDefined(platform.movement, platform.m))
        };
    }).filter(platform => platform.width > 0);
}

function getReplayEvents(replay) {
    return normalizeReplayCollection(replay?.events, MAX_REPLAY_READ_EVENTS).map(event => {
        const safeEvent = event && typeof event === 'object' ? event : {};
        return {
            ...safeEvent,
            time: finiteReplayInteger(firstDefined(safeEvent.time, safeEvent.t), 0, 0, 3600000),
            type: String(firstDefined(safeEvent.type, safeEvent.e, safeEvent.name, '')).slice(0, 40)
        };
    }).filter(event => event.type);
}

function compactReplayForStorage(replay) {
    if (!replay) return null;
    const samples = getReplaySamples(replay);
    const maxSamples = MAX_STORED_REPLAY_SAMPLES;
    const stride = Math.max(1, Math.ceil(samples.length / maxSamples));
    const compactSamples = samples
        .filter((_, index) => index === 0 || index === samples.length - 1 || index % stride === 0)
        .map(sample => {
            const compactSample = {
                t: Math.round(sample.time || 0),
                h: Math.round((sample.height || 0) * 10) / 10,
                x: Math.round((sample.xRatio || 0) * 10000) / 10000,
                y: Math.round((sample.yRatio ?? 0.4) * 10000) / 10000,
                f: sample.facing < 0 ? -1 : 1,
                z: sanitizeReplayAnimationState(sample.animationState),
                r: finiteReplayInteger(sample.animationFrame, 0, 0, 6),
                u: Math.round(finiteReplayNumber(sample.tumbleAngle, 0, -Math.PI * 4, Math.PI * 4) * 1000) / 1000,
                v: sample.visible === false ? 0 : 1,
                c: Math.round((sample.cameraDrop || 0) * 10) / 10,
                g: Number.isFinite(sample.groundedPlatformId) ? sample.groundedPlatformId : -1,
                o: Number.isFinite(sample.groundedOffsetRatio)
                    ? Math.max(-1, Math.min(2, Math.round(sample.groundedOffsetRatio * 1000) / 1000))
                    : null
            };
            const platformSnapshots = encodeReplayPlatformSnapshots(sample.platformSnapshots);
            if (platformSnapshots) {
                compactSample.p = platformSnapshots;
            }
            return compactSample;
        });

    return {
        version: 5,
        seed: sanitizeRunSeed(replay.seed || getCurrentRunSeed()),
        savedAt: finiteReplayInteger(replay.savedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        score: finiteReplayInteger(replay.score, 0, 0, 10000000),
        maxHeight: Math.round(finiteReplayNumber(replay.maxHeight, 0, 0, 100000) * 10) / 10,
        time: String(replay.time || '00:00').slice(0, 24),
        duration: finiteReplayInteger(replay.duration, 0, 0, 3600000),
        canvasWidth: finiteReplayInteger(replay.canvasWidth, 0, 0, 10000),
        canvasHeight: finiteReplayInteger(replay.canvasHeight, 0, 0, 10000),
        isMobileRun: replay.isMobileRun === true || replay.viewportProfile === 'mobile',
        viewportProfile: String(replay.viewportProfile || (replay.isMobileRun ? 'mobile' : 'desktop')).slice(0, 16),
        aspectRatio: finiteReplayNumber(replay.aspectRatio || (replay.canvasWidth && replay.canvasHeight
            ? Math.round((replay.canvasWidth / replay.canvasHeight) * 10000) / 10000
            : 0), 0, 0, 10),
        platforms: getReplayPlatforms(replay).slice(0, MAX_STORED_REPLAY_PLATFORMS).map(platform => ({
            i: platform.id,
            p: platform.type || 'normal',
            x: Math.round(platform.x || 0),
            w: Math.round(platform.width || 0),
            h: Math.round((platform.height || 0) * 10) / 10,
            t: Math.round(platform.time || 0),
            m: platform.movement || null
        })),
        samples: compactSamples,
        events: getReplayEvents(replay).slice(0, MAX_STORED_REPLAY_EVENTS)
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
    const eventDuration = getReplayEvents(replayViewer.replay)
        .reduce((max, event) => Math.max(max, event.time || 0), 0);
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
    const groundedPlatformId = pickDiscreteReplayValue(a, b, timeMs, 'groundedPlatformId', null, 4);
    const visible = pickDiscreteReplayValue(a, b, timeMs, 'visible', true, 36) !== false;
    const facing = pickDiscreteReplayValue(a, b, timeMs, 'facing', 1, 36) < 0 ? -1 : 1;
    const animationState = pickDiscreteReplayValue(a, b, timeMs, 'animationState', 'idle', 36);
    const animationFrame = pickDiscreteReplayValue(a, b, timeMs, 'animationFrame', 0, 36);
    const tumbleAngle = (a.tumbleAngle || 0) + ((b.tumbleAngle || 0) - (a.tumbleAngle || 0)) * t;
    return {
        time: timeMs,
        height: a.height + (b.height - a.height) * t,
        xRatio: a.xRatio + (b.xRatio - a.xRatio) * t,
        yRatio: (a.yRatio ?? 0.4) + ((b.yRatio ?? 0.4) - (a.yRatio ?? 0.4)) * t,
        cameraDrop: (a.cameraDrop || 0) + ((b.cameraDrop || 0) - (a.cameraDrop || 0)) * t,
        groundedPlatformId,
        groundedOffsetRatio: groundedPlatformId === null
            ? null
            : pickDiscreteReplayValue(a, b, timeMs, 'groundedOffsetRatio', null, 4),
        platformSnapshots: interpolateReplayPlatformSnapshots(a, b, t, timeMs),
        visible,
        facing,
        animationState,
        animationFrame,
        tumbleAngle
    };
}

export function getReplayEventsForCurrentViewer() {
    if (!replayViewer) return [];
    return getReplayEvents(replayViewer.replay);
}

export function consumeReplayEvents() {
    if (!replayViewer) return [];

    const start = Math.min(replayViewer.previousTime ?? replayViewer.time, replayViewer.time);
    const end = Math.max(replayViewer.previousTime ?? replayViewer.time, replayViewer.time);
    const events = [];
    getReplayEvents(replayViewer.replay).forEach((event, index) => {
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
const LOCAL_ALIAS_KEY = 'zipzip_localAlias';
const LEADERBOARD_RESET_VERSION = 'reset-all-accounts-20260502b';
const LOCAL_LEADERBOARD_RESET_KEY = `zipzip_${LEADERBOARD_RESET_VERSION}_local`;
const REMOTE_LEADERBOARD_RESET_KEY = `zipzip_${LEADERBOARD_RESET_VERSION}_remote`;
const LEADERBOARD_DISPLAY_LIMIT = 100;
const LOCAL_LEADERBOARD_STORE_LIMIT = 250;
const GLOBAL_LEADERBOARD_FETCH_LIMIT = 160;
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
                limit: GLOBAL_LEADERBOARD_FETCH_LIMIT
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

async function queryGlobalLeaderboardRankViaRest(idToken, entry) {
    if (!entry || typeof entry.score !== 'number') return null;

    const headers = {
        'Content-Type': 'application/json'
    };
    if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await fetch('https://firestore.googleapis.com/v1/projects/zipzip-d8d69/databases/(default)/documents:runAggregationQuery?key=AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            structuredAggregationQuery: {
                structuredQuery: {
                    from: [{ collectionId: LEADERBOARD_COLLECTION }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'score' },
                            op: 'GREATER_THAN',
                            value: toFirestoreValue(entry.score)
                        }
                    }
                },
                aggregations: [
                    {
                        alias: 'betterCount',
                        count: {}
                    }
                ]
            }
        })
    });

    if (!response.ok) {
        throw makeLeaderboardError('global-rest-rank-failed', `Global leaderboard REST rank failed (${response.status}).`);
    }

    const rows = await response.json();
    const countValue = rows?.[0]?.result?.aggregateFields?.betterCount;
    const betterCount = Number(countValue?.integerValue || countValue?.doubleValue || 0);
    return Number.isFinite(betterCount) ? betterCount + 1 : null;
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
        seed: entryData.seed,
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

function normalizeGlobalSubmitError(error) {
    return {
        ok: false,
        code: error?.code || error?.name || 'global-submit-failed',
        message: error?.message || 'Could not save this run to the global leaderboard.'
    };
}

function makeGlobalSubmitStatus(ok, details = {}) {
    return {
        ok,
        code: details.code || (ok ? 'global-submit-ok' : 'global-submit-failed'),
        message: details.message || '',
        usedReplay: !!details.usedReplay,
        skipped: !!details.skipped
    };
}

function getReplaylessEntryData(entryData) {
    return {
        ...entryData,
        replay: null
    };
}

async function submitGlobalLeaderboardViaRestWithReplayFallback(idToken, leaderboardUserId, entryData) {
    try {
        const result = await submitGlobalLeaderboardViaRest(idToken, leaderboardUserId, entryData);
        return makeGlobalSubmitStatus(true, { usedReplay: !!entryData.replay, skipped: !!result?.skipped });
    } catch (fullReplayError) {
        if (!entryData.replay) throw fullReplayError;
        console.warn("Global REST submit with replay failed. Retrying score without replay.", fullReplayError);
        const result = await submitGlobalLeaderboardViaRest(idToken, leaderboardUserId, getReplaylessEntryData(entryData));
        return makeGlobalSubmitStatus(true, {
            usedReplay: false,
            skipped: !!result?.skipped,
            code: 'global-submit-no-replay',
            message: 'Global score saved without replay data.'
        });
    }
}

async function upsertGlobalLeaderboardEntrySdk(firestoreApi, playerName, leaderboardUserId, entryData) {
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
    } = firestoreApi;
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
    const isBetter = !existingData || entryData.score > (existingData.score || 0) ||
        (entryData.score === (existingData.score || 0) && entryData.maxHeight > (existingData.maxHeight || 0)) ||
        (entryData.score === (existingData.score || 0) && entryData.maxHeight === (existingData.maxHeight || 0) && entryData.replay && !existingData.replay);

    if (!isBetter) {
        console.log("Run did not beat this player's stored leaderboard run. Keeping old replay.");
        return makeGlobalSubmitStatus(true, { usedReplay: !!existingData?.replay, skipped: true });
    }

    const submitData = {
        userId: leaderboardUserId,
        displayName: playerName,
        score: entryData.score,
        maxHeight: entryData.maxHeight,
        time: entryData.time,
        seed: entryData.seed,
        replay: entryData.replay,
        updatedAt: serverTimestamp()
    };

    if (existingDoc) {
        await updateDoc(doc(db, LEADERBOARD_COLLECTION, existingDoc.id), submitData);
        console.log("Leaderboard entry updated successfully!");
    } else {
        await addDoc(leaderboardRef, {
            ...submitData,
            timestamp: serverTimestamp()
        });
        console.log("Leaderboard entry added successfully!");
    }

    return makeGlobalSubmitStatus(true, { usedReplay: !!entryData.replay });
}

async function upsertGlobalLeaderboardEntrySdkWithReplayFallback(firestoreApi, playerName, leaderboardUserId, entryData) {
    try {
        return await upsertGlobalLeaderboardEntrySdk(firestoreApi, playerName, leaderboardUserId, entryData);
    } catch (fullReplayError) {
        if (!entryData.replay) throw fullReplayError;
        console.warn("Global SDK submit with replay failed. Retrying score without replay.", fullReplayError);
        const result = await upsertGlobalLeaderboardEntrySdk(firestoreApi, playerName, leaderboardUserId, getReplaylessEntryData(entryData));
        return {
            ...result,
            usedReplay: false,
            code: result.skipped ? result.code : 'global-submit-no-replay',
            message: result.skipped ? result.message : 'Global score saved without replay data.'
        };
    }
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
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries.slice(0, LOCAL_LEADERBOARD_STORE_LIMIT)));
}

function removeLocalStorageKeysStartingWith(prefix) {
    try {
        for (let index = localStorage.length - 1; index >= 0; index--) {
            const key = localStorage.key(index);
            if (key && key.startsWith(prefix)) {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.warn(`Could not remove localStorage keys starting with ${prefix}.`, error);
    }
}

export function clearLocalLeaderboardForFreshStart() {
    if (localStorage.getItem(LOCAL_LEADERBOARD_RESET_KEY) === 'done') return false;

    localStorage.removeItem(LOCAL_LEADERBOARD_KEY);
    localStorage.removeItem(LOCAL_PLAYER_ID_KEY);
    localStorage.removeItem(LOCAL_ALIAS_KEY);
    localStorage.removeItem('topScore');
    localStorage.removeItem('highestHeight');
    localStorage.removeItem(BEST_RUN_REPLAY_KEY);
    removeLocalStorageKeysStartingWith(`${BEST_RUN_REPLAY_KEY}:`);
    removeLocalStorageKeysStartingWith(`${ACHIEVEMENT_STORAGE_PREFIX}:`);
    const currentBestRunKey = getBestRunReplayStorageKey();
    if (currentBestRunKey) localStorage.removeItem(currentBestRunKey);
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
    lastSubmittedScore = null;
    lastGlobalSubmitStatus = null;
    bestRunReplay = null;
    bestRunReplayOwnerId = null;
    topScore = 0;
    highestHeight = 0;
    localStorage.setItem(LOCAL_LEADERBOARD_RESET_KEY, 'done');
    console.log("Local leaderboard, local users, and local replays cleared for a fresh start.");
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
    lastGlobalSubmitStatus = null;
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

function getLocalLeaderboardUserId(playerName = displayName) {
    const normalizedName = String(playerName || 'Local Player')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);

    if (normalizedName) {
        return `local-alias-${normalizedName}`;
    }

    return getLeaderboardUserId();
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

function rankLeaderboardEntries(entries) {
    return dedupeLeaderboardEntries(entries).map((entry, index) => ({
        ...entry,
        rank: entry.rank || index + 1
    }));
}

function buildLeaderboardDisplayWindow(entries, currentUserId = null, currentEntry = null, currentRank = null) {
    const rankedEntries = rankLeaderboardEntries(entries);
    const topEntries = rankedEntries.slice(0, LEADERBOARD_DISPLAY_LIMIT);

    if (currentUserId) {
        const topCurrentEntry = topEntries.find(entry => entry.userId === currentUserId);
        if (topCurrentEntry) {
            topCurrentEntry.isCurrentPlayer = true;
            return topEntries;
        }

        const rankedCurrentEntry = rankedEntries.find(entry => entry.userId === currentUserId);
        const entryToAppend = rankedCurrentEntry || currentEntry;
        if (entryToAppend) {
            return [
                ...topEntries,
                {
                    ...entryToAppend,
                    rank: rankedCurrentEntry?.rank || currentRank || entryToAppend.rank || null,
                    isCurrentPlayer: true,
                    separated: topEntries.length > 0
                }
            ];
        }
    }

    return topEntries;
}

function hydrateLeaderboardReplaysFromLocal(entries) {
    const localEntries = getLocalLeaderboard();
    if (!localEntries.length) return entries;

    return entries.map(entry => {
        if (hasReplayData(entry.replay)) return entry;
        const matchingLocalReplays = localEntries
            .filter(localEntry =>
                hasReplayData(localEntry.replay) &&
                String(localEntry.displayName || '').toLowerCase() === String(entry.displayName || '').toLowerCase()
            )
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        const localReplayEntry = matchingLocalReplays.find(localEntry =>
            Number(localEntry.score || 0) === Number(entry.score || 0) &&
            Math.abs(Number(localEntry.maxHeight || 0) - Number(entry.maxHeight || 0)) < 1 &&
            String(localEntry.time || '') === String(entry.time || '')
        ) || matchingLocalReplays.find(localEntry =>
            Number(localEntry.score || 0) === Number(entry.score || 0) &&
            Math.abs(Number(localEntry.maxHeight || 0) - Number(entry.maxHeight || 0)) < 1
        ) || matchingLocalReplays[0];

        return localReplayEntry
            ? { ...entry, seed: entry.seed || localReplayEntry.seed || localReplayEntry.replay?.seed || '', replay: localReplayEntry.replay }
            : entry;
    });
}

async function getBestGlobalEntryForUserSdk(firestoreApi, leaderboardRef, leaderboardUserId) {
    if (!leaderboardUserId) return null;

    const userQuery = firestoreApi.query(
        leaderboardRef,
        firestoreApi.where('userId', '==', leaderboardUserId)
    );
    const userSnapshot = await firestoreApi.getDocs(userQuery);
    const entries = [];
    userSnapshot.forEach((doc) => {
        entries.push({
            id: doc.id,
            ...doc.data()
        });
    });
    return dedupeLeaderboardEntries(entries)[0] || null;
}

async function getGlobalLeaderboardRankSdk(firestoreApi, leaderboardRef, entry) {
    if (!entry || typeof entry.score !== 'number' || !firestoreApi.getCountFromServer) return null;

    const betterQuery = firestoreApi.query(
        leaderboardRef,
        firestoreApi.where('score', '>', entry.score)
    );
    const snapshot = await firestoreApi.getCountFromServer(betterQuery);
    const betterCount = Number(snapshot.data().count || 0);
    return Number.isFinite(betterCount) ? betterCount + 1 : null;
}

function addLocalLeaderboardEntry(playerName, score, maxHeight, time, replay = null) {
    const leaderboardUserId = getLocalLeaderboardUserId(playerName);
    const seed = sanitizeRunSeed(replay?.seed || getCurrentRunSeed());
    const existingEntries = getLocalLeaderboard();
    const existingForUser = existingEntries.find(entry => entry.userId === leaderboardUserId);
    const isBetter = !existingForUser || score > (existingForUser.score || 0) ||
        (score === (existingForUser.score || 0) && maxHeight > (existingForUser.maxHeight || 0)) ||
        (score === (existingForUser.score || 0) && maxHeight === (existingForUser.maxHeight || 0) && replay && !existingForUser.replay);

    lastSubmittedScore = { score, maxHeight, time, seed, userId: leaderboardUserId, displayName: playerName || 'Local Player' };

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
        seed,
        replay,
        createdAt: existingForUser?.createdAt || Date.now(),
        updatedAt: Date.now(),
        local: true
    };

    const withoutOldUserEntry = existingEntries.filter(existing => existing.userId !== leaderboardUserId);
    const nextEntries = dedupeLeaderboardEntries([...withoutOldUserEntry, entry]);
    saveLocalLeaderboard(nextEntries);
    localLeaderboardCache = null;
    lastFetchTime = Date.now();
}

export async function getLocalLeaderboardEntries() {
    return buildLeaderboardDisplayWindow(getLocalLeaderboard(), getLocalLeaderboardUserId(displayName));
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
            where,
            orderBy,
            limit,
            getCountFromServer
        } = await getFirestoreApi();
        const firestoreApi = { getDocs, query, where, getCountFromServer };
        const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
        // Query enough rows to form the top 100 after de-duping by player.
        const q = query(
            leaderboardRef,
            orderBy('score', 'desc'), // Higher scores first
            orderBy('timestamp', 'asc'), // For ties, older scores rank higher
            limit(GLOBAL_LEADERBOARD_FETCH_LIMIT)
        );

        const querySnapshot = await getDocs(q);
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            leaderboardData.push({
                id: doc.id,
                ...doc.data()
            });
        });

        let currentEntry = null;
        let currentRank = null;
        const currentUserId = userId && userId !== 'local-player' ? userId : null;
        if (currentUserId) {
            try {
                currentEntry = await getBestGlobalEntryForUserSdk(firestoreApi, leaderboardRef, currentUserId);
                currentRank = await getGlobalLeaderboardRankSdk(firestoreApi, leaderboardRef, currentEntry);
            } catch (rankError) {
                console.warn("Could not fetch current player's global rank.", rankError);
            }
        }

        const leaderboardWindow = hydrateLeaderboardReplaysFromLocal(
            buildLeaderboardDisplayWindow(leaderboardData, currentUserId, currentEntry, currentRank)
        );
        console.log("Leaderboard fetched successfully:", leaderboardWindow);
        localLeaderboardCache = { source: 'global', entries: leaderboardWindow }; // Update cache
        lastFetchTime = now; // Update fetch time
        return leaderboardWindow;

    } catch (error) {
        console.warn("Firestore SDK leaderboard read failed. Trying authenticated REST fallback.", error);
        try {
            const authUser = await waitForLeaderboardAuth(2000);
            const idToken = authUser ? await authUser.getIdToken() : null;
            const leaderboardData = await fetchGlobalLeaderboardViaRest(idToken);
            let currentEntry = null;
            let currentRank = null;
            if (authUser?.uid && idToken) {
                try {
                    currentEntry = await queryGlobalLeaderboardEntryForUserViaRest(idToken, authUser.uid);
                    currentRank = await queryGlobalLeaderboardRankViaRest(idToken, currentEntry);
                } catch (rankError) {
                    console.warn("Could not fetch current player's REST global rank.", rankError);
                }
            }
            const leaderboardWindow = hydrateLeaderboardReplaysFromLocal(
                buildLeaderboardDisplayWindow(leaderboardData, authUser?.uid || null, currentEntry, currentRank)
            );
            localLeaderboardCache = { source: 'global', entries: leaderboardWindow };
            lastFetchTime = now;
            return leaderboardWindow;
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
    score = finiteReplayInteger(score, 0, 0, 10000000);
    maxHeight = Math.round(finiteReplayNumber(maxHeight, 0, 0, 100000) * 10) / 10;
    time = String(time || '00:00').slice(0, 24);
    let leaderboardUserId = getLeaderboardUserId();
    const replay = compactReplayForStorage(buildCurrentRunReplay(score, maxHeight, time));
    const seed = sanitizeRunSeed(replay?.seed || getCurrentRunSeed());

    // Store details before sending to Firestore (create an object for storage)
    const entryDataForHighlight = { score, maxHeight, time, seed };
    lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId }; // Store a copy
    lastGlobalSubmitStatus = null;
    console.log("Storing last submitted score for highlighting:", lastSubmittedScore);

    // Always keep a local copy so game-over can show the latest run even if mobile
    // browser auth/network blocks the global board for a moment.
    addLocalLeaderboardEntry(playerName, score, maxHeight, time, replay);

    if (activeLeaderboardSource === 'local') {
        lastGlobalSubmitStatus = makeGlobalSubmitStatus(true, {
            skipped: true,
            code: 'local-run',
            message: 'Local run saved locally.'
        });
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

        const firestoreApi = await getFirestoreApi();
        lastGlobalSubmitStatus = await upsertGlobalLeaderboardEntrySdkWithReplayFallback(firestoreApi, playerName, leaderboardUserId, {
            userId: leaderboardUserId,
            displayName: playerName,
            score,
            maxHeight,
            time,
            seed,
            replay
        });
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
                seed,
                replay
            };
            lastGlobalSubmitStatus = await submitGlobalLeaderboardViaRestWithReplayFallback(idToken, leaderboardUserId, restEntryData);
            localLeaderboardCache = null;
            lastFetchTime = 0;
            lastSubmittedScore = { ...entryDataForHighlight, userId: leaderboardUserId };
            console.log("Leaderboard entry submitted through REST fallback.");
        } catch (fallbackError) {
            console.warn("Remote leaderboard submit failed. Keeping this run local-only.", fallbackError);
            lastGlobalSubmitStatus = normalizeGlobalSubmitError(fallbackError);
        }
    }
}

// Function to clear cache if needed (e.g., on logout)
export function clearLeaderboardCache() {
    localLeaderboardCache = null;
    lastFetchTime = 0;
    lastSubmittedScore = null; // Clear highlight marker
    lastGlobalSubmitStatus = null;
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
    loadBestRunReplayForCurrentPlayer();
    achievementStateOwnerId = null;
    loadAchievementStateForCurrentPlayer();
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
