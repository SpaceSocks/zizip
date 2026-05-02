import * as state from './state.js?v=mobile-portrait-82';
// import { player } from './entities.js'; // No longer needed here

// This file will handle audio initialization and playback 

// --- Audio Elements ---
let musicPlayer;
let sfxLandPlayer;
let sfxMiddleLandPlayer;
let sfxGameOverPlayer;
let sfxPlayerDeathPlayer;
let audioContext;
let sfxGainNode;
let musicSourceNode;
let musicGainNode;
let sfxBufferLoadPromise = null;
let musicPreloadPromise = null;
let musicPreloadTrack = '';
const sfxBuffers = new Map();

// Store all SFX players for easier volume control
let sfxPlayers = [];

// --- Volume Control ---
let musicVolume = 0.6; // Start with default volume (0.0 to 1.0)
let sfxVolume = 0.6;   // Start with default volume (0.0 to 1.0)
let musicDucked = false;

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
const SFX_DEFINITIONS = {
    land: sfxLandPath,
    middleLand: sfxMiddleLandPath,
    gameOver: sfxGameOverPath,
    playerDeath: sfxPlayerDeathPath
};

function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    try {
        audioContext = new AudioContextCtor({ latencyHint: 'interactive' });
    } catch (error) {
        audioContext = new AudioContextCtor();
    }

    sfxGainNode = audioContext.createGain();
    sfxGainNode.gain.value = sfxVolume;
    sfxGainNode.connect(audioContext.destination);
    return audioContext;
}

function setupMusicGainNode() {
    if (!musicPlayer || musicSourceNode) return;

    const context = getAudioContext();
    if (!context) return;

    try {
        musicSourceNode = context.createMediaElementSource(musicPlayer);
        musicGainNode = context.createGain();
        musicSourceNode.connect(musicGainNode);
        musicGainNode.connect(context.destination);
        applyMusicVolume();
    } catch (error) {
        console.warn("Web Audio music gain unavailable; falling back to media volume.", error);
    }
}

function decodeAudioBuffer(context, arrayBuffer) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (buffer) => {
            if (settled) return;
            settled = true;
            resolve(buffer);
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const decodePromise = context.decodeAudioData(arrayBuffer, done, fail);
        if (decodePromise?.then) {
            decodePromise.then(done, fail);
        }
    });
}

async function loadSfxBuffers() {
    const context = getAudioContext();
    if (!context) return false;

    await Promise.all(Object.entries(SFX_DEFINITIONS).map(async ([name, path]) => {
        const response = await fetch(path, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        sfxBuffers.set(name, await decodeAudioBuffer(context, arrayBuffer));
    }));

    return true;
}

function ensureSfxBuffersLoading() {
    if (!sfxBufferLoadPromise) {
        sfxBufferLoadPromise = loadSfxBuffers().catch(error => {
            console.warn("Web Audio SFX buffers unavailable; falling back where safe.", error);
            return false;
        });
    }
    return sfxBufferLoadPromise;
}

function ensurePlaylistReady() {
    if (shuffledTracks.length > 0) return;
    shuffledTracks = [...musicTracks];
    shuffleArray(shuffledTracks);
    currentTrackIndex = 0;
}

function preloadMusicTrack(trackName) {
    if (!trackName) return Promise.resolve(false);
    if (musicPreloadTrack === trackName && musicPreloadPromise) return musicPreloadPromise;

    const trackPath = `Audio/Music/${trackName}.mp3`;
    musicPreloadTrack = trackName;
    musicPreloadPromise = fetch(trackPath, { cache: 'force-cache' })
        .then(response => {
            if (!response.ok) throw new Error(`Could not preload ${trackPath}: ${response.status}`);
            return response.blob();
        })
        .then(() => true)
        .catch(error => {
            console.warn(`Music preload failed for ${trackName}.`, error);
            return false;
        });
    return musicPreloadPromise;
}

function preloadCurrentMusicTrack() {
    ensurePlaylistReady();
    const trackName = shuffledTracks[currentTrackIndex];
    if (musicPlayer && trackName) {
        const trackPath = `Audio/Music/${trackName}.mp3`;
        if (!musicPlayer.src || !musicPlayer.src.endsWith(trackPath)) {
            musicPlayer.src = trackPath;
            musicPlayer.preload = 'auto';
            try {
                musicPlayer.load();
            } catch (error) {
                console.warn(`Could not start music element preload for ${trackName}.`, error);
            }
        }
    }
    return preloadMusicTrack(trackName);
}

function playBufferedSfx(name) {
    if (!state.getAudioInitialized()) return false;
    const context = getAudioContext();
    const buffer = sfxBuffers.get(name);
    if (!context || !sfxGainNode || !buffer) {
        ensureSfxBuffersLoading();
        return false;
    }

    if (context.state === 'suspended') {
        context.resume().catch(() => {});
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(sfxGainNode);
    source.start(0);
    return true;
}

function playFallbackAudio(player, label) {
    if (!state.getAudioInitialized() || !player) return;
    player.currentTime = 0;
    player.play().catch(e => {
        console.error(`Error playing ${label} SFX:`, e);
    });
}

export function warmAudioAssets() {
    ensurePlaylistReady();
    ensureSfxBuffersLoading();
    preloadCurrentMusicTrack();

    sfxPlayers.forEach(player => {
        if (!player) return;
        player.preload = 'auto';
        try {
            player.load();
        } catch (error) {
            console.warn("Could not warm SFX element.", error);
        }
    });
}

// --- Audio Setup ---
export function setupAudioPlayers() {
    musicPlayer = new Audio();
    musicPlayer.loop = false;
    musicPlayer.preload = 'auto';
    applyMusicVolume(); // Use stored volume
    
    sfxLandPlayer = new Audio(sfxLandPath);
    sfxMiddleLandPlayer = new Audio(sfxMiddleLandPath);
    sfxGameOverPlayer = new Audio(sfxGameOverPath);
    sfxPlayerDeathPlayer = new Audio(sfxPlayerDeathPath);

    // Assign initial volume and add to array
    sfxPlayers = [sfxLandPlayer, sfxMiddleLandPlayer, sfxGameOverPlayer, sfxPlayerDeathPlayer];
    sfxPlayers.forEach(player => {
        player.preload = 'auto';
        player.volume = sfxVolume;
        try {
            player.load();
        } catch (error) {
            console.warn("Could not start SFX preload.", error);
        }
    });
    ensurePlaylistReady();
    preloadCurrentMusicTrack();
    getAudioContext();
    setupMusicGainNode();
    ensureSfxBuffersLoading();

    // Add event listener to play next track when one ends
    musicPlayer.addEventListener('ended', playNextTrack);

    // DEBUG: Check if audio files are loading
    musicPlayer.addEventListener('error', (e) => console.error("Music Player Error:", e));
    sfxLandPlayer.addEventListener('error', (e) => console.error("SFX Land Error:", e));
    sfxMiddleLandPlayer.addEventListener('error', (e) => console.error("SFX Middle Land Error:", e));
    sfxGameOverPlayer.addEventListener('error', (e) => console.error("SFX Game Over Error:", e));
    sfxPlayerDeathPlayer.addEventListener('error', (e) => console.error("SFX Player Death Error:", e));
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
    applyMusicVolume();
    console.log(`Music volume set to: ${(musicVolume * 100).toFixed(0)}%`);
    // Store preference
    localStorage.setItem('musicVolumePref', musicVolume);
}

function applyMusicVolume() {
    if (!musicPlayer) return;
    const effectiveVolume = musicVolume * (musicDucked ? 0.4 : 1);
    if (musicGainNode) {
        const context = getAudioContext();
        musicPlayer.volume = 1;
        if (context) {
            musicGainNode.gain.setTargetAtTime(effectiveVolume, context.currentTime, 0.01);
        } else {
            musicGainNode.gain.value = effectiveVolume;
        }
        return;
    }
    musicPlayer.volume = effectiveVolume;
}

export function setSfxVolume(level) {
    // Ensure level is between 0 and 1
    sfxVolume = Math.max(0, Math.min(1, level));
    sfxPlayers.forEach(player => {
        if (player) {
            player.volume = sfxVolume;
        }
    });
    if (sfxGainNode) {
        sfxGainNode.gain.value = sfxVolume;
    }
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

    if (!playBufferedSfx('land')) {
        playFallbackAudio(sfxLandPlayer, 'Landing');
    }

    // Play the middle landing sound *additionally* if applicable
    if (isMiddle) {
        if (!playBufferedSfx('middleLand')) {
            playFallbackAudio(sfxMiddleLandPlayer, 'Middle Landing');
        }
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
        musicDucked = true;
        applyMusicVolume();
        console.log(`Lowering music volume temporarily to ${musicVolume * 0.4}`);
    }
}

export function restoreMusicVolume() {
    if (musicPlayer) {
        musicDucked = false;
        applyMusicVolume();
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

    ensurePlaylistReady();

    currentTrackName = shuffledTracks[currentTrackIndex];
    const trackPath = `Audio/Music/${currentTrackName}.mp3`;
    console.log(`Attempting to play track: ${currentTrackName} from ${trackPath}`);

    if (!musicPlayer.src || !musicPlayer.src.endsWith(trackPath)) {
        musicPlayer.src = trackPath;
        musicPlayer.preload = 'auto';
        musicPlayer.load();
    }
    setupMusicGainNode();
    applyMusicVolume();
    musicPlayer.play().then(() => {
        console.log(`musicPlayer.play() promise resolved for ${currentTrackName}.`);
        state.setCurrentTrackInfo(currentTrackName); // Update state for HUD
        const nextTrack = shuffledTracks[(currentTrackIndex + 1) % shuffledTracks.length];
        preloadMusicTrack(nextTrack);
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
        const context = getAudioContext();
        setupMusicGainNode();
        if (context?.state === 'suspended') {
            context.resume().catch(err => {
                console.warn("Audio context resume blocked until user interaction:", err);
            });
        }
        warmAudioAssets();
        if (musicPlayer && musicPlayer.paused) {
            startMusic();
        }
        return;
    }
    console.log("Running initializeAudio (to unlock context & start music)..." );

    if (!musicPlayer) {
        console.error("Music player not set up. Call setupAudioPlayers first.");
        return;
    }

    const context = getAudioContext();
    setupMusicGainNode();
    const unlockPromise = context
        ? context.resume()
        : sfxLandPlayer.play().then(() => {
            sfxLandPlayer.pause();
            sfxLandPlayer.currentTime = 0;
        });

    unlockPromise.then(() => {
        if (!state.getAudioInitialized()) {
            state.setAudioInitialized(true);
            console.log("Audio context unlocked.");
            warmAudioAssets();

            // Shuffle and start the first track immediately after unlock
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
    if (!playBufferedSfx('gameOver')) {
        playFallbackAudio(sfxGameOverPlayer, 'Game Over');
    }
}

export function playPlayerDeathSound() {
    if (!state.getAudioInitialized() || !sfxPlayerDeathPlayer) {
        console.warn("Cannot play Player Death sound: Audio not initialized or player not set up.");
        return;
    }
    if (!playBufferedSfx('playerDeath')) {
        playFallbackAudio(sfxPlayerDeathPlayer, 'Player Death');
    }
}
