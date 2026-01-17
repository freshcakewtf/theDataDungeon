# Bitmap Raycast Dungeon (Starter)

A no-build, browser-only JavaScript starter for:
- Rooms + corridors procedural dungeon (Option A)
- Classic DDA raycaster
- Billboard sprite enemies
- Sword swing (melee cone)
- Door unlock when all enemies are dead
- Low-res render + ordered Bayer dithering "bitmap" look

## Run
Open `index.html` with any local web server (recommended).
Examples:
- Python: `python3 -m http.server`
- Node: `npx serve`

Then visit: http://localhost:8000

## Controls
- Move: WASD
- Turn: Mouse (pointer lock) or ← →
- Swing sword: Left click or Space
- Restart run: R
- Toggle dithering: T
- Toggle minimap: M

## Notes
This is intentionally small and hackable. Expect “starter” quality AI + collision.
Tune constants in `src/config.js` and visuals in `src/post.js`.
# theDataDungeon
