import * as state from './state.js';
// import { player } from './entities.js'; // No longer needed here

// This file will handle audio initialization and playback 

// --- Audio Elements ---
let musicPlayer;
let sfxLandPlayer;
let sfxMiddleLandPlayer;
let sfxGameOverPlayer;
let sfxPlayerDeathPlayer;

// Store all SFX players for easier volume control
let sfxPlayers = [];

// --- Volume Control ---
let musicVolume = 0.6; // Start with default volume (0.0 to 1.0)
let sfxVolume = 0.6;   // Start with default volume (0.0 to 1.0)

// --- Music Tracks ---
const musicTracks = [
    'Warp Speed',
    'Stellar Confrontation',
    'Galactic Wonder',
    'Galactic Showdown',
    'Cosmic Journey'
];
let shuffledTracks = [];
let currentTrackIndex = 0;
let currentTrackName = "None";

// --- SFX Paths ---
const sfxLandPath = 'Audio/SFX/Landing1.wav';
const sfxMiddleLandPath = 'Audio/SFX/middleBlock.wav';
const sfxGameOverPath = 'Audio/SFX/gameover.wav';
const sfxPlayerDeathPath = 'Audio/SFX/PlayerDeath.wav';

// --- Audio Setup ---
export function setupAudioPlayers() {
    musicPlayer = new Audio();
    musicPlayer.loop = false;
    musicPlayer.volume = musicVolume; // Use stored volume
    
    sfxLandPlayer = new Audio(sfxLandPath);
    sfxMiddleLandPlayer = new Audio(sfxMiddleLandPath);
    sfxGameOverPlayer = new Audio(sfxGameOverPath);
    sfxPlayerDeathPlayer = new Audio(sfxPlayerDeathPath);

    // Assign initial volume and add to array
    sfxPlayers = [sfxLandPlayer, sfxMiddleLandPlayer, sfxGameOverPlayer, sfxPlayerDeathPlayer];
    sfxPlayers.forEach(player => player.volume = sfxVolume);

    // Add event listener to play next track when one ends
    musicPlayer.addEventListener('ended', playNextTrack);

    // DEBUG: Check if audio files are loading
    musicPlayer.addEventListener('error', (e) => console.error("Music Player Error:", e));
    sfxLandPlayer.addEventListener('error', (e) => console.error("SFX Land Error:", e));
    sfxMiddleLandPlayer.addEventListener('error', (e) => console.error("SFX Middle Land Error:", e));
    sfxGameOverPlayer.addEventListener('error', (e) => console.error("SFX Game Over Error:", e));
    sfxPlayerDeathPlayer.addEventListener('error', (e) => console.error("SFX Player Death Error:", e));
    musicPlayer.addEventListener('canplaythrough', () => console.log("Music can play through:", musicPlayer.src));
    sfxLandPlayer.addEventListener('canplaythrough', () => console.log("SFX Land can play through."));
    sfxMiddleLandPlayer.addEventListener('canplaythrough', () => console.log("SFX Middle Land can play through."));
    sfxGameOverPlayer.addEventListener('canplaythrough', () => console.log("SFX Game Over can play through."));
    sfxPlayerDeathPlayer.addEventListener('canplaythrough', () => console.log("SFX Player Death can play through."));
    console.log("Audio players setup with listeners.")
}

// --- Shuffle and Play Next Track ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
}

function playNextTrack() {
    currentTrackIndex++;
    if (currentTrackIndex >= shuffledTracks.length) {
        currentTrackIndex = 0; // Loop back to the beginning
        shuffleArray(shuffledTracks); // Re-shuffle when looping
        console.log("Music playlist looped and re-shuffled.");
    }
    startMusic(); // Start the next track
}

// --- Volume Setters (NEW) ---
export function setMusicVolume(level) {
    // Ensure level is between 0 and 1
    musicVolume = Math.max(0, Math.min(1, level));
    if (musicPlayer) {
        musicPlayer.volume = musicVolume;
    }
    console.log(`Music volume set to: ${(musicVolume * 100).toFixed(0)}%`);
    // Store preference
    localStorage.setItem('musicVolumePref', musicVolume);
}

export function setSfxVolume(level) {
    // Ensure level is between 0 and 1
    sfxVolume = Math.max(0, Math.min(1, level));
    sfxPlayers.forEach(player => {
        if (player) {
            player.volume = sfxVolume;
        }
    });
    console.log(`SFX volume set to: ${(sfxVolume * 100).toFixed(0)}%`);
    // Store preference
    localStorage.setItem('sfxVolumePref', sfxVolume);
}

// --- Volume Getters (NEW) ---
export function getMusicVolume() {
    return musicVolume;
}
export function getSfxVolume() {
    return sfxVolume;
}

// --- Load Volume Preferences (NEW) ---
export function loadVolumePreferences() {
    const savedMusicVol = localStorage.getItem('musicVolumePref');
    if (savedMusicVol !== null) {
        setMusicVolume(parseFloat(savedMusicVol));
    }
    const savedSfxVol = localStorage.getItem('sfxVolumePref');
    if (savedSfxVol !== null) {
        setSfxVolume(parseFloat(savedSfxVol));
    }
    console.log("Loaded volume preferences.");
}

// --- Audio Controls ---
export function playLandingSound(isMiddle = false) {
    if (!state.getAudioInitialized()) {
        // console.log("playLandingSound called but audio not initialized.");
        return;
    }

    // Always play the standard landing sound
    console.log(`Attempting to play standard landing sound.`);
    sfxLandPlayer.currentTime = 0;
    sfxLandPlayer.play().catch(e => {
        console.error(`Error playing standard landing SFX:`, e);
    });

    // Play the middle landing sound *additionally* if applicable
    if (isMiddle) {
        console.log(`Attempting to play middle landing sound additionally.`);
        sfxMiddleLandPlayer.currentTime = 0;
        sfxMiddleLandPlayer.play().catch(e => {
            console.error(`Error playing middle landing SFX:`, e);
        });
    }
}

export function pauseMusic() {
    if (musicPlayer && !musicPlayer.paused) {
        console.log("Pausing music.");
        musicPlayer.pause();
    }
}

// NEW: Lower/Restore Volume functions
export function lowerMusicVolume() {
    if (musicPlayer) {
        // Optional: Could lower relative to current musicVolume, 
        // or just set to a fixed low value for pause
        musicPlayer.volume = musicVolume * 0.4; 
        console.log(`Lowering music volume temporarily to ${musicPlayer.volume}`);
    }
}

export function restoreMusicVolume() {
    if (musicPlayer) {
        musicPlayer.volume = musicVolume; // Restore to the user-set level
        console.log(`Restoring music volume to user setting: ${musicVolume}`);
    }
}

// --- Start Music ---
export function startMusic() {
    const initialized = state.getAudioInitialized();
    console.log(`startMusic called. Audio Initialized: ${initialized}`);

    if (!initialized) {
        console.warn("Cannot start music, audio not initialized yet.");
        return;
    }

    if (shuffledTracks.length === 0) {
        console.error("No music tracks shuffled or available.");
        return;
    }

    currentTrackName = shuffledTracks[currentTrackIndex];
    const trackPath = `Audio/Music/${currentTrackName}.mp3`;
    console.log(`Attempting to play track: ${currentTrackName} from ${trackPath}`);

    musicPlayer.src = trackPath;
    restoreMusicVolume(); // Ensure volume is at original level when starting/resuming track
    musicPlayer.play().then(() => {
        console.log(`musicPlayer.play() promise resolved for ${currentTrackName}.`);
        state.setCurrentTrackInfo(currentTrackName); // Update state for HUD
    }).catch(e => {
        console.error(`Error caught during musicPlayer.play() for ${currentTrackName}:`, e);
        // Maybe try next track on error?
        // setTimeout(playNextTrack, 1000); 
    });
}

// --- Initialization (Unlock Audio Context & Start Music) ---
export function initializeAudio() {
    if (state.getAudioInitialized()) {
        console.log("Audio already initialized.");
        return;
    }
    console.log("Running initializeAudio (to unlock context & start music)..." );

    if (!musicPlayer) {
        console.error("Music player not set up. Call setupAudioPlayers first.");
        return;
    }

    // Attempt to unlock via a user-gesture-triggered SFX play/pause.
    // If Chrome blocks this on page load, leave audio uninitialized so a later
    // click/key press can retry successfully.
    const unlockPromise = sfxLandPlayer.play().then(() => {
        sfxLandPlayer.pause();
        sfxLandPlayer.currentTime = 0;
    });

    unlockPromise.then(() => {
        if (!state.getAudioInitialized()) {
            state.setAudioInitialized(true);
            console.log("Audio context unlocked.");

            // Shuffle and start the first track immediately after unlock
            shuffledTracks = [...musicTracks]; // Copy original list
            shuffleArray(shuffledTracks);
            currentTrackIndex = 0;
            console.log("Music playlist shuffled:", shuffledTracks);
            startMusic(); 
        }
    }).catch(err => {
         console.warn("Audio unlock blocked until user interaction:", err);
    });
}

// --- Getters ---
export const getCurrentTrackName = () => currentTrackName;
export const getMusicPlayer = () => musicPlayer; // For potential volume controls later 

// --- NEW Game Over Sound Function ---
export function playGameOverSound() {
    if (!state.getAudioInitialized() || !sfxGameOverPlayer) {
        console.warn("Cannot play Game Over sound: Audio not initialized or player not set up.");
        return;
    }
    console.log("Attempting to play Game Over sound.");
    sfxGameOverPlayer.currentTime = 0;
    sfxGameOverPlayer.play().catch(e => {
        console.error(`Error playing Game Over SFX:`, e);
    });
}

export function playPlayerDeathSound() {
    if (!state.getAudioInitialized() || !sfxPlayerDeathPlayer) {
        console.warn("Cannot play Player Death sound: Audio not initialized or player not set up.");
        return;
    }
    console.log("Attempting to play Player Death sound.");
    sfxPlayerDeathPlayer.currentTime = 0;
    sfxPlayerDeathPlayer.play().catch(e => {
        console.error(`Error playing Player Death SFX:`, e);
    });
}
