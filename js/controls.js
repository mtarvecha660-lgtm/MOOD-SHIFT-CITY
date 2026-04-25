// ── js/controls.js ──
let joystick  = { active: false, x: 0, y: 0, touchId: null };
let lookTouch = { active: false, id: null, lastX: 0, lastY: 0 };

function setupControls() {
    // ── Keyboard ──
    document.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'r') reload();
        if (e.key.toLowerCase() === 'f') activateSlowMo();
        if (e.key === '1') switchWeapon('pistol');
        if (e.key === '2') switchWeapon('shotgun');
        if (e.key === '3') switchWeapon('railgun');
    });
    document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    // ── Mouse ──
    document.addEventListener('mousedown', e => {
        if (!gameRunning || isMobile) return;
        if (e.button === 0) shoot();
        if (e.button === 2) activateSlowMo();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
        if (!gameRunning || isMobile || document.pointerLockElement !== document.body) return;
        yaw   -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));
    });

    // ── Touch ──
    window.addEventListener('touchstart', e => {
        for (let t of e.changedTouches) {
            if (t.clientX < window.innerWidth / 2) {
                joystick.active = true; joystick.touchId = t.identifier;
            } else {
                lookTouch.active = true; lookTouch.id = t.identifier;
                lookTouch.lastX = t.clientX; lookTouch.lastY = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        for (let t of e.changedTouches) {
            if (joystick.active && t.identifier === joystick.touchId) {
                let dx = t.clientX - 100, dy = t.clientY - (window.innerHeight - 100);
                let dist = Math.min(Math.hypot(dx, dy), 60);
                let ang  = Math.atan2(dy, dx);
                joystick.x = (Math.cos(ang) * dist) / 60;
                joystick.y = (Math.sin(ang) * dist) / 60;
                document.getElementById('joystick-knob').style.transform =
                    `translate(${joystick.x * 40}px, ${joystick.y * 40}px)`;
            } else if (lookTouch.active && t.identifier === lookTouch.id) {
                yaw   -= (t.clientX - lookTouch.lastX) * 0.007;
                pitch -= (t.clientY - lookTouch.lastY) * 0.007;
                pitch  = Math.max(-1.4, Math.min(1.4, pitch));
                lookTouch.lastX = t.clientX; lookTouch.lastY = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === joystick.touchId) {
                joystick.active = false; joystick.x = 0; joystick.y = 0;
                document.getElementById('joystick-knob').style.transform = 'translate(0,0)';
            }
            if (t.identifier === lookTouch.id) lookTouch.active = false;
        }
    });

    // ── Buttons ──
    document.getElementById('fire-btn').addEventListener('touchstart',   e => { e.preventDefault(); shoot();        });
    document.getElementById('reload-btn').addEventListener('touchstart',  e => { e.preventDefault(); reload();       });
    document.getElementById('slowmo-btn').addEventListener('touchstart',  e => { e.preventDefault(); activateSlowMo(); });
}