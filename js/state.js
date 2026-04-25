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

// Currency & Meta
let currency = 0;
let permanentUpgrades = {
    speed:   parseInt(localStorage.getItem('upg_speed')   || '0'),
    maxHp:   parseInt(localStorage.getItem('upg_maxHp')   || '0'),
    clipSize:parseInt(localStorage.getItem('upg_clipSize') || '0'),
};
let maxHp = 100 + permanentUpgrades.maxHp * 25;

// Weapon system
let currentWeapon = 'pistol'; // 'pistol' | 'shotgun' | 'railgun'
const WEAPONS = {
    pistol:  { maxClip:12,  damage:50,  cooldown:150,  spread:0,    bullets:1, color:0x00ffff, sound:'shoot'  },
    shotgun: { maxClip:6,   damage:35,  cooldown:600,  spread:0.12, bullets:5, color:0xff8800, sound:'shotgun'},
    railgun: { maxClip:4,   damage:200, cooldown:1200, spread:0,    bullets:1, color:0xff00ff, sound:'railgun', hitscan:true },
};
let maxClip  = 12 + permanentUpgrades.clipSize * 4;
let ammo     = maxClip;
let reserve  = 48;
let isReloading = false;

// Slow motion
let timeScale      = 1.0;
let lastSlowMoTime = -99999;
const SLOWMO_DURATION = 3000;
const SLOWMO_COOLDOWN = 10000;

// Crosshair hit flash
let crosshairHit     = false;
let crosshairHitTime = 0;

// Wave system
let wave = 0, enemiesToSpawn = 0, isWaveTransition = false;

// Achievement tracking
let killStreak = 0, totalKills = 0;
let achievements = JSON.parse(localStorage.getItem('achievements') || '{}');

// Constants
const MAX_PARTICLES  = 200;
const PARTICLE_SIZE  = 0.25;
const SHOOT_COOLDOWN = 150;

// Star mesh for skybox
let starMesh = null;

// ── Audio ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const Sound = {
    play(freq, type, duration, vol, freqEnd) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    },
    shoot()      { this.play(400, 'square',   0.1,  0.05); },
    shotgun()    { this.play(200, 'sawtooth', 0.15, 0.08); this.play(350, 'square', 0.1, 0.04); },
    railgun()    { this.play(800, 'sine', 0.05, 0.1); this.play(1400, 'sine', 0.35, 0.07, 200); },
    explode()    { this.play(60,  'sawtooth', 0.5,  0.12); },
    bigExplode() { this.play(40, 'sawtooth', 0.8, 0.2); this.play(80, 'square', 0.5, 0.1); },
    pickup()     { this.play(900, 'sine',     0.2,  0.1);  },
    reload()     { this.play(250, 'triangle', 0.2,  0.04); },
    slowMoIn()   { this.play(300, 'sine', 0.5, 0.06, 100); },
    achievement(){ this.play(600,'sine',0.1,0.08); setTimeout(()=>this.play(900,'sine',0.25,0.1),120); },
    enemyShoot() { this.play(180, 'square', 0.08, 0.03); },
};

// ── Voice Cues ──
const VoiceCues = {
    _q: [],
    _busy: false,
    say(text) {
        if (!window.speechSynthesis) return;
        this._q.push(text);
        if (!this._busy) this._next();
    },
    _next() {
        if (!this._q.length) { this._busy = false; return; }
        this._busy = true;
        const u = new SpeechSynthesisUtterance(this._q.shift());
        u.rate = 0.85; u.pitch = 0.55; u.volume = 0.55;
        const voices = speechSynthesis.getVoices();
        const pref = voices.find(v => /david|uk english male/i.test(v.name));
        if (pref) u.voice = pref;
        u.onend = () => this._next();
        speechSynthesis.speak(u);
    },
    signalFound()    { this.say('Signal found.'); },
    ammoLow()        { this.say('Ammunition low.'); },
    ammoDepleted()   { this.say('Ammunition depleted.'); },
    reloading()      { this.say('Reloading.'); },
    weaponPickup(w)  { this.say(`${w} acquired.`); },
    waveStart(n)     { this.say(`Wave ${n}. Engage.`); },
    slowMo()         { this.say('Mood shift activated.'); },
    achievement(name){ this.say(`Achievement: ${name}`); },
};

// ── Procedural Music ──
const Music = {
    _running: false,
    start() { if (!this._running) { this._running = true; this._tick(); } },
    stop()   { this._running = false; },
    _tick() {
        if (!this._running || !gameRunning) { this._running = false; return; }
        if (audioCtx.state === 'suspended') { setTimeout(() => this._tick(), 500); return; }
        const tension = Math.min(1.0, (enemies.length + enemiesToSpawn) / 10);
        const baseFreq = 55 + tension * 45;
        const osc = audioCtx.createOscillator();
        const g   = audioCtx.createGain();
        osc.type  = tension > 0.6 ? 'sawtooth' : 'sine';
        osc.frequency.value = baseFreq;
        const vol = (0.01 + tension * 0.035) * timeScale;
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.45);
        const interval = Math.max(150, 650 - tension * 500);
        setTimeout(() => this._tick(), interval);
    }
};