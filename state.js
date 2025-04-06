// This file will manage shared game state 

import { MAX_LIVES } from './constants.js';
import { db } from './firebaseConfig.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp // To store the time the score was submitted
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Game States Enum ---
export const GameState = Object.freeze({
    Loading: 'Loading',
    MainMenu: 'MainMenu', // Login Screen
    Playing: 'Playing',
    Paused: 'Paused',
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

// NEW: Store last submitted score details for highlighting
let lastSubmittedScore = null;

// NEW: Store current music track info
let currentTrackInfo = "None";

let height = 0;
let difficultyFactor = 0;
let platforms = [];
let lastLandedPlatformId = null; // NEW: Track the last platform landed on
let initialPlayerY = 0; // NEW: Track player's starting Y position

// --- Effect State ---
let scorePopups = [];

// --- Timer State ---
let elapsedTime = 0;

// --- Persistent State ---
let topScore = localStorage.getItem('topScore') || 0;
let highestHeight = localStorage.getItem('highestHeight') || 0;

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

// Add back lives getter/setter
export const getLives = () => lives;
export function loseLife() {
    lives--;
    console.log(`Life lost! Lives remaining: ${lives}`); // Log remaining lives
}
export function resetLives() {
    lives = 3; // Reset to 3
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
}

// --- Leaderboard Management (Firestore Implementation) --- //

const LEADERBOARD_COLLECTION = 'leaderboard'; // Name of Firestore collection
let localLeaderboardCache = null; // Cache results locally
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000; // Cache for 60 seconds

// Fetch leaderboard data from Firestore
export async function getLeaderboard() {
    const now = Date.now();
    // Use cache if it exists and is not too old
    if (localLeaderboardCache && (now - lastFetchTime < CACHE_DURATION)) {
        console.log("Returning cached leaderboard data.");
        return localLeaderboardCache;
    }

    console.log("Fetching leaderboard from Firestore...");
    try {
        const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
        // Query to get top 10 scores, ordered by score descending, then timestamp ascending
        const q = query(
            leaderboardRef,
            orderBy('score', 'desc'), // Higher scores first
            orderBy('timestamp', 'asc'), // For ties, older scores rank higher
            limit(10) // Limit to top 10
        );

        const querySnapshot = await getDocs(q);
        const leaderboardData = [];
        querySnapshot.forEach((doc) => {
            leaderboardData.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log("Leaderboard fetched successfully:", leaderboardData);
        localLeaderboardCache = leaderboardData; // Update cache
        lastFetchTime = now; // Update fetch time
        return leaderboardData;

    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        throw error; // Re-throw error to be handled by caller
    }
}

// Modify addLeaderboardEntry to store the data and accept individual arguments
export async function addLeaderboardEntry(playerName, score, maxHeight, time) {
    const userId = getUserId();
    if (!userId) {
        console.warn("User not logged in, cannot add leaderboard entry.");
        return; // Exit if user isn't logged in
    }

    // Store details before sending to Firestore (create an object for storage)
    const entryDataForHighlight = { score, maxHeight, time };
    lastSubmittedScore = { ...entryDataForHighlight }; // Store a copy
    console.log("Storing last submitted score for highlighting:", lastSubmittedScore);

    console.log(`Adding leaderboard entry to Firestore for ${playerName}: Score=${score}, Height=${maxHeight}, Time=${time}`);
    try {
        const leaderboardRef = collection(db, LEADERBOARD_COLLECTION);
        await addDoc(leaderboardRef, {
            userId: userId, // Use the ID fetched earlier
            displayName: playerName, // Use the passed playerName
            score: score, // Use the passed score
            maxHeight: maxHeight, // Use the passed maxHeight
            time: time, // Use the passed time (ensure it's a string/number Firestore supports)
            timestamp: serverTimestamp() // Use Firestore server time for reliable ordering
        });
        console.log("Leaderboard entry added successfully!");
        // Invalidate local cache so next fetch gets the new score
        localLeaderboardCache = null;
        lastFetchTime = 0;
    } catch (error) {
        console.error("Error adding leaderboard entry:", error);
        lastSubmittedScore = null; // Clear if error occurred
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