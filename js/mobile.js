// ── js/mobile.js ──
// Handles fullscreen request and landscape-only enforcement on mobile.

function checkDevice() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function isLandscape() {
    return window.innerWidth > window.innerHeight;
}

function requestFullscreen() {
    const el  = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => {});
    // Lock orientation to landscape where supported (Android Chrome)
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

function updateOrientationOverlay() {
    if (!isMobile) return; // Desktop: never show overlay
    const overlay = document.getElementById('rotate-overlay');
    if (!isLandscape()) {
        overlay.style.display = 'flex';
        if (gameRunning) { gameRunning = false; } // Pause while portrait
    } else {
        overlay.style.display = 'none';
        // Resume game when rotated back to landscape
        if (hp > 0 && scene && !gameRunning && document.getElementById('ui').style.display === 'block') {
            gameRunning = true;
            animate();
        }
    }
}

window.addEventListener('resize',            updateOrientationOverlay);
window.addEventListener('orientationchange', () => setTimeout(updateOrientationOverlay, 300));
