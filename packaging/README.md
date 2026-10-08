# Hub Windows packaging

The installer preserves the React/Vite frontend, local Node API, sherpa-onnx wake listener, and Edge runtime. It does not use Electron.

- Vite produces static frontend files.
- An official portable Node runtime serves the frontend and API.
- PyInstaller packages Python, sherpa-onnx, sentencepiece, NumPy, and native dependencies.
- Wake models remain outside the executable for native loading.
- Inno Setup installs per-user with optional startup launch.
- Edge uses a dedicated, preserved kiosk profile.

The product is named **Hub**. Existing `KitchenHub` installer filenames and Windows data paths remain for compatibility.

## Installed layout

```text
%LOCALAPPDATA%\Programs\KitchenHub\
  app\
    app-config.json
    dist\
    server\
      index.mjs
      calendars.mjs
      weather.mjs
      sheetsRecipes.mjs
    runtime\node.exe
  wake\
    kitchen-wake\kitchen-wake.exe
    models\sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01\
  launcher\

%LOCALAPPDATA%\KitchenHub\data\
  .env
  google-calendar-token.json
  calendar-selections.json
  wake\
  logs\
  edge-profile\
```

The build stages all production `server/*.mjs` modules and excludes test modules. Mutable user data belongs outside the installed program directory. Cook Mode persistence belongs to the dedicated browser profile.

## Build locally

Requirements: Node/npm, Python 3.11, and Inno Setup 6.

```powershell
npm run build:windows
```

Equivalent direct command: `./packaging/build-windows.ps1`.

Optional parameters: `-AppVersion`, `-NodeVersion`, `-OutputDirectory`, `-GoogleClientId`, and `-GoogleClientSecret`. The Google credentials default to the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables and are embedded in `app-config.json`. These are Desktop OAuth credentials; PKCE remains enabled and user tokens remain local.

The portable Node version is pinned and its archive is verified against the official `SHASUMS256.txt`. Set `INNO_SETUP_COMPILER` for a nonstandard `ISCC.exe` location.

Output: `artifacts\KitchenHub-Setup-<version>.exe`. Intermediates: `build\windows`. Both are ignored by Git.

## GitHub builds and releases

The [Build Windows installer workflow](../.github/workflows/windows-installer.yml) can run manually and upload an Actions artifact. A pushed `v*` tag also publishes the versioned installer to GitHub Releases. Pushing `main` does not automatically publish an installer.

Configure repository Actions variable `GOOGLE_CLIENT_ID` and secret `GOOGLE_CLIENT_SECRET` before building Google-enabled releases.

Before release:

1. Update the version in `package.json` and `package-lock.json`.
2. Run `npm test`, `npm run lint`, and `npm run build`.
3. Build the installer on Windows.
4. Install it in a clean Windows user profile and test on the actual Surface.
5. Verify API-key setup, microphone permission, automatic listening, custom wake phrase, spoken commands, audio output, and launch after restart.
6. Verify Google sign-in, selected secondary/read-only calendars, recipe sync, and live weather.
7. Verify Cook Mode step, servings, checks, and working edits survive refresh/restart; completion clears the active session.

Weather defaults to Los Angeles. Change `WEATHER_CITY`, `WEATHER_LATITUDE`, and `WEATHER_LONGITUDE` in the installed data `.env` and restart the app for another location. Calendar selections persist beside the Google token.

For rapid LAN design and voice testing, use `npm run dev:lan` and the [Surface voice launcher instructions](../README.md#voice-testing-through-lan). This is a development workflow; installed builds use localhost. Passing source tests does not establish that a newly generated installer or Surface microphone flow has been verified.