# Kitchen Hub

Kitchen Hub is a voice-controlled, screen-first kitchen application for a Microsoft Surface Pro. It combines a recipe library, persistent cooking sessions, serving scaling, ingredient readiness, timers, OpenAI speech-to-text and command interpretation, and local sherpa-onnx wake phrase detection.

Voice is the primary input. The screen provides the authoritative recipe state and concise responses. Recipe changes, navigation, serving math, and completion remain deterministic application logic.

## Install on a Surface

Download the latest `KitchenHub-Setup-x.y.z.exe` from the repository’s GitHub Releases page and run it. The installer contains the compiled frontend, Node runtime, packaged wake listener, and wake model. Git, Node, and Python are not required on the Surface.

After installation:

1. Launch **Kitchen Hub**.
2. Allow microphone access in Edge once.
3. Open **Settings → Connections** and enter an OpenAI API key.
4. Say “Kitchen Hub,” followed by a command.

The API key, logs, wake phrase, and dedicated Edge profile are stored under `%LOCALAPPDATA%\KitchenHub\data`. Upgrades preserve this directory. See [SURFACE_SETUP.md](./SURFACE_SETUP.md) for the complete tablet checklist.

## Run from source

Development still works independently of the installer:

```powershell
npm ci
npm run wake-setup
npm run build
npm run voice-server
```

In another terminal:

```powershell
npm run wake-listener
```

For live frontend development, run `npm run dev` and open `http://127.0.0.1:5173`. For the production-style path, open `http://127.0.0.1:8787` after `npm run build`.

### Live Surface design preview

To iterate on the interface without building an installer, connect the development computer and Surface to the same private network, then run:

```powershell
npm run dev:lan
```

The command prints a private-network URL such as `http://192.168.1.74:5173/`. Open that URL in Edge on the Surface and keep the terminal open. Vite hot reload sends saved frontend changes to the Surface immediately. On the first run, Windows may ask whether Node.js can communicate on the network; allow **Private networks** only.

LAN development also enables a visual monitor that reports each connected browser's current viewport, layout measurements, and a periodically refreshed screenshot. This lets the development computer inspect the Surface's actual rendering instead of approximating it with a desktop browser. Form controls are omitted from screenshots so API keys and other typed values are never captured. The monitor is enabled only by `npm run dev:lan`; it is absent from production builds and should be used only on a trusted private network.

This HTTP preview is intended for visual iteration. Browsers generally require HTTPS for microphone capture on a remote device, so use the installed KitchenHub build when testing wake-word and voice behavior.

The app creates or updates `.env` only when an API key or wake phrase is saved in Settings. This file is ignored by Git. Never place the API key in a `VITE_*` variable.

## Build the Windows installer

On Windows with Node, Python 3.11, and Inno Setup 6 installed:

```powershell
npm run build:windows
```

The result is `artifacts\KitchenHub-Setup-x.y.z.exe`, using the version from `package.json`. The build verifies the official portable Node download, compiles the frontend, packages the wake listener with PyInstaller, stages the wake model, and compiles the installer.

Tagged GitHub builds are automated. Push a version tag such as `v0.1.0`; the workflow builds the installer and attaches it to a GitHub Release. See [packaging/README.md](./packaging/README.md).

## Local endpoints

- `GET /api/voice/health` — local service, credentials, models, and wake phrase
- `PUT /api/settings/openai-key` — validate and save the local API key
- `PUT /api/settings/wake-phrase` — rebuild and activate the local wake phrase
- `POST /api/voice/transcribe` — transcribe a command recording
- `POST /api/voice/command` — return one schema-constrained application command
- `GET /api/wake/events` — stream wake events to the browser
- `POST /api/wake` — receive a detected wake event from the local listener
