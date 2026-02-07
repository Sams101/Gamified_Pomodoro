# Gamified Pomodoro Task App (offline-first)

Lightweight, single-user, offline-first Pomodoro + task tracker with simple points-based motivation.

## Run locally

This is a static web app (no build step).

- Option A: open `index.html` directly in a browser (works, but service worker may not register)
- Option B (recommended): serve the folder with any static server

If you have Python:

```bash
cd gamified-pomodoro-task-app
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Data & privacy

- All data is stored locally in your browser (IndexedDB).
- No network calls; no data leaves the device.

