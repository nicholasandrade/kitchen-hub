# Kitchen Hub

A voice-first countertop hub with cooking, timers, media destinations, themes, and a Recipe Lab prototype.

For a fresh Surface Pro installation, power configuration, kiosk mode, and automatic startup, follow [SURFACE_SETUP.md](./SURFACE_SETUP.md).

## Run locally

1. Copy `.env.example` to `.env`. Start the app, then add the OpenAI API key under **Settings → Connections**. The local server writes it to the private `.env` file.
2. Install the local wake-phrase model once:

   ```bash
   npm run wake-setup
   ```

3. Start the voice service:

   ```bash
   npm run voice-server
   ```

4. In another terminal, start the local wake listener:

   ```bash
   npm run wake-listener
   ```

5. In a third terminal, start Vite:

   ```bash
   npm run dev
   ```

For a production-style local run, build and let the voice server serve `dist`:

```bash
npm run build
npm start
```

Open the local URL in Chrome or Edge. The application includes:

- serving-size scaling
- step-by-step cooking mode
- persistent active-recipe sessions with a final-step completion flow
- ingredient readiness checks
- OpenAI speech-to-text with recipe vocabulary hints
- schema-constrained command interpretation through the OpenAI Responses API
- in-app OpenAI credential setup with local-only storage and server-side validation
- client-side execution of an explicit command allowlist
- local sherpa-onnx wake-phrase detection for `Kitchen Hub`
- voice activity detection that records one command at a time after the wake phrase
- an optional local regex fallback for UI development only (`VITE_VOICE_LOCAL_FALLBACK=true`)

The browser requires one initial tap to grant microphone access. Browser microphone samples are streamed only to the local sherpa-onnx listener at `127.0.0.1:8788`. No recording is created or sent to OpenAI until the local model hears “Kitchen Hub.” After the phrase, speak the command within seven seconds; the app records that command and sends it through the local voice server for transcription and structured interpretation. The OpenAI API key never enters the browser bundle, and recipe state changes remain deterministic in the React application.

## Voice endpoints

- `GET /api/voice/health` reports whether the server has credentials and which models are configured.
- `POST /api/voice/transcribe` accepts raw `webm`, `ogg`, or `mp4` audio.
- `POST /api/voice/command` accepts a transcript plus current app context and returns one strict command object.
- `GET /api/wake/events` streams local wake events to the browser.
- `POST /api/wake` lets the local listener publish a detected wake phrase.
