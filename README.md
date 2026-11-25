# Tempo

A first version of a customizable timer for sports and studying, designed for iPhone Safari and larger screens. Tempo is a working product name.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To test on an iPhone on the same Wi-Fi network, use `npm run dev -- --host 0.0.0.0` and open the computer's local network address on the phone. A plain HTTP network preview will not support all secure-context features, including service workers; use an HTTPS Vercel deployment for installation and offline tests.

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/`. The timer model and execution logic live separately from the React screens so that they can be reused when developing a native app.

## Included

- Sports and study preset libraries.
- Editable timed and manually completed stages, repeating groups, names, sound cues and warning settings.
- Saved routines and recent completed sessions stored locally.
- JSON routine import/export for sharing and backups.
- Pause, resume, skip, restart and a full-screen session view.
- A web app manifest and production-only offline shell caching.

Presets are editable examples, not official competition formats or training prescriptions. HYROX training uses manually completed runs and stations; the app does not measure distance or detect repetitions.

## Deploy with GitHub and Vercel

1. Push this repository to GitHub.
2. In Vercel, import `danieldhesiii/Timer-app`.
3. Keep the detected **Vite** framework, **npm run build** build command and **dist** output directory.
4. Deploy. No environment variables, database or API keys are required.

Subsequent pushes to the connected production branch deploy through Vercel. The app uses one page without client-side URL routes, so no wildcard rewrite is required.

## Try it on an iPhone

Open the HTTPS deployment in Safari. Use **Share → Add to Home Screen** to launch it in its own app window. After loading the production app and its assets while online, it can reopen offline. The home-screen install is a web app, not an App Store build.

During a session keep the app visible. The app can request a screen wake lock where Safari permits it, but the request can be denied or released by the system. Browser timers can be suspended or throttled when the screen locks or another app opens. Elapsed-time calculations catch up when execution resumes; that does not guarantee alerts at the original moment. Audio may require a user gesture and can be affected by device settings. Vibration is not supported by every browser, including iPhone Safari.

Reliable locked-screen cues, interactions with music and Bluetooth, interruptions, battery modes and native notifications must be verified in a native iPhone build before presenting those capabilities as supported. GitHub/Vercel is useful for testing the interface and active-session logic; it does not establish native background reliability.

## Your data

Saved routines and history stay in this browser on this device. There is no account, cloud sync or backend. Clearing website data, using another browser, changing the site origin or using private browsing can remove or separate this data. Export important routines to JSON before clearing data or changing deployments. Storage failures are reported rather than treated as successful saves.

An in-progress timer restarts when the page reloads; only saved routines and completed-session history persist. The initial version contains no advertising or analytics SDKs.
