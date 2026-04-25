// ── js/game.js ──
// World setup, game loop, enemies, bullets, particles, drops, waves, HUD.

// ── World helpers ──
function checkCollision(pos, radius) {
    for (let b of buildings) {
        if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
            pos.z + radius > b.minZ && pos.z - radius < b.maxZ &&
            pos.y < b.maxY) return true;
    }
    return false;
}

function createImpact(pos, color, count = 8) {
    let spawned = 0;
    for (let p of particles) {
        if (p.active || spawned >= count) continue;
        p.active = true; p.mesh.visible = true; p.life = 1.0;
        p.mesh.position.copy(pos);
        p.mesh.material.color.setHex(color);
        p.velocity.set(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.2) * 0.4,
            (Math.random() - 0.5) * 0.4
        );
        spawned++;
    }
}

// ── Building light references for flickering ──
let buildingLights = [];

// ── Scene init ──
function init() {
    scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x000008);
    scene.fog = new THREE.FogExp2(0x000015, 0.035);

    camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    let sun = new THREE.DirectionalLight(0x00ffff, 0.4);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    // ── Starfield ──
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 2000; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = 400 + Math.random() * 100;
        starVerts.push(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    starMesh = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true }));
    scene.add(starMesh);

    // ── Cyberpunk Grid Ground ──
    const gridGeo = new THREE.PlaneGeometry(500, 500, 80, 80);
    const gridMat = new THREE.MeshStandardMaterial({
        color: 0x050510,
        emissive: 0x001133,
        emissiveIntensity: 0.6,
        wireframe: true,
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -0.01;
    scene.add(grid);

    // Solid ground underneath
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ color: 0x030308 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.02;
    scene.add(road);

    // ── Buildings ──
    buildingLights = [];
    for (let i = 0; i < 40; i++) {
        const bh     = Math.random() * 22 + 10;
        const bColor = Math.random() > 0.5 ? 0x111118 : 0x1a1a22;
        const mesh   = new THREE.Mesh(
            new THREE.BoxGeometry(5, bh, 5),
            new THREE.MeshStandardMaterial({ color: bColor, emissive: 0x000000 })
        );
        let bx = Math.random() * 200 - 100, bz = Math.random() * 200 - 100;
        if (Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 25;
        mesh.position.set(bx, bh / 2, bz);
        scene.add(mesh);
        buildings.push({ minX: bx - 2.5, maxX: bx + 2.5, minY: 0, maxY: bh, minZ: bz - 2.5, maxZ: bz + 2.5 });

        if (Math.random() > 0.25) {
            const baseColor = Math.random() > 0.5 ? 0xff0040 : 0x00ffff;
            const light = new THREE.PointLight(baseColor, 1.2, 18);
            light.position.set(bx, bh * 0.82, bz);
            light.userData = { baseColor, phase: Math.random() * Math.PI * 2, waveColor: null };
            scene.add(light);
            buildingLights.push(light);
        }
    }

    // ── Particle pool ──
    const pGeo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        pMesh.visible = false;
        scene.add(pMesh);
        particles.push({ mesh: pMesh, velocity: new THREE.Vector3(), active: false, life: 0 });
    }

    // ── Player ──
    player = new THREE.Object3D();
    player.position.set(0, 1.8, 0);
    scene.add(player);

    setupControls();
}

// ── Weapons ──
function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;
    const now = performance.now();
    const wep = WEAPONS[currentWeapon];
    if (now - lastShotTime < wep.cooldown) return;

    ammo--; lastShotTime = now; shakeAmount = 0.1;
    Sound[wep.sound]();

    if (wep.hitscan) {
        // Railgun: instant raycast
        const dir = new THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
             Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
        ).normalize();
        let closest = null, closestDist = Infinity;
        for (let e of enemies) {
            const toE = e.mesh.position.clone().sub(player.position);
            const dot = toE.dot(dir);
            if (dot <= 0) continue;
            const perp = toE.clone().sub(dir.clone().multiplyScalar(dot)).length();
            if (perp < e.size * 0.8 && dot < closestDist) { closest = e; closestDist = dot; }
        }
        if (closest) {
            closest.hp -= wep.damage;
            createImpact(closest.mesh.position, 0xff00ff, 20);
            flashCrosshair();
        }
        // Draw beam
        const bStart = player.position.clone();
        const bEnd   = bStart.clone().add(dir.clone().multiplyScalar(200));
        const bGeo   = new THREE.BufferGeometry().setFromPoints([bStart, bEnd]);
        const bLine  = new THREE.Line(bGeo, new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9 }));
        scene.add(bLine);
        setTimeout(() => scene.remove(bLine), 120);
        return;
    }

    // Multi-bullet weapons (pistol / shotgun)
    for (let b = 0; b < wep.bullets; b++) {
        const spreadX = (Math.random() - 0.5) * wep.spread;
        const spreadY = (Math.random() - 0.5) * wep.spread;
        const bullet  = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 6, 6),
            new THREE.MeshBasicMaterial({ color: wep.color })
        );
        bullet.position.copy(player.position);
        const dir = new THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch) + spreadX,
             Math.sin(pitch) + spreadY,
            -Math.cos(yaw) * Math.cos(pitch)
        ).normalize();
        bullets.push({ mesh: bullet, dir, dist: 0, damage: wep.damage });
        scene.add(bullet);
    }
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip) return;
    isReloading = true;
    Sound.reload();
    VoiceCues.reloading();
    document.getElementById('wave-status').innerText = 'RELOADING...';
    const reloadTime = currentWeapon === 'railgun' ? 2000 : 1000;
    setTimeout(() => {
        if (!gameRunning) return;
        const needed   = maxClip - ammo;
        const transfer = Math.min(needed, reserve);
        ammo    += transfer;
        reserve -= transfer;
        isReloading = false;
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;
    }, reloadTime);
}

function switchWeapon(w) {
    if (currentWeapon === w) return;
    currentWeapon = w;
    const wep = WEAPONS[w];
    maxClip = wep.maxClip + permanentUpgrades.clipSize * 4;
    ammo    = Math.min(ammo, maxClip);
    document.getElementById('weapon-name').innerText = w.toUpperCase();
}

function flashCrosshair() {
    crosshairHit     = true;
    crosshairHitTime = performance.now();
    document.getElementById('crosshair').classList.add('hit');
    setTimeout(() => {
        document.getElementById('crosshair').classList.remove('hit');
        crosshairHit = false;
    }, 150);
}

// ── Slow Motion ──
function activateSlowMo() {
    const now = performance.now();
    if (now - lastSlowMoTime < SLOWMO_COOLDOWN) return;
    lastSlowMoTime = now;
    timeScale = 0.25;
    Sound.slowMoIn();
    VoiceCues.slowMo();
    document.getElementById('slowmo-indicator').style.display = 'block';
    setTimeout(() => {
        timeScale = 1.0;
        document.getElementById('slowmo-indicator').style.display = 'none';
    }, SLOWMO_DURATION);
}

// ── Wave / Enemy spawning ──
function startWave(num) {
    wave = num; enemiesToSpawn = 5 + (num * 2); isWaveTransition = true;
    document.getElementById('wave-status').innerText = 'SIGNAL STABILIZING...';
    setTimeout(() => {
        if (!gameRunning) return;
        isWaveTransition = false;
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;
        VoiceCues.waveStart(wave);
        killStreak = 0;
        let spawner = setInterval(() => {
            if (enemiesToSpawn > 0 && gameRunning) { spawnEnemy(); enemiesToSpawn--; }
            else clearInterval(spawner);
        }, 700);
    }, 1800);
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 30 + Math.random() * 20;
    const ex    = player.position.x + Math.cos(angle) * dist;
    const ez    = player.position.z + Math.sin(angle) * dist;
    const typeRoll = Math.random();
    const waveBonus = wave - 1;

    let type;
    if (typeRoll < 0.15) {
        // Scout
        type = { kind:'scout', color:0xffff00, hp:40+waveBonus*5, speed:0.18, size:0.8, ey:0.72, ranged:false, bomber:false };
    } else if (typeRoll < 0.30) {
        // Tank
        type = { kind:'tank', color:0xaa00ff, hp:400+waveBonus*30, speed:0.05, size:2.2, ey:1.98, ranged:false, bomber:false };
    } else if (typeRoll < 0.50) {
        // Ranged Attacker
        type = { kind:'ranged', color:0x00ff88, hp:80+waveBonus*8, speed:0.06, size:1.0, ey:0.9, ranged:true, bomber:false, lastShot:0, preferDist:14 };
    } else if (typeRoll < 0.65) {
        // Flying Drone
        const flyH = 8 + Math.random() * 10;
        type = { kind:'drone', color:0x00aaff, hp:60+waveBonus*5, speed:0.12, size:0.9, ey:flyH, ranged:true, bomber:false, lastShot:0, preferDist:20, hoverY:flyH };
    } else if (typeRoll < 0.80) {
        // Suicide Bomber
        type = { kind:'bomber', color:0xff6600, hp:60+waveBonus*5, speed:0.10, size:1.1, ey:0.99, ranged:false, bomber:true };
    } else {
        // Standard
        type = { kind:'standard', color:0xff0040, hp:100+waveBonus*10, speed:0.08, size:1.2, ey:1.08, ranged:false, bomber:false };
    }

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(type.size, type.size * 1.8, type.size),
        new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 })
    );
    mesh.position.set(ex, type.ey, ez);
    scene.add(mesh);

    // Drone: add spinning ring
    if (type.kind === 'drone') {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(type.size * 0.9, 0.12, 8, 20),
            new THREE.MeshBasicMaterial({ color: 0x00aaff })
        );
        mesh.add(ring);
    }

    enemies.push({
        mesh, hp: type.hp, maxHp: type.hp, speed: type.speed,
        size: type.size, kind: type.kind,
        ranged: type.ranged, bomber: type.bomber,
        lastShot: type.lastShot || 0,
        preferDist: type.preferDist || 0,
        hoverY: type.hoverY || null,
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        nextStrafeChange: Date.now() + 1500,
    });
}

// ── Enemy bullet ──
function spawnEnemyBullet(from, dir) {
    const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 5, 5),
        new THREE.MeshBasicMaterial({ color: 0xff4400 })
    );
    b.position.copy(from);
    b.position.y += 0.5;
    enemyBullets.push({ mesh: b, dir: dir.normalize(), dist: 0 });
    scene.add(b);
    Sound.enemyShoot();
}

// ── Drops ──
function spawnDrop(pos) {
    const roll = Math.random();
    let type, col;
    if (roll < 0.20 && wave >= 2) {
        // Weapon pickup
        const weapons = ['shotgun', 'railgun'];
        type = weapons[Math.floor(Math.random() * weapons.length)];
        col  = type === 'shotgun' ? 0xff8800 : 0xff00ff;
    } else if ((hp < 50) ? roll < 0.5 : roll < 0.25) {
        type = 'hp'; col = 0xff0000;
    } else {
        type = 'ammo'; col = 0x00ffff;
    }

    const dMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
    );
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);

    // Label
    drops.push({ mesh: dMesh, type });
}

// ── Achievement checker ──
function checkAchievements() {
    const unlocks = [
        { id:'first_blood',   label:'First Blood',        check: () => totalKills >= 1       },
        { id:'wave10',        label:'Signal Stabilized',  check: () => wave >= 10            },
        { id:'streak5',       label:'On Fire',            check: () => killStreak >= 5       },
        { id:'streak10',      label:'Unstoppable',        check: () => killStreak >= 10      },
        { id:'shotgun',       label:'Spreader',           check: () => currentWeapon==='shotgun' && totalKills >= 5 },
        { id:'railgun',       label:'Overclocked',        check: () => currentWeapon==='railgun' && totalKills >= 3 },
    ];
    for (let a of unlocks) {
        if (!achievements[a.id] && a.check()) {
            achievements[a.id] = true;
            localStorage.setItem('achievements', JSON.stringify(achievements));
            showAchievement(a.label);
        }
    }
}

function showAchievement(label) {
    Sound.achievement();
    VoiceCues.achievement(label);
    const el = document.getElementById('achievement-popup');
    el.innerText = '🏆 ' + label;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
    }, 3000);
}

// ── HUD ──
function updateUI() {
    document.getElementById('hp-val').innerText      = Math.max(0, Math.ceil(hp));
    document.getElementById('ammo-val').innerText    = ammo;
    document.getElementById('reserve-val').innerText = reserve;
    document.getElementById('score-val').innerText   = score;
    document.getElementById('currency-val').innerText = currency;
    document.getElementById('enemies-left').innerText = enemies.length + enemiesToSpawn;
    document.getElementById('reload-msg').style.display = (ammo <= 3 && reserve > 0) ? 'block' : 'none';
    document.getElementById('weapon-name').innerText = currentWeapon.toUpperCase();

    // Slowmo cooldown bar
    const now = performance.now();
    const elapsed = now - lastSlowMoTime;
    const pct = Math.min(1, elapsed / SLOWMO_COOLDOWN);
    document.getElementById('slowmo-bar-fill').style.width = (pct * 100) + '%';

    // HP color
    const hpEl = document.getElementById('hp-val');
    hpEl.style.color = hp < 30 ? '#ff0000' : hp < 60 ? '#ff8800' : '#ff0040';
}

// ── Last ammo warning ──
let _lastAmmoWarn = 12;
function checkAmmoVoice() {
    if (ammo <= 3 && _lastAmmoWarn > 3) { VoiceCues.ammoLow(); }
    if (ammo === 0 && _lastAmmoWarn > 0) { VoiceCues.ammoDepleted(); }
    _lastAmmoWarn = ammo;
}

// ── Game loop ──
let lastFrameTime = performance.now();

function animate() {
    if (!gameRunning) return;
    if (hp <= 0) {
        gameRunning = false;
        Music.stop();
        document.getElementById('gameover').style.display = 'flex';
        document.getElementById('final-score').innerText  = score;
        return;
    }
    requestAnimationFrame(animate);

    const now = performance.now();
    const rawDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    const dt = rawDt * timeScale * 60; // scaled delta (1.0 ≈ 60fps normal speed)

    // ── Dynamic building lights (flicker + wave color) ──
    for (let light of buildingLights) {
        const t  = now * 0.001 + light.userData.phase;
        // Flicker: sine + noise
        const flicker = 0.6 + 0.4 * Math.sin(t * 3.7) * Math.sin(t * 7.3 + 1.1);
        light.intensity = flicker * (1.0 + (wave - 1) * 0.05);
        // Wave-based hue shift at high waves
        if (wave >= 5) {
            const waveT = (now * 0.0005 + light.userData.phase) % 1;
            const waveColors = [0xff0040, 0x00ffff, 0xaa00ff, 0xff8800];
            const ci  = Math.floor(waveT * waveColors.length);
            light.color.setHex(waveColors[ci % waveColors.length]);
        } else {
            light.color.setHex(light.userData.baseColor);
        }
    }

    // ── Player movement ──
    const baseSpeed = (0.20 + permanentUpgrades.speed * 0.04) * timeScale;
    const pSize = 0.7;
    const fw  = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const rt  = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
    let mX = 0, mZ = 0;
    if (!isMobile) {
        if (keys['w']) { mX += fw.x * baseSpeed; mZ += fw.z * baseSpeed; }
        if (keys['s']) { mX -= fw.x * baseSpeed; mZ -= fw.z * baseSpeed; }
        if (keys['a']) { mX -= rt.x * baseSpeed; mZ -= rt.z * baseSpeed; }
        if (keys['d']) { mX += rt.x * baseSpeed; mZ += rt.z * baseSpeed; }
    } else if (joystick.active) {
        mX = (fw.x * -joystick.y + rt.x * joystick.x) * baseSpeed;
        mZ = (fw.z * -joystick.y + rt.z * joystick.x) * baseSpeed;
    }
    player.position.x += mX; if (checkCollision(player.position, pSize)) player.position.x -= mX;
    player.position.z += mZ; if (checkCollision(player.position, pSize)) player.position.z -= mZ;

    // ── Camera ──
    camera.position.copy(player.position);
    if (shakeAmount > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
        shakeAmount *= 0.88;
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // ── Starfield slow drift ──
    if (starMesh) starMesh.rotation.y += 0.00005 * timeScale;

    // ── Player bullets ──
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const spd = 2.5 * timeScale;
        const nextPos = b.mesh.position.clone().add(b.dir.clone().multiplyScalar(spd));

        if (checkCollision(nextPos, 0.2) || b.dist > 150) {
            if (b.dist <= 150) createImpact(nextPos, 0x00ffff, 6);
            scene.remove(b.mesh); bullets.splice(i, 1); continue;
        }

        let hitEnemy = false;
        for (let e of enemies) {
            const r = e.size / 2 + 0.4;
            if (Math.abs(nextPos.x - e.mesh.position.x) < r &&
                Math.abs(nextPos.z - e.mesh.position.z) < r) {
                e.hp -= b.damage || 50;
                hitEnemy = true;
                createImpact(nextPos, 0xff4040, 10);
                flashCrosshair();
                break;
            }
        }
        if (hitEnemy) { scene.remove(b.mesh); bullets.splice(i, 1); continue; }
        b.mesh.position.copy(nextPos); b.dist += spd;
    }

    // ── Enemy bullets ──
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const spd = 1.4 * timeScale;
        b.mesh.position.add(b.dir.clone().multiplyScalar(spd));
        b.dist += spd;
        if (b.dist > 60 || checkCollision(b.mesh.position, 0.2)) {
            scene.remove(b.mesh); enemyBullets.splice(i, 1); continue;
        }
        if (b.mesh.position.distanceTo(player.position) < 1.4) {
            hp -= 15; shakeAmount = 0.1;
            createImpact(player.position, 0xff4400, 6);
            scene.remove(b.mesh); enemyBullets.splice(i, 1);
        }
    }

    // ── Particles ──
    for (let p of particles) {
        if (!p.active) continue;
        p.mesh.position.addScaledVector(p.velocity, timeScale);
        p.velocity.y -= 0.01 * timeScale;
        p.life -= 0.025 * timeScale;
        const s = Math.max(0.01, p.life * 1.5);
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = Math.max(0, p.life);
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; }
    }

    // ── Enemy AI ──
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        if (e.hp <= 0) {
            totalKills++;
            killStreak++;
            currency += e.kind === 'tank' ? 30 : e.kind === 'drone' ? 20 : 10;

            if (e.bomber) {
                // Area explosion
                Sound.bigExplode();
                createImpact(e.mesh.position, 0xff6600, 40);
                if (player.position.distanceTo(e.mesh.position) < 6) {
                    hp -= 40; shakeAmount = 0.3;
                }
            } else {
                Sound.explode();
            }
            score += e.kind === 'tank' ? 150 : e.kind === 'drone' ? 80 : 50;
            createImpact(e.mesh.position, e.mesh.material.color.getHex(), 18);
            if (Math.random() > 0.45) spawnDrop(e.mesh.position);
            scene.remove(e.mesh); enemies.splice(i, 1);
            checkAchievements();
            continue;
        }

        const distToPlayer = e.mesh.position.distanceTo(player.position);

        // Teleport far enemies back into range
        if (distToPlayer > 80) {
            const angle = Math.random() * Math.PI * 2;
            e.mesh.position.x = player.position.x + Math.cos(angle) * 28;
            e.mesh.position.z = player.position.z + Math.sin(angle) * 28;
            if (e.hoverY) e.mesh.position.y = e.hoverY;
            createImpact(e.mesh.position, 0xaa00ff, 10);
            continue;
        }

        // Drone hover bob
        if (e.hoverY) {
            e.mesh.position.y = e.hoverY + Math.sin(now * 0.002 + i) * 0.8;
            e.mesh.children.forEach(c => c.rotation.y += 0.08 * timeScale);
        }

        const toP    = player.position.clone().sub(e.mesh.position).normalize();
        const sV     = new THREE.Vector3(-toP.z, 0, toP.x);

        // Steer change
        if (Date.now() > e.nextStrafeChange) {
            e.strafeDir = -e.strafeDir;
            e.nextStrafeChange = Date.now() + 1000 + Math.random() * 1500;
        }

        // Bomber accelerates as it closes
        const speedMod = e.bomber ? Math.max(1.0, 2.5 - distToPlayer * 0.1) : 1.0;
        const spd = e.speed * speedMod * timeScale;

        if (e.ranged) {
            // Stay at preferred distance
            const movingIn = distToPlayer > e.preferDist + 2;
            const movingOut= distToPlayer < e.preferDist - 2;
            const fwMul = movingIn ? 1 : movingOut ? -0.5 : 0;
            const moveX = (toP.x * fwMul * spd) + (sV.x * e.strafeDir * spd * 0.5);
            const moveZ = (toP.z * fwMul * spd) + (sV.z * e.strafeDir * spd * 0.5);
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;

            // Fire projectile
            const shootInterval = e.kind === 'drone' ? 1200 : 1800;
            if (now - e.lastShot > shootInterval / timeScale && distToPlayer < e.preferDist + 5) {
                spawnEnemyBullet(e.mesh.position.clone(), toP.clone());
                e.lastShot = now;
            }
        } else {
            // Melee: charge player
            const moveX = (toP.x * spd) + (sV.x * e.strafeDir * spd * 0.4);
            const moveZ = (toP.z * spd) + (sV.z * e.strafeDir * spd * 0.4);
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
            if (distToPlayer < 1.8) {
                const dmg = e.bomber ? 60 : 0.5;
                hp -= dmg * timeScale;
                shakeAmount = 0.08;
                createImpact(player.position, 0xffffff, 3);
                if (e.bomber) {
                    // Detonate
                    e.hp = 0;
                }
            }
        }

        e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);
    }

    if (enemies.length === 0 && enemiesToSpawn === 0 && !isWaveTransition) startWave(wave + 1);

    // ── Drops ──
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.mesh.rotation.y += 0.08 * timeScale;
        d.mesh.position.y = 0.8 + Math.sin(now * 0.005) * 0.2;
        if (player.position.distanceTo(d.mesh.position) < 2.0) {
            Sound.pickup();
            if (d.type === 'hp') {
                hp = Math.min(maxHp, hp + 25);
                VoiceCues.signalFound();
            } else if (d.type === 'ammo') {
                reserve += 24;
                VoiceCues.signalFound();
            } else if (d.type === 'shotgun' || d.type === 'railgun') {
                switchWeapon(d.type);
                const extraAmmo = WEAPONS[d.type].maxClip * 3;
                reserve = Math.min(reserve + extraAmmo, 99);
                VoiceCues.weaponPickup(d.type);
            }
            createImpact(d.mesh.position, d.type === 'hp' ? 0xff0000 : 0x00ffff, 15);
            scene.remove(d.mesh); drops.splice(i, 1);
        }
    }

    checkAmmoVoice();
    updateUI();
    renderer.render(scene, camera);
}

// ── Start ──
function startGame() {
    checkDevice();
    if (isMobile) {
        requestFullscreen();
        if (!isLandscape()) { updateOrientationOverlay(); return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('menu').style.display      = 'none';
    document.getElementById('ui').style.display        = 'block';
    document.getElementById('crosshair').style.display = 'block';
    if (!isMobile) document.body.requestPointerLock();
    else document.querySelectorAll('.touch-controls').forEach(el => el.style.display = 'flex');
    init();
    gameRunning = true;
    lastFrameTime = performance.now();
    Music.start();
    startWave(1);
    animate();
}

// ── Shop ──
function openShop() { document.getElementById('shop-overlay').style.display = 'flex'; }
function closeShop(){ document.getElementById('shop-overlay').style.display = 'none'; }
function buyUpgrade(key, cost, label) {
    const saved = parseInt(localStorage.getItem('currency') || '0');
    if (saved < cost) { alert('Not enough credits!'); return; }
    localStorage.setItem('currency', saved - cost);
    permanentUpgrades[key] = (permanentUpgrades[key] || 0) + 1;
    localStorage.setItem('upg_' + key, permanentUpgrades[key]);
    document.getElementById('saved-currency').innerText = localStorage.getItem('currency');
    alert(`${label} upgraded to level ${permanentUpgrades[key]}!`);
}

// ── Resize ──
window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});