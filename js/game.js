// ── js/game.js ──
// Optimized with Object Pooling, Performance Monitoring, and Difficulty Scaling

let lastFrameTime = 0;
let fpsDisplayTime = 0;
let currentFPS = 0;

function init() {
    scene = new THREE.Scene();[cite: 3]
    scene.background = new THREE.Color(0x000005);[cite: 3]
    scene.fog = new THREE.FogExp2(0x000011, 0.04);[cite: 3]

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);[cite: 3]
    renderer = new THREE.WebGLRenderer({ antialias: true });[cite: 3]
    renderer.setSize(window.innerWidth, window.innerHeight);[cite: 3]
    document.body.appendChild(renderer.domElement);[cite: 3]

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));[cite: 3]
    let sun = new THREE.DirectionalLight(0x00ffff, 0.5);[cite: 3]
    sun.position.set(5, 10, 5);[cite: 3]
    scene.add(sun);[cite: 3]

    // Ground[cite: 3]
    let road = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ color: 0x080808 })
    );[cite: 3]
    road.rotation.x = -Math.PI / 2;[cite: 3]
    scene.add(road);[cite: 3]

    // Buildings[cite: 3]
    for (let i = 0; i < 40; i++) {
        let bh = Math.random() * 20 + 10;[cite: 3]
        let bColor = Math.random() > 0.5 ? 0x111111 : 0x1a1a1a;[cite: 3]
        let mesh = new THREE.Mesh(
            new THREE.BoxGeometry(5, bh, 5),
            new THREE.MeshStandardMaterial({ color: bColor, emissive: 0x000000 })
        );[cite: 3]
        let bx = Math.random() * 200 - 100, bz = Math.random() * 200 - 100;[cite: 3]
        if (Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 25;[cite: 3]
        mesh.position.set(bx, bh / 2, bz);[cite: 3]
        scene.add(mesh);[cite: 3]
        buildings.push({ minX: bx - 2.5, maxX: bx + 2.5, minY: 0, maxY: bh, minZ: bz - 2.5, maxZ: bz + 2.5 });[cite: 3]
    }

    // --- OBJECT POOLS ---

    // Bullet Pool (Pre-allocate 50 bullets)[cite: 3, 5]
    const bGeo = new THREE.SphereGeometry(0.2, 8, 8);[cite: 3]
    const bMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });[cite: 3]
    for (let i = 0; i < 50; i++) {
        let mesh = new THREE.Mesh(bGeo, bMat);[cite: 3]
        mesh.visible = false;[cite: 3]
        scene.add(mesh);[cite: 3]
        bullets.push({ mesh, dir: new THREE.Vector3(), dist: 0, active: false });[cite: 3]
    }

    // Enemy Pool (Pre-allocate 30 enemies)[cite: 3, 5]
    for (let i = 0; i < 30; i++) {
        let mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1.8, 1),[cite: 3]
            new THREE.MeshStandardMaterial({ color: 0xff0040, emissive: 0xff0040, emissiveIntensity: 0.8 })[cite: 3]
        );[cite: 3]
        mesh.visible = false;[cite: 3]
        scene.add(mesh);[cite: 3]
        enemies.push({ mesh, active: false, hp: 100, speed: 0, size: 1, strafeDir: 1, nextStrafeChange: 0 });[cite: 3]
    }

    // Particle Pool[cite: 3, 5]
    const pGeo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);[cite: 3]
    for (let i = 0; i < MAX_PARTICLES; i++) {[cite: 3, 5]
        const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));[cite: 3]
        pMesh.visible = false;[cite: 3]
        scene.add(pMesh);[cite: 3]
        particles.push({ mesh: pMesh, velocity: new THREE.Vector3(), active: false, life: 0 });[cite: 3]
    }

    player = new THREE.Object3D();[cite: 3]
    player.position.set(0, 1.8, 0);[cite: 3]
    scene.add(player);[cite: 3]

    setupControls();[cite: 3, 6]
}

// ── Optimized Weapon (Pooling) ──

function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;[cite: 3, 5]
    const now = performance.now();[cite: 3]
    if (now - lastShotTime < SHOOT_COOLDOWN) return;[cite: 3, 5]

    // Find first available bullet in pool[cite: 3]
    let bullet = bullets.find(b => !b.active);
    if (!bullet) return;

    ammo--;[cite: 3, 5]
    lastShotTime = now;[cite: 3, 5]
    Sound.shoot();[cite: 3, 5]
    shakeAmount = 0.12;[cite: 3, 5]

    bullet.active = true;
    bullet.mesh.visible = true;
    bullet.mesh.position.copy(player.position);[cite: 3]
    bullet.dist = 0;
    bullet.dir.set(
        -Math.sin(yaw) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();[cite: 3]
}

// ── Optimized Spawning (Scaling & Pooling) ──

function startWave(num) {
    wave = num;[cite: 3, 5]
    enemiesToSpawn = 5 + (num * 2);[cite: 3]
    isWaveTransition = true;[cite: 3, 5]
    document.getElementById('wave-status').innerText = 'SIGNAL STABILIZING...';[cite: 3]
    setTimeout(() => {
        if (!gameRunning) return;[cite: 3, 5]
        isWaveTransition = false;[cite: 3, 5]
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;[cite: 3]
        let spawner = setInterval(() => {
            if (enemiesToSpawn > 0 && gameRunning) { spawnEnemy(); enemiesToSpawn--; }[cite: 3]
            else clearInterval(spawner);[cite: 3]
        }, 800);[cite: 3]
    }, 1500);[cite: 3]
}

function spawnEnemy() {
    let enemy = enemies.find(e => !e.active);[cite: 3]
    if (!enemy) return;

    let angle = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 20;[cite: 3]
    let ex = player.position.x + Math.cos(angle) * dist;[cite: 3]
    let ez = player.position.z + Math.sin(angle) * dist;[cite: 3]

    // Difficulty Scaling logic
    let diffMult = 1 + (wave * 0.15); 
    let typeRoll = Math.random();[cite: 3]

    let type = { color: 0xff0040, hp: 100 * diffMult, speed: 0.08 * diffMult, size: 1.2 };[cite: 3]
    if (typeRoll > 0.8) type = { color: 0xaa00ff, hp: 400 * diffMult, speed: 0.05 * diffMult, size: 2.2 };[cite: 3]
    if (typeRoll < 0.2) type = { color: 0:ffff00, hp: 40 * diffMult,  speed: 0.18 * diffMult, size: 0.8 };[cite: 3]

    enemy.active = true;
    enemy.mesh.visible = true;
    enemy.hp = type.hp;
    enemy.speed = type.speed;
    enemy.size = type.size;
    enemy.mesh.scale.set(type.size, type.size, type.size);
    enemy.mesh.position.set(ex, type.size * 0.9, ez);[cite: 3]
    enemy.mesh.material.color.setHex(type.color);[cite: 3]
    enemy.mesh.material.emissive.setHex(type.color);[cite: 3]
    enemy.strafeDir = Math.random() > 0.5 ? 1 : -1;[cite: 3]
}

// ── Optimized Main Loop ──

function animate(now) {
    if (!gameRunning) return;[cite: 3, 5]
    if (hp <= 0) {[cite: 3, 5]
        gameRunning = false;[cite: 3, 5]
        document.getElementById('gameover').style.display = 'flex';[cite: 1, 3]
        document.getElementById('final-score').innerText = score;[cite: 1, 3]
        return;
    }
    requestAnimationFrame(animate);[cite: 3]

    // Performance Monitoring (FPS)
    const dt = now - lastFrameTime;
    lastFrameTime = now;
    if (now > fpsDisplayTime + 500) {
        currentFPS = Math.round(1000 / dt);
        fpsDisplayTime = now;
    }

    // Player movement[cite: 3]
    let sp = 0.2, pSize = 0.7;[cite: 3]
    let fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));[cite: 3]
    let rt = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));[cite: 3]
    let mX = 0, mZ = 0;[cite: 3]
    if (!isMobile) {[cite: 3, 5]
        if (keys['w']) { mX += fw.x * sp; mZ += fw.z * sp; }[cite: 3]
        if (keys['s']) { mX -= fw.x * sp; mZ -= fw.z * sp; }[cite: 3]
        if (keys['a']) { mX -= rt.x * sp; mZ -= rt.z * sp; }[cite: 3]
        if (keys['d']) { mX += rt.x * sp; mZ += rt.z * sp; }[cite: 3]
    } else if (joystick.active) {[cite: 3, 6]
        mX = (fw.x * -joystick.y + rt.x * joystick.x) * sp;[cite: 3]
        mZ = (fw.z * -joystick.y + rt.z * joystick.x) * sp;[cite: 3]
    }
    player.position.x += mX; if (checkCollision(player.position, pSize)) player.position.x -= mX;[cite: 3]
    player.position.z += mZ; if (checkCollision(player.position, pSize)) player.position.z -= mZ;[cite: 3]

    // Camera[cite: 3]
    camera.position.copy(player.position);[cite: 3]
    if (shakeAmount > 0) {[cite: 3, 5]
        camera.position.x += (Math.random() - 0.5) * shakeAmount;[cite: 3]
        camera.position.y += (Math.random() - 0.5) * shakeAmount;[cite: 3]
        shakeAmount *= 0.88;[cite: 3]
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');[cite: 3, 5]

    // Bullets (Pool Update)[cite: 3]
    bullets.forEach(b => {
        if (!b.active) return;
        let nextPos = b.mesh.position.clone().add(b.dir.clone().multiplyScalar(2.0));[cite: 3]

        if (checkCollision(nextPos, 0.2) || b.dist > 150) {[cite: 3]
            if (b.dist <= 150) createImpact(nextPos, 0x00ffff, 6);[cite: 3]
            b.active = false; b.mesh.visible = false; return;
        }

        let hitEnemy = false;
        for (let e of enemies) {
            if (!e.active) continue;
            let r = e.size / 2 + 0.4;[cite: 3]
            // Efficient Distance-based collision[cite: 3]
            if (nextPos.distanceTo(e.mesh.position) < r) {
                e.hp -= 50; hitEnemy = true;[cite: 3]
                createImpact(nextPos, 0xff0040, 12);[cite: 3]
                break;
            }
        }
        if (hitEnemy) { b.active = false; b.mesh.visible = false; return; }
        b.mesh.position.copy(nextPos); b.dist += 2.0;[cite: 3]
    });

    // Enemy AI (Pool Update)[cite: 3]
    let activeCount = 0;
    enemies.forEach(e => {
        if (!e.active) return;
        activeCount++;

        if (e.hp <= 0) {[cite: 3]
            Sound.explode(); score += 50;[cite: 3, 5]
            createImpact(e.mesh.position, e.mesh.material.color.getHex(), 20);[cite: 3]
            if (Math.random() > 0.5) spawnDrop(e.mesh.position);[cite: 3]
            e.active = false; e.mesh.visible = false; return;
        }

        let distToPlayer = e.mesh.position.distanceTo(player.position);[cite: 3]
        if (distToPlayer > 80) {[cite: 3]
            let angle = Math.random() * Math.PI * 2;[cite: 3]
            e.mesh.position.x = player.position.x + Math.cos(angle) * 30;[cite: 3]
            e.mesh.position.z = player.position.z + Math.sin(angle) * 30;[cite: 3]
            createImpact(e.mesh.position, 0xaa00ff, 15);[cite: 3]
            return;
        }

        let toP = player.position.clone().sub(e.mesh.position).normalize();[cite: 3]
        let sV  = new THREE.Vector3(-toP.z, 0, toP.x);[cite: 3]
        let moveX = (toP.x * e.speed) + (sV.x * e.strafeDir * e.speed * 0.4);[cite: 3]
        let moveZ = (toP.z * e.speed) + (sV.z * e.strafeDir * e.speed * 0.4);[cite: 3]

        e.mesh.position.x += moveX;[cite: 3]
        if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.x -= moveX;[cite: 3]
        e.mesh.position.z += moveZ;[cite: 3]
        if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.z -= moveZ;[cite: 3]

        e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);[cite: 3]
        if (distToPlayer < 1.8) { hp -= 0.5; shakeAmount = 0.08; createImpact(player.position, 0xffffff, 2); }[cite: 3]
    });

    if (activeCount === 0 && enemiesToSpawn === 0 && !isWaveTransition) startWave(wave + 1);[cite: 3]

    // Particles[cite: 3]
    particles.forEach(p => {
        if (!p.active) return;
        p.mesh.position.add(p.velocity);[cite: 3]
        p.velocity.y -= 0.01;[cite: 3]
        p.life -= 0.03;[cite: 3]
        let s = p.life * 1.5;[cite: 3]
        p.mesh.scale.set(s, s, s);[cite: 3]
        p.mesh.material.opacity = p.life;[cite: 3]
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; }[cite: 3]
    });

    // Drops[cite: 3]
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];[cite: 3]
        d.mesh.rotation.y += 0.08;[cite: 3]
        d.mesh.position.y = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;[cite: 3]
        if (player.position.distanceTo(d.mesh.position) < 2.0) {[cite: 3]
            Sound.pickup();[cite: 3, 5]
            if (d.type === 'hp') hp = Math.min(100, hp + 25); else reserve += 24;[cite: 3, 5]
            createImpact(d.mesh.position, d.type === 'hp' ? 0xff0000 : 0x00ffff, 15);[cite: 3]
            scene.remove(d.mesh); drops.splice(i, 1);[cite: 3]
        }
    }

    updateUI();[cite: 3]
    renderer.render(scene, camera);[cite: 3]
}

// ── Support Functions ──

function updateUI() {
    document.getElementById('hp-val').innerText      = Math.max(0, Math.ceil(hp));[cite: 3]
    document.getElementById('ammo-val').innerText    = ammo;[cite: 3]
    document.getElementById('reserve-val').innerText = reserve;[cite: 3]
    document.getElementById('score-val').innerText   = `${score} (FPS: ${currentFPS})`;[cite: 3]
    document.getElementById('enemies-left').innerText = enemies.filter(e => e.active).length + enemiesToSpawn;[cite: 3]
    document.getElementById('reload-msg').style.display = (ammo <= 3 && reserve > 0) ? 'block' : 'none';[cite: 2, 3]
}

function checkCollision(pos, radius) {
    for (let b of buildings) {[cite: 3]
        if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
            pos.z + radius > b.minZ && pos.z - radius < b.maxZ &&
            pos.y < b.maxY) return true;[cite: 3]
    }
    return false;[cite: 3]
}

function createImpact(pos, color, count = 8) {
    for (let i = 0; i < count; i++) {
        let p = particles.find(p => !p.active);[cite: 3]
        if (!p) break;
        p.active = true; p.mesh.visible = true; p.life = 1.0;[cite: 3]
        p.mesh.position.copy(pos);[cite: 3]
        p.mesh.material.color.setHex(color);[cite: 3]
        p.velocity.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.2) * 0.4, (Math.random() - 0.5) * 0.4);[cite: 3]
    }
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip) return;[cite: 3, 5]
    isReloading = true; Sound.reload();[cite: 3, 5]
    document.getElementById('wave-status').innerText = 'RELOADING...';[cite: 3]
    setTimeout(() => {
        let needed   = maxClip - ammo;[cite: 3, 5]
        let transfer = Math.min(needed, reserve);[cite: 3, 5]
        ammo    += transfer;[cite: 3, 5]
        reserve -= transfer;[cite: 3, 5]
        isReloading = false;[cite: 3, 5]
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;[cite: 3, 5]
    }, 1000);[cite: 3]
}

function spawnDrop(pos) {
    let isH  = (hp < 50) ? Math.random() > 0.3 : Math.random() > 0.7;[cite: 3, 5]
    let col  = isH ? 0xff0000 : 0x00ffff;[cite: 3]
    let dMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),[cite: 3]
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })[cite: 3]
    );[cite: 3]
    dMesh.position.set(pos.x, 0.8, pos.z);[cite: 3]
    scene.add(dMesh);[cite: 3]
    drops.push({ mesh: dMesh, type: isH ? 'hp' : 'ammo' });[cite: 3]
}

function startGame() {
    checkDevice();[cite: 3, 4]
    if (isMobile) {[cite: 3, 5]
        requestFullscreen();[cite: 3, 4]
        if (!isLandscape()) { updateOrientationOverlay(); return; }[cite: 3, 4]
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();[cite: 3, 5]
    document.getElementById('menu').style.display    = 'none';[cite: 1, 3]
    document.getElementById('ui').style.display      = 'block';[cite: 1, 3]
    document.getElementById('crosshair').style.display = 'block';[cite: 1, 3]
    if (!isMobile) document.body.requestPointerLock();[cite: 3, 6]
    else document.querySelectorAll('.touch-controls').forEach(el => el.style.display = 'flex');[cite: 2, 3]
    init();[cite: 3]
    gameRunning = true;[cite: 3, 5]
    startWave(1);[cite: 3, 5]
    animate();[cite: 3]
}

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;[cite: 3]
    camera.aspect = window.innerWidth / window.innerHeight;[cite: 3]
    camera.updateProjectionMatrix();[cite: 3]
    renderer.setSize(window.innerWidth, window.innerHeight);[cite: 3]
});
