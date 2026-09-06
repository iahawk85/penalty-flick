# Penalty Flick ⚽

A small **Progressive Web App** soccer penalty-shootout game. Drag back the ball
and release to flick it past the goalkeeper. Score goals, clear levels, beat
your personal best.

## Play

- **Touch / mouse:** drag the ball toward you and release to shoot.
- **Aim:** the further you pull, the harder the shot. Aim for the corners.
- **Game:** 5 shots per level. Score 3+ to advance. The keeper gets faster each level.

## Run locally

The game is static — no build step. Serve the folder over HTTP so the
service worker registers correctly:

```bash
cd ~/SoccerFlick
python3 -m http.server 8080
# then open http://localhost:8080
```

## Install as a PWA

Open the served page in a Chromium / Safari mobile browser and use
**Add to Home Screen**. After install it launches full-screen and works
offline (files are precached by `sw.js`).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup, HUD, overlays |
| `style.css` | Pitch styling, overlays, banners |
| `game.js` | Canvas rendering, physics, keeper AI, input, PWA bootstrap |
| `manifest.json` | PWA install metadata |
| `sw.js` | Offline cache (cache-first) |
| `icons/` | App icons (SVG + PNG 192/512) |

## License

MIT — do whatever, just don't blame me for top-corner winners.