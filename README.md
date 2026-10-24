# Hub

Hub is a voice-first kitchen and home display for Microsoft Surface. It combines live Weather, Google Calendar, a recipe library, Recipe Lab, persistent Cook Mode, serving scaling, ingredient check-off, and timers. OpenAI handles speech transcription and structured command interpretation; sherpa-onnx detects the wake phrase locally.

The product name is Hub. Existing KitchenHub installer filenames, Windows paths, environment names, and storage keys remain for compatibility.

## Install on a Surface

Download an available `KitchenHub-Setup-<version>.exe` from [GitHub Releases](https://github.com/nicholasandrade/kitchen-hub/releases). The installer bundles the frontend, portable Node, packaged wake listener, and wake models. Git, Node, and Python are not required on the Surface.

1. Launch the installed app and allow microphone access in Edge.
2. Open **Settings → Connections** and enter your OpenAI API key.
3. Sign in with Google for Calendar and Hub Recipes.
4. Select the calendars you want to display.
5. Say the configured wake phrase, then a command.

The server data, API key, Google token, logs, wake phrase, and Edge profile live under `%LOCALAPPDATA%\KitchenHub\data`. Upgrades preserve this directory. See [Surface setup](SURFACE_SETUP.md).

## App updates

Hub checks GitHub's latest published release at startup and every 30 seconds while open. **Settings → App updates** lets you save an interval of 5–86,400 seconds for the current browser and check immediately. A banner links to a newer release; download and run its installer to upgrade. Checks do not install automatically. Offline failures retry, and server-requested throttling delays subsequent GitHub requests. The checker follows the public latest-release redirect rather than consuming anonymous REST API requests. Existing installations need this version installed once to gain update checks. This anonymous checker requires publicly accessible releases. A private repository returns no visible release; GitHub authentication in a desktop browser does not authenticate the local Node checker.

## Run from source

```powershell
npm ci
npm run wake-setup
npm run build
npm run voice-server
```

In a second terminal run `npm run wake-listener`. For frontend development, run `npm run dev` and open `http://127.0.0.1:5173/`. For the compiled app, open `http://127.0.0.1:8787/`.

Keep credentials in the ignored server `.env`; use `.env.example` as a template. Never put an OpenAI API key or Google secret in a `VITE_*` variable. Settings saves the API key and custom wake phrase locally.

## Live Surface preview

Connect both computers to the same trusted private network:

```powershell
npm run dev:lan
```

This starts the API, wake listener, and Vite preview and prints the LAN URL. Open it on the Surface. Saved frontend changes update through Vite without a GitHub commit/pull loop. If a client misses an update, press **Ctrl+Shift+R** there. Allow the development server on Private networks only if Windows prompts.

LAN development optionally enables a visual monitor at `/__kitchenhub/clients` with viewport/layout telemetry and screenshots. Form fields are omitted. It is absent from production builds and should only be used on a trusted private network.

### Voice testing through LAN

Ordinary HTTP LAN tabs cannot capture microphone audio. Download `Hub-SurfaceVoice.ps1` from your preview URL, for example `http://192.168.1.74:5173/Hub-SurfaceVoice.ps1`, on the Surface. Run:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\Hub-SurfaceVoice.ps1"
```

For another address, add `-PreviewUrl "http://YOUR-LAN-IP:5173/"`. The launcher opens a separate Edge profile at `%LOCALAPPDATA%\Hub\LanVoice` with a development-only secure-origin exception for that exact LAN address. Use it only on your trusted home network and allow the microphone when prompted.

Listening starts automatically while Hub is open. Say the displayed wake phrase, then “set a timer for one minute.” Audio goes through the development computer's local wake listener and voice API. The Surface does not need Python or Node for this preview. Service health checks do not replace an actual spoken-command test on the Surface.

## Home screen and Cook Mode

- Weather and Continue Cooking occupy the left column; Calendar gets roughly 65% of desktop width. Narrow screens stack the cards.
- Recipe Lab, Timer, Recipes, and Settings share the home header utility group.
- Calendar uses large wrapped titles, aligned times, cancellation strikethroughs, and reminder badges. Source calendar and platform labels are hidden from event rows.
- Next Meeting prioritizes remaining meetings today, then searches the following year across selected calendars. Cancelled, declined, holiday, reminder, and all-day events are excluded. Distant meetings use a compact strip; near-start and active meetings emphasize timing. Join appears only within ten minutes before the meeting or while it is active.
- Cook Mode persists the active recipe, working recipe edits, step, serving/scaling state, and checked ingredients. Completion clears the active session. Browser-local sessions are separate for each browser profile and origin.

## Live Weather

Weather uses Open-Meteo forecast and air-quality data, with no demo fallback. It shows conditions, Fahrenheit temperature, daily range, AQI, peak daily UV, daily rain chance, humidity, feels-like temperature, and sunset. The service caches readings for ten minutes. Missing readings are marked unavailable; a provider failure uses a real cached reading with a stale notice or displays an error when no reading exists.

Configure location in the server `.env`, then restart Node:

```dotenv
WEATHER_CITY=Los Angeles
WEATHER_LATITUDE=34.0522
WEATHER_LONGITUDE=-118.2437
```

Location is configured on the server rather than detected from the browser.

## Google Calendar and Hub Recipes

One desktop OAuth session serves Calendar and the **Hub Recipes** Google Sheet. Hub lists visible calendars and fetches each enabled calendar separately, including secondary, shared, and read-only calendars. Events merge chronologically with calendar-specific identities. A failed calendar does not discard successful calendars. Choose calendars in **Settings → Connections**; selections persist in `calendar-selections.json` on the server and apply to previews using that server. Disabling a calendar does not delete it from Google.

Calendar access is read-only. Sheets access supports recipe synchronization; Drive metadata access locates the spreadsheet by exact name if `GOOGLE_RECIPES_SPREADSHEET_ID` is not configured.

Developer setup:

1. Enable Google Calendar, Sheets, and Drive APIs in the Google Cloud project.
2. Configure the consent screen and add your Google account as a test user while the app is in testing.
3. Create a **Desktop app** OAuth client and download its credentials.
4. For local development, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. For installer builds, set the Actions variable `GOOGLE_CLIENT_ID` and secret `GOOGLE_CLIENT_SECRET`.
5. Optionally set `GOOGLE_RECIPES_SPREADSHEET_ID` to the recipe spreadsheet ID.

The app uses Authorization Code with PKCE and the loopback callback `http://127.0.0.1:8787`. Desktop client credentials embedded in the installer are not confidential. User refresh tokens stay in `google-calendar-token.json` in the mutable server data directory. Existing Calendar-only connections may need **Reconnect Google** to grant Sheets scopes. Client credentials do not replace the user's initial sign-in and consent.

## Windows installer build

On Windows with Node/npm, Python 3.11, and Inno Setup 6:

```powershell
npm run build:windows
```

Output: `artifacts\KitchenHub-Setup-<version>.exe`. The build verifies the official portable Node download, compiles the frontend, packages the wake listener, bundles wake models and production server modules, and compiles the installer.

The GitHub **Build Windows installer** workflow supports manual Actions artifacts and `v*` tags that publish release assets. A push to `main` alone does not publish an installer. See [packaging README](packaging/README.md).

## Local endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/updates` | Current version and latest GitHub release |
| `GET /api/voice/health` | Voice configuration, models, wake phrase |
| `PUT /api/settings/openai-key` | Validate and save API key locally |
| `PUT /api/settings/wake-phrase` | Rebuild and activate wake phrase |
| `GET /api/weather` | Live configured-location weather and stale status |
| `GET /api/calendar/status` | Google connection status |
| `GET /api/calendar/oauth/start` | Desktop Google sign-in |
| `GET /api/calendar/list` | Visible calendars and selections |
| `PUT /api/calendar/selection` | Save `{ id, selected }` |
| `GET /api/calendar/today?timeMin=…&timeMax=…&timeZone=…` | Selected-calendar events for the requested window |
| `DELETE /api/calendar/connection` | Remove local Google token |
| `POST /api/voice/transcribe` | Command recording transcription |
| `POST /api/voice/command` | Schema-constrained application command |
| `POST /api/recipes/generate` | Recipe Lab draft |
| `GET /api/recipes` | Normalized Hub Recipes |
| `GET /api/recipes/search?q=…` | Recipe search |
| `POST /api/recipes` | Save recipe |
| `PUT /api/recipes/:id` | Update recipe |
| `GET /api/wake/events` | Browser wake-event stream |
| `POST /api/wake/audio` | Browser PCM forwarding to wake listener |
| `POST /api/wake` | Detected wake notification |

## Validation

```powershell
npm test
npm run lint
npm run build
```

Tests cover recipe normalization/scaling, multi-calendar selection/merging/failures, weather/cache behavior, event classification, countdown/Join timing, and Next Meeting presentation. Microphone permissions, real wake detection, audio output, and installer behavior require actual Surface testing.