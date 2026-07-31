// ── js/game.js ──
// World setup, game loop, enemies, bullets, particles, drops, waves, HUD.

// ── Character definitions ──
const CHARS = {
    striker:  { speed: 0.20, maxHp: 100, cooldown: 150, dmg: 50, clip: 12, reserve: 48, burst: 1 },
    enforcer: { speed: 0.13, maxHp: 160, cooldown: 280, dmg: 40, clip:  8, reserve: 32, burst: 3 },
    phantom:  { speed: 0.28, maxHp:  70, cooldown:  85, dmg: 28, clip: 20, reserve: 72, burst: 1 },
    medic:    { speed: 0.17, maxHp: 110, cooldown: 200, dmg: 35, clip: 10, reserve: 40, burst: 1 }
};

// ── CODEX data ──
const CODEX_DATA = {
    operatives: [
        {
            id: 'striker', color: 0x00ffff, hex: '#00ffff', modelSize: [1.0, 1.8, 1.0],
            name: 'STRIKER', tag: 'BALANCED OPERATIVE',
            desc: 'Precision operative with reliable output in all combat situations. Adaptable to any engagement range.',
            stats: [
                { label: 'SPD',  val: 7, color: '#00ffff' },
                { label: 'HP',   val: 6, color: '#ff4466' },
                { label: 'DMG',  val: 7, color: '#ff8800' },
                { label: 'RATE', val: 7, color: '#ffff00' }
            ],
            perks: ['Single precision shot', 'Standard loadout', '12-round clip · 48 reserve']
        },
        {
            id: 'enforcer', color: 0xaa00ff, hex: '#aa00ff', modelSize: [1.4, 2.5, 1.4],
            name: 'ENFORCER', tag: 'HEAVY SPECIALIST',
            desc: 'Built for sustained engagements. Shotgun burst devastates clustered targets at close range.',
            stats: [
                { label: 'SPD',  val: 4, color: '#00ffff' },
                { label: 'HP',   val: 9, color: '#ff4466' },
                { label: 'DMG',  val: 8, color: '#ff8800' },
                { label: 'RATE', val: 4, color: '#ffff00' }
            ],
            perks: ['3-round shotgun burst per trigger', '160 HP armor plating', '8 shots per clip · 32 reserve']
        },
        {
            id: 'phantom', color: 0xffff00, hex: '#ffff00', modelSize: [0.9, 1.6, 0.9],
            name: 'PHANTOM', tag: 'GHOST OPERATIVE',
            desc: 'Speed is the only armor. Extreme mobility and rapid fire let the Phantom dictate every engagement.',
            stats: [
                { label: 'SPD',  val: 9, color: '#00ffff' },
                { label: 'HP',   val: 4, color: '#ff4466' },
                { label: 'DMG',  val: 4, color: '#ff8800' },
                { label: 'RATE', val: 9, color: '#ffff00' }
            ],
            perks: ['Ultra-fast movement', '85ms fire cooldown', '20-round clip · 72 reserve']
        },
        {
            id: 'medic', color: 0x00ff88, hex: '#00ff88', modelSize: [1.0, 1.8, 1.0],
            name: 'MEDIC', tag: 'SUPPORT OPERATIVE',
            desc: 'Passive regeneration and enhanced field supplies keep the Medic alive far longer than raw stats suggest.',
            stats: [
                { label: 'SPD',  val: 6, color: '#00ffff' },
                { label: 'HP',   val: 7, color: '#ff4466' },
                { label: 'DMG',  val: 5, color: '#ff8800' },
                { label: 'RATE', val: 6, color: '#ffff00' }
            ],
            perks: ['Passive +0.5 HP/sec regeneration', 'HP drops restore 50 instead of 25', '10-round clip · 40 reserve']
        }
    ],
    drops: [
        {
            id: 'hp', color: 0xff3040, hex: '#ff3040', modelShape: 'sphere', modelSize: 0.55,
            name: 'HP PACK', tag: 'INSTANT HEAL',
            desc: 'Restores 25 HP on contact (50 for Medic). Highest priority when your health is critical.',
            stats: [
                { label: 'HEAL',   val: 7,  color: '#ff4466' },
                { label: 'RARITY', val: 6,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 10, color: '#ff8800' }
            ],
            perks: ['Instant +25 HP on pickup', 'Medic operative gets +50 HP', 'Always collect when below 50% HP']
        },
        {
            id: 'ammo', color: 0x00ffff, hex: '#00ffff', modelShape: 'sphere', modelSize: 0.5,
            name: 'AMMO CRATE', tag: 'RESERVE REFILL',
            desc: 'Refills your reserve ammunition. Smart drop guarantees supply when critically low.',
            stats: [
                { label: 'FILL',   val: 9,  color: '#00ffff' },
                { label: 'RARITY', val: 7,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 10, color: '#ff8800' }
            ],
            perks: ['Refills full reserve ammo', 'Smart system guarantees supply', 'Cyan glow — easy to spot']
        },
        {
            id: 'speed', color: 0xff00ff, hex: '#ff00ff', modelShape: 'sphere', modelSize: 0.45,
            name: 'SPEED+', tag: '6s MOVEMENT BOOST',
            desc: 'Dramatically increases movement speed for 6 seconds.',
            stats: [
                { label: 'POWER',  val: 7,  color: '#ff00ff' },
                { label: 'RARITY', val: 5,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 6,  color: '#ff8800' }
            ],
            perks: ['+40% movement speed', '6 second active duration', 'Magenta screen tint while active']
        },
        {
            id: 'shield', color: 0x0088ff, hex: '#0088ff', modelShape: 'sphere', modelSize: 0.55,
            name: 'SHIELD', tag: '4s DAMAGE BLOCK',
            desc: 'Absorbs all incoming damage for 4 seconds. Rarest standard drop.',
            stats: [
                { label: 'POWER',  val: 10, color: '#0088ff' },
                { label: 'RARITY', val: 3,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 4,  color: '#ff8800' }
            ],
            perks: ['Blocks all damage for 4 seconds', 'Rarest drop in the field', 'Blue aura while shield is active']
        },
        {
            id: 'rapid', color: 0xff8800, hex: '#ff8800', modelShape: 'sphere', modelSize: 0.48,
            name: 'RAPID+', tag: '6s FIRE RATE BOOST',
            desc: 'Massively increases your fire rate for 6 seconds.',
            stats: [
                { label: 'POWER',  val: 9,  color: '#ff8800' },
                { label: 'RARITY', val: 5,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 6,  color: '#ff8800' }
            ],
            perks: ['Fire rate multiplied for 6 seconds', 'Stacks with Phantom operative', 'Orange aura while active']
        },
        {
            id: 'overclock', color: 0xffffff, hex: '#ffffff', modelShape: 'sphere', modelSize: 0.48,
            name: 'OVERCLOCK', tag: '5s DAMAGE BOOST',
            desc: 'Doubles your bullet damage for 5 seconds. Melts bosses and armored waves.',
            stats: [
                { label: 'POWER',  val: 10, color: '#ffffff' },
                { label: 'RARITY', val: 3,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 5,  color: '#ff8800' }
            ],
            perks: ['Bullet damage ×2 for 5 seconds', 'Devastating against boss waves', 'White glow — rare and powerful']
        },
        {
            id: 'secondary', color: 0xffdd00, hex: '#ffdd00', modelShape: 'sphere', modelSize: 0.5,
            name: 'ROCKET', tag: 'SECONDARY WEAPON',
            desc: 'A 3-shot rocket launcher. Press F to fire. Explodes on impact with massive AOE damage.',
            stats: [
                { label: 'POWER',  val: 10, color: '#ffdd00' },
                { label: 'RARITY', val: 2,  color: '#ffff00' },
                { label: 'RANGE',  val: 7,  color: '#00ffff' },
                { label: 'TIMING', val: 3,  color: '#ff8800' }
            ],
            perks: ['3 rockets per pickup', '100 AOE damage on explosion', 'Press F / dedicated button to fire']
        }
    ],
    threats: [
        {
            id: 'runner', color: 0xff0040, hex: '#ff0040', modelSize: [1.0, 1.8, 1.0],
            name: 'RUNNER', tag: 'MELEE ATTACKER',
            desc: 'Charges directly at targets with no hesitation. High speed, low survivability.',
            stats: [
                { label: 'SPD',  val: 7,  color: '#00ffff' },
                { label: 'HP',   val: 4,  color: '#ff4466' },
                { label: 'DMG',  val: 6,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['High-speed charge', 'Strafe evasion behavior', 'Weak to burst fire']
        },
        {
            id: 'scout', color: 0xffff00, hex: '#ffff00', modelSize: [0.7, 1.2, 0.7],
            name: 'SCOUT', tag: 'SPEED THREAT',
            desc: 'The fastest unit on the field. Eliminate in 1–2 hits before it reaches melee range.',
            stats: [
                { label: 'SPD',  val: 10, color: '#00ffff' },
                { label: 'HP',   val: 1,  color: '#ff4466' },
                { label: 'DMG',  val: 4,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['Extreme movement speed', 'Fragile (40 HP)', 'Melee-only threat']
        },
        {
            id: 'tank', color: 0xaa00ff, hex: '#aa00ff', modelSize: [2.0, 3.6, 2.0],
            name: 'TANK', tag: 'ARMORED UNIT',
            desc: 'Heavily armored behemoth. Absorbs sustained fire and delivers devastating melee damage.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 10, color: '#ff4466' },
                { label: 'DMG',  val: 8,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['400 HP total armor', 'Slow movement speed', 'High melee damage output']
        },
        {
            id: 'sniper', color: 0x00ff66, hex: '#00ff66', modelSize: [0.9, 1.6, 0.9],
            name: 'SNIPER', tag: 'RANGED THREAT',
            desc: 'Maintains preferred distance and fires precise projectiles with line-of-sight checks.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 4,  color: '#ff4466' },
                { label: 'DMG',  val: 7,  color: '#ff8800' },
                { label: 'RNG',  val: 9,  color: '#aa00ff' }
            ],
            perks: ['60-unit fire range', 'LOS-verified shots', 'Bullets blocked by other enemies']
        },
        {
            id: 'bomber', color: 0xff6600, hex: '#ff6600', modelSize: [1.3, 1.8, 1.3],
            name: 'BOMBER', tag: 'SUICIDE THREAT',
            desc: 'Slow walker that explodes on contact. Eliminate at range — never let it get close.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 3,  color: '#ff4466' },
                { label: 'DMG',  val: 9,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['Explodes on contact for 60 damage', 'Pulses orange warning when close', 'Prioritise before it reaches you']
        },
        {
            id: 'overlord', color: 0xff4400, hex: '#ff4400', modelSize: [4.0, 7.2, 4.0],
            name: 'OVERLORD', tag: 'BOSS UNIT',
            desc: 'Elite command unit deployed every 5 waves. Three phases — each more lethal than the last.',
            stats: [
                { label: 'SPD',  val: 5,  color: '#00ffff' },
                { label: 'HP',   val: 10, color: '#ff4466' },
                { label: 'DMG',  val: 9,  color: '#ff8800' },
                { label: 'RNG',  val: 5,  color: '#aa00ff' }
            ],
            perks: ['Three escalating combat phases', 'Phase 3: full berserk charge', 'Drops guaranteed loot on death']
        }
    ]
};

// ── CODEX preview renderer ──
let previewRenderer = null, previewScene = null, previewCamera = null;
let previewMesh = null, previewLight = null, previewAnimId = null;

function initPreviewRenderer() {
    if (previewRenderer) return;
    const canvas = document.getElementById('preview-canvas');
    previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    previewRenderer.setSize(220, 220);
    previewRenderer.setClearColor(0x000000, 0);
    previewScene  = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    previewLight = new THREE.PointLight(0x00ffff, 4, 40);
    previewLight.position.set(3, 6, 4);
    previewScene.add(previewLight);
    const fill = new THREE.PointLight(0xffffff, 1.2, 40);
    fill.position.set(-4, 1, -3);
    previewScene.add(fill);
    const grid = new THREE.GridHelper(10, 10, 0x111111, 0x0a0a0a);
    previewScene.add(grid);
}

function clearPreviewMesh() {
    if (previewMesh) {
        previewScene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh.material.dispose();
        previewMesh = null;
    }
}

function setPreviewMesh(color, w, h, d) {
    clearPreviewMesh();
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35,
        roughness: 0.55, metalness: 0.5
    });
    previewMesh = new THREE.Mesh(geo, mat);
    previewMesh.position.y = h / 2;
    previewMesh.userData.baseY = h / 2;
    const edges = new THREE.EdgesGeometry(geo);
    const line  = new THREE.LineSegments(edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
    );
    previewMesh.add(line);
    previewScene.add(previewMesh);
    if (previewLight) previewLight.color.setHex(color);
    const dist = Math.max(h, w) * 2.4 + 1.5;
    previewCamera.position.set(0, h * 0.55, dist);
    previewCamera.lookAt(0, h * 0.3, 0);
}

function setPreviewSphere(color, radius) {
    clearPreviewMesh();
    const geo = new THREE.OctahedronGeometry(radius);
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6,
        roughness: 0.25, metalness: 0.7
    });
    previewMesh = new THREE.Mesh(geo, mat);
    previewMesh.position.y = radius + 0.4;
    previewMesh.userData.baseY = radius + 0.4;
    const edges = new THREE.EdgesGeometry(geo);
    const line  = new THREE.LineSegments(edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
    );
    previewMesh.add(line);
    previewScene.add(previewMesh);
    if (previewLight) previewLight.color.setHex(color);
    previewCamera.position.set(0, radius * 2.5, radius * 6);
    previewCamera.lookAt(0, radius + 0.4, 0);
}

function animatePreview() {
    previewAnimId = requestAnimationFrame(animatePreview);
    if (previewMesh) {
        previewMesh.rotation.y += 0.012;
        previewMesh.position.y = (previewMesh.userData.baseY || 0)
            + Math.sin(Date.now() * 0.0016) * 0.06;
    }
    if (previewRenderer && previewScene && previewCamera)
        previewRenderer.render(previewScene, previewCamera);
}

// ── CODEX logic ──

function openCodex(tab) {
    document.getElementById('menu').style.display  = 'none';
    document.getElementById('codex').style.display = 'flex';
    initPreviewRenderer();
    if (!previewAnimId) animatePreview();
    switchCodexTab(tab || 'operatives');
}

function closeCodex() {
    cancelAnimationFrame(previewAnimId);
    previewAnimId = null;
    document.getElementById('codex').style.display = 'none';
    document.getElementById('menu').style.display  = 'flex';
}

function switchCodexTab(tab) {
    document.querySelectorAll('.codex-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-btn-' + tab).classList.add('active');
    const sidebar = document.getElementById('codex-sidebar');
    sidebar.innerHTML = '';
    CODEX_DATA[tab].forEach(item => {
        const div = document.createElement('div');
        div.className = 'codex-item';
        div.id = 'codex-item-' + item.id;
        if (tab === 'operatives' && item.id === selectedChar) div.classList.add('selected-operative');
        div.onclick = () => showCodexEntry(tab, item.id);
        div.innerHTML = `
            <div class="item-dot" style="background:${item.hex};box-shadow:0 0 7px ${item.hex};"></div>
            <div class="item-labels">
                <span class="item-name" style="color:${item.hex};">${item.name}</span>
                <span class="item-tag">${item.tag}</span>
            </div>
            ${tab === 'operatives' && item.id === selectedChar
                ? '<span class="item-check">&#10003;</span>' : ''}
        `;
        sidebar.appendChild(div);
    });
    showCodexEntry(tab, CODEX_DATA[tab][0].id);
}

function showCodexEntry(tab, id) {
    const item = CODEX_DATA[tab].find(i => i.id === id);
    if (!item) return;
    document.querySelectorAll('.codex-item').forEach(el => el.classList.remove('active'));
    const sideEl = document.getElementById('codex-item-' + id);
    if (sideEl) sideEl.classList.add('active');
    if (item.modelShape === 'sphere') {
        setPreviewSphere(item.color, item.modelSize);
    } else {
        setPreviewMesh(item.color, item.modelSize[0], item.modelSize[1], item.modelSize[2]);
    }
    document.getElementById('preview-label').innerText = '// ' + item.name + ' //';
    const info = document.getElementById('codex-info');
    info.classList.remove('slide-in');
    void info.offsetWidth;
    info.classList.add('slide-in');
    const isOp     = tab === 'operatives';
    const isChosen = isOp && id === selectedChar;
    info.innerHTML = `
        <div class="info-name" style="color:${item.hex};text-shadow:0 0 24px ${item.hex}55;">
            ${item.name}
        </div>
        <div class="info-tag" style="color:${item.hex};border-color:${item.hex};">${item.tag}</div>
        <div class="info-desc">${item.desc}</div>
        <div class="info-stats">
            ${item.stats.map(s => `
                <div class="info-stat-row">
                    <span class="stat-lbl">${s.label}</span>
                    <div class="stat-track">
                        <div class="stat-fill" data-val="${s.val}" style="background:${s.color};box-shadow:0 0 6px ${s.color};width:0%;"></div>
                    </div>
                    <span class="stat-num">${s.val}</span>
                </div>
            `).join('')}
        </div>
        <div class="info-perks">
            ${item.perks.map(p => `<div class="perk-item">&rsaquo; ${p}</div>`).join('')}
        </div>
        ${isOp ? `
            <button class="select-op-btn ${isChosen ? 'already-selected' : ''}"
                    onclick="pickOperative('${id}')">
                ${isChosen ? '&#10003; OPERATIVE SELECTED' : '&#9658; SELECT THIS OPERATIVE'}
            </button>
        ` : ''}
    `;
    setTimeout(() => {
        document.querySelectorAll('.stat-fill').forEach(bar => {
            bar.style.width = (parseInt(bar.dataset.val) * 10) + '%';
        });
    }, 60);
}

function pickOperative(id) {
    selectedChar = id;
    document.querySelectorAll('.codex-item').forEach(el => {
        el.classList.remove('selected-operative');
        el.querySelector('.item-check')?.remove();
    });
    const el = document.getElementById('codex-item-' + id);
    if (el) {
        el.classList.add('selected-operative');
        const check = document.createElement('span');
        check.className = 'item-check'; check.textContent = '✓';
        el.appendChild(check);
    }
    showCodexEntry('operatives', id);
    updateMenuSelectedChar();
}

function updateMenuSelectedChar() {
    const data = CODEX_DATA.operatives.find(o => o.id === selectedChar);
    const el   = document.getElementById('menu-selected-char');
    if (data && el) el.innerHTML = `<span style="color:${data.hex};">&#9658; ${data.name}</span>`;
}

// ── Difficulty mode ──

function setDifficulty(mode) {
    difficultyMode = mode;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('diff-' + mode);
    if (btn) btn.classList.add('active');
}

// ── Achievement system ──

function unlockAchievement(id) {
    if (unlockedAchievements.includes(id)) return;
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (!def) return;
    unlockedAchievements.push(id);
    localStorage.setItem('msc_achievements', JSON.stringify(unlockedAchievements));
    Sound.achievement();
    showAchievementToast(def.name, def.desc);
}

function showAchievementToast(name, desc) {
    const el = document.getElementById('achievement-toast');
    if (!el) return;
    el.innerHTML = `<span class="ach-label">// ACHIEVEMENT //</span><span class="ach-name">${name}</span><span class="ach-desc">${desc}</span>`;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3200);
}

function checkAchievements() {
    if (killCount === 1)   unlockAchievement('first_blood');
    if (killCount >= 100)  unlockAchievement('centurion');
    if (totalEnemiesKilled >= 500) unlockAchievement('executioner');
    if (runSpeedPickups >= 3)      unlockAchievement('speed_demon');
    if (comboMultiplier >= 4)      unlockAchievement('combo_master');
}

// ── Kill feed ──

function addKillFeedEntry(text, color) {
    killFeedEntries.push({ text, color, expires: Date.now() + 2500, opacity: 1 });
    if (killFeedEntries.length > 6) killFeedEntries.shift();
}

function renderKillFeed() {
    const el = document.getElementById('kill-feed');
    if (!el) return;
    const now = Date.now();
    killFeedEntries = killFeedEntries.filter(e => now < e.expires);
    el.innerHTML = killFeedEntries.map(e => {
        const age = 1 - (e.expires - now) / 2500;
        const op  = age > 0.75 ? (1 - (age - 0.75) * 4) : 1;
        return `<div class="kf-entry" style="color:${e.color};opacity:${op.toFixed(2)}">${e.text}</div>`;
    }).join('');
}

// ── World helpers ──

function isPositionInBuilding(x, z, radius) {
    for (let b of buildings) {
        if (x + radius > b.minX && x - radius < b.maxX &&
            z + radius > b.minZ && z - radius < b.maxZ) return true;
    }
    return false;
}

function checkCollision(pos, radius) {
    for (let b of buildings) {
        if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
            pos.z + radius > b.minZ && pos.z - radius < b.maxZ &&
            pos.y < b.maxY) return true;
    }
    return false;
}

// Memory-safe mesh disposal
function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            mesh.material.dispose();
        }
    }
    if (scene) scene.remove(mesh);
}

function createImpact(pos, color, count = 8) {
    for (let i = 0; i < count; i++) {
        let p = particles.find(p => !p.active);
        if (!p) break;
        p.active = true; p.mesh.visible = true; p.life = 1.0;
        p.mesh.position.copy(pos);
        p.mesh.material.color.setHex(color);
        p.velocity.set(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.2) * 0.4,
            (Math.random() - 0.5) * 0.4
        );
    }
}

// ── Scene init ──

function init() {
    // Reset entity and structure arrays to prevent leaks across runs
    buildings = [];
    particles = [];
    enemies = [];
    bullets = [];
    enemyBullets = [];
    drops = [];
    buildingLights = [];

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    scene.fog = new THREE.FogExp2(0x000011, 0.04);

    camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // WebGL Context Fix: Only initialize renderer if it does not exist
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    let sun = new THREE.DirectionalLight(0x00ffff, 0.5);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    let road = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ color: 0x080808 })
    );
    road.rotation.x = -Math.PI / 2;
    scene.add(road);

    for (let i = 0; i < 40; i++) {
        let bh = Math.random() * 20 + 10;
        let mesh = new THREE.Mesh(
            new THREE.BoxGeometry(5, bh, 5),
            new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x111111 : 0x1a1a1a })
        );
        let bx = Math.random() * 200 - 100, bz = Math.random() * 200 - 100;
        if (Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 25;
        mesh.position.set(bx, bh / 2, bz);
        scene.add(mesh);
        buildings.push({ minX: bx - 2.5, maxX: bx + 2.5, minY: 0, maxY: bh, minZ: bz - 2.5, maxZ: bz + 2.5 });
        if (Math.random() > 0.3) {
            let win = new THREE.PointLight(Math.random() > 0.5 ? 0xff0040 : 0x00ffff, 1, 15);
            win.position.set(bx, bh * 0.8, bz);
            win.userData.baseIntensity = 0.6 + Math.random() * 0.8;
            win.userData.phase = Math.random() * Math.PI * 2;
            scene.add(win);
            buildingLights.push(win);
        }
    }

    const pGeo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        pMesh.visible = false;
        scene.add(pMesh);
        particles.push({ mesh: pMesh, velocity: new THREE.Vector3(), active: false, life: 0 });
    }

    player = new THREE.Object3D();
    player.position.set(0, 1.8, 0);
    scene.add(player);

    setupControls();

    const mm = document.getElementById('minimap');
    if (mm) { mm.width = 150; mm.height = 150; }
}

// ── Weapons ──

function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;
    const now = performance.now();
    const cd  = (boosts.rapid && Date.now() < boosts.rapid) ? shootCooldown * 0.4 : shootCooldown;
    if (now - lastShotTime < cd) return;
    ammo--; lastShotTime = now; Sound.shoot(); shakeAmount = 0.12;
    muzzleFlashAmount = 1.0;
    shotsFired++;
    if (ammo === 0 && !isReloading && reserve > 0) setTimeout(reload, 220);

    const activeDmg = (boosts.overclock && Date.now() < boosts.overclock) ? bulletDmg * 2 : bulletDmg;
    const spreads = burstCount === 3 ? [-0.22, 0, 0.22] : [0];
    for (let s of spreads) {
        let bullet = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: (boosts.overclock && Date.now() < boosts.overclock) ? 0xffffff : 0x00ffff })
        );
        bullet.position.copy(player.position);
        let dir = new THREE.Vector3(
            -Math.sin(yaw + s) * Math.cos(pitch),
             Math.sin(pitch),
            -Math.cos(yaw + s) * Math.cos(pitch)
        ).normalize();
        bullets.push({ mesh: bullet, dir, dist: 0, dmg: activeDmg });
        scene.add(bullet);
    }
}

function fireSecondary() {
    if (!gameRunning || !hasSecondaryWeapon || secondaryAmmo <= 0) return;
    secondaryAmmo--;
    if (secondaryAmmo <= 0) hasSecondaryWeapon = false;
    Sound.secondary();
    shakeAmount = 0.35;
    muzzleFlashAmount = 1.5;
    shotsFired++;

    const rocketMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    rocketMesh.position.copy(player.position);
    const dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
    bullets.push({ mesh: rocketMesh, dir, dist: 0, dmg: 100, isRocket: true, aoeRadius: 6 });
    scene.add(rocketMesh);
}

function rocketExplode(pos) {
    createImpact(pos, 0xff4400, 40);
    shakeAmount = 0.5;
    const aoeR = 6;
    for (let e of enemies) {
        if (pos.distanceTo(e.mesh.position) < aoeR) {
            e.hp -= 100;
            e.hitFlash = 1.0;
            shotsHit++;
        }
    }
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip) return;
    isReloading = true; Sound.reload();
    const statusEl = document.getElementById('wave-status');
    if (statusEl) statusEl.innerText = 'RELOADING...';
    setTimeout(() => {
        let needed = maxClip - ammo, transfer = Math.min(needed, reserve);
        ammo += transfer; reserve -= transfer;
        isReloading = false;
        if (!isWaveTransition && statusEl) statusEl.innerText = 'WAVE ' + wave;
    }, 1000);
}

// ── Powerups ──

function applyPowerup(type) {
    Sound.boost();
    const durations = { speed: 6000, shield: 4000, rapid: 6000, overclock: 5000 };
    boosts[type] = Date.now() + (durations[type] || 5000);
    const el = document.getElementById('boost-' + type);
    if (el) el.style.display = 'inline-block';
    const colors = { speed: '255,0,255', shield: '0,136,255', rapid: '255,136,0', overclock: '255,255,255' };
    const col = colors[type] || '255,255,255';
    const dmgEl = document.getElementById('damage-overlay'); 