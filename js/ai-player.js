// ── js/ai_player.js ──
// NEXUS AI — Tactical Player Controller v2
//
// INSTALL:
//   1. Copy this file to  js/ai_player.js
//   2. In index.html, after ALL other <script> tags, add:
//        <script src="js/ai_player.js"></script>
//   3. In-game press  Alt+A  or click the ▶ NEXUS AI button (bottom-right)

const NEXUS = (() => {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    //  PERSISTENCE / LEARNING
    // ─────────────────────────────────────────────────────────────
    const MEM_KEY = 'nexus_memory_v2';
    let mem = (() => {
        try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch { return {}; }
    })();
    mem.threatDeaths = mem.threatDeaths || { scout:0, sniper:0, bomber:0, tank:0, boss:0, runner:0 };
    mem.totalRuns    = mem.totalRuns    || 0;
    mem.bestWave     = mem.bestWave     || 0;
    mem.dangerZones  = mem.dangerZones  || [];

    function saveMem() {
        try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch {}
    }

    // ─────────────────────────────────────────────────────────────
    //  AI STATE
    // ─────────────────────────────────────────────────────────────
    let active  = false;
    let rafId   = null;

    const ai = {
        phase:       'IDLE',
        strafeDir:   1,
        strafeTimer: 0,
        lastHp:      100,
        lastPos:     null,
        stuckTicks:  0,
        log:         [],
        hudTick:     0,
        threatScore: 0,
    };

    // ─────────────────────────────────────────────────────────────
    //  THREAT SCORING
    // ─────────────────────────────────────────────────────────────
    function scoreEnemy(e) {
        if (!player) return 0;
        const d    = player.position.distanceTo(e.mesh.position);
        const hpF  = hp / playerMaxHp;
        const name = (e.name || '').toLowerCase();
        let   s    = 0;

        if (e.isBoss)            s = 2000;
        else if (name==='bomber')  s = 600 - d * 10;
        else if (name==='scout')   s = 350 - d * 1.5;
        else if (name==='sniper')  s = 220;
        else if (name==='runner')  s = 130 - d;
        else if (name==='tank')    s = 90;
        else                       s = 110;

        if (name !== 'sniper') s += Math.max(0, 28 - d) * 5;
        if (hpF < 0.35) s *= 1.5;
        s += (mem.threatDeaths[name] || 0) * 18;
        s += Math.max(0, 80 - e.hp) * 0.4;

        // Heavily penalize enemies we can't see — prefer visible targets
        if (!hasLineOfSight(player.position, e.mesh.position)) s -= 800;

        return s;
    }

    function getBestTarget() {
        if (!enemies || !enemies.length) return null;
        let best = null, bS = -Infinity;
        for (const e of enemies) { const s = scoreEnemy(e); if (s > bS) { bS = s; best = e; } }
        ai.threatScore = bS;
        return best;
    }

    // ─────────────────────────────────────────────────────────────
    //  DROP SCORING
    // ─────────────────────────────────────────────────────────────
    function scoreDrop(d) {
        if (!player) return -1;
        const dist = player.position.distanceTo(d.mesh.position);
        const hpF  = hp / playerMaxHp;
        const ammoT = ammo + reserve;
        let s = 0;

        if (d.type === 'hp') {
            if      (hpF < 0.30) s = 1000;
            else if (hpF < 0.50) s = 600;
            else if (hpF < 0.75) s = 200;
            else                 s = 40;
        } else if (d.type === 'ammo') {
            // Desperate: out of ammo entirely — highest possible priority
            if      (ammo === 0 && reserve === 0) s = 1100;
            else if (ammo <= 2 && reserve === 0)  s = 950;
            else if (ammoT < 10)                  s = 500;
            else if (ammoT < 24)                  s = 150;
            else                                  s = 40;
        } else if (d.type === 'secondary') {
            s = 700;
        } else if (d.type === 'powerup') {
            const vals = { overclock:600, shield:500, rapid:400, speed:300 };
            s = vals[d.powerup] || 250;
            if (d.powerup === 'shield'    && enemies && enemies.length > 4) s += 200;
            if (d.powerup === 'overclock' && isBossWave) s += 400;
        }

        // Reduced distance penalty (was *5 — too harsh for powerups at mid range)
        s -= dist * 2.5;

        // Only suppress non-critical non-hp drops during huge enemy swarms,
        // and never suppress ammo pickups when the AI is out of ammo
        const ammoEmergency = (d.type === 'ammo' && ammo === 0 && reserve === 0);
        if (!ammoEmergency && enemies && enemies.length > 6 && hpF > 0.65 && d.type !== 'hp') {
            s *= 0.6; // was 0.3 — less extreme suppression so powerups still register
        }
        return s;
    }

    function getBestDrop() {
        if (!drops || !drops.length) return null;

        // Emergency ammo override: if completely dry, pick nearest ammo drop regardless of score
        if (ammo === 0 && reserve === 0) {
            const ammoDrop = drops
                .filter(d => d.type === 'ammo')
                .sort((a, b) =>
                    player.position.distanceTo(a.mesh.position) -
                    player.position.distanceTo(b.mesh.position)
                )[0];
            if (ammoDrop) return ammoDrop;
        }

        let best = null, bS = -Infinity;
        for (const d of drops) { const s = scoreDrop(d); if (s > bS) { bS = s; best = d; } }
        return (bS > 30) ? best : null;
    }

    // ─────────────────────────────────────────────────────────────
    //  AIM — directly writes yaw / pitch globals
    // ─────────────────────────────────────────────────────────────
    function aimAt(worldPos) {
        const dx  = worldPos.x - player.position.x;
        const dz  = worldPos.z - player.position.z;
        const dy  = (worldPos.y != null ? worldPos.y : player.position.y) - player.position.y + 0.3;
        const hd  = Math.sqrt(dx * dx + dz * dz);

        const tYaw   = Math.atan2(-dx, -dz);
        const tPitch = Math.atan2(dy, hd);

        let dYaw = tYaw - yaw;
        while (dYaw >  Math.PI) dYaw -= 2 * Math.PI;
        while (dYaw < -Math.PI) dYaw += 2 * Math.PI;

        yaw   += dYaw   * 0.18;
        pitch += (tPitch - pitch) * 0.25;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));

        return Math.abs(dYaw) < 0.10;
    }

    // ─────────────────────────────────────────────────────────────
    //  MOVE — directly pushes player.position in world-space
    //  Mirrors the game loop's own collision handling exactly.
    // ─────────────────────────────────────────────────────────────
    function moveWorld(wx, wz) {
        const sp  = (boosts && boosts.speed && Date.now() < boosts.speed)
                    ? playerSpeed * 1.8 : playerSpeed;
        const len = Math.sqrt(wx * wx + wz * wz) || 1;
        const mx  = (wx / len) * sp;
        const mz  = (wz / len) * sp;

        player.position.x += mx;
        if (checkCollision(player.position, 0.7)) player.position.x -= mx;

        player.position.z += mz;
        if (checkCollision(player.position, 0.7)) player.position.z -= mz;
    }

    // ─────────────────────────────────────────────────────────────
    //  STUCK DETECTION
    // ─────────────────────────────────────────────────────────────
    function checkStuck() {
        if (!ai.lastPos) { ai.lastPos = { x: player.position.x, z: player.position.z }; return; }
        const moved = Math.hypot(
            player.position.x - ai.lastPos.x,
            player.position.z - ai.lastPos.z
        );
        ai.stuckTicks = (moved < 0.02) ? ai.stuckTicks + 1 : 0;
        ai.lastPos = { x: player.position.x, z: player.position.z };

        if (ai.stuckTicks > 18) {
            ai.stuckTicks  = 0;
            ai.strafeDir  *= -1;
            ai.strafeTimer = 0;
            const ang = Math.random() * Math.PI * 2;
            moveWorld(Math.cos(ang) * 3, Math.sin(ang) * 3);
            log('UNSTUCK — nudge');
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  DANGER ZONES
    // ─────────────────────────────────────────────────────────────
    function markDanger(pos) {
        mem.dangerZones.push({ x: pos.x, z: pos.z, t: Date.now() });
        if (mem.dangerZones.length > 60) mem.dangerZones.shift();
        saveMem();
    }

    function inDanger(x, z) {
        const now = Date.now();
        return mem.dangerZones.some(dz =>
            (now - dz.t) < 25000 && Math.hypot(dz.x - x, dz.z - z) < 6
        );
    }

    // ─────────────────────────────────────────────────────────────
    //  STRAFE HELPER
    // ─────────────────────────────────────────────────────────────
    function strafeVec(ux, uz) {
        ai.strafeTimer--;
        if (ai.strafeTimer <= 0) {
            ai.strafeDir  *= -1;
            ai.strafeTimer = 10 + Math.floor(Math.random() * 16);
        }
        return { x: -uz * ai.strafeDir, z: ux * ai.strafeDir };
    }

    // ─────────────────────────────────────────────────────────────
    //  LINE-OF-SIGHT — ray vs AABB slab test (XZ plane)
    //  Returns true if the path from 'from' to 'to' is clear of
    //  all buildings. Uses the slab method on each building AABB.
    // ─────────────────────────────────────────────────────────────
    function hasLineOfSight(from, to) {
        if (!buildings || !buildings.length) return true;

        const dx = to.x - from.x;
        const dz = to.z - from.z;

        for (const b of buildings) {
            // Tiny margin so the ray catches near-grazes
            const margin = 0.4;
            const minX = b.minX - margin, maxX = b.maxX + margin;
            const minZ = b.minZ - margin, maxZ = b.maxZ + margin;

            // Skip if either endpoint is already inside this building
            const fromIn = from.x > minX && from.x < maxX && from.z > minZ && from.z < maxZ;
            const toIn   =   to.x > minX &&   to.x < maxX &&   to.z > minZ &&   to.z < maxZ;
            if (fromIn || toIn) continue;

            // X-axis slab
            let tMinX = -Infinity, tMaxX = Infinity;
            if (Math.abs(dx) > 1e-9) {
                const t1 = (minX - from.x) / dx;
                const t2 = (maxX - from.x) / dx;
                tMinX = Math.min(t1, t2);
                tMaxX = Math.max(t1, t2);
            } else {
                if (from.x < minX || from.x > maxX) continue; // parallel and outside
            }

            // Z-axis slab
            let tMinZ = -Infinity, tMaxZ = Infinity;
            if (Math.abs(dz) > 1e-9) {
                const t1 = (minZ - from.z) / dz;
                const t2 = (maxZ - from.z) / dz;
                tMinZ = Math.min(t1, t2);
                tMaxZ = Math.max(t1, t2);
            } else {
                if (from.z < minZ || from.z > maxZ) continue;
            }

            // Slab overlap within segment [0, 1]
            const tEnter = Math.max(tMinX, tMinZ);
            const tExit  = Math.min(tMaxX, tMaxZ);
            if (tEnter < tExit && tEnter < 1.0 && tExit > 0.0) {
                return false; // blocked
            }
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    //  ROCKET LOGIC
    // ─────────────────────────────────────────────────────────────
    function considerRocket(tgt) {
        if (!hasSecondaryWeapon || secondaryAmmo <= 0 || !tgt) return;
        const d = player.position.distanceTo(tgt.mesh.position);
        if (d < 5 || d > 55) return;
        if (!hasLineOfSight(player.position, tgt.mesh.position)) return;

        const cluster = enemies.filter(e =>
            e.mesh.position.distanceTo(tgt.mesh.position) < 8
        ).length;

        if (tgt.isBoss || cluster >= 3 || (tgt.name === 'TANK' && d < 22)) {
            if (aimAt(tgt.mesh.position)) {
                fireSecondary();
                log(`ROCKET → ${tgt.isBoss ? 'BOSS' : tgt.name} cluster:${cluster}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  PREFERRED ENGAGEMENT DISTANCES
    // ─────────────────────────────────────────────────────────────
    const PREF = { bomber:14, sniper:11, scout:8, runner:15, tank:12 };

    // ─────────────────────────────────────────────────────────────
    //  PHASE DETERMINATION
    // ─────────────────────────────────────────────────────────────
    function getPhase(tgt, dp) {
        const hpF = hp / playerMaxHp;

        const closeBomber = enemies && enemies.find(e =>
            e.name === 'BOMBER' &&
            player.position.distanceTo(e.mesh.position) < 13
        );

        if (!enemies || enemies.length === 0)          return dp ? 'SEEK_DROP' : 'IDLE';
        if (closeBomber)                                return 'EVADE_BOMBER';

        // Critical HP — seek HP drop or kite
        if (hpF < 0.28) {
            const hpDrop = drops && drops.find(d => d.type === 'hp');
            return hpDrop ? 'SEEK_DROP' : 'KITE';
        }

        // Out of ammo entirely — always seek nearest ammo drop, even mid-combat
        if (ammo === 0 && reserve === 0) {
            const ammoDrop = drops && drops.find(d => d.type === 'ammo');
            if (ammoDrop) return 'SEEK_DROP';
        }

        // Seek any high-value drop nearby (lowered threshold from 300 to 200 for powerups)
        if (dp && scoreDrop(dp) > 200 &&
            player.position.distanceTo(dp.mesh.position) < 35) return 'SEEK_DROP';

        if (tgt && tgt.name === 'SNIPER' &&
            player.position.distanceTo(tgt.mesh.position) > 18)  return 'KITE';

        return 'HUNT';
    }

    // ─────────────────────────────────────────────────────────────
    //  PHASE EXECUTORS
    // ─────────────────────────────────────────────────────────────

    function doIdle(dp) {
        if (dp) { ai.phase = 'SEEK_DROP'; }
        else    { yaw += 0.008; }
    }

    function doHunt(tgt) {
        if (!tgt) { doIdle(null); return; }

        const los = hasLineOfSight(player.position, tgt.mesh.position);

        aimAt(tgt.mesh.position);

        const d    = player.position.distanceTo(tgt.mesh.position);
        const name = (tgt.name || '').toLowerCase();
        const pref = PREF[name] || 18;

        const dx = tgt.mesh.position.x - player.position.x;
        const dz = tgt.mesh.position.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        let wx, wz;
        if (!los) {
            // No line of sight — move toward enemy while strafing hard to one side
            // to flank around the building. Pure strafe lets us slide along the wall.
            wx = ux * 0.5 + sv.x * 1.2;
            wz = uz * 0.5 + sv.z * 1.2;
        } else if (d > pref + 2) {
            wx = ux * 0.85 + sv.x * 0.55;
            wz = uz * 0.85 + sv.z * 0.55;
        } else if (d < pref - 2) {
            wx = -ux * 0.85 + sv.x * 0.55;
            wz = -uz * 0.85 + sv.z * 0.55;
        } else {
            wx = sv.x;
            wz = sv.z;
        }

        if (inDanger(player.position.x + wx * 2, player.position.z + wz * 2)) {
            wx = -wx; wz = -wz;
        }

        moveWorld(wx, wz);

        // Only shoot when we actually have line of sight
        if (los && ammo > 0 && !isReloading) shoot();
        else if (ammo === 0 && reserve === 0) {
            // Completely out of ammo and no drop yet — kite away from enemies
            const dx = player.position.x - tgt.mesh.position.x;
            const dz = player.position.z - tgt.mesh.position.z;
            const len = Math.sqrt(dx*dx + dz*dz) || 1;
            moveWorld(dx / len, dz / len);
        }
        considerRocket(tgt);
    }

    function doKite(tgt) {
        if (!tgt) { doIdle(null); return; }

        aimAt(tgt.mesh.position);

        const dx  = tgt.mesh.position.x - player.position.x;
        const dz  = tgt.mesh.position.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        moveWorld(-ux * 0.6 + sv.x * 0.8, -uz * 0.6 + sv.z * 0.8);

        if (hasLineOfSight(player.position, tgt.mesh.position) && ammo > 0 && !isReloading) shoot();
    }

    function doSeekDrop(dp, tgt) {
        if (!dp || !dp.mesh) { ai.phase = 'HUNT'; return; }

        if (tgt) {
            aimAt(tgt.mesh.position);
            const los = hasLineOfSight(player.position, tgt.mesh.position);
            if (los && player.position.distanceTo(tgt.mesh.position) < 35 && ammo > 0 && !isReloading) shoot();
        } else {
            aimAt(dp.mesh.position);
        }

        const dx   = dp.mesh.position.x - player.position.x;
        const dz   = dp.mesh.position.z - player.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < 1.8) {
            ai.phase = 'HUNT';
            log(`COLLECTED ${dp.type.toUpperCase()}`);
            return;
        }

        moveWorld(dx / dist, dz / dist);
    }

    function doEvadeBomber(bomber, tgt) {
        if (!bomber || !bomber.mesh) { ai.phase = 'HUNT'; return; }

        aimAt(bomber.mesh.position);
        if (hasLineOfSight(player.position, bomber.mesh.position) && ammo > 0 && !isReloading) shoot();

        const dx  = player.position.x - bomber.mesh.position.x;
        const dz  = player.position.z - bomber.mesh.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        moveWorld(dx / len, dz / len);
    }

    // ─────────────────────────────────────────────────────────────
    //  MAIN FRAME HOOK
    // ─────────────────────────────────────────────────────────────
    function frame() {
        if (!active) return;
        rafId = requestAnimationFrame(frame);

        if (!gameRunning || gamePaused || !player || hp <= 0) return;

        // Auto-reload
        if (ammo <= 2 && reserve > 0 && !isReloading) reload();

        // Damage detection
        if (hp < ai.lastHp - 1) {
            markDanger(player.position);
            const tgt = getBestTarget();
            if (tgt) {
                const n = (tgt.name || '').toLowerCase();
                mem.threatDeaths[n] = (mem.threatDeaths[n] || 0) + 0.15;
                saveMem();
            }
        }
        ai.lastHp = hp;

        checkStuck();

        const tgt = getBestTarget();
        const dp  = getBestDrop();

        const closeBomber = enemies && enemies.find(e =>
            e.name === 'BOMBER' &&
            player.position.distanceTo(e.mesh.position) < 13
        );

        const newPhase = getPhase(tgt, dp);
        if (newPhase !== ai.phase) {
            log(`→ ${newPhase}${tgt ? ' [' + (tgt.isBoss ? 'BOSS' : tgt.name) + ']' : ''} hp:${Math.ceil(hp)}`);
            ai.phase = newPhase;
        }

        switch (ai.phase) {
            case 'IDLE':         doIdle(dp);                       break;
            case 'HUNT':         doHunt(tgt);                      break;
            case 'KITE':         doKite(tgt);                      break;
            case 'SEEK_DROP':    doSeekDrop(dp, tgt);              break;
            case 'EVADE_BOMBER': doEvadeBomber(closeBomber, tgt);  break;
        }

        // HUD every 4 frames
        if (++ai.hudTick % 4 === 0) updateHUD();
    }

    // ─────────────────────────────────────────────────────────────
    //  LOGGING
    // ─────────────────────────────────────────────────────────────
    function log(msg) {
        ai.log.unshift(msg);
        if (ai.log.length > 10) ai.log.pop();
    }

    // ─────────────────────────────────────────────────────────────
    //  POINTER-LOCK PATCH
    // ─────────────────────────────────────────────────────────────
    let plPatched = false;
    function patchPointerLock() {
        if (plPatched) return;
        plPatched = true;
        document.addEventListener('pointerlockchange', () => {
            if (active && gameRunning && !document.pointerLockElement) {
                setTimeout(() => {
                    if (active && gamePaused) {
                        gamePaused = false;
                        const pm = document.getElementById('pause-menu');
                        if (pm) pm.style.display = 'none';
                    }
                }, 8);
            }
        }, true);
    }

    // ─────────────────────────────────────────────────────────────
    //  ENABLE / DISABLE
    // ─────────────────────────────────────────────────────────────
    function enable() {
        if (active) return;
        active = true;
        ai.lastHp    = hp || 100;
        ai.phase     = 'IDLE';
        ai.lastPos   = null;
        ai.stuckTicks = 0;
        patchPointerLock();
        rafId = requestAnimationFrame(frame);
        const btn = document.getElementById('nexus-btn');
        if (btn) { btn.textContent = '■ NEXUS AI'; btn.classList.add('on'); }
        const hud = document.getElementById('nexus-hud');
        if (hud) hud.style.display = 'block';
        log('NEXUS ONLINE');
        updateHUD();
    }

    function disable() {
        if (!active) return;
        active = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        const btn = document.getElementById('nexus-btn');
        if (btn) { btn.textContent = '▶ NEXUS AI'; btn.classList.remove('on'); }
        const hud = document.getElementById('nexus-hud');
        if (hud) hud.style.display = 'none';
    }

    // ─────────────────────────────────────────────────────────────
    //  HUD
    // ─────────────────────────────────────────────────────────────
    function updateHUD() {
        const el = document.getElementById('nexus-hud');
        if (!el) return;
        const hF = player ? hp / playerMaxHp : 0;
        const hC = hF < 0.3 ? '#ff3040' : hF < 0.55 ? '#ff8800' : '#00ff88';
        const aF = maxClip > 0 ? ammo / maxClip : 0;
        const phaseColors = {
            HUNT:'#0ff', KITE:'#ff0', SEEK_DROP:'#f46', EVADE_BOMBER:'#f80', IDLE:'#556', FLANK:'#a0f'
        };
        const pC = phaseColors[ai.phase] || '#0fc';
        el.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,255,204,0.2);padding-bottom:5px;margin-bottom:7px">
  <span style="color:#0fc;font-size:12px;letter-spacing:2px;font-weight:bold">◈ NEXUS AI</span>
  <span style="font-size:9px;padding:2px 8px;border-radius:3px;background:${pC}22;color:${pC};letter-spacing:1px;border:1px solid ${pC}44">${ai.phase}</span>
</div>
<div style="margin-bottom:7px">
  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
    <span style="color:#445;font-size:9px;width:38px;letter-spacing:1px">HP</span>
    <div style="flex:1;height:5px;background:#0a0f1a;border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${(hF*100).toFixed(0)}%;background:${hC};border-radius:2px;transition:width 0.1s"></div></div>
    <span style="font-size:9px;color:${hC};width:52px;text-align:right">${Math.ceil(hp)}/${playerMaxHp}</span>
  </div>
  <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px">
    <span style="color:#445;font-size:9px;width:38px;letter-spacing:1px">AMMO</span>
    <div style="flex:1;height:5px;background:#0a0f1a;border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${(aF*100).toFixed(0)}%;background:#0ff;border-radius:2px;transition:width 0.1s"></div></div>
    <span style="font-size:9px;color:#0ff;width:52px;text-align:right">${ammo}+${reserve}</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:9px;color:#445">
    <span>ENEMIES <span style="color:#f46">${enemies ? enemies.length : 0}</span></span>
    <span>DROPS <span style="color:#a0f">${drops ? drops.length : 0}</span></span>
    <span>THREAT <span style="color:#f80">${ai.threatScore.toFixed(0)}</span></span>
  </div>
</div>
<div style="border-top:1px solid rgba(0,255,204,0.1);padding-top:5px;margin-bottom:5px">
${ai.log.slice(0,6).map(l=>`<div style="color:#344;font-size:9px;line-height:1.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l}</div>`).join('')}
</div>
<div style="border-top:1px solid rgba(0,255,204,0.1);padding-top:4px;color:#334;font-size:9px;letter-spacing:0.5px">
  Wave ${typeof wave!=='undefined'?wave:'–'} · Best wave ${mem.bestWave} · Run #${mem.totalRuns}
</div>`;
    }

    // ─────────────────────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────────────────────
    function injectUI() {
        if (document.getElementById('nexus-btn')) return;

        const s = document.createElement('style');
        s.textContent = `
        #nexus-hud {
            position:fixed;top:14px;right:170px;width:232px;
            background:rgba(0,2,10,0.88);
            border:1px solid rgba(0,255,204,0.22);border-radius:6px;
            padding:10px 12px;font-family:'Courier New',monospace;
            color:#aee;z-index:9999;pointer-events:none;
            backdrop-filter:blur(6px);
            box-shadow:0 0 24px rgba(0,255,204,0.08),inset 0 0 30px rgba(0,255,204,0.03);
            display:none;
        }
        #nexus-btn {
            position:fixed;bottom:55px;right:14px;
            background:rgba(0,255,204,0.06);
            border:1px solid rgba(0,255,204,0.35);
            color:#0fc;font-family:'Courier New',monospace;
            font-size:10px;letter-spacing:2px;padding:7px 14px;
            cursor:pointer;border-radius:4px;z-index:9999;
            transition:background 0.2s,box-shadow 0.2s;
        }
        #nexus-btn:hover { background:rgba(0,255,204,0.15);box-shadow:0 0 10px rgba(0,255,204,0.2); }
        #nexus-btn.on    { background:rgba(0,255,204,0.18);border-color:#0fc;box-shadow:0 0 14px rgba(0,255,204,0.25); }
        `;
        document.head.appendChild(s);

        const hud = document.createElement('div');
        hud.id = 'nexus-hud';
        document.body.appendChild(hud);

        const btn = document.createElement('button');
        btn.id = 'nexus-btn';
        btn.textContent = '▶ NEXUS AI';
        btn.addEventListener('click', () => active ? disable() : enable());
        document.body.appendChild(btn);
    }

    // Watch for game-over to save run stats
    setInterval(() => {
        if (active && typeof hp !== 'undefined' && hp <= 0) {
            mem.totalRuns++;
            const w = typeof wave !== 'undefined' ? wave : 0;
            if (w > mem.bestWave) mem.bestWave = w;
            saveMem();
            log(`RUN OVER wave:${w} | best:${mem.bestWave}`);
        }
    }, 600);

    const ready = () => {
        injectUI();
        document.addEventListener('keydown', e => {
            if (e.altKey && e.key.toLowerCase() === 'a') {
                active ? disable() : enable();
            }
        });
        console.log('%c[NEXUS AI v2] Ready — Alt+A or click ▶ NEXUS AI to activate', 'color:#00ffcc;font-weight:bold');
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();

    return {
        enable, disable,
        get on()  { return active; },
        get mem() { return mem; },
        resetMemory() {
            mem = {
                threatDeaths:{scout:0,sniper:0,bomber:0,tank:0,boss:0,runner:0},
                totalRuns:0, bestWave:0, dangerZones:[]
            };
            saveMem();
        }
    };
})();

// ─────────────────────────────────────────────────────────────────
// INSTALL:
//   1. Save as  js/ai_player.js
//   2. In index.html, LAST line inside <body> before </body>:
//        <script src="js/ai_player.js"></script>
//   3. Open game → start a run → click ▶ NEXUS AI  or  Alt+A
// ─────────────────────────────────────────────────────────────────
