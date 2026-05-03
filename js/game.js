// ── js/game.js ──
// World setup, game loop, enemies, bullets, particles, drops, waves, HUD.

// ── Character definitions ──
const CHARS = {
    striker:  { speed: 0.20, maxHp: 100, cooldown: 150, dmg: 50, clip: 12, reserve: 48,  burst: 1 },
    enforcer: { speed: 0.13, maxHp: 160, cooldown: 280, dmg: 40, clip:  8, reserve: 32,  burst: 3 },
    phantom:  { speed: 0.28, maxHp:  70, cooldown:  85, dmg: 28, clip: 20, reserve: 72,  burst: 1 }
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
        }
    ],
    drops: [
        {
            id: 'hp', color: 0xff3040, hex: '#ff3040', modelShape: 'sphere', modelSize: 0.55,
            name: 'HP PACK', tag: 'INSTANT HEAL',
            desc: 'Restores 40 HP on contact. Highest priority pickup when your health is critical — never pass one up below 50%.',
            stats: [
                { label: 'HEAL',   val: 7,  color: '#ff4466' },
                { label: 'RARITY', val: 6,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 10, color: '#ff8800' }
            ],
            perks: ['Instant +40 HP on pickup', 'Glows red — highly visible', 'Always collect when below 50% HP']
        },
        {
            id: 'ammo', color: 0x00ffff, hex: '#00ffff', modelShape: 'sphere', modelSize: 0.5,
            name: 'AMMO CRATE', tag: 'RESERVE REFILL',
            desc: 'Refills your reserve ammunition. The smart drop system guarantees an ammo drop when you run critically low — you will never be left dry.',
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
            desc: 'Dramatically increases movement speed for 6 seconds. Ideal for repositioning, chasing down drops, or escaping a surrounded situation.',
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
            desc: 'Absorbs all incoming damage for 4 seconds. The rarest drop — use it strategically when surrounded or facing a Tank.',
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
            desc: 'Massively increases your fire rate for 6 seconds. Devastating when combined with the Phantom operative or during a high-density wave.',
            stats: [
                { label: 'POWER',  val: 9,  color: '#ff8800' },
                { label: 'RARITY', val: 5,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 6,  color: '#ff8800' }
            ],
            perks: ['Fire rate multiplied for 6 seconds', 'Stacks well with Phantom operative', 'Orange aura while active']
        }
    ],
    threats: [
        {
            id: 'runner', color: 0xff0040, hex: '#ff0040', modelSize: [1.0, 1.8, 1.0],
            name: 'RUNNER', tag: 'MELEE ATTACKER',
            desc: 'Charges directly at targets with no hesitation. High speed closing capability, low survivability.',
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
            desc: 'The fastest unit on the field. Glass cannon — eliminate in 1–2 hits before it reaches melee range.',
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
            desc: 'Heavily armored behemoth. Absorbs sustained fire and delivers devastating melee damage at close range.',
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
            desc: 'Maintains preferred distance and fires precise projectiles. Performs line-of-sight check before every shot.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 4,  color: '#ff4466' },
                { label: 'DMG',  val: 7,  color: '#ff8800' },
                { label: 'RNG',  val: 9,  color: '#aa00ff' }
            ],
            perks: ['60-unit fire range', 'LOS-verified shots', 'Bullets blocked by other enemies']
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

    // Floor grid
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

    const isOp      = tab === 'operatives';
    const isChosen  = isOp && id === selectedChar;

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
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    scene.fog = new THREE.FogExp2(0x000011, 0.04);

    camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

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
            scene.add(win);
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
    mm.width = 150; mm.height = 150;
}

// ── Weapons ──

function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;
    const now = performance.now();
    const cd  = (boosts.rapid && Date.now() < boosts.rapid) ? shootCooldown * 0.4 : shootCooldown;
    if (now - lastShotTime < cd) return;
    ammo--; lastShotTime = now; Sound.shoot(); shakeAmount = 0.12;
    muzzleFlashAmount = 1.0;

    const spreads = burstCount === 3 ? [-0.22, 0, 0.22] : [0];
    for (let s of spreads) {
        let bullet = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x00ffff })
        );
        bullet.position.copy(player.position);
        let dir = new THREE.Vector3(
            -Math.sin(yaw + s) * Math.cos(pitch),
             Math.sin(pitch),
            -Math.cos(yaw + s) * Math.cos(pitch)
        ).normalize();
        bullets.push({ mesh: bullet, dir, dist: 0 });
        scene.add(bullet);
    }
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip) return;
    isReloading = true; Sound.reload();
    document.getElementById('wave-status').innerText = 'RELOADING...';
    setTimeout(() => {
        let needed = maxClip - ammo, transfer = Math.min(needed, reserve);
        ammo += transfer; reserve -= transfer;
        isReloading = false;
        if (!isWaveTransition) document.getElementById('wave-status').innerText = 'WAVE ' + wave;
    }, 1000);
}

// ── Powerups ──

function applyPowerup(type) {
    Sound.boost();
    const durations = { speed: 6000, shield: 4000, rapid: 6000 };
    boosts[type] = Date.now() + durations[type];
    const el = document.getElementById('boost-' + type);
    if (el) el.style.display = 'inline-block';
    const colors = { speed: '255,0,255', shield: '0,136,255', rapid: '255,136,0' };
    const dmgEl = document.getElementById('damage-overlay');
    dmgEl.style.boxShadow = `inset 0 0 120px 60px rgba(${colors[type]},0.5)`;
    damageFlashAmount = 0.4;
    setTimeout(() => { dmgEl.style.boxShadow = 'inset 0 0 120px 60px rgba(255,0,40,0.85)'; }, 300);
}

// ── Waves ──

function showWaveBonus(num, bonus) {
    const el = document.getElementById('wave-bonus');
    el.innerText = 'WAVE ' + num + ' CLEARED  +' + bonus;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

function startWave(num) {
    if (tutorialMode) return;
    if (num > 1) { score += (num - 1) * 100; showWaveBonus(num - 1, (num - 1) * 100); Sound.wave(); }
    wave = num; enemiesToSpawn = 5 + (num * 2); isWaveTransition = true;
    document.getElementById('wave-status').innerText = 'SIGNAL STABILIZING...';
    setTimeout(() => {
        if (!gameRunning) return;
        isWaveTransition = false;
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;
        let spawner = setInterval(() => {
            if (enemiesToSpawn > 0 && gameRunning) { spawnEnemy(); enemiesToSpawn--; }
            else clearInterval(spawner);
        }, 800);
    }, 1500);
}

function spawnEnemy() {
    let ex, ez, attempts = 0;
    let typeRoll = Math.random();

    let type = { color: 0xff0040, hp: 100, speed: 0.08, size: 1.2, behavior: 'normal', shootInterval: 0 };
    if (typeRoll > 0.85) type = { color: 0xaa00ff, hp: 400, speed: 0.05, size: 2.2, behavior: 'normal', shootInterval: 0 };
    if (typeRoll < 0.15) type = { color: 0xffff00, hp: 40,  speed: 0.18, size: 0.8, behavior: 'normal', shootInterval: 0 };
    if (typeRoll >= 0.15 && typeRoll < 0.28) type = {
        color: 0x00ff66, hp: 80, speed: 0.04, size: 1.0, behavior: 'sniper',
        shootInterval: 1800, bulletSpeed: 0.9, bulletDamage: 15, bulletRange: 60, preferredDist: 30
    };

    // Find a clear spawn position — retry until outside all buildings
    do {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 30 + Math.random() * 25;
        ex = player.position.x + Math.cos(angle) * dist;
        ez = player.position.z + Math.sin(angle) * dist;
        attempts++;
    } while (isPositionInBuilding(ex, ez, type.size / 2 + 0.5) && attempts < 15);

    let mesh = new THREE.Mesh(
        new THREE.BoxGeometry(type.size, type.size * 1.8, type.size),
        new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 })
    );
    mesh.position.set(ex, type.size * 0.9, ez);
    scene.add(mesh);
    enemies.push({
        mesh, hp: type.hp, speed: type.speed, size: type.size, behavior: type.behavior,
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        nextStrafeChange: Date.now() + 1500,
        shootInterval:  type.shootInterval  || 0,
        bulletSpeed:    type.bulletSpeed    || 0,
        bulletDamage:   type.bulletDamage   || 0,
        bulletRange:    type.bulletRange    || 0,
        preferredDist:  type.preferredDist  || 0,
        lastEnemyShot:  Date.now() + Math.random() * 2000
    });
}

// ── Drops ──

function spawnDrop(pos) {
    if (Math.random() < 0.25) {
        const pTypes  = ['speed', 'shield', 'rapid'];
        const pColors = { speed: 0xff00ff, shield: 0x0088ff, rapid: 0xff8800 };
        const dType   = pTypes[Math.floor(Math.random() * pTypes.length)];
        const col     = pColors[dType];
        let dMesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.7),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
        );
        dMesh.position.set(pos.x, 0.8, pos.z);
        scene.add(dMesh);
        drops.push({ mesh: dMesh, type: 'powerup', powerup: dType });
        return;
    }
    // Smart ammo drop: if player is critically low AND no ammo drop already on the ground,
    // guarantee an ammo drop regardless of HP state.
    const ammoOnGround   = drops.filter(d => d.type === 'ammo').length;
    const totalAmmo      = ammo + reserve;
    const desperateAmmo  = totalAmmo <= maxClip && ammoOnGround === 0;

    let isH;
    if (desperateAmmo) {
        isH = false; // force ammo drop
    } else if (hp < 50) {
        isH = Math.random() > 0.3; // prefer HP when hurt
    } else {
        isH = Math.random() > 0.7; // slight HP bias normally
    }
    let col  = isH ? 0xff0000 : 0x00ffff;
    let dMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
    );
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);
    drops.push({ mesh: dMesh, type: isH ? 'hp' : 'ammo' });
}

// ── Minimap ──

function drawMinimap() {
    const mm  = document.getElementById('minimap');
    const ctx = mm.getContext('2d');
    const W = mm.width, H = mm.height, cx = W / 2, cy = H / 2, scale = 1.5;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, cx, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#2a2a3a';
    for (let b of buildings) {
        let bx = cx + (b.minX + 2.5 - player.position.x) * scale;
        let by = cy + (b.minZ + 2.5 - player.position.z) * scale;
        let bw = (b.maxX - b.minX) * scale, bh = (b.maxZ - b.minZ) * scale;
        ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    }

    const pCol = { speed: '#ff00ff', shield: '#0088ff', rapid: '#ff8800' };
    for (let d of drops) {
        let dx = cx + (d.mesh.position.x - player.position.x) * scale;
        let dy = cy + (d.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = d.type === 'hp' ? '#ff4444' : d.type === 'ammo' ? '#00ffff' : (pCol[d.powerup] || '#fff');
        ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#ff8800';
    for (let eb of enemyBullets) {
        let ex = cx + (eb.mesh.position.x - player.position.x) * scale;
        let ey = cy + (eb.mesh.position.z - player.position.z) * scale;
        ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    }

    for (let e of enemies) {
        let ex = cx + (e.mesh.position.x - player.position.x) * scale;
        let ey = cy + (e.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = '#' + e.mesh.material.color.getHexString();
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
    }

    if (boosts.shield && Date.now() < boosts.shield) {
        ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-yaw);
    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2); ctx.stroke();
}

// ── HUD ──

function updateUI() {
    document.getElementById('hp-val').innerText      = Math.max(0, Math.ceil(hp));
    document.getElementById('ammo-val').innerText    = ammo;
    document.getElementById('reserve-val').innerText = reserve;
    document.getElementById('score-val').innerText   = score;
    document.getElementById('enemies-left').innerText = enemies.length + enemiesToSpawn;
    document.getElementById('reload-msg').style.display = (ammo <= 3 && reserve > 0) ? 'block' : 'none';

    const dmgEl = document.getElementById('damage-overlay');
    dmgEl.style.opacity = damageFlashAmount;
    if (damageFlashAmount > 0) damageFlashAmount = Math.max(0, damageFlashAmount - 0.04);

    const mfEl = document.getElementById('muzzle-flash');
    mfEl.style.opacity = muzzleFlashAmount;
    if (muzzleFlashAmount > 0) muzzleFlashAmount = Math.max(0, muzzleFlashAmount - 0.18);

    const now = Date.now();
    ['speed', 'shield', 'rapid'].forEach(b => {
        const el = document.getElementById('boost-' + b);
        if (el) el.style.display = (boosts[b] && now < boosts[b]) ? 'inline-block' : 'none';
    });
}

// ── Game loop ──

function animate() {
    if (!gameRunning) return;
    if (gamePaused) return;
    if (hp <= 0) {
        gameRunning = false;
        if (score > highScore) { highScore = score; localStorage.setItem('msc_highscore', highScore); }
        document.getElementById('gameover').style.display  = 'flex';
        document.getElementById('final-score').innerText   = score;
        document.getElementById('final-hs').innerText      = highScore;
        return;
    }
    requestAnimationFrame(animate);

    const shielded = boosts.shield && Date.now() < boosts.shield;
    const sp       = (boosts.speed  && Date.now() < boosts.speed)  ? playerSpeed * 1.8 : playerSpeed;

    let pSize = 0.7;
    let fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let rt = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
    let mX = 0, mZ = 0;
    if (!isMobile) {
        if (keys['w']) { mX += fw.x * sp; mZ += fw.z * sp; }
        if (keys['s']) { mX -= fw.x * sp; mZ -= fw.z * sp; }
        if (keys['a']) { mX -= rt.x * sp; mZ -= rt.z * sp; }
        if (keys['d']) { mX += rt.x * sp; mZ += rt.z * sp; }
    } else if (joystick.active) {
        mX = (fw.x * -joystick.y + rt.x * joystick.x) * sp;
        mZ = (fw.z * -joystick.y + rt.z * joystick.x) * sp;
    }
    player.position.x += mX; if (checkCollision(player.position, pSize)) player.position.x -= mX;
    player.position.z += mZ; if (checkCollision(player.position, pSize)) player.position.z -= mZ;

    camera.position.copy(player.position);
    if (shakeAmount > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
        shakeAmount *= 0.88;
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // Player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        let nextPos = b.mesh.position.clone().add(b.dir.clone().multiplyScalar(2.0));
        if (checkCollision(nextPos, 0.2) || b.dist > 150) {
            if (b.dist <= 150) createImpact(nextPos, 0x00ffff, 6);
            scene.remove(b.mesh); bullets.splice(i, 1); continue;
        }
        let hitEnemy = false;
        for (let e of enemies) {
            let r = e.size / 2 + 0.4;
            if (nextPos.x > e.mesh.position.x - r && nextPos.x < e.mesh.position.x + r &&
                nextPos.z > e.mesh.position.z - r && nextPos.z < e.mesh.position.z + r) {
                e.hp -= bulletDmg; hitEnemy = true;
                createImpact(nextPos, 0xff0040, 12); break;
            }
        }
        if (hitEnemy) { scene.remove(b.mesh); bullets.splice(i, 1); continue; }
        b.mesh.position.copy(nextPos); b.dist += 2.0;
    }

    // Enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        let nextPos = eb.mesh.position.clone().add(eb.dir.clone().multiplyScalar(eb.speed));
        if (checkCollision(nextPos, 0.15) || eb.dist > eb.range) {
            if (eb.dist <= eb.range) createImpact(nextPos, 0x00ff66, 4);
            scene.remove(eb.mesh); enemyBullets.splice(i, 1); continue;
        }
        let blocked = false;
        const sub = eb.dir.clone().multiplyScalar(eb.speed / 3);
        let probe2 = eb.mesh.position.clone();
        outer: for (let s = 0; s < 3; s++) {
            probe2.add(sub);
            for (let e of enemies) {
                let r = e.size / 2 + 0.4;
                if (probe2.x > e.mesh.position.x - r && probe2.x < e.mesh.position.x + r &&
                    probe2.z > e.mesh.position.z - r && probe2.z < e.mesh.position.z + r) {
                    createImpact(probe2, 0x00ff66, 4); blocked = true; break outer;
                }
            }
        }
        if (blocked) { scene.remove(eb.mesh); enemyBullets.splice(i, 1); continue; }
        if (nextPos.distanceTo(player.position) < 1.0) {
            if (!shielded) {
                hp -= eb.damage; damageFlashAmount = 0.7; shakeAmount = 0.18; Sound.hit();
                createImpact(player.position, 0xff0000, 6);
            } else {
                createImpact(player.position, 0x0088ff, 8);
            }
            scene.remove(eb.mesh); enemyBullets.splice(i, 1); continue;
        }
        eb.mesh.position.copy(nextPos); eb.dist += eb.speed;
    }

    // Particles
    particles.forEach(p => {
        if (!p.active) return;
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.01; p.life -= 0.03;
        let s = p.life * 1.5;
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = p.life;
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; }
    });

    // Enemy AI
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        if (e.hp <= 0) {
            Sound.explode(); score += 50;
            createImpact(e.mesh.position, e.mesh.material.color.getHex(), 20);
            if (Math.random() > 0.5) spawnDrop(e.mesh.position);
            scene.remove(e.mesh); enemies.splice(i, 1); continue;
        }
        let distToPlayer = e.mesh.position.distanceTo(player.position);
        if (distToPlayer > 80) {
            let a = Math.random() * Math.PI * 2;
            e.mesh.position.x = player.position.x + Math.cos(a) * 30;
            e.mesh.position.z = player.position.z + Math.sin(a) * 30;
            createImpact(e.mesh.position, 0xaa00ff, 15); continue;
        }
        let toP = player.position.clone().sub(e.mesh.position).normalize();

        if (e.behavior === 'sniper') {
            let moveDir = distToPlayer < e.preferredDist - 3 ? toP.clone().negate()
                        : distToPlayer > e.preferredDist + 3 ? toP.clone()
                        : new THREE.Vector3(-toP.z, 0, toP.x);
            let moveX = moveDir.x * e.speed, moveZ = moveDir.z * e.speed;
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.z -= moveZ;
            e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);

            let losBlocked = false;
            if (distToPlayer <= e.bulletRange && Date.now() - e.lastEnemyShot > e.shootInterval) {
                let steps = Math.ceil(distToPlayer / 1.5);
                let losStep = player.position.clone().sub(e.mesh.position).divideScalar(steps);
                let probe  = e.mesh.position.clone();
                for (let s = 1; s < steps; s++) {
                    probe.add(losStep);
                    for (let other of enemies) {
                        if (other === e) continue;
                        let r = other.size / 2 + 0.3;
                        if (probe.x > other.mesh.position.x - r && probe.x < other.mesh.position.x + r &&
                            probe.z > other.mesh.position.z - r && probe.z < other.mesh.position.z + r) {
                            losBlocked = true; break;
                        }
                    }
                    if (losBlocked) break;
                }
            }
            if (distToPlayer <= e.bulletRange && Date.now() - e.lastEnemyShot > e.shootInterval && !losBlocked) {
                e.lastEnemyShot = Date.now();
                let eBullet = new THREE.Mesh(
                    new THREE.SphereGeometry(0.12, 6, 6),
                    new THREE.MeshBasicMaterial({ color: 0x00ff66 })
                );
                eBullet.position.copy(e.mesh.position);
                eBullet.position.y = e.mesh.position.y + e.size * 0.4;
                let eDir = player.position.clone().sub(eBullet.position).normalize();
                eBullet.position.addScaledVector(eDir, e.size / 2 + 0.8);
                enemyBullets.push({ mesh: eBullet, dir: eDir, dist: 0, speed: e.bulletSpeed, damage: e.bulletDamage, range: e.bulletRange });
                scene.add(eBullet);
            }
        } else {
            let sV = new THREE.Vector3(-toP.z, 0, toP.x);
            let moveX = (toP.x * e.speed) + (sV.x * e.strafeDir * e.speed * 0.4);
            let moveZ = (toP.z * e.speed) + (sV.z * e.strafeDir * e.speed * 0.4);
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.z -= moveZ;
            if (Date.now() > e.nextStrafeChange) {
                e.strafeDir *= -1;
                e.nextStrafeChange = Date.now() + 1000 + Math.random() * 1000;
            }
            e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);
            if (distToPlayer < 1.8 && !shielded) { hp -= 0.5; shakeAmount = 0.08; createImpact(player.position, 0xffffff, 2); }
        }
    }

    if (enemies.length === 0 && enemiesToSpawn === 0 && !isWaveTransition) startWave(wave + 1);

    // Drops
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        d.mesh.rotation.y += 0.08;
        d.mesh.position.y = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
        if (player.position.distanceTo(d.mesh.position) < 2.0) {
            Sound.pickup();
            if      (d.type === 'hp')      hp      = Math.min(playerMaxHp, hp + 25);
            else if (d.type === 'ammo')    reserve = Math.min(MAX_RESERVE, reserve + 24);
            else if (d.type === 'powerup') applyPowerup(d.powerup);
            createImpact(d.mesh.position, d.mesh.material.color.getHex(), 15);
            scene.remove(d.mesh); drops.splice(i, 1);
        }
    }

    updateUI();
    drawMinimap();
    renderer.render(scene, camera);
}

// ── Start / Begin ──

function startGame() {
    checkDevice();
    if (isMobile) {
        requestFullscreen();
        if (!isLandscape()) { updateOrientationOverlay(); return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const c = CHARS[selectedChar];
    playerSpeed = c.speed; playerMaxHp = c.maxHp; shootCooldown = c.cooldown;
    bulletDmg = c.dmg; maxClip = c.clip; ammo = c.clip; burstCount = c.burst;
    hp = c.maxHp; reserve = c.reserve; boosts = {};

    document.getElementById('menu').style.display = 'none';
    beginGame();
}

function beginGame() {
    document.getElementById('ui').style.display         = 'block';
    document.getElementById('crosshair').style.display  = 'block';
    document.getElementById('minimap').style.display    = 'block';
    document.getElementById('boosts-hud').style.display = 'flex';
    if (!isMobile) document.body.requestPointerLock();
    else {
        requestFullscreen();
        document.getElementById('mobile-controls').style.display = 'block';
    }
    init();
    gameRunning = true;
    if (tutorialMode) {
        document.getElementById('wave-status').innerText = 'TRAINING';
        initTutorialPhases();
    } else {
        startWave(1);
    }
    animate();
}

// ── Settings ──

function openSettings() {
    const el = document.getElementById('settings');
    el.style.display = 'flex';
    updateSettingsUI();
    // Show gyro controls only on mobile
    if (isMobile || ('ontouchstart' in window)) {
        document.getElementById('gyro-row').style.display      = 'flex';
        document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
    }
}

function closeSettings() {
    document.getElementById('settings').style.display = 'none';
}

function updateSettingsUI() {
    const volSlider = document.getElementById('vol-slider');
    if (volSlider) {
        volSlider.value = settings.masterVolume;
        document.getElementById('vol-val').innerText = settings.masterVolume;
    }
    const gyroToggle = document.getElementById('gyro-toggle');
    if (gyroToggle) {
        gyroToggle.innerText = settings.gyroEnabled ? 'ON' : 'OFF';
        gyroToggle.classList.toggle('on', settings.gyroEnabled);
    }
    const gyroSensSlider = document.getElementById('gyro-sens-slider');
    if (gyroSensSlider) {
        gyroSensSlider.value = settings.gyroSensitivity;
        document.getElementById('gyro-sens-val').innerText = settings.gyroSensitivity;
        document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
    }
    const lookSlider = document.getElementById('look-sens-slider');
    if (lookSlider) {
        lookSlider.value = settings.lookSensitivity;
        document.getElementById('look-sens-val').innerText = settings.lookSensitivity;
    }
}

function toggleGyroSetting() {
    if (settings.gyroEnabled) {
        disableGyro();
    } else {
        enableGyro();
    }
    document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
}

// ── Pause ──

function togglePause() {
    if (!gameRunning) return;
    gamePaused = !gamePaused;
    if (gamePaused) {
        document.exitPointerLock();
        document.getElementById('pause-menu').style.display = 'flex';
    } else {
        resumeGame();
    }
}

function resumeGame() {
    gamePaused = false;
    document.getElementById('pause-menu').style.display = 'none';
    if (!isMobile) document.body.requestPointerLock();
    animate();
}

function exitToMenu() {
    if (score > highScore) { highScore = score; localStorage.setItem('msc_highscore', highScore); }
    window.location.reload();
}

// Pause on pointer-lock lost (browser releases lock when ESC is pressed)
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && gameRunning && !gamePaused) {
        gamePaused = true;
        document.getElementById('pause-menu').style.display = 'flex';
    }
});

// ── Resize ──

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('menu-hs').innerText = highScore;

// Auto-show tutorial on very first visit
if (!localStorage.getItem('msc_tut_done')) {
    openTutorial();
}
