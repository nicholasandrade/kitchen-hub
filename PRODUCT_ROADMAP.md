# Kitchen Hub product roadmap

## Product direction

Kitchen Hub is a countertop home interface. Cooking is its first complete feature, with timers and media as supporting utilities.

Voice is the primary interface. Every routine action must be discoverable and completable by speaking naturally. The tablet display provides readable state, confirmations, setup, and recovery; touch is a secondary fallback rather than the intended daily interaction.

The cooking experience has three separate jobs:

1. **Recipe Lab** — a conversational workspace for inventing, adapting, and evaluating recipes.
2. **Recipe Library** — the approved collection of recipes the user has chosen to keep.
3. **Cook Mode** — the focused, hands-free execution view for one selected recipe.

Keeping these jobs separate protects Cook Mode from planning clutter and keeps unfinished AI output out of the permanent library.

## Recipe lifecycle

Every recipe moves through an explicit lifecycle:

`source material → lab draft → user review → saved recipe → cooking session`

- **Source material** can include a conversation, a pasted recipe, purchase history, pantry information, or an existing saved recipe.
- **Lab drafts** are disposable and editable. AI changes never overwrite an original recipe.
- **User review** shows the completed ingredients, steps, assumptions, and unresolved questions before saving.
- **Saved recipes** are versioned records in the library.
- **Cooking sessions** can make temporary changes without altering the saved recipe unless the user explicitly saves a new version.

## Shared data boundary

The source of truth will be a small cloud service owned by Kitchen Hub, rather than browser local storage or a ChatGPT conversation.

The service should expose authenticated operations for:

- recipes and recipe versions
- Recipe Lab conversations and structured drafts
- imported purchase records
- pantry observations inferred from purchases
- cooking sessions, temporary adjustments, and saved changes
- connected service metadata and sync status

Kitchen Hub and ChatGPT will use the same API. ChatGPT does not need direct access to the tablet or its local storage. A ChatGPT integration can send an approved draft to the shared API, after which it appears in Recipe Lab or the library on the tablet.

## Recipe Lab

Recipe Lab should feel like a focused conversation, not a general chat client.

The native flow begins with voice. The screen shows what Kitchen Hub intends to do, the current structured draft, and any question that requires an answer. Touch controls remain available for correction and accessibility, but no routine theorycrafting, saving, or cooking action should require them.

The view has one primary conversation area and a quieter draft preview. The assistant can:

- develop a recipe from an idea or constraint
- adapt a saved recipe without modifying the original
- use recent purchase data as optional context
- compare alternatives and explain tradeoffs
- ask only questions that materially affect the recipe
- produce structured ingredients, steps, servings, timing, and notes

The user can explicitly:

- discard the draft
- keep working on it
- save it as a new recipe
- save it as a new version of an existing recipe
- start cooking after review

## Purchase and pantry context

Email receipts and grocery services feed a normalized purchase inbox. Importers should preserve the original source while extracting:

- item name
- quantity and unit when available
- purchase date
- merchant
- confidence and unresolved matches

Imported purchases should not silently become pantry truth. Perishable items expire, quantities are consumed, and receipt names are often ambiguous. The AI may use purchases as suggestions and ask for confirmation when availability matters.

Initial connector order:

1. Forwarded or authorized email receipts
2. Manual receipt/photo/paste import
3. Instacart, Whole Foods, or other services where a stable supported integration is available

## Implementation milestones

### 1. Local Recipe Lab prototype

- Add Recipe Lab as a separate cooking destination.
- Implement the conversation and structured draft review UI.
- Save drafts and approved recipes locally behind a repository interface.
- Keep Cook Mode behavior unchanged.

### 2. Shared recipe service

- Add authentication and a small database-backed API.
- Move recipes, versions, and drafts from local storage to the shared store.
- Retain a local cache for tablet resilience.
- Add an integration endpoint that ChatGPT can use to create or update a draft.

### 3. OpenAI conversation pipeline

- Use OpenAI speech-to-text for spoken input.
- Send conversation plus structured recipe state to the model.
- Require schema-validated actions for recipe mutations.
- Show proposed changes before saving permanent data.
- Use text-to-speech for useful questions and confirmations.
- Make interruption, correction, pause, cancel, and undo first-class voice actions.
- Keep a visible listening state and concise action confirmation without displaying a transcript by default.

### 4. Purchase inbox

- Add receipt ingestion and normalized purchase records.
- Add a review queue for uncertain items.
- Let Recipe Lab optionally use recent purchases and confirmed pantry items.

### 5. Production tablet behavior

- PWA installation and full-screen launch
- screen wake lock during cooking
- offline access to saved recipes and the active cooking session
- recovery after refresh, sleep, or network interruption

### 6. Media and household expansion

- Embedded YouTube playback, with a one-time user activation fallback when the browser blocks voice-initiated autoplay
- Spotify launch and handoff, plus generic Windows media-session transport controls through a local native companion; avoid Spotify catalog search or direct Spotify API voice control unless Spotify grants approval or changes its policy
- multiple named timers and voice control
- add further home utilities only when they have a clear countertop use

## Media integration constraints

- Kitchen Hub should preserve foreground focus. Media actions must attempt the Windows media-session API first, background UI Automation patterns second, and a dedicated background browser adapter third. Physical mouse or keyboard injection, which can steal focus, is an explicit last resort and must restore Kitchen Hub immediately or report that the action requires attention.
- A browser speech-recognition result is not a trusted click or tap. Browsers may therefore block the first unmuted playback request even when the user initiated it by voice.
- YouTube's IFrame Player API supports programmatic play, pause, stop, seeking, volume, and queueing. Kitchen Hub should attempt the voice action, handle the API's autoplay-blocked event, and present one large activation control when the browser requires it. Later voice controls can operate the active player.
- Spotify's current developer policy prohibits a third-party voice-enabled streaming application or voice assistant from controlling Spotify. Until there is written approval or a policy change, Kitchen Hub may open or hand off to Spotify but should not implement native voice playback commands through Spotify's SDK or API.
- On the Surface Pro, a small companion process running in the signed-in Windows session can use `GlobalSystemMediaTransportControlsSessionManager` to find the active media session and request generic play, pause, stop, next, previous, seek, shuffle, and now-playing information. This behaves like system media controls rather than a Spotify catalog integration. It does not provide search, playlist selection, or guaranteed control when Spotify has no active media session.

## Immediate next build

Build the local Recipe Lab shell and recipe repository boundary first. Use fixture responses until the shared service and OpenAI connection exist. This lets the interaction and review flow be tested without pretending that brittle local parsing is intelligent conversation.

