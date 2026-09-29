# Windows packaging

The Windows package preserves the existing architecture:

- Vite compiles the React frontend to static files.
- An official portable Node executable runs `server/index.mjs` and serves the frontend.
- PyInstaller creates a folder-based `kitchen-wake.exe` distribution containing Python, sherpa-onnx, sentencepiece, NumPy, and their native libraries.
- The sherpa wake model remains outside the executable for reliable native loading and easier inspection.
- Inno Setup produces one per-user installer and registers an optional startup shortcut.
- Edge runs in kiosk mode with a dedicated, preserved profile.

## Installed layout

```text
%LOCALAPPDATA%\Programs\KitchenHub\
  app\
    dist\
    server\index.mjs
    runtime\node.exe
  wake\
    kitchen-wake\kitchen-wake.exe
    models\sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01\
  launcher\

%LOCALAPPDATA%\KitchenHub\data\
  .env
  wake\
  logs\
  edge-profile\
```

## Local build

Requirements are Node/npm, Python 3.11, and Inno Setup 6. Run:

```powershell
.\packaging\build-windows.ps1
```

Optional parameters are `-AppVersion`, `-NodeVersion`, and `-OutputDirectory`. The default Node version is pinned and its zip is checked against Node’s official `SHASUMS256.txt` before use. Set `INNO_SETUP_COMPILER` if `ISCC.exe` is installed in a nonstandard directory.

The output is `artifacts\KitchenHub-Setup-<version>.exe`. Build intermediates stay under `build\windows`; both paths are ignored by Git.

## GitHub release

The `Build Windows installer` workflow can run manually and returns the setup executable as an Actions artifact. A pushed `v*` tag also creates a GitHub Release and attaches the versioned installer.

Before tagging a release:

1. update the version in `package.json` and `package-lock.json`
2. run `npm run lint` and `npm run build`
3. test `packaging\build-windows.ps1`
4. install the result on a clean Windows user profile
5. confirm Settings can save the API key, microphone access persists, the wake phrase works, and a recipe survives restart
