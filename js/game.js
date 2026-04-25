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

    // Ground
    let road = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ color: 0x080808 })
    );
    road.rotation.x = -Math.PI / 2;
    scene.add(road);

    // Buildings
    for (let i = 0; i < 40; i++) {
        let bh     = Math.random() * 20 + 10;
        let bColor = Math.random() > 0.5 ? 0x111111 : 0x1a1a1a;
        let mesh   = new THREE.Mesh(
            new THREE.BoxGeometry(5, bh, 5),
            new THREE.MeshStandardMaterial({ color: bColor, emissive: 0x000000 })
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

    // Particle pool
    const pGeo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        pMesh.visible = false;
        scene.add(pMesh);
        particles.push({ mesh: pMesh, velocity: new THREE.Vector3(), active: false, life: 0 });
    }

    // Player
    player = new THREE.Object3D();
    player.position.set(0, 1.8, 0);
    scene.add(player);

    setupControls();
}

// ── Weapons ──

function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;
    const now = performance.now();
    if (now - lastShotTime < SHOOT_COOLDOWN) return;
    ammo--; lastShotTime = now; Sound.shoot(); shakeAmount = 0.12;

    let bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    bullet.position.copy(player.position);
    let dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
    bullets.push({ mesh: bullet, dir, dist: 0 });
    scene.add(bullet);
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip) return;
    isReloading = true; Sound.reload();
    document.getElementById('wave-status').innerText = 'RELOADING...';
    setTimeout(() => {
        let needed   = maxClip - ammo;
        let transfer = Math.min(needed, reserve);
        ammo    += transfer;
        reserve -= transfer;
        isReloading = false;
        document.getElementById('wave-status').innerText = 'WAVE ' + wave;
    }, 1000);
}

// ── Wave / Enemy spawning ──

function startWave(num) {
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
    let angle = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 20;
    let ex = player.position.x + Math.cos(angle) * dist;
    let ez = player.position.z + Math.sin(angle) * dist;
    let typeRoll = Math.random();

    let type = { color: 0xff0040, hp: 100, speed: 0.08, size: 1.2 };
    if (typeRoll > 0.8) type = { color: 0xaa00ff, hp: 400, speed: 0.05, size: 2.2 }; // Tank
    if (typeRoll < 0.2) type = { color: 0xffff00, hp: 40,  speed: 0.18, size: 0.8 }; // Scout

    let mesh = new THREE.Mesh(
        new THREE.BoxGeometry(type.size, type.size * 1.8, type.size),
        new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 })
    );
    mesh.position.set(ex, type.size * 0.9, ez);
    scene.add(mesh);
    enemies.push({ mesh, hp: type.hp, speed: type.speed, size: type.size, strafeDir: Math.random() > 0.5 ? 1 : -1, nextStrafeChange: Date.now() + 1500 });
}

// ── Drops ──

function spawnDrop(pos) {
    let isH  = (hp < 50) ? Math.random() > 0.3 : Math.random() > 0.7;
    let col  = isH ? 0xff0000 : 0x00ffff;
    let dMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
    );
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);
    drops.push({ mesh: dMesh, type: isH ? 'hp' : 'ammo' });
}

// ── HUD ──

function updateUI() {
    document.getElementById('hp-val').innerText      = Math.max(0, Math.ceil(hp));
    document.getElementById('ammo-val').innerText    = ammo;
    document.getElementById('reserve-val').innerText = reserve;
    document.getElementById('score-val').innerText   = score;
    document.getElementById('enemies-left').innerText = enemies.length + enemiesToSpawn;
    document.getElementById('reload-msg').style.display = (ammo <= 3 && reserve > 0) ? 'block' : 'none';
}

// ── Game loop ──

function animate() {
    if (!gameRunning) return;
    if (hp <= 0) {
        gameRunning = false;
        document.getElementById('gameover').style.display = 'flex';
        document.getElementById('final-score').innerText  = score;
        return;
    }
    requestAnimationFrame(animate);

    // Player movement
    let sp = 0.2, pSize = 0.7;
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

    // Camera
    camera.position.copy(player.position);
    if (shakeAmount > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
        shakeAmount *= 0.88;
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // Bullets
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
                e.hp -= 50; hitEnemy = true;
                createImpact(nextPos, 0xff0040, 12);
                break;
            }
        }
        if (hitEnemy) { scene.remove(b.mesh); bullets.splice(i, 1); continue; }
        b.mesh.position.copy(nextPos); b.dist += 2.0;
    }

    // Particles
    particles.forEach(p => {
        if (!p.active) return;
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.01;
        p.life -= 0.03;
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
            let angle = Math.random() * Math.PI * 2;
            e.mesh.position.x = player.position.x + Math.cos(angle) * 30;
            e.mesh.position.z = player.position.z + Math.sin(angle) * 30;
            createImpact(e.mesh.position, 0xaa00ff, 15);
            continue;
        }

        let toP   = player.position.clone().sub(e.mesh.position).normalize();
        let sV    = new THREE.Vector3(-toP.z, 0, toP.x);
        let moveX = (toP.x * e.speed) + (sV.x * e.strafeDir * e.speed * 0.4);
        let moveZ = (toP.z * e.speed) + (sV.z * e.strafeDir * e.speed * 0.4);

        e.mesh.position.x += moveX;
        if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.x -= moveX;
        e.mesh.position.z += moveZ;
        if (checkCollision(e.mesh.position, e.size / 2)) e.mesh.position.z -= moveZ;

        e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);
        if (distToPlayer < 1.8) { hp -= 0.5; shakeAmount = 0.08; createImpact(player.position, 0xffffff, 2); }
    }

    if (enemies.length === 0 && enemiesToSpawn === 0 && !isWaveTransition) startWave(wave + 1);

    // Drops
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        d.mesh.rotation.y += 0.08;
        d.mesh.position.y = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
        if (player.position.distanceTo(d.mesh.position) < 2.0) {
            Sound.pickup();
            if (d.type === 'hp') hp = Math.min(100, hp + 25); else reserve += 24;
            createImpact(d.mesh.position, d.type === 'hp' ? 0xff0000 : 0x00ffff, 15);
            scene.remove(d.mesh); drops.splice(i, 1);
        }
    }

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
    document.getElementById('menu').style.display    = 'none';
    document.getElementById('ui').style.display      = 'block';
    document.getElementById('crosshair').style.display = 'block';
    if (!isMobile) document.body.requestPointerLock();
    else document.querySelectorAll('.touch-controls').forEach(el => el.style.display = 'flex');
    init();
    gameRunning = true;
    startWave(1);
    animate();
}

// ── Resize ──

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
