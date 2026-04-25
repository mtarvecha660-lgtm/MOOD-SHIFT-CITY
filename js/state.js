// ── js/state.js ──
// Shared game state and constants. All other modules read/write these globals.

// Three.js objects
let scene, camera, renderer, player;

// Entity arrays
let enemies = [], bullets = [], buildings = [], drops = [], particles = [];

// Player stats
let hp = 100, score = 0, keys = {}, gameRunning = false;
let yaw = 0, pitch = 0, lastShotTime = 0, shakeAmount = 0;
let isMobile = false;

// Weapon
let ammo = 12, maxClip = 12, reserve = 48, isReloading = false;

// Wave system
let wave = 0, enemiesToSpawn = 0, isWaveTransition = false;

// Constants
const MAX_PARTICLES  = 100;
const PARTICLE_SIZE  = 0.25;
const SHOOT_COOLDOWN = 150;

// ── Audio ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const Sound = {
    play(freq, type, duration, vol) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    },
    shoot()   { this.play(400, 'square',   0.1, 0.05); },
    explode() { this.play(60,  'sawtooth', 0.5, 0.12); },
    pickup()  { this.play(900, 'sine',     0.2, 0.1);  },
    reload()  { this.play(250, 'triangle', 0.2, 0.04); }
};
