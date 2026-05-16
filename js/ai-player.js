// ── js/ai_player.js ──
// NEXUS AI — Tactical Player Controller
// A fully autonomous AI that controls the player character with adaptive strategy,
// threat prioritization, environment awareness, drop seeking, and learning from mistakes.
//
// HOW TO INSTALL:
//   1. Add <script src="js/ai_player.js"></script> to index.html AFTER all other scripts
//   2. Add the AI HUD panel (see index.html snippet at the bottom of this file)
//   3. Optionally call NEXUS.enable() from console or bind to a key

// ════════════════════════════════════════════════════════════════
//  NEXUS AI CONTROLLER
// ════════════════════════════════════════════════════════════════

const NEXUS = (() => {
    'use strict';

    // ── State ──────────────────────────────────────────────────────
    let enabled        = false;
    let tickInterval   = null;
    let frameHook      = null;

    // ── Memory & Learning ──────────────────────────────────────────
    // Persisted across browser sessions via localStorage
    const MEM_KEY = 'nexus_memory';
    let memory = (() => {
        try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch { return {}; }
    })();

    // Threat kill stats: tracks how many times AI died while this threat type was the danger
    // Used to tune threat priority weights over runs
    memory.threatDeaths  = memory.threatDeaths  || { scout: 0, sniper: 0, bomber: 0, tank: 0, boss: 0, runner: 0 };
    memory.totalRuns     = memory.totalRuns     || 0;
    memory.bestWave      = memory.bestWave      || 0;
    memory.lastRunWave   = memory.lastRunWave   || 0;
    // Map of danger zones: positions where the AI took damage often
    memory.dangerZones   = memory.dangerZones   || [];
    // Per-powerup value learned over time
    memory.powerupValue  = memory.powerupValue  || { hp: 10, ammo: 6, speed: 5, shield: 9, rapid: 7, overclock: 9, secondary: 10 };

    function saveMemory() {
        try { localStorage.setItem(MEM_KEY, JSON.stringify(memory)); } catch {}
    }

    // ── AI Working State ───────────────────────────────────────────
    let state = {
        phase: 'IDLE',          // IDLE | HUNT | EVADE | SEEK_DROP | REPOSITION | KITE
        target: null,           // current primary enemy target
        dropTarget: null,       // current drop target
        moveDir: { x: 0, z: 0 },
        aimYaw: 0,
        aimPitch: 0,
        strafeTimer: 0,
        strafeDir: 1,
        repositionTimer: 0,
        lastDamageTick: 0,
        lastHpAtDmg: 0,
        decisionTimer: 0,
        tacticalLog: [],        // recent decisions for HUD
        currentThreatScore: 0,  // highest threat score in field
        explosiveSteering: false,
        kiteDir: null,
        pathfindAttempts: 0,
        stuckTimer: 0,
        lastPos: null,
        runStartHp: 100,
        bestRunHp: 100,
        avgEngageDist: 20,      // learned preferred engage distance
    };

    // ── Constants ──────────────────────────────────────────────────
    const AI_TICK_MS      = 50;   // decision frequency (20 fps logic)
    const CRITICAL_HP_PCT = 0.30; // below 30% = critical
    const LOW_HP_PCT      = 0.50; // below 50% = seek heals
    const LOW_AMMO        = 4;    // bullets remaining to force reload
    const SAFE_DIST_FROM_BOMBER = 8;
    const SNIPER_DANGER_DIST    = 35;
    const PREFERRED_FIGHT_DIST  = 18; // default engagement distance
    const MAX_YAW_SLEW          = 0.12; // radians per tick max aim speed

    // ── Threat scoring ─────────────────────────────────────────────
    // Returns a danger score for an enemy based on type, distance, HP, and learned weights
    function threatScore(e) {
        const dist      = player.position.distanceTo(e.mesh.position);
        const hpFrac    = hp / playerMaxHp;
        let   base      = 0;
        const name      = (e.name || '').toLowerCase();

        // Base threat by type
        if (e.isBoss)          base = 1000;
        else if (name === 'bomber')  base = 500 - dist * 8; // extreme close-range danger
        else if (name === 'scout')   base = 300 - dist * 2; // fast → punishing at any dist
        else if (name === 'sniper')  base = 200 + (dist < SNIPER_DANGER_DIST ? 80 : 0);
        else if (name === 'runner')  base = 120 - dist * 1.5;
        else if (name === 'tank')    base = 80;  // slow but durable
        else                         base = 100;

        // Distance modifier — closer = more dangerous for melee types
        if (name !== 'sniper') base += Math.max(0, 30 - dist) * 4;

        // HP modifier — we're low → threats matter more
        if (hpFrac < CRITICAL_HP_PCT) base *= 1.4;

        // Learning modifier — AI died to this type before, fear it more
        const deathPenalty = (memory.threatDeaths[name] || 0) * 15;
        base += deathPenalty;

        // Easy kills first (prefer low-HP targets when safe)
        base += Math.max(0, 100 - e.hp) * 0.5;

        return base;
    }

    // ── Target selection ───────────────────────────────────────────
    function selectBestTarget() {
        if (!enemies || enemies.length === 0) return null;
        let best = null, bestScore = -Infinity;
        for (const e of enemies) {
            const s = threatScore(e);
            if (s > bestScore) { bestScore = s; best = e; }
        }
        state.currentThreatScore = bestScore;
        return best;
    }

    // ── Drop scoring ───────────────────────────────────────────────
    function dropUrgency(d) {
        const dist     = player.position.distanceTo(d.mesh.position);
        const hpFrac   = hp / playerMaxHp;
        const ammoFrac = (ammo + reserve) / (maxClip + 120);
        let   score    = 0;

        if (d.type === 'hp') {
            if (hpFrac < CRITICAL_HP_PCT)      score = 900;
            else if (hpFrac < LOW_HP_PCT)       score = 500;
            else if (hpFrac < 0.75)             score = 200;
            else                                score = 50;
        } else if (d.type === 'ammo') {
            if (ammo <= LOW_AMMO && reserve === 0) score = 800;
            else if (ammoFrac < 0.25)              score = 400;
            else                                   score = 80;
        } else if (d.type === 'secondary') {
            score = (memory.powerupValue.secondary || 10) * 60;
        } else if (d.type === 'powerup') {
            score = (memory.powerupValue[d.powerup] || 5) * 50;
            // Shield/overclock more valuable in high-pressure situations
            if (d.powerup === 'shield' && enemies.length > 3) score *= 1.5;
            if (d.powerup === 'overclock' && isBossWave)      score *= 2.0;
        }

        // Distance penalty — don't go far for low-value items
        score -= dist * 3;

        // Don't chase drops if critically outnumbered and no hp issue
        if (enemies.length > 5 && hpFrac > 0.6 && d.type !== 'hp') score *= 0.4;

        return score;
    }

    function selectBestDrop() {
        if (!drops || drops.length === 0) return null;
        let best = null, bestScore = -Infinity;
        for (const d of drops) {
            const s = dropUrgency(d);
            if (s > bestScore) { bestScore = s; best = d; }
        }
        return bestScore > 20 ? best : null;
    }

    // ── Aim system ─────────────────────────────────────────────────
    function aimAt(worldPos) {
        const dx = worldPos.x - player.position.x;
        const dz = worldPos.z - player.position.z;
        const dy = worldPos.y - player.position.y - 0.2; // aim slightly above center
        const dist = Math.sqrt(dx * dx + dz * dz);

        const desiredYaw   = Math.atan2(-dx, -dz);
        const desiredPitch = Math.atan2(dy, dist);

        // Smooth slew toward desired aim
        let dyaw = desiredYaw - yaw;
        // Wrap to [-π, π]
        while (dyaw >  Math.PI) dyaw -= 2 * Math.PI;
        while (dyaw < -Math.PI) dyaw += 2 * Math.PI;

        const slewSpeed = Math.min(MAX_YAW_SLEW * 2, Math.abs(dyaw)) * Math.sign(dyaw);
        yaw   += slewSpeed;
        pitch += (desiredPitch - pitch) * 0.3;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));

        return Math.abs(dyaw) < 0.08; // returns true if on-target
    }

    // ── Movement system ────────────────────────────────────────────
    function setMovement(x, z) {
        // Convert world-space movement to key presses relative to current yaw
        const fw = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const rt = { x:  Math.cos(yaw), z: -Math.sin(yaw) };

        const fwDot = x * fw.x + z * fw.z;
        const rtDot = x * rt.x + z * rt.z;

        keys['w'] = fwDot >  0.25;
        keys['s'] = fwDot < -0.25;
        keys['a'] = rtDot < -0.25;
        keys['d'] = rtDot >  0.25;
    }

    function stopMovement() {
        keys['w'] = keys['s'] = keys['a'] = keys['d'] = false;
    }

    // ── Stuck detection ────────────────────────────────────────────
    function checkStuck() {
        if (!state.lastPos) { state.lastPos = player.position.clone(); return; }
        const moved = player.position.distanceTo(state.lastPos);
        if (moved < 0.05) {
            state.stuckTimer++;
        } else {
            state.stuckTimer = 0;
        }
        state.lastPos = player.position.clone();

        // If stuck for >20 ticks (~1s), force a new direction
        if (state.stuckTimer > 20) {
            state.stuckTimer = 0;
            state.strafeDir *= -1;
            // Random nudge
            const nudgeAngle = Math.random() * Math.PI * 2;
            state.moveDir = { x: Math.cos(nudgeAngle), z: Math.sin(nudgeAngle) };
            logTactic('UNSTUCK — rerouting');
        }
    }

    // ── Building avoidance ─────────────────────────────────────────
    function avoidBuildings(mx, mz) {
        // If the proposed move would hit a building, find a clear direction
        const test = { x: player.position.x + mx * 2, y: player.position.y, z: player.position.z + mz * 2 };
        if (checkCollision(test, 0.8)) {
            // Try perpendicular
            return { x: -mz, z: mx };
        }
        return { x: mx, z: mz };
    }

    // ── Danger zone recording ──────────────────────────────────────
    function recordDangerZone(pos) {
        memory.dangerZones.push({ x: pos.x, z: pos.z, t: Date.now() });
        if (memory.dangerZones.length > 50) memory.dangerZones.shift();
        saveMemory();
    }

    function isDangerZone(pos) {
        const now = Date.now();
        return memory.dangerZones.some(dz => {
            if (now - dz.t > 30000) return false; // older than 30s, forget
            return Math.hypot(dz.x - pos.x, dz.z - pos.z) < 8;
        });
    }

    // ── Tactical log ───────────────────────────────────────────────
    function logTactic(msg) {
        const now = new Date().toISOString().substr(14, 5);
        state.tacticalLog.unshift(`[${now}] ${msg}`);
        if (state.tacticalLog.length > 12) state.tacticalLog.pop();
        updateHUD();
    }

    // ── MAIN DECISION TICK ─────────────────────────────────────────
    function tick() {
        if (!enabled || !gameRunning || gamePaused || hp <= 0) {
            stopMovement();
            return;
        }

        const now      = Date.now();
        const hpFrac   = hp / playerMaxHp;
        const ammoLow  = ammo <= LOW_AMMO;
        const noReserve = reserve === 0;

        // ── Auto-reload ──
        if (ammo <= LOW_AMMO && reserve > 0 && !isReloading) {
            reload();
        }

        // ── Stuck check ──
        checkStuck();

        // ── Damage detection → record danger zone ──
        if (hp < state.lastHpAtDmg - 0.5) {
            state.lastDamageTick = now;
            recordDangerZone(player.position);

            // Learn which enemy hurt us (credit nearest high-threat enemy)
            if (state.target) {
                const name = (state.target.name || '').toLowerCase();
                memory.threatDeaths[name] = (memory.threatDeaths[name] || 0) + 0.1;
                saveMemory();
            }
        }
        state.lastHpAtDmg = hp;

        // ──────────────────────────────────────────────────────────
        //  PHASE DETERMINATION
        // ──────────────────────────────────────────────────────────

        const bestDrop   = selectBestDrop();
        const bestTarget = selectBestTarget();

        // Determine if a bomber is dangerously close
        const closeBomber = enemies.find(e =>
            e.name === 'BOMBER' &&
            player.position.distanceTo(e.mesh.position) < SAFE_DIST_FROM_BOMBER + 4
        );

        // Determine if a sniper has LOS on us
        const activeSnipers = enemies.filter(e => e.name === 'SNIPER');
        const sniperThreat  = activeSnipers.length > 0 &&
            activeSnipers.some(s => player.position.distanceTo(s.mesh.position) < SNIPER_DANGER_DIST);

        let newPhase = state.phase;

        if (!enemies || enemies.length === 0) {
            // Between waves — collect any drops
            newPhase = bestDrop ? 'SEEK_DROP' : 'IDLE';
        } else if (closeBomber) {
            // PRIORITY 1: Bomber about to explode — run
            newPhase = 'EVADE_BOMBER';
        } else if (hpFrac < CRITICAL_HP_PCT) {
            // PRIORITY 2: Critical HP → seek heal or evade
            const hpDrop = bestDrop && (bestDrop.type === 'hp');
            newPhase = hpDrop ? 'SEEK_DROP' : 'KITE';
        } else if (bestDrop && dropUrgency(bestDrop) > 200 && player.position.distanceTo(bestDrop.mesh.position) < 25) {
            // PRIORITY 3: High-value nearby drop
            newPhase = 'SEEK_DROP';
        } else if (ammoLow && noReserve) {
            // PRIORITY 4: No ammo + no reserve → rush melee or seek
            newPhase = 'HUNT'; // will fire secondary if available
        } else {
            newPhase = 'HUNT';
        }

        // Sniper override: prefer kiting vs snipers unless we're already close
        if (newPhase === 'HUNT' && sniperThreat && bestTarget && bestTarget.name === 'SNIPER') {
            const distToSniper = player.position.distanceTo(bestTarget.mesh.position);
            if (distToSniper > 20) {
                newPhase = 'KITE'; // approach at an angle, not straight line
            }
        }

        if (newPhase !== state.phase) {
            logTactic(`PHASE → ${newPhase} | HP:${Math.ceil(hp)} | Enemies:${enemies.length}`);
            state.phase = newPhase;
        }

        // ──────────────────────────────────────────────────────────
        //  EXECUTE PHASE
        // ──────────────────────────────────────────────────────────
        switch (state.phase) {
            case 'IDLE':         executeIdle();           break;
            case 'HUNT':         executeHunt(bestTarget); break;
            case 'KITE':         executeKite(bestTarget); break;
            case 'SEEK_DROP':    executeSeekDrop(bestDrop, bestTarget); break;
            case 'EVADE_BOMBER': executeEvadeBomber(closeBomber, bestTarget); break;
        }

        // ── Secondary weapon usage ──
        if (hasSecondaryWeapon && secondaryAmmo > 0) {
            considerRocketShot(bestTarget);
        }
    }

    // ── IDLE ───────────────────────────────────────────────────────
    function executeIdle() {
        stopMovement();
        // Slowly rotate to scan
        yaw += 0.01;
    }

    // ── HUNT ───────────────────────────────────────────────────────
    function executeHunt(target) {
        if (!target) { executeIdle(); return; }

        const dist = player.position.distanceTo(target.mesh.position);
        const aimReady = aimAt(target.mesh.position);

        // Determine preferred engagement distance based on enemy type
        let preferredDist = PREFERRED_FIGHT_DIST;
        const tname = (target.name || '').toLowerCase();
        if (tname === 'bomber')      preferredDist = 14; // keep distance
        if (tname === 'sniper')      preferredDist = 12; // get close to disrupt
        if (tname === 'tank')        preferredDist = 10; // get in, deal damage
        if (tname === 'scout')       preferredDist = 8;  // scout is fast, meet it quick
        if (tname === 'boss' || target.isBoss) preferredDist = 20;

        // Move toward/away from target
        const toTarget = {
            x: target.mesh.position.x - player.position.x,
            z: target.mesh.position.z - player.position.z
        };
        const len = Math.hypot(toTarget.x, toTarget.z) || 1;
        const unitToTarget = { x: toTarget.x / len, z: toTarget.z / len };
        const perp = { x: -unitToTarget.z, z: unitToTarget.x }; // strafe vector

        // Strafe timing
        state.strafeTimer--;
        if (state.strafeTimer <= 0) {
            state.strafeDir *= -1;
            state.strafeTimer = 10 + Math.floor(Math.random() * 15);
        }

        let mx, mz;
        if (dist > preferredDist + 3) {
            // Approach: move forward + strafe
            mx = unitToTarget.x + perp.x * state.strafeDir * 0.6;
            mz = unitToTarget.z + perp.z * state.strafeDir * 0.6;
        } else if (dist < preferredDist - 3) {
            // Back off: move backward + strafe
            mx = -unitToTarget.x + perp.x * state.strafeDir * 0.6;
            mz = -unitToTarget.z + perp.z * state.strafeDir * 0.6;
        } else {
            // At range: pure strafe
            mx = perp.x * state.strafeDir;
            mz = perp.z * state.strafeDir;
        }

        // Avoid known danger zones
        const testPos = { x: player.position.x + mx * 3, z: player.position.z + mz * 3 };
        if (isDangerZone(testPos)) {
            mx = -mx; mz = -mz;
        }

        const safe = avoidBuildings(mx, mz);
        setMovement(safe.x, safe.z);

        // Shoot when aimed
        if (aimReady && ammo > 0 && !isReloading) {
            shoot();
        }

        state.target = target;
        updateHUDTarget(target, dist);
    }

    // ── KITE ───────────────────────────────────────────────────────
    // Move in a circular/diagonal path to avoid straight-line shots
    function executeKite(target) {
        if (!target) { executeIdle(); return; }

        aimAt(target.mesh.position);

        // Move diagonally away from target while facing it
        const toTarget = {
            x: target.mesh.position.x - player.position.x,
            z: target.mesh.position.z - player.position.z
        };
        const len = Math.hypot(toTarget.x, toTarget.z) || 1;
        const unitAway = { x: -toTarget.x / len, z: -toTarget.z / len };
        const perp = { x: -unitAway.z, z: unitAway.x };

        // Strafe timer
        state.strafeTimer--;
        if (state.strafeTimer <= 0) {
            state.strafeDir *= -1;
            state.strafeTimer = 12 + Math.floor(Math.random() * 10);
        }

        const mx = unitAway.x * 0.7 + perp.x * state.strafeDir * 0.7;
        const mz = unitAway.z * 0.7 + perp.z * state.strafeDir * 0.7;
        const safe = avoidBuildings(mx, mz);
        setMovement(safe.x, safe.z);

        // Still shoot while kiting
        if (ammo > 0 && !isReloading) {
            shoot();
        }
    }

    // ── SEEK_DROP ──────────────────────────────────────────────────
    function executeSeekDrop(drop, target) {
        if (!drop) { state.phase = 'HUNT'; return; }

        // Still aim at nearest enemy while pathing to drop
        if (target) {
            aimAt(target.mesh.position);
            // Shoot opportunistically
            const dist = player.position.distanceTo(target.mesh.position);
            if (dist < 30 && ammo > 0 && !isReloading) shoot();
        }

        // Move toward drop
        const toDrop = {
            x: drop.mesh.position.x - player.position.x,
            z: drop.mesh.position.z - player.position.z
        };
        const len = Math.hypot(toDrop.x, toDrop.z) || 1;
        const dir = { x: toDrop.x / len, z: toDrop.z / len };
        const safe = avoidBuildings(dir.x, dir.z);
        setMovement(safe.x * 1.2, safe.z * 1.2); // faster toward drop

        const distToDrop = player.position.distanceTo(drop.mesh.position);
        if (distToDrop < 2.5) {
            // Collected — return to hunt
            state.phase = 'HUNT';
            logTactic(`COLLECTED ${drop.type.toUpperCase()}`);
        }
    }

    // ── EVADE_BOMBER ───────────────────────────────────────────────
    function executeEvadeBomber(bomber, target) {
        if (!bomber) { state.phase = 'HUNT'; return; }

        // Run directly away from bomber
        const away = {
            x: player.position.x - bomber.mesh.position.x,
            z: player.position.z - bomber.mesh.position.z
        };
        const len = Math.hypot(away.x, away.z) || 1;
        away.x /= len; away.z /= len;

        const safe = avoidBuildings(away.x, away.z);
        setMovement(safe.x, safe.z);

        // Aim at bomber while running — kill it before it reaches
        aimAt(bomber.mesh.position);
        if (ammo > 0 && !isReloading) shoot();

        const dist = player.position.distanceTo(bomber.mesh.position);
        logTactic(`EVADING BOMBER — dist:${dist.toFixed(1)}`);
    }

    // ── ROCKET CONSIDERATION ───────────────────────────────────────
    function considerRocketShot(target) {
        if (!target || !hasSecondaryWeapon || secondaryAmmo <= 0) return;

        const dist = player.position.distanceTo(target.mesh.position);

        // Use rockets on boss, or vs. 3+ clustered enemies, or vs. tank
        const isCluster = enemies.filter(e =>
            e.mesh.position.distanceTo(target.mesh.position) < 8
        ).length >= 3;

        const worthRocket =
            target.isBoss ||
            isCluster ||
            (target.name === 'TANK' && dist < 25) ||
            (enemies.length === 1 && target.name === 'TANK'); // boss wave cleanup

        if (worthRocket && dist > 4 && dist < 50) {
            // Make sure we're aimed first
            const aimReady = aimAt(target.mesh.position);
            if (aimReady) {
                fireSecondary();
                logTactic(`ROCKET FIRED at ${target.name || 'BOSS'} (${enemies.length} nearby)`);
            }
        }
    }

    // ── HUD ────────────────────────────────────────────────────────
    function updateHUD() {
        const el = document.getElementById('nexus-hud');
        if (!el || !enabled) return;

        const hpFrac = hp / playerMaxHp;
        const hpColor = hpFrac < 0.3 ? '#ff3040' : hpFrac < 0.5 ? '#ff8800' : '#00ff88';

        el.innerHTML = `
            <div class="nexus-header">
                <span class="nexus-name">◈ NEXUS AI</span>
                <span class="nexus-phase nexus-phase-${(state.phase || 'IDLE').toLowerCase().replace('_','-')}">${state.phase}</span>
            </div>
            <div class="nexus-stats">
                <div class="nexus-stat">
                    <span class="nexus-label">HP</span>
                    <div class="nexus-bar-wrap"><div class="nexus-bar" style="width:${(hpFrac*100).toFixed(0)}%;background:${hpColor}"></div></div>
                    <span class="nexus-val" style="color:${hpColor}">${Math.ceil(hp)}/${playerMaxHp}</span>
                </div>
                <div class="nexus-stat">
                    <span class="nexus-label">AMMO</span>
                    <div class="nexus-bar-wrap"><div class="nexus-bar" style="width:${(ammo/maxClip*100).toFixed(0)}%;background:#00ffff"></div></div>
                    <span class="nexus-val" style="color:#00ffff">${ammo}+${reserve}</span>
                </div>
                <div class="nexus-stat">
                    <span class="nexus-label">THREAT</span>
                    <span class="nexus-val" style="color:#ff4466">${enemies ? enemies.length : 0} units · score:${state.currentThreatScore.toFixed(0)}</span>
                </div>
                <div class="nexus-stat">
                    <span class="nexus-label">DROPS</span>
                    <span class="nexus-val" style="color:#aa00ff">${drops ? drops.length : 0} on field</span>
                </div>
            </div>
            <div class="nexus-log">
                ${state.tacticalLog.slice(0, 6).map(l => `<div class="nexus-log-line">${l}</div>`).join('')}
            </div>
            <div class="nexus-footer">
                Wave ${typeof wave !== 'undefined' ? wave : '–'} · Score ${typeof score !== 'undefined' ? score : '–'}
                · Best Wave: ${memory.bestWave} · Run #${memory.totalRuns}
            </div>
        `;
    }

    function updateHUDTarget(target, dist) {
        // Light HUD update without full rebuild
        const footer = document.querySelector('.nexus-footer');
        if (!footer) { updateHUD(); return; }
        // Only rebuild full HUD every 5 ticks to save perf
        state.decisionTimer = (state.decisionTimer + 1) % 5;
        if (state.decisionTimer === 0) updateHUD();
    }

    function injectStyles() {
        if (document.getElementById('nexus-styles')) return;
        const s = document.createElement('style');
        s.id = 'nexus-styles';
        s.textContent = `
        #nexus-hud {
            position: fixed;
            top: 16px;
            right: 170px;
            width: 240px;
            background: rgba(0,0,0,0.82);
            border: 1px solid #00ffcc44;
            border-radius: 6px;
            padding: 10px 12px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #aaffee;
            z-index: 9999;
            pointer-events: none;
            backdrop-filter: blur(4px);
            box-shadow: 0 0 18px #00ffcc22;
        }
        .nexus-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            border-bottom: 1px solid #00ffcc22;
            padding-bottom: 5px;
        }
        .nexus-name {
            color: #00ffcc;
            font-size: 12px;
            font-weight: bold;
            letter-spacing: 2px;
        }
        .nexus-phase {
            font-size: 9px;
            letter-spacing: 1.5px;
            padding: 2px 6px;
            border-radius: 3px;
            background: #00ffcc22;
            color: #00ffcc;
        }
        .nexus-phase-evade-bomber { background:#ff660022; color:#ff6600; }
        .nexus-phase-kite         { background:#ffff0022; color:#ffff00; }
        .nexus-phase-seek-drop    { background:#ff004022; color:#ff4466; }
        .nexus-phase-hunt         { background:#00ffff22; color:#00ffff; }
        .nexus-phase-idle         { background:#44444422; color:#888; }
        .nexus-stats { margin-bottom: 7px; }
        .nexus-stat {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .nexus-label { color:#556; width:40px; font-size:9px; letter-spacing:1px; flex-shrink:0; }
        .nexus-bar-wrap {
            flex: 1;
            height: 4px;
            background: #112;
            border-radius: 2px;
            overflow: hidden;
        }
        .nexus-bar { height: 100%; border-radius: 2px; transition: width 0.1s; }
        .nexus-val { font-size: 9px; width: 60px; text-align: right; flex-shrink:0; }
        .nexus-log {
            border-top: 1px solid #00ffcc11;
            padding-top: 5px;
            margin-bottom: 5px;
        }
        .nexus-log-line {
            color: #668;
            font-size: 9px;
            letter-spacing: 0.5px;
            line-height: 1.5;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .nexus-footer {
            color: #445;
            font-size: 9px;
            letter-spacing: 1px;
            border-top: 1px solid #00ffcc11;
            padding-top: 5px;
        }
        #nexus-toggle-btn {
            position: fixed;
            bottom: 60px;
            right: 16px;
            background: rgba(0,255,204,0.08);
            border: 1px solid #00ffcc55;
            color: #00ffcc;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            letter-spacing: 2px;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 4px;
            z-index: 9999;
            transition: background 0.2s;
        }
        #nexus-toggle-btn:hover { background: rgba(0,255,204,0.2); }
        #nexus-toggle-btn.active { background: rgba(0,255,204,0.18); color: #00ffcc; border-color:#00ffcc; }
        `;
        document.head.appendChild(s);
    }

    function injectHUDElements() {
        if (document.getElementById('nexus-hud')) return;

        // Main HUD panel
        const hudEl = document.createElement('div');
        hudEl.id = 'nexus-hud';
        hudEl.style.display = 'none';
        document.body.appendChild(hudEl);

        // Toggle button
        const btn = document.createElement('button');
        btn.id = 'nexus-toggle-btn';
        btn.textContent = '▶ NEXUS AI';
        btn.addEventListener('click', () => {
            if (enabled) disable(); else enable();
        });
        document.body.appendChild(btn);
    }

    // ── Run-end learning ───────────────────────────────────────────
    function recordRunEnd() {
        memory.totalRuns++;
        memory.lastRunWave = typeof wave !== 'undefined' ? wave : 0;
        if (memory.lastRunWave > memory.bestWave) memory.bestWave = memory.lastRunWave;
        saveMemory();
        logTactic(`RUN ENDED wave:${memory.lastRunWave} best:${memory.bestWave}`);
    }

    // Watch for game over
    function watchGameOver() {
        if (typeof hp !== 'undefined' && hp <= 0 && enabled) {
            recordRunEnd();
        }
    }

    // ── Enable / Disable ───────────────────────────────────────────
    function enable() {
        if (enabled) return;
        enabled = true;

        // Show HUD
        const hudEl = document.getElementById('nexus-hud');
        if (hudEl) hudEl.style.display = 'block';
        const btn = document.getElementById('nexus-toggle-btn');
        if (btn) { btn.textContent = '■ NEXUS AI'; btn.classList.add('active'); }

        // Start decision loop
        tickInterval = setInterval(tick, AI_TICK_MS);

        // Override shoot — AI will call shoot() directly, no mouse needed
        // Also watch for game-over
        frameHook = setInterval(watchGameOver, 500);

        logTactic('NEXUS ONLINE — tactical AI engaged');

        // Disable pointer lock requirement so AI can control camera
        // (pointer lock event handler in game.js would pause, we prevent that)
        _patchPointerLock();
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        clearInterval(tickInterval);
        clearInterval(frameHook);
        tickInterval = null;
        frameHook    = null;
        stopMovement();

        const hudEl = document.getElementById('nexus-hud');
        if (hudEl) hudEl.style.display = 'none';
        const btn = document.getElementById('nexus-toggle-btn');
        if (btn) { btn.textContent = '▶ NEXUS AI'; btn.classList.remove('active'); }
    }

    // ── Pointer-lock patch ─────────────────────────────────────────
    // When AI is controlling, prevent the pointer-lock-change event from pausing the game
    let _plPatched = false;
    function _patchPointerLock() {
        if (_plPatched) return;
        _plPatched = true;
        // We wrap the pointerlockchange: if AI is on, suppress the auto-pause
        document.addEventListener('pointerlockchange', () => {
            if (enabled && gameRunning && !document.pointerLockElement) {
                // Re-suppress the pause that game.js would trigger
                setTimeout(() => {
                    if (enabled && gamePaused) {
                        gamePaused = false;
                        const pm = document.getElementById('pause-menu');
                        if (pm) pm.style.display = 'none';
                    }
                }, 10);
            }
        }, true); // capture phase, runs before game.js listener
    }

    // ── Init ───────────────────────────────────────────────────────
    function init() {
        injectStyles();
        injectHUDElements();

        // Key binding: Alt+A to toggle AI
        document.addEventListener('keydown', e => {
            if (e.altKey && e.key.toLowerCase() === 'a') {
                if (enabled) disable(); else enable();
            }
        });

        // Auto-enable if AI mode was previously on (optional session persist)
        // Remove the line below if you don't want auto-enable
        // if (localStorage.getItem('nexus_auto') === '1') enable();

        console.log('%c[NEXUS AI] Loaded. Press Alt+A or click ▶ NEXUS AI to activate.', 'color:#00ffcc;font-weight:bold');
        console.log('%c[NEXUS AI] Or call NEXUS.enable() / NEXUS.disable() from the console.', 'color:#00cc99');
    }

    // Run init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        enable,
        disable,
        get enabled() { return enabled; },
        get memory() { return memory; },
        resetMemory() {
            memory = {
                threatDeaths: { scout:0, sniper:0, bomber:0, tank:0, boss:0, runner:0 },
                totalRuns: 0, bestWave: 0, lastRunWave: 0, dangerZones: [],
                powerupValue: { hp:10, ammo:6, speed:5, shield:9, rapid:7, overclock:9, secondary:10 }
            };
            saveMemory();
        },
        get tacticalLog() { return [...state.tacticalLog]; },
        get phase() { return state.phase; }
    };
})();

// ════════════════════════════════════════════════════════════════
// INSTALLATION NOTES
// ════════════════════════════════════════════════════════════════
//
// 1. Place this file at  js/ai_player.js
//
// 2. In index.html, add this line AFTER the last <script> tag:
//    <script src="js/ai_player.js"></script>
//
// 3. Open the game in a browser.  You will see a "▶ NEXUS AI" button
//    in the bottom-right corner of the screen.
//
// 4. Click it (or press Alt+A) while in-game to activate the AI.
//    The AI HUD appears in the top-right, showing:
//      - Current tactical phase (HUNT / KITE / SEEK_DROP / EVADE_BOMBER / IDLE)
//      - HP and ammo bars
//      - Threat count and score
//      - Live tactical log
//      - Run statistics
//
// 5. The AI learns between sessions:
//      - It tracks which enemy types caused the most damage
//      - It records danger zones on the map
//      - It updates threat priority weights accordingly
//      - It remembers best wave, total runs, and adjusts drop valuations
//
// HOW THE AI THINKS:
//
//   THREAT PRIORITY:
//     Boss > Bomber (when close) > Scout > Sniper > Runner > Tank
//     Modified by: learned death weights, current HP, distance
//
//   PHASES:
//     EVADE_BOMBER  — Bomber within 12 units: sprint away while shooting it
//     SEEK_DROP     — High-value drop nearby or critical HP
//     KITE          — Sniper threat or needs to approach at angle
//     HUNT          — Standard engagement: close to preferred dist, strafe, shoot
//     IDLE          — No enemies: collect drops and scan
//
//   MOVEMENT:
//     - Strafe constantly while engaging
//     - Back off if too close, advance if too far
//     - Avoids buildings automatically
//     - Detects when stuck and pathfinds around obstacles
//     - Avoids known damage zones from past runs
//
//   ROCKETS:
//     Used on: Boss | 3+ clustered enemies | Tank in close range
//
//   LEARNING:
//     - Deaths near enemy types increase fear of that type
//     - Danger zones on map are avoided in future runs
//     - All data saved to localStorage between sessions
//
// ════════════════════════════════════════════════════════════════
