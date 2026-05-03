# Mood Shift City: Ultra Vis

> **Urban Combat Protocol v4.2 — High-Vis Protocol Enabled**

A browser-based first-person shooter built entirely with vanilla HTML, CSS, and JavaScript using [Three.js](https://threejs.org/). No build tools, no frameworks, no installs — just open and play.

---

## Gameplay

Survive endless waves of hostile operatives in a procedurally-lit neon city. Each wave is harder than the last. Kill enemies, collect drops, and push your score as high as possible.

### Controls

| Input | Action |
|-------|--------|
| `W A S D` | Move |
| Mouse | Aim |
| Left Click | Fire |
| `R` | Reload |
| `ESC` | Pause / Resume |

**Mobile:** Virtual joystick (left thumb) + FIRE / RELOAD buttons. Rotate device to landscape to play.

---

## Operatives

Choose your operative in the **Intel Database** before deploying. Each has a unique playstyle:

| Operative | Role | HP | Speed | Fire Rate | Special |
|-----------|------|----|-------|-----------|---------|
| **STRIKER** | Balanced | 100 | ★★★★ | ★★★★ | Reliable all-rounder |
| **ENFORCER** | Heavy | 160 | ★★ | ★★ | 3-round shotgun burst per trigger |
| **PHANTOM** | Ghost | 70 | ★★★★★ | ★★★★★ | 85 ms fire cooldown, 20-round clip |

---

## Enemy Types

| Threat | Behaviour |
|--------|-----------|
| **RUNNER** (red) | Fast melee charger |
| **BRUTE** (purple) | High-HP tank, slow but hits hard |
| **DASHER** (yellow) | Frantic speed, low HP |
| **SNIPER** (green) | Keeps distance, fires precise long-range shots |

---

## Drops & Powerups

Enemies drop pickups on death. The drop system is context-aware:

- If you are critically low on ammo **and** no ammo drop is already on the ground, the next kill **guarantees** an ammo drop.
- When HP is below 50 the system tilts toward HP drops.
- Powerup drops (25% base chance) are independent of HP/ammo drops.

### Powerup Types

| Pickup | Effect |
|--------|--------|
| **SPEED+** (magenta) | Movement speed ×1.8 for a short duration |
| **SHIELD** (blue) | Blocks incoming damage temporarily |
| **RAPID+** (orange) | Fire-rate boost for a short duration |

---

## Features

- **Three.js r128** 3D rendering — no WebGL boilerplate
- **Procedural city** — randomised building layout every run
- **Wave system** — enemy count and difficulty scale each wave, with an inter-wave bonus screen
- **Intel Database (Codex)** — animated 3D operative previews, stat bars, perk lists, and threat intel; operative selection persists to the main menu
- **Minimap** — real-time radar with directional player arrow, enemy dots, and building silhouettes
- **Smart ammo drop logic** — context-aware survival safety net
- **Pause menu** — triggered by ESC or automatic pointer-lock loss; resume without losing state
- **Damage & muzzle flash overlays** — screen-edge red flash on hit, white flash on fire
- **Procedural audio** — Web Audio API synthesised sounds (shoot, reload, explode, pickup, wave start)
- **Particle effects** — enemy death explosions
- **High score persistence** — saved to `localStorage`
- **Mobile support** — virtual joystick, touch fire/reload buttons, landscape-lock overlay

---

## File Structure

```
├── index.html          # All markup: menu, codex, pause, HUD, touch controls
├── css/
│   └── style.css       # All visual styling, animations, overlays
└── js/
    ├── state.js        # Shared game state, constants, Web Audio sound engine
    ├── controls.js     # Keyboard, mouse, pointer-lock, shooting logic
    ├── mobile.js       # Touch joystick and mobile button handlers
    └── game.js         # World, game loop, enemies, bullets, drops, waves, HUD, codex
```

---

## Running Locally

No build step required.

```bash
# Python 3
python3 -m http.server 5000
```

Then open `http://localhost:5000` in any modern browser.

Alternatively use any static file server — the app is 100% client-side.

---

## Tech Stack

- [Three.js r128](https://threejs.org/) — 3D scene, geometry, lighting
- Web Audio API — procedural sound synthesis
- Pointer Lock API — mouse-look
- `localStorage` — high score persistence
- Pure HTML5 / CSS3 / ES6+ JavaScript — zero dependencies beyond Three.js

---

## License

MIT — do whatever you like with it.
