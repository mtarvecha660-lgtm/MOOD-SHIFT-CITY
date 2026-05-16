// ══════════════════════════════════════════════════════════════════════
//  ai-player.js  —  Neural Q-Learning AI for Mood Shift City
//  Drop this AFTER game.js in index.html:
//    <script src="js/ai-player.js"></script>
//
//  Then add the toggle button anywhere in your menu / HUD HTML:
//    <button onclick="AIPlayer.toggle()">AI PLAYER</button>
//
//  The AI reads the same globals your game loop uses (enemies, bullets,
//  drops, player, yaw, pitch, hp, ammo, reserve, boosts, wave …) and
//  drives the game by writing back into keys[], yaw, pitch, and calling
//  shoot() / reload() / fireSecondary() directly.
// ══════════════════════════════════════════════════════════════════════

const AIPlayer = (() => {

    // ── Configuration ──────────────────────────────────────────────────
    const CFG = {
        tickMs:            50,      // how often the AI thinks (ms)
        learningRate:      0.15,
        discount:          0.92,
        epsilon:           0.25,    // exploration (decays over time)
        epsilonMin:        0.03,
        epsilonDecay:      0.9995,
        replayBatchSize:   32,
        replayBufferMax:   5000,

        // Combat
        idealRange:        14,      // preferred engagement distance
        dangerRange:        6,      // flee if closer than this
        dropPickupRange:    5,      // go for drops when this close
        lowHpThreshold:    40,      // prioritise HP drops below this
        lowAmmoThreshold:   5,      // trigger reload / ammo hunt

        // Aim
        aimLerpSpeed:      0.28,    // how fast the AI rotates toward target
        aimLeadFactor:     0.12,    // bullet-travel lead compensation
        pitchTarget:      -0.05,    // slight downward aim for ground targets
    };

    // ── Q-table (state-action value approximation) ─────────────────────
    // State is discretised into a compact key; actions are indices.
    // Weights are persisted to localStorage so the AI improves across sessions.

    const ACTIONS = [
        'forward', 'backward', 'strafeLeft', 'strafeRight',
        'shoot', 'reload', 'rocket',
        'chaseEnemy', 'fleeEnemy', 'chaseDrop',
        'idle'
    ];

    let qtable = {};
    try {
        qtable = JSON.parse(localStorage.getItem('msc_ai_qtable') || '{}');
    } catch(e) { qtable = {}; }

    let epsilon   = parseFloat(localStorage.getItem('msc_ai_eps') || String(CFG.epsilon));
    let totalSteps = parseInt(localStorage.getItem('msc_ai_steps') || '0');
    let totalReward = parseFloat(localStorage.getItem('msc_ai_reward') || '0');

    // Replay buffer for experience replay
    const replayBuffer = [];

    function saveProgress() {
        try {
            localStorage.setItem('msc_ai_qtable',  JSON.stringify(qtable));
            localStorage.setItem('msc_ai_eps',     String(epsilon));
            localStorage.setItem('msc_ai_steps',   String(totalSteps));
            localStorage.setItem('msc_ai_reward',  String(totalReward));
        } catch(e) {}
    }

    // ── State Encoder ──────────────────────────────────────────────────
    function encodeState() {
        if (!player || !gameRunning) return 'idle';

        // Nearest enemy
        let nearestEnemy = null, nearestEnemyDist = Infinity;
        for (const e of enemies) {
            const d = player.position.distanceTo(e.mesh.position);
            if (d < nearestEnemyDist) { nearestEnemyDist = d; nearestEnemy = e; }
        }

        // Nearest priority drop
        let nearestDrop = null, nearestDropDist = Infinity;
        for (const d of drops) {
            // Weigh HP drops higher when low health
            const priority = (d.type === 'hp' && hp < CFG.lowHpThreshold) ? 0.3 : 1.0;
            const dist = player.position.distanceTo(d.mesh.position) * priority;
            if (dist < nearestDropDist) { nearestDropDist = dist; nearestDrop = d; }
        }

        // Danger: incoming enemy bullets
        let bulletDanger = 0;
        for (const eb of enemyBullets) {
            if (player.position.distanceTo(eb.mesh.position) < 8) bulletDanger++;
        }

        // Discretise
        const hpBucket     = hp < 25 ? 0 : hp < 50 ? 1 : hp < 80 ? 2 : 3;
        const ammoBucket   = ammo === 0 ? 0 : ammo <= 3 ? 1 : ammo <= 8 ? 2 : 3;
        const reserveBucket = reserve === 0 ? 0 : reserve < 10 ? 1 : 2;
        const enemyDistB   = nearestEnemyDist === Infinity ? 5
                           : nearestEnemyDist < CFG.dangerRange ? 0
                           : nearestEnemyDist < CFG.idealRange  ? 1
                           : nearestEnemyDist < 30 ? 2
                           : nearestEnemyDist < 55 ? 3 : 4;
        const dropNearby   = nearestDropDist < CFG.dropPickupRange * 2 ? 1 : 0;
        const dangerBucket = Math.min(bulletDanger, 3);
        const waveBucket   = Math.min(wave, 10);
        const bossB        = isBossWave ? 1 : 0;
        const shieldB      = (boosts.shield && Date.now() < boosts.shield) ? 1 : 0;
        const rapidB       = (boosts.rapid  && Date.now() < boosts.rapid)  ? 1 : 0;
        const rocketB      = hasSecondaryWeapon ? 1 : 0;
        const enemyCountB  = Math.min(enemies.length, 5);

        return [hpBucket, ammoBucket, reserveBucket, enemyDistB,
                dropNearby, dangerBucket, waveBucket, bossB,
                shieldB, rapidB, rocketB, enemyCountB].join('_');
    }

    // ── Q-table helpers ────────────────────────────────────────────────
    function getQ(state, action) {
        const key = state + '|' + action;
        return qtable[key] !== undefined ? qtable[key] : 0;
    }
    function setQ(state, action, val) {
        qtable[state + '|' + action] = val;
    }
    function bestAction(state) {
        let best = ACTIONS[0], bestV = -Infinity;
        for (const a of ACTIONS) {
            const v = getQ(state, a);
            if (v > bestV) { bestV = v; best = a; }
        }
        return best;
    }

    // ── Reward function ────────────────────────────────────────────────
    let _prevScore = 0, _prevHp = 100, _prevWave = 0, _prevKills = 0;

    function computeReward() {
        const scoreDelta = score   - _prevScore;
        const hpDelta    = hp      - _prevHp;
        const waveDelta  = wave    - _prevWave;
        const killDelta  = killCount - _prevKills;

        let reward = 0;
        reward += scoreDelta * 0.01;         // points earned
        reward += killDelta  * 2.0;          // kills
        reward += waveDelta  * 5.0;          // wave cleared
        reward += hpDelta    * 0.05;         // hp gained (pickups, regen)
        reward -= (hpDelta < 0 ? -hpDelta * 0.1 : 0);  // hp lost penalty

        // Big reward for staying alive while wave is hard
        if (hp > 0 && gameRunning) reward += 0.1;

        // Penalty for running out of ammo in combat
        if (ammo === 0 && enemies.length > 0) reward -= 1.5;

        _prevScore = score; _prevHp = hp; _prevWave = wave; _prevKills = killCount;
        return reward;
    }

    // ── Experience Replay ──────────────────────────────────────────────
    function storeExperience(state, action, reward, nextState) {
        replayBuffer.push({ state, action, reward, nextState });
        if (replayBuffer.length > CFG.replayBufferMax) replayBuffer.shift();
    }

    function trainBatch() {
        if (replayBuffer.length < CFG.replayBatchSize) return;
        for (let i = 0; i < CFG.replayBatchSize; i++) {
            const idx = Math.floor(Math.random() * replayBuffer.length);
            const { state, action, reward, nextState } = replayBuffer[idx];
            const bestNextV = Math.max(...ACTIONS.map(a => getQ(nextState, a)));
            const target = reward + CFG.discount * bestNextV;
            const current = getQ(state, action);
            const updated = current + CFG.learningRate * (target - current);
            setQ(state, action, updated);
        }
    }

    // ── Action Execution ───────────────────────────────────────────────
    // All movement is done by injecting into the keys{} object exactly
    // as if a human pressed the keyboard. Aim is done by writing yaw/pitch.

    function clearMovementKeys() {
        keys['w'] = false; keys['s'] = false;
        keys['a'] = false; keys['d'] = false;
    }

    let _lastShotAttempt = 0;
    let _targetYaw = 0, _targetPitch = CFG.pitchTarget;
    let _aiThinkTimer = null;
    let _prevState = null, _prevAction = null;
    let _statsEl = null;

    function aimAt(worldPos) {
        if (!player) return;
        const dx = worldPos.x - player.position.x;
        const dz = worldPos.z - player.position.z;
        const dy = worldPos.y - player.position.y;
        const groundDist = Math.sqrt(dx*dx + dz*dz);

        _targetYaw   = Math.atan2(-dx, -dz);
        _targetPitch = Math.atan2(dy, groundDist);
    }

    function lerpAngle(from, to, t) {
        let delta = to - from;
        while (delta >  Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return from + delta * t;
    }

    function applyAimLerp() {
        yaw   = lerpAngle(yaw,   _targetYaw,   CFG.aimLerpSpeed);
        pitch = lerpAngle(pitch, _targetPitch, CFG.aimLerpSpeed * 0.5);
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
    }

    function executeAction(action) {
        clearMovementKeys();

        // Find situational data every tick
        let nearestEnemy = null, nearestEnemyDist = Infinity;
        for (const e of enemies) {
            const d = player.position.distanceTo(e.mesh.position);
            if (d < nearestEnemyDist) { nearestEnemyDist = d; nearestEnemy = e; }
        }

        let nearestDrop = null, nearestDropDist = Infinity;
        for (const d of drops) {
            const priority = (d.type === 'hp' && hp < CFG.lowHpThreshold) ? 0.3 : 1.0;
            const dist = player.position.distanceTo(d.mesh.position) * priority;
            if (dist < nearestDropDist) { nearestDropDist = dist; nearestDrop = d; }
        }

        // ── Always aim at nearest enemy (or their predicted future pos) ──
        if (nearestEnemy) {
            // Lead the target based on movement direction
            const ePos = nearestEnemy.mesh.position.clone();
            const speed = nearestEnemy.speed || 0;
            const toPlayer = player.position.clone().sub(ePos).normalize();
            ePos.add(toPlayer.multiplyScalar(nearestEnemyDist * CFG.aimLeadFactor * speed * 10));
            aimAt(ePos);
        }

        // ── Execute chosen action ──
        switch (action) {
            case 'forward':
                keys['w'] = true;
                break;

            case 'backward':
                keys['s'] = true;
                break;

            case 'strafeLeft':
                keys['a'] = true;
                break;

            case 'strafeRight':
                keys['d'] = true;
                break;

            case 'shoot': {
                const now = performance.now();
                if (ammo > 0 && !isReloading && now - _lastShotAttempt > shootCooldown * 0.9) {
                    _lastShotAttempt = now;
                    shoot();
                }
                // Keep approaching if far
                if (nearestEnemy && nearestEnemyDist > CFG.idealRange * 1.5) {
                    keys['w'] = true;
                }
                break;
            }

            case 'reload':
                if (!isReloading && reserve > 0 && ammo < maxClip) reload();
                // Strafe while reloading
                keys[Math.random() > 0.5 ? 'a' : 'd'] = true;
                break;

            case 'rocket':
                if (hasSecondaryWeapon && secondaryAmmo > 0) {
                    if (nearestEnemy) aimAt(nearestEnemy.mesh.position);
                    fireSecondary();
                }
                break;

            case 'chaseEnemy':
                if (nearestEnemy) {
                    // Move toward enemy
                    const dx = nearestEnemy.mesh.position.x - player.position.x;
                    const dz = nearestEnemy.mesh.position.z - player.position.z;
                    const angle = Math.atan2(-dx, -dz);
                    const rel = angle - yaw;
                    // Map angle to WASD
                    const norm = ((rel % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
                    if (norm < Math.PI * 0.25 || norm > Math.PI * 1.75) keys['w'] = true;
                    else if (norm < Math.PI * 0.75) keys['a'] = true;
                    else if (norm < Math.PI * 1.25) keys['s'] = true;
                    else keys['d'] = true;
                }
                break;

            case 'fleeEnemy':
                if (nearestEnemy) {
                    // Move away — reverse of chase
                    const dx = nearestEnemy.mesh.position.x - player.position.x;
                    const dz = nearestEnemy.mesh.position.z - player.position.z;
                    const angle = Math.atan2(-dx, -dz);
                    const rel = angle - yaw;
                    const norm = ((rel % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
                    // Flee = opposite
                    if (norm < Math.PI * 0.25 || norm > Math.PI * 1.75) keys['s'] = true;
                    else if (norm < Math.PI * 0.75) keys['d'] = true;
                    else if (norm < Math.PI * 1.25) keys['w'] = true;
                    else keys['a'] = true;

                    // Still shoot while fleeing
                    const now = performance.now();
                    if (ammo > 0 && !isReloading && now - _lastShotAttempt > shootCooldown * 0.9) {
                        _lastShotAttempt = now;
                        shoot();
                    }
                }
                break;

            case 'chaseDrop':
                if (nearestDrop) {
                    aimAt(nearestDrop.mesh.position);
                    const dx = nearestDrop.mesh.position.x - player.position.x;
                    const dz = nearestDrop.mesh.position.z - player.position.z;
                    const angle = Math.atan2(-dx, -dz);
                    const rel = angle - yaw;
                    const norm = ((rel % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
                    if (norm < Math.PI * 0.25 || norm > Math.PI * 1.75) keys['w'] = true;
                    else if (norm < Math.PI * 0.75) keys['a'] = true;
                    else if (norm < Math.PI * 1.25) keys['s'] = true;
                    else keys['d'] = true;
                    // reset aim back to enemy after a tick
                }
                break;

            case 'idle':
            default:
                // Small random strafe to dodge
                if (Math.random() < 0.3) keys[Math.random() > 0.5 ? 'a' : 'd'] = true;
                break;
        }

        // Always shoot while we have ammo and an enemy is in sight
        // (the AI can combine movement + shooting)
        if (nearestEnemy && ammo > 0 && !isReloading && action !== 'rocket') {
            const now = performance.now();
            const cd = (boosts.rapid && Date.now() < boosts.rapid)
                ? shootCooldown * 0.4 : shootCooldown;
            if (now - _lastShotAttempt > cd * 0.95) {
                _lastShotAttempt = now;
                // Only shoot if roughly aimed (within ~25°)
                const dx = nearestEnemy.mesh.position.x - player.position.x;
                const dz = nearestEnemy.mesh.position.z - player.position.z;
                const enemyYaw = Math.atan2(-dx, -dz);
                let diff = Math.abs(enemyYaw - yaw);
                while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                if (diff < 0.45) shoot();
            }
        }

        // Auto-reload when empty
        if (ammo === 0 && reserve > 0 && !isReloading) reload();
    }

    // ── Heuristic action override (expert knowledge layer) ────────────
    // Blends RL with hard-coded expert rules so early learning isn't
    // completely random — critical for not dying in wave 1.
    function heuristicAction() {
        // 1. Rocket on boss or cluster
        if (hasSecondaryWeapon && secondaryAmmo > 0 && enemies.length > 0) {
            let nearestDist = Infinity;
            for (const e of enemies) {
                const d = player.position.distanceTo(e.mesh.position);
                if (d < nearestDist) nearestDist = d;
            }
            if (isBossWave || (enemies.length >= 4 && nearestDist < 20)) return 'rocket';
        }

        // 2. Reload when empty + no immediate threat
        if (ammo === 0 && reserve > 0 && !isReloading) return 'reload';

        // 3. Flee if critically close
        let nearestEnemyDist = Infinity;
        for (const e of enemies) {
            const d = player.position.distanceTo(e.mesh.position);
            if (d < nearestEnemyDist) nearestEnemyDist = d;
        }
        if (nearestEnemyDist < CFG.dangerRange) return 'fleeEnemy';

        // 4. Chase HP drop when dying
        if (hp < CFG.lowHpThreshold) {
            for (const d of drops) {
                if (d.type === 'hp') {
                    const dist = player.position.distanceTo(d.mesh.position);
                    if (dist < 25) return 'chaseDrop';
                }
            }
        }

        // 5. Chase ammo when critical
        if (ammo <= CFG.lowAmmoThreshold && reserve === 0) {
            for (const d of drops) {
                if (d.type === 'ammo') {
                    const dist = player.position.distanceTo(d.mesh.position);
                    if (dist < 25) return 'chaseDrop';
                }
            }
        }

        // 6. Chase drops opportunistically when near
        if (drops.length > 0) {
            let closestDropDist = Infinity;
            for (const d of drops) {
                const dist = player.position.distanceTo(d.mesh.position);
                if (dist < closestDropDist) closestDropDist = dist;
            }
            if (closestDropDist < CFG.dropPickupRange) return 'chaseDrop';
        }

        // 7. Maintain ideal range
        if (enemies.length > 0) {
            if (nearestEnemyDist < CFG.idealRange * 0.6) return 'fleeEnemy';
            if (nearestEnemyDist > CFG.idealRange * 2.0) return 'chaseEnemy';
            return 'shoot';
        }

        return null; // let RL decide
    }

    // ── Main think tick ────────────────────────────────────────────────
    function think() {
        if (!_enabled || !gameRunning || gamePaused || hp <= 0) return;

        // 1. Observe state
        const state = encodeState();

        // 2. Compute reward for previous action
        if (_prevState !== null) {
            const reward = computeReward();
            totalReward += reward;
            storeExperience(_prevState, _prevAction, reward, state);
            trainBatch();
        }

        // 3. Decay exploration rate
        epsilon = Math.max(CFG.epsilonMin, epsilon * CFG.epsilonDecay);
        totalSteps++;

        // 4. Choose action: blend heuristic + RL
        let action;
        const expert = heuristicAction();
        if (expert) {
            // Expert override ~70% of the time, RL can explore otherwise
            action = (Math.random() < 0.70) ? expert
                : (Math.random() < epsilon ? ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
                : bestAction(state));
        } else {
            action = Math.random() < epsilon
                ? ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
                : bestAction(state);
        }

        // 5. Apply smooth aim
        applyAimLerp();

        // 6. Execute
        executeAction(action);

        // 7. Remember for next tick
        _prevState  = state;
        _prevAction = action;

        // 8. Save progress every 200 steps
        if (totalSteps % 200 === 0) saveProgress();

        // 9. Update HUD
        updateOverlay(state, action);
    }

    // ── Overlay HUD ────────────────────────────────────────────────────
    function createOverlay() {
        if (document.getElementById('ai-overlay')) return;
        const el = document.createElement('div');
        el.id = 'ai-overlay';
        el.style.cssText = `
            position:fixed; top:10px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.78); border:1px solid #00ffff;
            color:#00ffff; font-family:monospace; font-size:11px;
            padding:6px 14px; border-radius:4px; z-index:9999;
            pointer-events:none; text-align:center; line-height:1.7;
            box-shadow: 0 0 14px #00ffff44;
        `;
        document.body.appendChild(el);
        _statsEl = el;
    }

    function updateOverlay(state, action) {
        if (!_statsEl) return;
        const qVals = ACTIONS.map(a => `${a.padEnd(12)}${getQ(state,a).toFixed(2)}`);
        const best  = bestAction(state);
        _statsEl.innerHTML =
            `<span style="color:#ff8800">// AI PLAYER ACTIVE //</span><br>` +
            `Action: <b style="color:#ffff00">${action.toUpperCase()}</b>` +
            ` &nbsp;|&nbsp; Best Q: <b style="color:#00ff88">${best.toUpperCase()}</b><br>` +
            `ε=${epsilon.toFixed(3)} &nbsp; Steps: ${totalSteps} &nbsp; Reward: ${totalReward.toFixed(1)}<br>` +
            `<span style="color:#888">States learned: ${Object.keys(qtable).length}</span>`;
    }

    function removeOverlay() {
        const el = document.getElementById('ai-overlay');
        if (el) el.remove();
        _statsEl = null;
    }

    // ── Public API ─────────────────────────────────────────────────────
    let _enabled = false;

    function enable() {
        if (_enabled) return;
        _enabled = true;
        _prevState = null; _prevAction = null;
        _prevScore = score; _prevHp = hp; _prevWave = wave; _prevKills = killCount;
        createOverlay();
        _aiThinkTimer = setInterval(think, CFG.tickMs);
        console.log('[AI] Enabled. Epsilon:', epsilon.toFixed(3),
                    '| Q-states:', Object.keys(qtable).length);
    }

    function disable() {
        _enabled = false;
        clearInterval(_aiThinkTimer);
        clearMovementKeys();
        removeOverlay();
        saveProgress();
        console.log('[AI] Disabled & progress saved.');
    }

    function toggle() {
        _enabled ? disable() : enable();
    }

    function resetLearning() {
        qtable = {};
        epsilon = CFG.epsilon;
        totalSteps = 0;
        totalReward = 0;
        replayBuffer.length = 0;
        localStorage.removeItem('msc_ai_qtable');
        localStorage.removeItem('msc_ai_eps');
        localStorage.removeItem('msc_ai_steps');
        localStorage.removeItem('msc_ai_reward');
        console.log('[AI] Learning reset.');
    }

    function getStats() {
        return {
            enabled:      _enabled,
            epsilon:      epsilon,
            totalSteps:   totalSteps,
            totalReward:  totalReward,
            statesLearned: Object.keys(qtable).length,
            replaySize:   replayBuffer.length
        };
    }

    // Auto-disable when game ends / reloads
    window.addEventListener('beforeunload', () => { if (_enabled) saveProgress(); });

    return { enable, disable, toggle, resetLearning, getStats };

})();

// ── Inject a toggle button into the existing menu HUD ─────────────────
// This runs after DOM is ready. Adds the AI button below the PLAY button.
(function injectAIButton() {
    function doInject() {
        const menu = document.getElementById('menu-content');
        if (!menu) return;

        // Don't double-inject
        if (document.getElementById('ai-toggle-btn')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-top:14px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;';

        const toggleBtn = document.createElement('button');
        toggleBtn.id        = 'ai-toggle-btn';
        toggleBtn.innerText = '🤖 AI PLAYER: OFF';
        toggleBtn.style.cssText = `
            background:transparent; border:1px solid #00ffff; color:#00ffff;
            font-family:monospace; font-size:13px; padding:8px 18px;
            cursor:pointer; letter-spacing:2px; transition:all .2s;
        `;
        toggleBtn.onmouseover = () => toggleBtn.style.background = 'rgba(0,255,255,0.12)';
        toggleBtn.onmouseout  = () => toggleBtn.style.background = 'transparent';
        toggleBtn.onclick = () => {
            AIPlayer.toggle();
            const stats = AIPlayer.getStats();
            toggleBtn.innerText = stats.enabled ? '🤖 AI PLAYER: ON' : '🤖 AI PLAYER: OFF';
            toggleBtn.style.color       = stats.enabled ? '#00ff88' : '#00ffff';
            toggleBtn.style.borderColor = stats.enabled ? '#00ff88' : '#00ffff';
        };

        const resetBtn = document.createElement('button');
        resetBtn.innerText = '↺ RESET AI';
        resetBtn.style.cssText = `
            background:transparent; border:1px solid #ff4466; color:#ff4466;
            font-family:monospace; font-size:11px; padding:8px 12px;
            cursor:pointer; letter-spacing:1px; transition:all .2s;
        `;
        resetBtn.onmouseover = () => resetBtn.style.background = 'rgba(255,68,102,0.12)';
        resetBtn.onmouseout  = () => resetBtn.style.background = 'transparent';
        resetBtn.onclick = () => {
            if (confirm('Reset all AI learning? This clears the Q-table.')) {
                AIPlayer.resetLearning();
                alert('AI learning reset. The AI starts fresh next game.');
            }
        };

        wrapper.appendChild(toggleBtn);
        wrapper.appendChild(resetBtn);

        // Insert a stats row too
        const statsRow = document.createElement('div');
        statsRow.id = 'ai-stats-row';
        statsRow.style.cssText = `
            color:#555; font-family:monospace; font-size:10px;
            text-align:center; margin-top:4px; letter-spacing:1px;
        `;

        function refreshStats() {
            const s = AIPlayer.getStats();
            statsRow.innerText =
                `AI · ${s.statesLearned} states · ε=${s.epsilon.toFixed(3)} · ${s.totalSteps} steps`;
        }
        refreshStats();
        setInterval(refreshStats, 3000);

        menu.appendChild(wrapper);
        menu.appendChild(statsRow);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInject);
    } else {
        doInject();
    }
})();
