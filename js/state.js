// ── js/state.js ──
// Shared game state and constants. All other modules read/write these globals.

// Three.js objects
let scene, camera, renderer, player;

// Entity arrays
let enemies = [], bullets = [], enemyBullets = [], buildings = [], drops = [], particles = [];

// Player stats
let hp = 100, score = 0, keys = {}, gameRunning = false;
let yaw = 0, pitch = 0, lastShotTime = 0, shakeAmount = 0;
let isMobile = false;
let damageFlashAmount = 0, muzzleFlashAmount = 0;

// Weapon
let ammo = 12, maxClip = 12, reserve = 48, isReloading = false;
const MAX_RESERVE = 120;

// Wave system
let wave = 0, enemiesToSpawn = 0, isWaveTransition = false;
let gamePaused = false;
let tutorialMode = false;

// High score
let highScore = parseInt(localStorage.getItem('msc_highscore') || '0');

// ── Character build ──
let selectedChar  = 'striker';
let playerSpeed   = 0.2;
let playerMaxHp   = 100;
let shootCooldown = 150;
let bulletDmg     = 50;
let burstCount    = 1;

// ── Active powerup boosts ──
// Each key maps to an expiry timestamp (Date.now() + duration)
let boosts = {};

// Constants
const MAX_PARTICLES = 100;
const PARTICLE_SIZE = 0.25;

// ── Persistent settings ──
const settings = {
    masterVolume:    parseInt(localStorage.getItem('msc_vol')    ?? '80'),  // 0-100
    gyroEnabled:     localStorage.getItem('msc_gyro')   === 'true',
    gyroSensitivity: parseInt(localStorage.getItem('msc_gyroS') ?? '10'),  // 1-20
    lookSensitivity: parseInt(localStorage.getItem('msc_lookS') ?? '7')    // 1-20
};
function saveSettings() {
    localStorage.setItem('msc_vol',   settings.masterVolume);
    localStorage.setItem('msc_gyro',  settings.gyroEnabled);
    localStorage.setItem('msc_gyroS', settings.gyroSensitivity);
    localStorage.setItem('msc_lookS', settings.lookSensitivity);
}

// ── Audio ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const Sound = {
    play(freq, type, duration, vol) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const scaledVol = vol * (settings.masterVolume / 100);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(scaledVol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    },
    shoot()   { this.play(400,  'square',   0.1,  0.05); },
    explode() { this.play(60,   'sawtooth', 0.5,  0.12); },
    pickup()  { this.play(900,  'sine',     0.2,  0.1);  },
    reload()  { this.play(250,  'triangle', 0.2,  0.04); },
    wave()    { this.play(600,  'sine',     0.6,  0.08); },
    hit()     { this.play(150,  'sawtooth', 0.15, 0.08); },
    boost()   { this.play(1200, 'sine',     0.3,  0.06); }
};
