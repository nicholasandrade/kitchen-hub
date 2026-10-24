import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAppUpdates } from './appUpdates'
import { AppUpdateBanner, AppUpdateSettings } from './components/AppUpdateSettings'
import { localRecipeRepository, sheetsRecipeRepository, type RecipeDraft } from './recipeRepository'
import { localCookingSessionRepository } from './cookingSessionRepository'
import { LiveWeatherCard } from './home/LiveWeatherCard'
import { CalendarAgenda } from './home/CalendarAgenda'
import { cookingProgress } from './home/cookingProgress'
import type { CalendarEvent } from './home/calendarPresentation'
import './home/home.css'
import './themes.css'
import { AttentionLayer, type AttentionReminder } from './components/AttentionLayer'
import { LiveDock } from './components/LiveDock'
import { TimerView } from './components/TimerView'
import { formatTimerDuration, timerService } from './timers/timerService'
import {
  formatIngredientQuantity,
  getRecipeScaleFactor,
  normalizeRecipe,
  scaleRecipe,
  validateRecipe,
  type Recipe,
  type RecipeIngredient,
  type ScaleRequest,
} from './recipe'

export type Ingredient = RecipeIngredient
export type { Recipe }
type PendingEdit =
  | { kind: 'ingredient-choice'; ingredient: Ingredient }
  | { kind: 'addition-details'; name: string; stepIndex?: number; amount?: number; unit?: string; note?: string }
type VoiceMessage = { id: number; role: 'user' | 'assistant'; text: string }
type VoicePhase = 'off' | 'ready' | 'hearing' | 'processing' | 'error'
type HubCalendar = { id: string; name: string; primary: boolean; accessRole?: string; backgroundColor?: string; selected: boolean }
type CalendarConnectionState = 'loading' | 'setup' | 'ready' | 'connecting' | 'connected' | 'error'
type CalendarLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
const READY_VOICE_MESSAGE = 'Ready for a voice command.'
type VoiceCommand = {
  action: 'next_step' | 'previous_step' | 'go_to_step' | 'start_over' |
    'set_servings' | 'adjust_servings' | 'ingredient_quantity' |
    'check_ingredient' | 'uncheck_ingredient' | 'scroll_ingredients' |
    'remove_ingredient' | 'save_changes' | 'discard_changes' |
    'pause_listening' | 'create_timer' | 'timer_remaining' |
    'pause_timer' | 'resume_timer' | 'add_timer_time' | 'cancel_timer' |
    'scale_anchor' | 'start_step_timer' | 'unknown'
  step: number | null
  servings: number | null
  delta: number | null
  ingredient: string | null
  direction: 'up' | 'down' | null
  duration_seconds: number | null
  timer_label: string | null
  quantity: number | null
  unit: string | null
  response: string
  confidence: number
}
type ThemeId = 'architectural' | 'warm' | 'mineral' | 'cyberpunk' | 'retro' | 'terracotta' | 'vaporwave' | 'seventies' | 'candy' | 'blueprint' | 'tavern'

const DEFAULT_WAKE_PHRASE = 'Hub'
const WAKE_WINDOW_MS = 7000
const monotonicNow = () => performance.now()

const themeOptions: Array<{ id: ThemeId; name: string; description: string }> = [
  { id: 'architectural', name: 'Architectural Graphite', description: 'Porcelain, graphite, and cool teal.' },
  { id: 'warm', name: 'Warm Hearth', description: 'Cream, deep green, and burnt orange.' },
  { id: 'mineral', name: 'Soft Mineral', description: 'Mist gray, slate blue, and ocean glass.' },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Midnight panels, neon cyan, and electric magenta.' },
  { id: 'retro', name: 'Retro Diner', description: 'Vanilla, diner blue, and cherry-red details.' },
  { id: 'terracotta', name: 'Terracotta Studio', description: 'Clay, parchment, and deep aubergine.' },
  { id: 'vaporwave', name: 'Vaporwave Sunset', description: 'Electric dusk, hot pink, and poolside cyan.' },
  { id: 'seventies', name: 'Seventies Kitchen', description: 'Avocado, harvest gold, and burnt sienna.' },
  { id: 'candy', name: 'Candy Lab', description: 'Bubblegum, grape soda, and acid lime.' },
  { id: 'blueprint', name: 'Blueprint', description: 'Deep cobalt, drafting lines, and chalk white.' },
  { id: 'tavern', name: 'Adventurer’s Tavern', description: 'Aged parchment, dark oak, and candlelit brass.' },
]
const recipe = normalizeRecipe({
  id: 'miso-ginger-cod',
  name: 'Miso Ginger Cod Bowls',
  description: 'Flaky cod, gingery greens, and rice with a glossy miso glaze.',
  minutes: 35,
  baseServings: 2,
  calories: 540,
  protein: 42,
  ingredients: [
    { name: 'cod fillets', amount: 12, unit: 'oz', steps: [2, 3, 5] },
    { name: 'white miso', amount: 2, unit: 'tbsp', steps: [1, 2, 4] },
    { name: 'fresh ginger', amount: 1, unit: 'tbsp', note: 'finely grated', steps: [1] },
    { name: 'soy sauce', amount: 1.5, unit: 'tbsp', steps: [1] },
    { name: 'sesame oil', amount: 1, unit: 'tsp', steps: [1] },
    { name: 'garlic', amount: 2, unit: 'cloves', note: 'finely grated', steps: [1] },
    { name: 'honey', amount: 1, unit: 'tbsp', steps: [1] },
    { name: 'rice vinegar', amount: 1, unit: 'tbsp', steps: [1, 4] },
    { name: 'jasmine rice', amount: 1, unit: 'cup', steps: [0, 5] },
    { name: 'napa cabbage', amount: 4, unit: 'cups', note: 'thinly sliced', steps: [4, 5] },
    { name: 'baby cucumbers', amount: 2, unit: '', note: 'thinly sliced', steps: [5] },
    { name: 'avocado', amount: 1, unit: '', note: 'sliced', steps: [5] },
    { name: 'scallions', amount: 2, unit: '', note: 'sliced', steps: [5] },
    { name: 'sesame seeds', amount: 1, unit: 'tbsp', steps: [5] },
    { name: 'lime', amount: 1, unit: '', note: 'cut into wedges', steps: [5] },
    { name: 'nori', amount: 2, unit: 'sheets', note: 'torn', steps: [5] },
  ],
  steps: [
    'Rinse the rice until the water runs mostly clear. Cook with 1½ cups water, then cover and rest off heat.',
    'Whisk the miso, ginger, soy sauce, sesame oil, garlic, honey, rice vinegar, and 1 tablespoon warm water into a smooth glaze.',
    'Pat the cod dry. Brush generously with half of the miso glaze and place on a lined sheet pan.',
    'Broil the cod 6–8 minutes, until browned at the edges and it flakes easily with a fork.',
    'Sauté the cabbage over medium-high heat for 4 minutes. Add the remaining glaze and cook for 1 minute.',
    'Divide rice and cabbage between bowls. Add cucumber and avocado, then top with cod, scallions, sesame seeds, nori, and lime.',
  ],
})

const recipes: Recipe[] = [
  recipe,
  {
    id: 'lemon-herb-chicken', name: 'Lemon Herb Chicken',
    description: 'Golden chicken, roasted potatoes, and bright lemon pan juices.',
    minutes: 45, baseServings: 4, calories: 610, protein: 48,
    ingredients: [
      { name: 'chicken thighs', amount: 2, unit: 'lb', steps: [1, 3] },
      { name: 'baby potatoes', amount: 1.5, unit: 'lb', note: 'halved', steps: [0, 4] },
      { name: 'lemon', amount: 2, unit: '', note: 'zested and juiced', steps: [1, 3, 4] },
      { name: 'garlic', amount: 4, unit: 'cloves', note: 'minced', steps: [1, 3] },
      { name: 'fresh rosemary', amount: 2, unit: 'tbsp', note: 'chopped', steps: [1, 3] },
      { name: 'olive oil', amount: 3, unit: 'tbsp', steps: [0, 1] },
      { name: 'green beans', amount: 12, unit: 'oz', note: 'trimmed', steps: [2, 4] },
      { name: 'butter', amount: 2, unit: 'tbsp', steps: [3] },
    ],
    steps: [
      'Toss the potatoes with olive oil and season generously. Roast cut-side down at 425°F for 15 minutes.',
      'Season the chicken with lemon zest, garlic, rosemary, olive oil, salt, and pepper.',
      'Turn the potatoes, add the green beans, and place the chicken over the vegetables.',
      'Roast for 20–25 minutes. Rest the chicken, then stir butter and lemon juice into the pan juices.',
      'Slice the chicken and serve with the roasted potatoes, green beans, and lemon pan sauce.',
    ],
  },
  {
    id: 'sesame-tofu-noodles', name: 'Sesame Tofu Noodles',
    description: 'Crisp tofu and noodles tossed with a savory sesame dressing.',
    minutes: 30, baseServings: 2, calories: 520, protein: 24,
    ingredients: [
      { name: 'extra-firm tofu', amount: 14, unit: 'oz', note: 'pressed and cubed', steps: [0, 3] },
      { name: 'rice noodles', amount: 8, unit: 'oz', steps: [1, 4] },
      { name: 'soy sauce', amount: 3, unit: 'tbsp', steps: [2] },
      { name: 'sesame oil', amount: 1, unit: 'tbsp', steps: [2] },
      { name: 'rice vinegar', amount: 2, unit: 'tbsp', steps: [2] },
      { name: 'chili crisp', amount: 1, unit: 'tbsp', steps: [2, 4] },
      { name: 'baby bok choy', amount: 3, unit: 'cups', note: 'chopped', steps: [3] },
      { name: 'scallions', amount: 3, unit: '', note: 'sliced', steps: [4] },
      { name: 'sesame seeds', amount: 1, unit: 'tbsp', steps: [4] },
    ],
    steps: [
      'Pat the tofu dry and season with salt. Sear in a lightly oiled skillet until crisp on every side.',
      'Soak or cook the rice noodles according to the package directions, then drain well.',
      'Whisk soy sauce, sesame oil, rice vinegar, chili crisp, and 2 tablespoons warm water.',
      'Add the bok choy to the tofu and cook until bright green and just tender.',
      'Toss the noodles with the dressing, tofu, and bok choy. Finish with scallions and sesame seeds.',
    ],
  },
].map(normalizeRecipe)

const SMART_RECIPE_EDITING_ENABLED = false

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
}

const unitAliases: Record<string, string> = {
  pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  cup: 'cup', cups: 'cups', clove: 'clove', cloves: 'cloves',
}

const cloneRecipe = (source: Recipe): Recipe => ({
  ...source,
  ingredients: source.ingredients.map((item) => ({
    ...item,
    quantity: typeof item.quantity === 'object' ? { ...item.quantity } : item.quantity,
    steps: [...item.steps],
  })),
  steps: [...source.steps],
  structuredSteps: source.structuredSteps?.map((item) => ({ ...item })),
})

const parseSpokenNumber = (value?: string) => value ? (Number(value) || numberWords[value]) : undefined

const tidyStep = (text: string) => text
  .replace(/\s+,/g, ',')
  .replace(/,\s*(and\s+)?\./g, '.')
  .replace(/,\s*and\s+/g, ' and ')
  .replace(/\s{2,}/g, ' ')
  .replace(/^\s*and\s+/i, '')
  .trim()

const removeIngredientFromStep = (text: string, ingredientName: string) => {
  const escaped = ingredientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tidyStep(text
    .replace(new RegExp(`(?:the\\s+)?${escaped}(?:,|\\s+and)?\\s*`, 'gi'), '')
    .replace(/miso\s+glaze/gi, 'glaze'))
}

const appendIngredientToStep = (text: string, ingredient: Ingredient) => {
  const prep = ingredient.note ? `, ${ingredient.note}` : ''
  return `${text} Add the ${ingredient.name}${prep}.`
}

const findIngredientIndex = (ingredients: Ingredient[], command: string) => {
  const exact = ingredients.findIndex((item) => command.includes(item.name))
  if (exact >= 0) return exact
  return ingredients.findIndex((item) => item.name
    .split(/\s+/)
    .filter((word) => word.length > 3 && !['fresh', 'white', 'baby'].includes(word))
    .some((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(command)))
}

function formatAmount(amount: number) {
  if (Number.isInteger(amount)) return String(amount)
  if (Math.abs(amount - 0.5) < 0.01) return '½'
  if (Math.abs(amount - 1.5) < 0.01) return '1½'
  if (Math.abs(amount - 2.5) < 0.01) return '2½'
  return amount.toFixed(1).replace(/\.0$/, '')
}

const formatRecipeTime = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
}

const formatIngredientNote = (note?: string) => note
  ?.split(';')
  .map((part) => part.trim())
  .filter((part) => part
    && !/^estimated from\b/i.test(part)
    && !/^~?[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]+\s*(?:g|kg|oz|lb)\s*\//i.test(part))
  .join(' · ') ?? ''

const parseTimerDurationSeconds = (command: string) => {
  const match = command.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(hours?|minutes?|mins?|seconds?|secs?)\b/i)
  if (!match) return null
  const amount = parseSpokenNumber(match[1])
  if (!amount) return null
  if (/^hours?/i.test(match[2])) return Math.round(amount * 3600)
  if (/^(seconds?|secs?)/i.test(match[2])) return Math.round(amount)
  return Math.round(amount * 60)
}

const parseTimerLabel = (command: string) => command.match(/\bset\s+(?:a\s+)?(.+?)\s+timer\b/i)?.[1]?.trim() || 'Timer'


function App() {
  const [restoredSession] = useState(() => localCookingSessionRepository.load(recipe))
  const [baseRecipe, setBaseRecipe] = useState<Recipe>(() => restoredSession?.baseRecipe ?? recipe)
  const [workingRecipe, setWorkingRecipe] = useState<Recipe>(() => restoredSession?.workingRecipe ?? cloneRecipe(recipe))
  const [hasActiveRecipe, setHasActiveRecipe] = useState(() => Boolean(restoredSession))
  const [servings, setServings] = useState(() => restoredSession?.servings ?? recipe.baseServings)
  const [scaleRequest, setScaleRequest] = useState<ScaleRequest>(() => restoredSession?.scaleRequest ?? { mode: 'servings', servings: restoredSession?.servings ?? recipe.baseServings })
  const [step, setStep] = useState(() => restoredSession?.step ?? 0)
  const [checked, setChecked] = useState<Set<number>>(() => new Set(restoredSession?.checkedIngredients ?? []))
  const [alwaysListening, setAlwaysListening] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('off')
  const [, setTranscript] = useState('Listening starts automatically while Hub is open.')
  const [, setNotice] = useState('Ready when you are')
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([
    { id: 0, role: 'assistant', text: READY_VOICE_MESSAGE },
  ])
  const [voiceThreadOpen, setVoiceThreadOpen] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null)
  const [hasDraftChanges, setHasDraftChanges] = useState(() => restoredSession?.hasDraftChanges ?? false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryRecipes, setLibraryRecipes] = useState<Recipe[]>(() => {
    const saved = localRecipeRepository.loadSavedRecipes()
    return [...recipes, ...saved.filter((savedRecipe) => !recipes.some((item) => item.id === savedRecipe.id))]
  })
  const [recipeSyncStatus, setRecipeSyncStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [activeView, setActiveView] = useState<'home' | 'cooking' | 'recipe-lab' | 'timer'>('home')
  const [labDraft, setLabDraft] = useState<RecipeDraft | null>(() => localRecipeRepository.loadDraft())
  const [labPrompt, setLabPrompt] = useState('')
  const [labStatus, setLabStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle')
  const updates = useAppUpdates()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'root' | 'appearance' | 'connections' | 'updates'>('root')
  const [openAIKey, setOpenAIKey] = useState('')
  const [openAIStatus, setOpenAIStatus] = useState<'loading' | 'connected' | 'empty' | 'saving' | 'error'>('loading')
  const [openAIMessage, setOpenAIMessage] = useState('')
  const [wakePhrase, setWakePhrase] = useState(DEFAULT_WAKE_PHRASE)
  const [wakePhraseDraft, setWakePhraseDraft] = useState(DEFAULT_WAKE_PHRASE)
  const [wakePhraseStatus, setWakePhraseStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [wakePhraseMessage, setWakePhraseMessage] = useState('')
  const [calendarConnection, setCalendarConnection] = useState<CalendarConnectionState>('loading')
  const [recipesAuthorized, setRecipesAuthorized] = useState(false)
  const [calendarLoadState, setCalendarLoadState] = useState<CalendarLoadState>('idle')
  const [calendarRefreshing, setCalendarRefreshing] = useState(false)
  const [hubCalendars, setHubCalendars] = useState<HubCalendar[]>([])
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [calendarSelectionError, setCalendarSelectionError] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [futureCalendarEvents, setFutureCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarMessage, setCalendarMessage] = useState('')
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('kitchen-hub:theme')
    return themeOptions.some((option) => option.id === saved) ? saved as ThemeId : 'architectural'
  })
  const shouldListenRef = useRef(false)
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechStartedAtRef = useRef(0)
  const lastVoiceAtRef = useRef(0)
  const processingVoiceRef = useRef(false)
  const wakeWindowUntilRef = useRef(0)
  const wakePhraseRef = useRef(wakePhrase)
  const wakeWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeSamplesRef = useRef<number[]>([])
  const wakeUploadRef = useRef<Promise<void>>(Promise.resolve())
  const discardRecordingRef = useRef(false)
  const voiceMessageIdRef = useRef(1)
  const stepRef = useRef(step)
  const ingredientListRef = useRef<HTMLUListElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)
  const workingRecipeRef = useRef(workingRecipe)
  const pendingEditRef = useRef<PendingEdit | null>(null)
  const servingsRef = useRef(servings)

  const scaledRecipe = useMemo(() => {
    try { return scaleRecipe(workingRecipe, scaleRequest) } catch { return workingRecipe }
  }, [scaleRequest, workingRecipe])
  const scale = useMemo(() => {
    try { return getRecipeScaleFactor(workingRecipe, scaleRequest) } catch { return 1 }
  }, [scaleRequest, workingRecipe])
  const progress = cookingProgress(step, workingRecipe.steps.length)
  const currentInstruction = workingRecipe.steps[step]
  const isLongStep = currentInstruction.length > 115
  const currentVoiceMessage = voiceMessages[voiceMessages.length - 1]
  const voiceStatusLabel = voicePhase === 'error'
    ? 'Voice unavailable'
    : voicePhase === 'processing'
      ? 'Understanding'
      : voicePhase === 'hearing'
        ? 'Listening'
        : alwaysListening
          ? `Listening for “${wakePhrase}”`
          : 'Starting voice'
  const voicePanelNeedsRoom = Boolean(pendingEdit)
    || voicePhase === 'error'
    || (currentVoiceMessage?.text !== READY_VOICE_MESSAGE && currentVoiceMessage?.text.length > 72)
  const scaledIngredients = useMemo(
    () => scaledRecipe.ingredients,
    [scaledRecipe.ingredients],
  )
  const displayedIngredients = useMemo(
    () => scaledIngredients
      .map((item, index) => ({ item, index, relevant: item.steps.includes(step) }))
      .sort((a, b) => Number(b.relevant) - Number(a.relevant)),
    [scaledIngredients, step],
  )
  const todayLabel = useMemo(() => new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date()), [])
  const reminderEvent = useMemo(() => calendarEvents.find((event) =>
    /\b(remind|pull|take|defrost|thaw|marinate|prep|soak|move|buy|pick up)\b/i.test(`${event.title} ${event.description}`),
  ), [calendarEvents])
  const attentionReminder = useMemo<AttentionReminder | null>(() => reminderEvent ? {
    id: reminderEvent.id,
    title: reminderEvent.title,
    dueAt: reminderEvent.allDay ? new Date().setHours(0, 0, 0, 0) : new Date(reminderEvent.start).getTime(),
  } : null, [reminderEvent])

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    workingRecipeRef.current = workingRecipe
  }, [workingRecipe])

  useEffect(() => {
    pendingEditRef.current = pendingEdit
  }, [pendingEdit])

  useEffect(() => {
    servingsRef.current = servings
  }, [servings])

  useEffect(() => {
    wakePhraseRef.current = wakePhrase
  }, [wakePhrase])

  const mergeLibraryRecipes = (external: Recipe[]) => [
    ...recipes,
    ...external.filter((candidate) => !recipes.some((builtIn) => builtIn.id === candidate.id)),
  ]

  const applyExternalRecipeMetadata = (external: Recipe[]) => {
    const match = external.find((candidate) => candidate.id === workingRecipeRef.current.id)
    if (!match) return
    const previousBaseServings = workingRecipeRef.current.baseServings
    const withMetadata = (current: Recipe) => ({
      ...current,
      minutes: match.minutes,
      baseServings: match.baseServings,
      calories: match.calories,
      protein: match.protein,
      scaling: current.scaling ? { ...current.scaling, baseServings: match.baseServings } : match.scaling,
    })
    setBaseRecipe((current) => current.id === match.id ? withMetadata(current) : current)
    setWorkingRecipe((current) => {
      if (current.id !== match.id) return current
      const next = withMetadata(current)
      workingRecipeRef.current = next
      return next
    })
    if (scaleRequest.mode === 'servings' && scaleRequest.servings === previousBaseServings) {
      applyServingScale(match.baseServings)
    }
  }

  const refreshRecipeLibrary = async () => {
    setRecipeSyncStatus('loading')
    try {
      const external = await sheetsRecipeRepository.refresh()
      setLibraryRecipes(mergeLibraryRecipes(external))
      applyExternalRecipeMetadata(external)
      setRecipeSyncStatus('ready')
    } catch {
      setRecipeSyncStatus('error')
    }
  }

  useEffect(() => {
    void sheetsRecipeRepository.list().then((external) => {
      if (external.length) setLibraryRecipes(mergeLibraryRecipes(external))
      applyExternalRecipeMetadata(external)
      setRecipeSyncStatus('ready')
    }).catch(() => setRecipeSyncStatus('error'))
    // Recipe sync intentionally runs once when the app starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasActiveRecipe) return
    localCookingSessionRepository.save({
      baseRecipe,
      workingRecipe,
      step,
      servings,
      scaleRequest,
      checkedIngredients: [...checked],
      hasDraftChanges,
    })
  }, [baseRecipe, checked, hasActiveRecipe, hasDraftChanges, scaleRequest, servings, step, workingRecipe])

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [voiceMessages, voiceThreadOpen])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [activeView])

  const addVoiceMessage = (role: VoiceMessage['role'], text: string) => {
    setVoiceMessages((current) => [
      ...current,
      { id: voiceMessageIdRef.current++, role, text },
    ].slice(-24))
  }

  const showVoiceStatus = (text: string) => {
    setTranscript(text)
    addVoiceMessage('assistant', text)
    if (text.trim().endsWith('?') || text.length > 180) setVoiceThreadOpen(true)
  }

  const goToStep = (nextStep: number) => {
    const bounded = Math.max(0, Math.min(workingRecipe.steps.length - 1, nextStep))
    setStep(bounded)
    setNotice(`Step ${bounded + 1} of ${workingRecipe.steps.length}`)
  }

  const stopMicrophoneMeter = () => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current)
    meterTimerRef.current = null
    discardRecordingRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    wakeSamplesRef.current = []
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }

  const setPending = (next: PendingEdit | null) => {
    pendingEditRef.current = next
    setPendingEdit(next)
  }

  const updateDraft = (updater: (current: Recipe) => Recipe) => {
    const next = updater(workingRecipeRef.current)
    workingRecipeRef.current = next
    setWorkingRecipe(next)
    setHasDraftChanges(true)
  }

  const applyServingScale = (value: number) => {
    const bounded = Math.max(1, Math.min(12, value))
    servingsRef.current = bounded
    setServings(bounded)
    setScaleRequest({ mode: 'servings', servings: bounded })
  }

  const applyAnchorScale = (quantity: number, unit: string, ingredient?: string | null) => {
    try {
      const nextRequest: ScaleRequest = { mode: 'anchor', quantity, unit, ingredient: ingredient || undefined }
      scaleRecipe(workingRecipeRef.current, nextRequest)
      setScaleRequest(nextRequest)
      showVoiceStatus(`Scaled from the original recipe to ${formatAmount(quantity)} ${unit}${ingredient ? ` of ${ingredient}` : ''}.`)
    } catch (error) {
      showVoiceStatus(error instanceof Error ? error.message : 'This recipe cannot be scaled by its main ingredient yet.')
    }
  }

  const requestAdditionDetails = (addition: Extract<PendingEdit, { kind: 'addition-details' }>) => {
    setPending(addition)
    const missing = [
      addition.amount === undefined ? 'how much you used' : '',
      !addition.note ? 'how it was prepared' : '',
      addition.stepIndex === undefined ? 'which step it belongs in' : '',
    ].filter(Boolean)
    const question = `For ${addition.name}, tell me ${missing.join(' and ')}.`
    setNotice('I need one detail')
    setTranscript(question)
    addVoiceMessage('assistant', question)
    setVoiceThreadOpen(true)
  }

  const commitAddition = (addition: Extract<PendingEdit, { kind: 'addition-details' }>) => {
    if (addition.amount === undefined || !addition.note || addition.stepIndex === undefined) {
      requestAdditionDetails(addition)
      return
    }
    const ingredient: Ingredient = {
      name: addition.name,
      amount: addition.amount,
      unit: addition.unit ?? '',
      note: addition.note,
      steps: [addition.stepIndex],
    }
    updateDraft((current) => ({
      ...current,
      ingredients: [...current.ingredients, ingredient],
      steps: current.steps.map((text, index) => index === addition.stepIndex ? appendIngredientToStep(text, ingredient) : text),
    }))
    setPending(null)
    setNotice(`${addition.name} added to step ${addition.stepIndex + 1}`)
    setTranscript(`I added ${formatAmount(addition.amount)} ${addition.unit ?? ''} ${addition.name}, ${addition.note}, and updated step ${addition.stepIndex + 1}. Say “save my changes” to keep this version.`)
  }

  const findVoiceTimer = (label?: string | null) => {
    const activeTimers = timerService.getActiveTimers()
    if (!label || /^timer$/i.test(label)) return activeTimers[0]
    const normalized = label.toLowerCase().replace(/\btimer\b/g, '').trim()
    return activeTimers.find((timer) => timer.label.toLowerCase().includes(normalized)) ?? activeTimers[0]
  }

  const handleCommand = (rawCommand: string) => {
    const command = rawCommand.toLowerCase().trim().replace(/[.?!]+$/, '')

    if (/\bset\b.*\btimer\b/.test(command)) {
      const durationSeconds = parseTimerDurationSeconds(command)
      if (durationSeconds) {
        const label = parseTimerLabel(command)
        timerService.createTimer({ label, durationMs: durationSeconds * 1000, source: 'voice' })
        showVoiceStatus(`${label} timer set for ${Math.round(durationSeconds / 60)} minutes.`)
        return
      }
    }
    if (/\b(?:how much time|time.*left|timer.*remaining)\b/.test(command)) {
      const timer = findVoiceTimer(command)
      showVoiceStatus(timer ? `${timer.label} has ${formatTimerDuration(timerService.getRemainingTime(timer))} remaining.` : 'There are no active timers.')
      return
    }
    if (/\bpause\b.*\btimer\b/.test(command)) {
      const timer = findVoiceTimer(command)
      if (timer) timerService.pauseTimer(timer.id)
      showVoiceStatus(timer ? `${timer.label} paused.` : 'There are no active timers.')
      return
    }
    if (/\bresume\b.*\btimer\b/.test(command)) {
      const timer = findVoiceTimer(command)
      if (timer) timerService.resumeTimer(timer.id)
      showVoiceStatus(timer ? `${timer.label} resumed.` : 'There are no paused timers.')
      return
    }
    if (/\badd\b.*\b(?:timer|minutes?|mins?)\b/.test(command)) {
      const timer = findVoiceTimer(command)
      const durationSeconds = parseTimerDurationSeconds(command)
      if (timer && durationSeconds) timerService.addTime(timer.id, durationSeconds * 1000)
      showVoiceStatus(timer && durationSeconds ? `Added ${Math.round(durationSeconds / 60)} minutes to ${timer.label}.` : 'Tell me how much time to add and which timer.')
      return
    }
    if (/\bcancel\b.*\btimer\b/.test(command)) {
      const timer = findVoiceTimer(command)
      if (timer) timerService.cancelTimer(timer.id)
      showVoiceStatus(timer ? `${timer.label} cancelled.` : 'There are no active timers.')
      return
    }

    if (/\b(?:pause|stop)\s+(?:hands[- ]free|listening|microphone|mic)\b/.test(command)) {
      showVoiceStatus('Voice control stays available while Hub is open.')
      return
    }

    if (!SMART_RECIPE_EDITING_ENABLED && (
      /\bi have\s+(?:\d+|one|two|three|four|five|six|seven|eight)\b/.test(command)
      || /\b(?:i\s+)?(?:added|add|am adding)\b/.test(command)
    )) {
      setPending(null)
      setNotice('Smart recipe editing is not connected yet')
      const response = 'Adding or substituting ingredients will be available after the OpenAI connection is enabled.'
      showVoiceStatus(response)
      return
    }

    const pending = pendingEditRef.current
    if (pending?.kind === 'ingredient-choice') {
      if (/\b(?:replace|instead|swap|substitute)\b/.test(command)) {
        const current = workingRecipeRef.current
        const targetIndex = findIngredientIndex(current.ingredients, command)
        const fallbackIndex = current.ingredients.findIndex((item) => item.name.includes('cod'))
        const replaceIndex = targetIndex >= 0 ? targetIndex : fallbackIndex
        if (replaceIndex >= 0) {
          const replaced = current.ingredients[replaceIndex]
          const replacement = { ...pending.ingredient, steps: [...replaced.steps] }
          updateDraft((source) => ({
            ...source,
            ingredients: source.ingredients.map((item, index) => index === replaceIndex ? replacement : item),
            steps: source.steps.map((text) => text.replace(/\bcod(?: fillets?)?\b/gi, replacement.name)),
          }))
          setPending(null)
          setNotice(`${replacement.name} replaces ${replaced.name}`)
          showVoiceStatus(`Replacing ${replaced.name} with ${formatAmount(replacement.amount)} ${replacement.unit} ${replacement.name} and updating the affected steps.`)
          return
        }
      }
      if (/\b(?:add|alongside|separate)\b/.test(command)) {
        requestAdditionDetails({ kind: 'addition-details', ...pending.ingredient, stepIndex: undefined })
        return
      }
      setNotice('Replace or add?')
      const response = `Should ${pending.ingredient.name} replace the cod, or should I add it as a separate ingredient?`
      showVoiceStatus(response)
      return
    }

    if (pending?.kind === 'addition-details') {
      const amountMatch = command.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(pounds?|lbs?|ounces?|oz|tablespoons?|tbsp|teaspoons?|tsp|cups?|cloves?)?\b/)
      const stepMatch = command.match(/\bstep\s+(\d+|one|two|three|four|five|six)\b/)
      const preparationMatch = command.match(/\b(thinly sliced|sliced|diced|chopped|minced|grated|crushed|whole|seeded|roasted|raw)\b/)
      const next = {
        ...pending,
        amount: parseSpokenNumber(amountMatch?.[1]) ?? pending.amount,
        unit: amountMatch?.[2] ? unitAliases[amountMatch[2]] : pending.unit,
        stepIndex: stepMatch ? (parseSpokenNumber(stepMatch[1]) ?? 1) - 1 : pending.stepIndex,
        note: preparationMatch?.[1] ?? pending.note,
      }
      commitAddition(next)
      return
    }

    if (/\b(?:save|keep)\s+(?:my\s+)?(?:changes|customizations|recipe)\b/.test(command)) {
      localStorage.setItem(`kitchen-hub:${baseRecipe.id}:custom`, JSON.stringify(workingRecipeRef.current))
      setHasDraftChanges(false)
      setNotice('Customized recipe saved')
      showVoiceStatus('Saving this as a customized copy. The original recipe remains available.')
      return
    }
    if (/\b(?:discard|undo)\s+(?:my\s+)?(?:changes|customizations)\b/.test(command)) {
      const fresh = cloneRecipe(baseRecipe)
      workingRecipeRef.current = fresh
      setWorkingRecipe(fresh)
      setPending(null)
      setChecked(new Set())
      setHasDraftChanges(false)
      setNotice('Draft changes discarded')
      showVoiceStatus('Discarding the draft and restoring the original recipe.')
      return
    }

    const scrollMatch = command.match(/\bscroll(?:\s+the)?\s+ingredients?\s+(down|up)\b/)
    if (scrollMatch) {
      const list = ingredientListRef.current
      list?.scrollBy({ top: (scrollMatch[1] === 'down' ? 1 : -1) * (list.clientHeight * 0.72), behavior: 'smooth' })
      setNotice(`Ingredients scrolled ${scrollMatch[1]}`)
      showVoiceStatus(`Scrolling the ingredient list ${scrollMatch[1]}.`)
      return
    }

    const targetStep = command.match(/\b(?:go to|show|open)\s+step\s+(\d+|one|two|three|four|five|six)\b/)
    if (targetStep) {
      const next = (parseSpokenNumber(targetStep[1]) ?? 1) - 1
      showVoiceStatus(`Moving to step ${Math.max(0, Math.min(workingRecipeRef.current.steps.length - 1, next)) + 1}.`)
      return goToStep(next)
    }
    if (/\b(next|continue|forward)\b/.test(command)) {
      const next = Math.min(workingRecipeRef.current.steps.length - 1, stepRef.current + 1)
      showVoiceStatus(`Moving to step ${next + 1}.`)
      return goToStep(next)
    }
    if (/\b(back|previous|go back)\b/.test(command)) {
      const next = Math.max(0, stepRef.current - 1)
      showVoiceStatus(`Moving back to step ${next + 1}.`)
      return goToStep(next)
    }
    if (/\b(first|start over)\b/.test(command)) {
      showVoiceStatus('Returning to step 1.')
      return goToStep(0)
    }

    const servingMatch = command.match(/(?:make (?:it|this)|servings? (?:to|is))\s+(\d+|one|two|three|four|five|six|seven|eight)/)
    if (servingMatch) {
      const value = parseSpokenNumber(servingMatch[1])
      if (value) {
        applyServingScale(value)
        setNotice(`Scaled for ${value} ${value === 1 ? 'person' : 'people'}`)
        showVoiceStatus(`Adjusting the recipe for ${value} ${value === 1 ? 'person' : 'people'}.`)
        return
      }
    }

    const servingAdjustment = command.match(/\b(increase|add|decrease|reduce|lower)\s+(?:the\s+)?servings?(?:\s+(to|by)\s+(\d+|one|two|three|four|five|six|seven|eight))?\b/)
    if (servingAdjustment) {
      const direction = /^(increase|add)$/.test(servingAdjustment[1]) ? 1 : -1
      const spokenValue = parseSpokenNumber(servingAdjustment[3])
      const next = servingAdjustment[2] === 'to' && spokenValue
        ? spokenValue
        : servingsRef.current + direction * (spokenValue ?? 1)
      const bounded = Math.max(1, Math.min(8, next))
      applyServingScale(bounded)
      setNotice(`Scaled for ${bounded} ${bounded === 1 ? 'person' : 'people'}`)
      showVoiceStatus(`Adjusting the recipe for ${bounded} ${bounded === 1 ? 'person' : 'people'}.`)
      return
    }

    const currentRecipe = workingRecipeRef.current
    const ingredientIndex = findIngredientIndex(currentRecipe.ingredients, command)
    const ingredient = ingredientIndex >= 0 ? currentRecipe.ingredients[ingredientIndex] : undefined

    if (ingredient && /\b(?:remove|delete|take out|leave out|omit)\b/.test(command)) {
      updateDraft((current) => ({
        ...current,
        ingredients: current.ingredients.filter((_, index) => index !== ingredientIndex),
        steps: current.steps.map((text) => removeIngredientFromStep(text, ingredient.name)),
      }))
      setChecked(new Set())
      setNotice(`${ingredient.name} removed from this draft`)
      showVoiceStatus(`Removing ${ingredient.name} from this draft and revising the affected steps.`)
      return
    }

    const additionMatch = command.match(/\b(?:i\s+)?(?:added|add|am adding)\s+(.+?)\s+(?:in|to)\s+step\s+(\d+|one|two|three|four|five|six)\b/)
    if (additionMatch) {
      const detail = additionMatch[1].match(/^(?:(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(pounds?|lbs?|ounces?|oz|tablespoons?|tbsp|teaspoons?|tsp|cups?|cloves?)?\s+(?:of\s+)?)?(.+)$/)
      const preparationMatch = additionMatch[1].match(/,?\s*(thinly sliced|sliced|diced|chopped|minced|grated|crushed|whole|seeded|roasted|raw)\b/)
      const name = (detail?.[3] ?? additionMatch[1]).replace(/,?\s*(thinly sliced|sliced|diced|chopped|minced|grated|crushed|whole|seeded|roasted|raw)\b/, '').trim()
      const addition: Extract<PendingEdit, { kind: 'addition-details' }> = {
        kind: 'addition-details', name,
        amount: parseSpokenNumber(detail?.[1]),
        unit: detail?.[2] ? unitAliases[detail[2]] : undefined,
        note: preparationMatch?.[1],
        stepIndex: (parseSpokenNumber(additionMatch[2]) ?? 1) - 1,
      }
      commitAddition(addition)
      return
    }

    const haveMatch = command.match(/\bi have\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(pounds?|lbs?|ounces?|oz|tablespoons?|tbsp|teaspoons?|tsp|cups?|cloves?)?\s+(?:of\s+)?(.+)$/)
    if (haveMatch) {
      const offered: Ingredient = {
        name: haveMatch[3].trim(), amount: parseSpokenNumber(haveMatch[1]) ?? 1,
        unit: haveMatch[2] ? unitAliases[haveMatch[2]] : '', steps: [],
      }
      const anchorId = currentRecipe.scaling?.anchorIngredientId
      if (ingredient && anchorId && ingredient.id === anchorId && offered.unit) {
        applyAnchorScale(offered.amount, offered.unit, ingredient.name)
        return
      }
      if (ingredient) {
        updateDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, index) => index === ingredientIndex ? { ...item, amount: offered.amount, unit: offered.unit } : item) }))
        setNotice(`${ingredient.name} amount updated`)
        showVoiceStatus(`Updating this draft to ${formatAmount(offered.amount)} ${offered.unit} ${ingredient.name}.`)
      } else {
        setPending({ kind: 'ingredient-choice', ingredient: offered })
        setNotice('Replace or add?')
        showVoiceStatus(`Should ${formatAmount(offered.amount)} ${offered.unit} ${offered.name} replace the cod, or should I add it as a separate ingredient?`)
      }
      return
    }

    if (ingredient && /\b(?:check|mark)(?:\s+off)?\b/.test(command)) {
      setChecked((current) => new Set(current).add(ingredientIndex))
      setNotice(`${ingredient.name} checked off`)
      showVoiceStatus(`Checking off ${ingredient.name}.`)
      return
    }
    if (ingredient && /\b(?:uncheck|restore)\b/.test(command)) {
      setChecked((current) => {
        const next = new Set(current)
        next.delete(ingredientIndex)
        return next
      })
      setNotice(`${ingredient.name} restored`)
      showVoiceStatus(`Restoring ${ingredient.name} to the ingredient list.`)
      return
    }
    if (ingredient && /\b(how much|amount|quantity)\b/.test(command)) {
      const scaledIngredient = scaledRecipe.ingredients[ingredientIndex] ?? ingredient
      const response = `${formatIngredientQuantity(scaledIngredient)} ${ingredient.name}`.trim()
      setNotice(response)
      showVoiceStatus(response)
      return
    }
    const response = 'I didn’t catch that command. Please try saying it another way.'
    setNotice('I didn’t catch a kitchen command yet')
    showVoiceStatus(response)
    setVoiceThreadOpen(true)
  }

  const executeVoiceCommand = (command: VoiceCommand) => {
    const currentRecipe = workingRecipeRef.current
    const ingredientIndex = command.ingredient
      ? findIngredientIndex(currentRecipe.ingredients, command.ingredient.toLowerCase())
      : -1
    const ingredient = ingredientIndex >= 0 ? currentRecipe.ingredients[ingredientIndex] : undefined

    switch (command.action) {
      case 'next_step':
        goToStep(stepRef.current + 1)
        break
      case 'previous_step':
        goToStep(stepRef.current - 1)
        break
      case 'go_to_step':
        if (command.step !== null) goToStep(command.step - 1)
        break
      case 'start_over':
        goToStep(0)
        break
      case 'set_servings':
        if (command.servings !== null) {
          applyServingScale(command.servings)
        }
        break
      case 'adjust_servings': {
        applyServingScale(servingsRef.current + (command.delta ?? 0))
        break
      }
      case 'scale_anchor':
        if (command.quantity && command.unit) applyAnchorScale(command.quantity, command.unit, command.ingredient)
        break
      case 'ingredient_quantity':
        if (ingredient) {
          const scaledIngredient = scaledRecipe.ingredients[ingredientIndex] ?? ingredient
          command.response = `${formatIngredientQuantity(scaledIngredient)} ${ingredient.name}`.trim()
        }
        break
      case 'check_ingredient':
        if (ingredientIndex >= 0) setChecked((current) => new Set(current).add(ingredientIndex))
        break
      case 'uncheck_ingredient':
        if (ingredientIndex >= 0) setChecked((current) => {
          const next = new Set(current)
          next.delete(ingredientIndex)
          return next
        })
        break
      case 'scroll_ingredients':
        ingredientListRef.current?.scrollBy({
          top: (command.direction === 'up' ? -1 : 1) * (ingredientListRef.current.clientHeight * .72),
          behavior: 'smooth',
        })
        break
      case 'remove_ingredient':
        if (ingredientIndex >= 0 && ingredient) {
          updateDraft((current) => ({
            ...current,
            ingredients: current.ingredients.filter((_, index) => index !== ingredientIndex),
            steps: current.steps.map((text) => removeIngredientFromStep(text, ingredient.name)),
          }))
          setChecked(new Set())
        }
        break
      case 'save_changes':
        localStorage.setItem(`kitchen-hub:${baseRecipe.id}:custom`, JSON.stringify(workingRecipeRef.current))
        setHasDraftChanges(false)
        break
      case 'discard_changes': {
        const fresh = cloneRecipe(baseRecipe)
        workingRecipeRef.current = fresh
        setWorkingRecipe(fresh)
        setHasDraftChanges(false)
        setChecked(new Set())
        break
      }
      case 'pause_listening':
        command.response = 'Voice control stays available while Hub is open.'
        break
      case 'create_timer':
        if (command.duration_seconds && command.duration_seconds > 0) {
          timerService.createTimer({
            label: command.timer_label || 'Timer',
            durationMs: command.duration_seconds * 1000,
            source: 'voice',
          })
        }
        break
      case 'start_step_timer': {
        const currentStep = currentRecipe.structuredSteps?.[stepRef.current]
        if (currentStep?.timerSeconds) {
          timerService.createTimer({
            label: command.timer_label || `${currentRecipe.name} · Step ${stepRef.current + 1}`,
            durationMs: currentStep.timerSeconds * 1000,
            source: 'cooking',
          })
          command.response = `${formatTimerDuration(currentStep.timerSeconds * 1000)} timer started for this step.`
        } else command.response = 'This step does not include a timer.'
        break
      }
      case 'timer_remaining': {
        const timer = findVoiceTimer(command.timer_label)
        command.response = timer
          ? `${timer.label} has ${formatTimerDuration(timerService.getRemainingTime(timer))} remaining.`
          : 'There are no active timers.'
        break
      }
      case 'pause_timer': {
        const timer = findVoiceTimer(command.timer_label)
        if (timer) timerService.pauseTimer(timer.id)
        break
      }
      case 'resume_timer': {
        const timer = findVoiceTimer(command.timer_label)
        if (timer) timerService.resumeTimer(timer.id)
        break
      }
      case 'add_timer_time': {
        const timer = findVoiceTimer(command.timer_label)
        if (timer && command.duration_seconds) timerService.addTime(timer.id, command.duration_seconds * 1000)
        break
      }
      case 'cancel_timer': {
        const timer = findVoiceTimer(command.timer_label)
        if (timer) timerService.cancelTimer(timer.id)
        break
      }
      case 'unknown':
        setVoiceThreadOpen(true)
        break
    }
    if (command.confidence < .65 || command.response.trim().endsWith('?')) setVoiceThreadOpen(true)
    showVoiceStatus(command.response)
  }

  const submitVoiceRecording = async (audio: Blob) => {
    if (!shouldListenRef.current || processingVoiceRef.current || audio.size < 500) return
    processingVoiceRef.current = true
    setVoicePhase('processing')
    setNotice('Understanding your request')
    let transcript = ''
    try {
      const vocabulary = [wakePhraseRef.current, ...workingRecipeRef.current.ingredients.map((item) => item.name)].join(', ')
      const transcriptionResponse = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': audio.type || 'audio/webm',
          'X-Kitchen-Vocabulary': encodeURIComponent(vocabulary),
        },
        body: audio,
      })
      const transcription = await transcriptionResponse.json()
      if (!transcriptionResponse.ok) throw new Error(transcription.error || 'Transcription failed.')
      transcript = String(transcription.text || '').trim()
      if (!transcript) throw new Error('I did not hear a complete request.')
      addVoiceMessage('user', transcript)

      const commandResponse = await fetch('/api/voice/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          context: {
            view: activeView,
            recipe: workingRecipeRef.current.name,
            ingredients: workingRecipeRef.current.ingredients.map((item) => item.name),
            step: stepRef.current + 1,
            stepCount: workingRecipeRef.current.steps.length,
            servings: servingsRef.current,
            scaling: workingRecipeRef.current.scaling,
            currentStepTimerSeconds: workingRecipeRef.current.structuredSteps?.[stepRef.current]?.timerSeconds ?? null,
            hasDraftChanges,
            activeTimers: timerService.getActiveTimers().map((timer) => ({
              label: timer.label,
              status: timer.status,
              remainingSeconds: Math.ceil(timerService.getRemainingTime(timer) / 1000),
            })),
          },
        }),
      })
      const command = await commandResponse.json()
      if (!commandResponse.ok) throw new Error(command.error || 'Command service failed.')
      executeVoiceCommand(command as VoiceCommand)
    } catch (error) {
      if (import.meta.env.VITE_VOICE_LOCAL_FALLBACK === 'true' && transcript) {
        handleCommand(transcript)
      } else {
        setVoicePhase('error')
        const message = error instanceof Error ? error.message : 'The voice service is unavailable.'
        showVoiceStatus(message)
      }
    } finally {
      processingVoiceRef.current = false
      if (shouldListenRef.current) {
        setVoicePhase('ready')
        setNotice(`Waiting for “${wakePhraseRef.current}”`)
      }
    }
  }

  const startMicrophoneMeter = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('media-devices-unavailable')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const audioContext = new AudioContext()
    await audioContext.resume()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    const microphoneSource = audioContext.createMediaStreamSource(stream)
    microphoneSource.connect(analyser)
    const wakeProcessor = audioContext.createScriptProcessor(4096, 1, 1)
    const silentOutput = audioContext.createGain()
    silentOutput.gain.value = 0
    wakeProcessor.onaudioprocess = (event) => {
      if (!shouldListenRef.current) return
      wakeSamplesRef.current.push(...event.inputBuffer.getChannelData(0))
      const samplesPerUpload = Math.round(audioContext.sampleRate / 2)
      if (wakeSamplesRef.current.length < samplesPerUpload) return
      const samples = new Float32Array(wakeSamplesRef.current.splice(0, samplesPerUpload))
      wakeUploadRef.current = wakeUploadRef.current
        .then(async () => {
          await fetch('/api/wake/audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(audioContext.sampleRate) },
            body: samples.buffer,
          })
        })
        .catch(() => undefined)
    }
    microphoneSource.connect(wakeProcessor)
    wakeProcessor.connect(silentOutput)
    silentOutput.connect(audioContext.destination)
    const samples = new Uint8Array(analyser.fftSize)

    micStreamRef.current = stream
    audioContextRef.current = audioContext
    const beginUtterance = () => {
      if (processingVoiceRef.current || recorderRef.current || !shouldListenRef.current) return
      if (monotonicNow() >= wakeWindowUntilRef.current) return
      wakeWindowUntilRef.current = 0
      if (wakeWindowTimerRef.current) clearTimeout(wakeWindowTimerRef.current)
      wakeWindowTimerRef.current = null
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined)
      audioChunksRef.current = []
      discardRecordingRef.current = false
      speechStartedAtRef.current = performance.now()
      lastVoiceAtRef.current = speechStartedAtRef.current
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        recorderRef.current = null
        if (discardRecordingRef.current) return
        const recording = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void submitVoiceRecording(recording)
      }
      recorderRef.current = recorder
      recorder.start(200)
      setVoicePhase('hearing')
      setNotice('Listening')
    }

    meterTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length)
      const now = performance.now()
      if (rms > .035) {
        lastVoiceAtRef.current = now
        beginUtterance()
      }
      const recorder = recorderRef.current
      if (recorder?.state === 'recording') {
        const length = now - speechStartedAtRef.current
        if ((length > 450 && now - lastVoiceAtRef.current > 850) || length > 12000) recorder.stop()
      }
    }, 80)
  }

  useEffect(() => {
    const events = new EventSource('/api/wake/events')
    const handleWake = () => {
      wakeWindowUntilRef.current = monotonicNow() + WAKE_WINDOW_MS
      if (!shouldListenRef.current) return
      if (wakeWindowTimerRef.current) clearTimeout(wakeWindowTimerRef.current)
      wakeWindowTimerRef.current = setTimeout(() => {
        wakeWindowUntilRef.current = 0
        wakeWindowTimerRef.current = null
        if (!recorderRef.current && shouldListenRef.current) {
          setVoicePhase('ready')
          setNotice(`Waiting for “${wakePhraseRef.current}”`)
          showVoiceStatus(`Say “${wakePhraseRef.current}” when you’re ready.`)
        }
      }, WAKE_WINDOW_MS)
      setVoicePhase('ready')
      setNotice('Listening for your command')
      showVoiceStatus('I’m listening.')
    }
    events.addEventListener('wake', handleWake)
    return () => {
      events.removeEventListener('wake', handleWake)
      events.close()
      if (wakeWindowTimerRef.current) clearTimeout(wakeWindowTimerRef.current)
    }
  }, [])

  const startHandsFree = async () => {
    if (shouldListenRef.current || micStreamRef.current) return
    if (!window.MediaRecorder) {
      setNotice('Voice recording is unavailable')
      const response = 'This browser cannot record microphone audio. Open Hub in current Chrome or Edge.'
      setTranscript(response)
      addVoiceMessage('assistant', response)
      return
    }

    try {
      const healthResponse = await fetch('/api/voice/health')
      const health = await healthResponse.json()
      if (!healthResponse.ok || !health.configured) throw new Error('Add OPENAI_API_KEY to the voice server before enabling listening.')
      const configuredPhrase = String(health.wakePhrase || DEFAULT_WAKE_PHRASE)
      setWakePhrase(configuredPhrase)
      setWakePhraseDraft(configuredPhrase)
      wakePhraseRef.current = configuredPhrase
    } catch (error) {
      setVoicePhase('error')
      setNotice('Voice service needs setup')
      addVoiceMessage('assistant', error instanceof Error ? error.message : 'The OpenAI voice service is unavailable.')
      return
    }

    shouldListenRef.current = true
    try {
      await startMicrophoneMeter()
    } catch (error) {
      stopMicrophoneMeter()
      setVoicePhase('error')
      setNotice('Microphone is unavailable')
      const response = !window.isSecureContext
        ? 'Microphone access is blocked in this LAN preview. Launch it with the Surface voice-testing command shown by the development server.'
        : error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow access and try again.'
        : 'This browser is not providing microphone audio. Try Chrome or Edge.'
      setTranscript(response)
      addVoiceMessage('assistant', response)
      shouldListenRef.current = false
      return
    }
    setAlwaysListening(true)
    setVoicePhase('ready')
    setNotice(`Waiting for “${wakePhraseRef.current}”`)
    setTranscript(`Say “${wakePhraseRef.current}” before a command.`)
    addVoiceMessage('assistant', `Say “${wakePhraseRef.current}”, then your command.`)
  }
  useEffect(() => {
    const startTimer = window.setTimeout(() => void startHandsFree(), 150)
    return () => window.clearTimeout(startTimer)
    // Voice startup is intentionally tied to mounting the app, not rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    shouldListenRef.current = false
    if (wakeWindowTimerRef.current) clearTimeout(wakeWindowTimerRef.current)
    if (meterTimerRef.current) clearInterval(meterTimerRef.current)
    discardRecordingRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    void audioContextRef.current?.close()
  }, [])

  const toggleIngredient = (index: number) => {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })
  }

  const openRecipe = (selected: Recipe) => {
    const fresh = cloneRecipe(selected)
    setBaseRecipe(selected)
    workingRecipeRef.current = fresh
    setWorkingRecipe(fresh)
    servingsRef.current = selected.baseServings
    setServings(selected.baseServings)
    setScaleRequest({ mode: 'servings', servings: selected.baseServings })
    stepRef.current = 0
    setStep(0)
    setChecked(new Set())
    setPending(null)
    setHasDraftChanges(false)
    setHasActiveRecipe(true)
    setVoiceMessages([{ id: voiceMessageIdRef.current++, role: 'assistant', text: READY_VOICE_MESSAGE }])
    setLibraryOpen(false)
    setActiveView('cooking')
  }

  const finishRecipe = () => {
    localCookingSessionRepository.clear()
    setHasActiveRecipe(false)
    setChecked(new Set())
    setStep(0)
    stepRef.current = 0
    setVoiceMessages([{ id: voiceMessageIdRef.current++, role: 'assistant', text: READY_VOICE_MESSAGE }])
    setActiveView('home')
  }

  const chooseTheme = (nextTheme: ThemeId) => {
    setTheme(nextTheme)
    localStorage.setItem('kitchen-hub:theme', nextTheme)
  }

  const openSettings = () => {
    setSettingsPage('root')
    setOpenAIStatus('loading')
    setOpenAIMessage('')
    setSettingsOpen(true)
  }

  const loadCalendarStatus = async () => {
    try {
      const response = await fetch('/api/calendar/status')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not reach the local calendar service.')
      const nextState: CalendarConnectionState = result.connected ? 'connected' : result.configured ? 'ready' : 'setup'
      setCalendarConnection(nextState)
      setRecipesAuthorized(Boolean(result.recipesAuthorized))
      setCalendarMessage('')
      return nextState
    } catch (error) {
      setCalendarConnection('error')
      setCalendarMessage(error instanceof Error ? error.message : 'Could not reach the local calendar service.')
      return 'error' as CalendarConnectionState
    }
  }

  const loadTodayCalendar = async () => {
    setCalendarRefreshing(true)
    setCalendarLoadState(state => state === 'ready' || state === 'empty' ? state : 'loading')
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 1)
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const query = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone })
      const response = await fetch(`/api/calendar/today?${query}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Today’s calendar could not be loaded.')
      const events = Array.isArray(result.events) ? result.events as CalendarEvent[] : []
      setHubCalendars(Array.isArray(result.calendars) ? result.calendars : [])
      const tomorrow = new Date(start)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const eventStart = (event: CalendarEvent) => new Date(event.allDay ? `${event.start}T00:00:00` : event.start).getTime()
      setCalendarEvents(events.filter(event => eventStart(event) < tomorrow.getTime()))
      setFutureCalendarEvents(events.filter(event => eventStart(event) >= tomorrow.getTime()))
      setCalendarLoadState(events.length ? 'ready' : result.errors?.length ? 'error' : 'empty')
      setCalendarMessage(result.errors?.length ? `Could not refresh: ${result.errors.map((item: { calendarName: string }) => item.calendarName).join(', ')}. Other calendars are shown.` : '')
    } catch (error) {
      setCalendarLoadState(state => state === 'ready' || state === 'empty' ? state : 'error')
      setCalendarMessage(error instanceof Error ? error.message : 'Today’s calendar could not be loaded.')
    } finally {
      setCalendarRefreshing(false)
    }
  }

  const selectHubCalendar = async (calendar: HubCalendar) => {
    setCalendarSaving(true)
    setCalendarSelectionError('')
    try {
      const response = await fetch('/api/calendar/selection', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: calendar.id, selected: !calendar.selected }),
      })
      if (!response.ok) throw new Error('Calendar selection could not be saved.')
      await loadTodayCalendar()
    } catch (error) {
      setCalendarSelectionError(error instanceof Error ? error.message : 'Calendar selection could not be saved.')
    } finally { setCalendarSaving(false) }
  }

  const connectGoogleCalendar = () => {
    setCalendarConnection('connecting')
    setRecipesAuthorized(false)
    setCalendarMessage('Complete the Google sign-in window to connect Calendar and Hub Recipes.')
    window.open('/api/calendar/oauth/start', 'kitchen-hub-google-calendar', 'popup=yes,width=620,height=760')
    const startedAt = Date.now()
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch('/api/calendar/status')
        const result = await response.json()
        if (response.ok && result.connected && result.recipesAuthorized) {
          window.clearInterval(poll)
          setCalendarConnection('connected')
          setRecipesAuthorized(true)
          setCalendarMessage('')
          void loadTodayCalendar()
          void refreshRecipeLibrary()
          return
        }
      } catch { /* keep polling while the sign-in window is active */ }
      if (Date.now() - startedAt > 120_000) {
        window.clearInterval(poll)
        void loadCalendarStatus()
      }
    }, 1500)
  }

  const disconnectGoogleCalendar = async () => {
    try {
      const response = await fetch('/api/calendar/connection', { method: 'DELETE' })
      if (!response.ok) throw new Error('Google Calendar could not be disconnected.')
      setCalendarConnection('ready')
      setRecipesAuthorized(false)
      setCalendarLoadState('idle')
      setCalendarEvents([])
      setCalendarMessage('Google Calendar is disconnected.')
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Google Calendar could not be disconnected.')
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void loadCalendarStatus().then((state) => {
        if (state === 'connected') void loadTodayCalendar()
      })
    }, 0)
    const refresh = window.setInterval(() => {
      void loadCalendarStatus().then((state) => {
        if (state === 'connected') void loadTodayCalendar()
      })
    }, 5 * 60 * 1000)
    return () => { window.clearTimeout(initial); window.clearInterval(refresh) }
  }, [])

  useEffect(() => {
    const handleCalendarConnection = (event: MessageEvent) => {
      if (event.data?.type !== 'kitchen-hub-google-connected') return
      void loadCalendarStatus().then((state) => {
        if (state === 'connected') void loadTodayCalendar()
      })
    }
    window.addEventListener('message', handleCalendarConnection)
    return () => window.removeEventListener('message', handleCalendarConnection)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const calendarCheck = window.setTimeout(() => { void loadCalendarStatus() }, 0)
    let cancelled = false
    fetch('/api/voice/health')
      .then(async (response) => {
        const health = await response.json()
        if (!response.ok) throw new Error(health.error || 'Could not reach the local voice service.')
        if (!cancelled) {
          setOpenAIStatus(health.configured ? 'connected' : 'empty')
          const configuredPhrase = String(health.wakePhrase || DEFAULT_WAKE_PHRASE)
          setWakePhrase(configuredPhrase)
          setWakePhraseDraft(configuredPhrase)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOpenAIStatus('error')
          setOpenAIMessage(error instanceof Error ? error.message : 'Could not reach the local voice service.')
        }
      })
    return () => { cancelled = true; window.clearTimeout(calendarCheck) }
  }, [settingsOpen])

  const saveOpenAIKey = async () => {
    setOpenAIStatus('saving')
    setOpenAIMessage('')
    try {
      const response = await fetch('/api/settings/openai-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: openAIKey }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The API key could not be saved.')
      setOpenAIKey('')
      setOpenAIStatus('connected')
      setOpenAIMessage('OpenAI is connected and ready for voice commands.')
    } catch (error) {
      setOpenAIStatus('error')
      setOpenAIMessage(error instanceof Error ? error.message : 'The API key could not be saved.')
    }
  }

  const saveWakePhrase = async () => {
    setWakePhraseStatus('saving')
    setWakePhraseMessage('')
    try {
      const response = await fetch('/api/settings/wake-phrase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: wakePhraseDraft }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The wake phrase could not be changed.')
      setWakePhrase(result.phrase)
      wakePhraseRef.current = result.phrase
      setWakePhraseDraft(result.phrase)
      setWakePhraseStatus('saved')
      setWakePhraseMessage(`Now listening for “${result.phrase}.”`)
      if (shouldListenRef.current) {
        setNotice(`Waiting for “${result.phrase}”`)
        showVoiceStatus(`Say “${result.phrase}” before your command.`)
      }
    } catch (error) {
      setWakePhraseStatus('error')
      setWakePhraseMessage(error instanceof Error ? error.message : 'The wake phrase could not be changed.')
    }
  }

  const runLabPrompt = async (prompt = labPrompt) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || labStatus === 'loading') return
    setLabPrompt(cleanPrompt)
    setLabStatus('loading')
    try {
      const response = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt }),
      })
      const generated = await response.json()
      if (!response.ok) throw new Error(generated.error || 'Recipe Lab could not build that recipe.')
      const id = `${generated.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
      const normalized = normalizeRecipe({
        id,
        name: generated.name,
        description: generated.description,
        minutes: generated.minutes,
        baseServings: generated.baseServings,
        calories: generated.calories,
        protein: generated.protein,
        ingredients: generated.ingredients.map((item: { name: string; sourceQuantity: string; sourceUnit: string; notes: string; scalingBehavior: RecipeIngredient['scalingBehavior']; steps: number[] }) => ({
          name: item.name,
          ingredient: item.name,
          amount: 0,
          quantity: undefined,
          unit: item.sourceUnit,
          sourceQuantity: item.sourceQuantity,
          sourceUnit: item.sourceUnit,
          note: item.notes || undefined,
          notes: item.notes || undefined,
          scalingBehavior: item.scalingBehavior,
          steps: item.steps,
        })),
        steps: generated.steps,
        servingIdeas: generated.servingIdeas,
        notes: generated.notes,
        source: { kind: 'generated', label: cleanPrompt, capturedAt: new Date().toISOString() },
      })
      const validation = validateRecipe(normalized)
      const nextDraft: RecipeDraft = {
        id,
        prompt: cleanPrompt,
        response: generated.response,
        recipe: { ...normalized, validationWarnings: validation.warnings },
        updatedAt: new Date().toISOString(),
      }
      localRecipeRepository.saveDraft(nextDraft)
      setLabDraft(nextDraft)
      setLabPrompt('')
      setLabStatus('idle')
    } catch {
      setLabStatus('error')
    }
  }

  const discardLabDraft = () => {
    localRecipeRepository.discardDraft()
    setLabDraft(null)
    setLabPrompt('')
    setLabStatus('idle')
  }

  const saveLabRecipe = async (startCooking: boolean) => {
    if (!labDraft) return
    const normalized = normalizeRecipe(labDraft.recipe)
    const validation = validateRecipe(normalized)
    const recipeToSave = { ...normalized, validationWarnings: validation.warnings }
    setLabStatus('loading')
    try {
      await sheetsRecipeRepository.save(recipeToSave)
      const savedRecipes = localRecipeRepository.saveRecipe(recipeToSave)
      setLibraryRecipes(mergeLibraryRecipes(savedRecipes))
      setLabStatus('saved')
      if (startCooking) {
        openRecipe(recipeToSave)
        setActiveView('cooking')
      }
    } catch {
      setLabStatus('error')
    }
  }

  return (
    <main className="app-shell" data-theme={theme} data-view={activeView}>
      <AppUpdateBanner updates={updates} />
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => { setLibraryOpen(false); setActiveView('home') }} aria-label="Go to Hub home">
          <div className="hub-wordmark" aria-label="Hub">
            Hub
          </div>
        </button>
        <div className={`voice-presence voice-${voicePhase}`} role="status" aria-live="polite">
          <span aria-hidden="true" />
          {voiceStatusLabel}
        </div>
        <div className="topbar-actions">
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setActiveView('recipe-lab')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6m-5 0v7l-6 9a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10" /></svg><span>Recipe Lab</span></button> : null}
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setActiveView('timer')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="8" /><path d="M9 2h6m-3 0v4m0 4v5l3 2M18 6l2-2" /></svg><span>Timer</span></button> : null}
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setLibraryOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h16M8 7h8M8 11h6" /></svg><span>Recipes</span></button> : null}
          {activeView === 'home' ? <button className="ghost-button utility-button" type="button" aria-label="Open settings" title="Settings" onClick={openSettings}><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
          <path d="M19.43 15.1a1.7 1.7 0 0 0 .34 1.88l.06.06-2.79 2.79-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4.14v-.01a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.79-2.79.06-.06a1.7 1.7 0 0 0 .34-1.88A1.7 1.7 0 0 0 3.01 14H3V10h.01a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.79-2.79.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.93 3.08V3h4.14v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.79 2.79-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.99 10H21v4h-.01a1.7 1.7 0 0 0-1.56 1.1Z" />
        </svg><span>Settings</span></button> : null}
          {activeView !== 'home' ? <button className="ghost-button" type="button" onClick={() => { setLibraryOpen(false); setActiveView('home') }}>Home</button> : null}
          {activeView === 'cooking' || activeView === 'recipe-lab' ? <button className="ghost-button" type="button" onClick={() => setActiveView(activeView === 'recipe-lab' ? 'cooking' : 'recipe-lab')}>{activeView === 'recipe-lab' ? 'Cook Mode' : 'Recipe Lab'}</button> : null}
          {activeView === 'cooking' || activeView === 'recipe-lab' ? <button className="ghost-button" type="button" aria-label="Open recipe library" onClick={() => setLibraryOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h16M8 7h8M8 11h6" /></svg><span>Recipes</span></button> : null}
        </div>
      </header>

      {activeView !== 'home' ? (<button className="settings-button" type="button" aria-label="Open settings" title="Settings" onClick={openSettings}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
          <path d="M19.43 15.1a1.7 1.7 0 0 0 .34 1.88l.06.06-2.79 2.79-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4.14v-.01a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.79-2.79.06-.06a1.7 1.7 0 0 0 .34-1.88A1.7 1.7 0 0 0 3.01 14H3V10h.01a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.79-2.79.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.93 3.08V3h4.14v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.79 2.79-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.99 10H21v4h-.01a1.7 1.7 0 0 0-1.56 1.1Z" />
        </svg>
      </button>) : null}

      {settingsOpen ? (
        <div className="library-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className={`settings-panel ${settingsPage === 'appearance' ? 'appearance-open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="library-heading">
              <div className="settings-heading-copy">
                {settingsPage !== 'root' ? <button type="button" className="settings-back" onClick={() => setSettingsPage('root')} aria-label="Back to settings">←</button> : null}
                <div><p className="eyebrow">{settingsPage === 'root' ? 'Hub' : 'Settings'}</p><h2 id="settings-title">{settingsPage === 'appearance' ? 'Appearance' : settingsPage === 'connections' ? 'Connections' : settingsPage === 'updates' ? 'App updates' : 'Settings'}</h2></div>
              </div>
              <button type="button" className="library-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
            </div>
            {settingsPage === 'root' ? (
              <div className="settings-list">
                <button type="button" className="settings-row" onClick={() => setSettingsPage('appearance')}>
                  <span className="settings-row-icon" aria-hidden="true">◐</span>
                  <span className="settings-row-copy"><strong>Appearance</strong><small>Theme, color, and visual style</small></span>
                  <span className="settings-row-value">{themeOptions.find((option) => option.id === theme)?.name}<b aria-hidden="true">›</b></span>
                </button>
                <button type="button" className="settings-row" onClick={() => setSettingsPage('updates')}>
                  <span className="settings-row-icon" aria-hidden="true">↻</span>
                  <span className="settings-row-copy"><strong>App updates</strong><small>New releases on GitHub</small></span>
                  <span className="settings-row-value">Every {updates.intervalSeconds}s<b aria-hidden="true">›</b></span>
                </button>
                <button type="button" className="settings-row" onClick={() => setSettingsPage('connections')}>
                  <span className="settings-row-icon" aria-hidden="true">⌁</span>
                  <span className="settings-row-copy"><strong>Connections</strong><small>OpenAI voice, Calendar, and Hub Recipes</small></span>
                  <span className="settings-row-value">{openAIStatus === 'connected' && calendarConnection === 'connected' ? 'All connected' : openAIStatus === 'loading' || calendarConnection === 'loading' ? 'Checking…' : calendarConnection === 'ready' ? 'Google sign-in' : calendarConnection === 'setup' ? 'Calendar unavailable' : 'Setup required'}<b aria-hidden="true">›</b></span>
                </button>
              </div>
            ) : settingsPage === 'updates' ? (
              <AppUpdateSettings updates={updates} />
            ) : settingsPage === 'appearance' ? (
              <div className="theme-grid">
                {themeOptions.map((option) => (
                  <button type="button" className={`theme-option ${option.id === theme ? 'active' : ''}`} aria-pressed={option.id === theme} key={option.id} onClick={() => chooseTheme(option.id)}>
                    <span className={`theme-preview ${option.id}`} aria-hidden="true"><i /><i /><i /></span>
                    <span className="theme-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
                    <span className="theme-check" aria-hidden="true">{option.id === theme ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="connection-settings">
                <div className={`connection-status ${openAIStatus}`}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{openAIStatus === 'loading' ? 'Checking connection' : openAIStatus === 'connected' ? 'OpenAI connected' : openAIStatus === 'saving' ? 'Verifying key' : openAIStatus === 'error' ? 'Connection needs attention' : 'OpenAI setup required'}</strong>
                    <p>{openAIStatus === 'connected' ? 'Voice transcription and command understanding are ready.' : openAIStatus === 'loading' ? 'Contacting the local Hub service…' : openAIStatus === 'saving' ? 'The local service is securely checking this key with OpenAI…' : openAIMessage || 'Add an API key to enable production voice control.'}</p>
                  </div>
                </div>
                <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void saveOpenAIKey() }}>
                  <label htmlFor="openai-api-key">OpenAI API key</label>
                  <input id="openai-api-key" type="password" value={openAIKey} onChange={(event) => setOpenAIKey(event.target.value)} placeholder={openAIStatus === 'connected' ? 'Enter a new key to replace the current one' : 'sk-…'} autoComplete="off" spellCheck={false} />
                  <small>The key is saved only in Hub’s private local data file. It is never stored in the browser.</small>
                  <button type="submit" disabled={!openAIKey.trim() || openAIStatus === 'saving'}>{openAIStatus === 'saving' ? 'Verifying…' : openAIStatus === 'connected' ? 'Replace key' : 'Connect OpenAI'}</button>
                </form>
                <form className="connection-form wake-phrase-form" onSubmit={(event) => { event.preventDefault(); void saveWakePhrase() }}>
                  <div className="connection-form-heading">
                    <div><label htmlFor="wake-phrase">Wake phrase</label><p>Current phrase: “{wakePhrase}”</p></div>
                    <span className={`wake-save-state ${wakePhraseStatus}`}>{wakePhraseStatus === 'saving' ? 'Updating…' : wakePhraseStatus === 'saved' ? 'Updated' : wakePhraseStatus === 'error' ? 'Try again' : 'Local'}</span>
                  </div>
                  <input id="wake-phrase" type="text" value={wakePhraseDraft} onChange={(event) => { setWakePhraseDraft(event.target.value); setWakePhraseStatus('idle'); setWakePhraseMessage('') }} maxLength={32} placeholder="Hub" autoComplete="off" spellCheck={false} />
                  <small>Use two to four distinctive words that are easy to pronounce. The local wake model reloads immediately.</small>
                  {wakePhraseMessage ? <p className={`connection-feedback ${wakePhraseStatus}`}>{wakePhraseMessage}</p> : null}
                  <button type="submit" disabled={wakePhraseDraft.trim().length < 2 || wakePhraseDraft.trim() === wakePhrase || wakePhraseStatus === 'saving'}>{wakePhraseStatus === 'saving' ? 'Updating…' : 'Change wake phrase'}</button>
                </form>
                <section className="calendar-connection" aria-labelledby="google-calendar-settings-title">
                  <div className={`connection-status calendar-${calendarConnection}`}>
                    <span aria-hidden="true" />
                    <div>
                      <strong id="google-calendar-settings-title">{calendarConnection === 'connected' && recipesAuthorized ? 'Google services connected' : calendarConnection === 'connected' ? 'Hub Recipes needs access' : calendarConnection === 'connecting' ? 'Connecting Google services' : calendarConnection === 'ready' ? 'Google services' : calendarConnection === 'loading' ? 'Checking Google services' : calendarConnection === 'error' ? 'Google connection needs attention' : 'Google Sign-In unavailable'}</strong>
                      <p>{calendarConnection === 'connected' && recipesAuthorized ? 'Calendar and the Hub Recipes spreadsheet are connected.' : calendarConnection === 'connected' ? 'Reconnect once to grant access to the Hub Recipes spreadsheet. Calendar access will remain available.' : calendarConnection === 'setup' ? 'This build does not have complete Google OAuth credentials yet.' : calendarMessage || 'Sign in once to connect Calendar and Hub Recipes.'}</p>
                    </div>
                  </div>
                  {calendarConnection === 'ready' || calendarConnection === 'connecting' ? <button className="calendar-connect-button" type="button" disabled={calendarConnection === 'connecting'} onClick={connectGoogleCalendar}>{calendarConnection === 'connecting' ? 'Waiting for Google…' : 'Sign in with Google'}</button> : null}
                  {calendarConnection === 'connected' ? <div className="calendar-connection-actions">{!recipesAuthorized ? <button type="button" onClick={connectGoogleCalendar}>Reconnect Google</button> : <button type="button" onClick={() => void refreshRecipeLibrary()}>Refresh recipes</button>}<button type="button" onClick={() => void loadTodayCalendar()}>Refresh calendar</button><button type="button" className="secondary" onClick={() => void disconnectGoogleCalendar()}>Disconnect</button></div> : null}
                  {calendarConnection === 'connected' ? <fieldset className="calendar-selection">
                    <legend>Calendars shown on Home</legend>
                    {hubCalendars.map(calendar => <label key={calendar.id}>
                      <input type="checkbox" checked={calendar.selected} disabled={calendarSaving} onChange={() => void selectHubCalendar(calendar)} />
                      <span>{calendar.name}<small>{calendar.primary ? 'Primary' : calendar.accessRole === 'reader' ? 'Read only' : ''}</small></span>
                    </label>)}
                    {!hubCalendars.length ? <button type="button" onClick={() => void loadTodayCalendar()}>Load calendars</button> : null}
                    {calendarSelectionError ? <p role="alert">{calendarSelectionError}</p> : null}
                  </fieldset> : null}
                </section>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {libraryOpen ? (
        <div className="library-backdrop" role="presentation" onClick={() => setLibraryOpen(false)}>
          <section className="recipe-library" role="dialog" aria-modal="true" aria-labelledby="library-title" onClick={(event) => event.stopPropagation()}>
            <div className="library-heading">
              <div><p className="eyebrow">Recipe library</p><h2 id="library-title">What are you cooking?</h2></div>
              <div><button type="button" disabled={recipeSyncStatus === 'loading'} onClick={() => void refreshRecipeLibrary()}>{recipeSyncStatus === 'loading' ? 'Refreshing…' : 'Refresh'}</button><button type="button" className="library-close" onClick={() => setLibraryOpen(false)} aria-label="Close recipe library">×</button></div>
            </div>
            <div className="recipe-grid">
              {libraryRecipes.map((item) => (
                <button type="button" className={`recipe-tile ${hasActiveRecipe && item.id === baseRecipe.id ? 'active' : ''}`} key={item.id} onClick={() => openRecipe(item)}>
                  <span className="recipe-tile-number">{String(libraryRecipes.indexOf(item) + 1).padStart(2, '0')}</span>
                  <span className="recipe-tile-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
                  <span className="recipe-tile-meta">{formatRecipeTime(item.minutes)} · {item.baseServings} {item.baseServings === 1 ? 'serving' : 'servings'} · {item.calories} cal · {item.protein}g protein</span>
                </button>
              ))}
            </div>
            {recipeSyncStatus === 'error' ? <p className="connection-feedback error">Showing cached recipes. Reconnect Google in Settings to sync Hub Recipes.</p> : null}
          </section>
        </div>
      ) : null}

      {activeView === 'home' ? (
        <section className="hub-home" aria-label="Hub home">
          <div className="hub-layout">
            <div className="hub-left-stack">
              <LiveWeatherCard />
              <button className={`hub-card cooking-app ${hasActiveRecipe ? '' : 'is-empty'}`} type="button" onClick={() => hasActiveRecipe ? setActiveView('cooking') : setLibraryOpen(true)}>
                {hasActiveRecipe ? (
                  <span className="hub-card-copy"><span className="hub-card-kicker">Continue cooking</span><strong>{workingRecipe.name}</strong><span className="cooking-step">Step {step + 1} of {workingRecipe.steps.length}</span><small>{formatRecipeTime(workingRecipe.minutes)} total recipe time</small><span className="cooking-progress" role="progressbar" aria-label="Recipe step progress" aria-valuemin={0} aria-valuemax={workingRecipe.steps.length} aria-valuenow={step + 1}><span style={{ width: `${progress}%` }} /></span></span>
                ) : (
                  <span className="hub-card-copy"><span className="hub-card-kicker">Ready when you are</span><strong>Choose your next recipe</strong><small>Browse saved recipes or start with an idea from Recipe Lab.</small></span>
                )}
                <span className="hub-card-action">{hasActiveRecipe ? 'Resume cooking' : 'Choose a recipe'} <b aria-hidden="true">→</b></span>
              </button>
            </div>
            <section className="calendar-card display-panel" aria-labelledby="calendar-title">
              <header className="calendar-heading">
                <div><p className="eyebrow">Today</p><h2 id="calendar-title">{todayLabel}</h2></div>
                <span className="calendar-source">Google Calendar</span>
              </header>
              <div className={`calendar-content${calendarRefreshing ? ' is-refreshing' : ''}`} aria-live="polite" aria-busy={calendarRefreshing}>
                {calendarConnection === 'loading' || calendarLoadState === 'loading' ? (
                  <div className="calendar-skeleton" aria-label="Loading today’s calendar"><i /><i /><i /><i /></div>
                ) : calendarConnection !== 'connected' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">31</span><strong>{calendarConnection === 'setup' ? 'Google Sign-In is not ready in this build.' : 'Bring your day into the kitchen.'}</strong><p>{calendarConnection === 'setup' ? 'Add Hub’s Google OAuth credentials to enable sign-in.' : 'Sign in once to see today’s schedule and prep reminders.'}</p>{calendarConnection === 'ready' ? <button type="button" onClick={connectGoogleCalendar}>Sign in with Google</button> : null}</div>
                ) : calendarLoadState === 'error' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">!</span><strong>Today’s schedule didn’t load.</strong><p>{calendarMessage}</p><button type="button" onClick={() => void loadTodayCalendar()}>Try again</button></div>
                ) : calendarLoadState === 'empty' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">✓</span><strong>Nothing scheduled today.</strong><p>Your day is clear. New Google Calendar events will appear here.</p><button type="button" onClick={() => void loadTodayCalendar()}>Refresh</button></div>
                ) : (
                  <CalendarAgenda events={calendarEvents} futureEvents={futureCalendarEvents} />
                )}
              </div>
              {calendarMessage && calendarLoadState !== 'error' ? <p className="calendar-refresh-warning" role="status">{calendarMessage}</p> : null}
            </section>
          </div>
          <LiveDock onOpenTimers={() => setActiveView('timer')} />
        </section>
      ) : activeView === 'recipe-lab' ? (
        <section className="recipe-lab" aria-label="Recipe Lab">
          <header className="lab-heading">
            <p className="eyebrow">Cooking · Recipe Lab</p>
            <span className="prototype-badge">Prototype AI</span>
          </header>

          <div className={`lab-workspace ${labDraft ? 'has-draft' : 'is-empty'}`}>
            <section className="lab-conversation" aria-labelledby="lab-conversation-title">
              <div className="lab-section-heading">
                <p className="eyebrow">Conversation</p>
                <h2 id="lab-conversation-title">What are you thinking?</h2>
              </div>

              <div className="lab-response" aria-live="polite">
                {labStatus === 'loading' ? (
                  <div className="lab-loading" aria-label="Building recipe draft"><i /><i /><i /><span>Shaping the recipe…</span></div>
                ) : labStatus === 'error' ? (
                  <div className="lab-error"><strong>I couldn’t build that draft.</strong><span>Your idea is still here.</span><button type="button" onClick={() => runLabPrompt()}>Try again</button></div>
                ) : labDraft ? (
                  <div className="lab-answer"><span className="lab-answer-mark" aria-hidden="true">K</span><p>{labDraft.response}</p></div>
                ) : (
                  <div className="lab-empty">
                    <strong>Start with the meal, the constraint, or what you have.</strong>
                    <span>The connected version will also be able to use receipts and confirmed pantry context.</span>
                    <div className="lab-starters">
                      {['A fast dinner using chicken and greens', 'A vegetarian meal for four', 'Help me rethink a saved recipe'].map((starter) => (
                        <button type="button" key={starter} onClick={() => runLabPrompt(starter)}>{starter}<b aria-hidden="true">→</b></button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <form className="lab-composer" onSubmit={(event) => { event.preventDefault(); void runLabPrompt() }}>
                <label htmlFor="lab-prompt">Your idea</label>
                <div>
                  <textarea id="lab-prompt" value={labPrompt} onChange={(event) => setLabPrompt(event.target.value)} placeholder="Try: I want something bright and savory using what I bought this week…" rows={3} />
                  <button type="submit" disabled={!labPrompt.trim() || labStatus === 'loading'} aria-label="Send idea">↑</button>
                </div>
              </form>
            </section>

            <aside className="lab-draft" aria-labelledby="lab-draft-title">
              {labDraft ? (
                <>
                  <div className="lab-draft-heading"><div><p className="eyebrow">Current draft</p><h2 id="lab-draft-title">{labDraft.recipe.name}</h2></div><span>{formatRecipeTime(labDraft.recipe.minutes)} · {labDraft.recipe.baseServings} servings</span></div>
                  <p className="lab-draft-description">{labDraft.recipe.description}</p>
                  <div className="lab-draft-summary">
                    <section><span>Ingredients</span><strong>{labDraft.recipe.ingredients.length}</strong><small>{labDraft.recipe.ingredients.slice(0, 4).map((item) => item.name).join(', ')}</small></section>
                    <section><span>Method</span><strong>{labDraft.recipe.steps.length} steps</strong><small>{labDraft.recipe.steps[0]}</small></section>
                  </div>
                  {labDraft.recipe.validationWarnings?.length ? <p className="lab-warning">This recipe can be saved, but automatic scaling may be incomplete: {labDraft.recipe.validationWarnings.join(' ')}</p> : null}
                  {labStatus === 'saved' ? <p className="lab-saved" role="status">Saved to your recipe library.</p> : null}
                  <div className="lab-draft-actions">
                    <button className="lab-primary" type="button" onClick={() => void saveLabRecipe(true)}>Save & cook</button>
                    <button type="button" onClick={() => void saveLabRecipe(false)}>Save to library</button>
                    <button type="button" onClick={discardLabDraft}>Discard draft</button>
                  </div>
                </>
              ) : (
                <div className="lab-draft-placeholder">
                  <span className="lab-draft-icon" aria-hidden="true">✦</span>
                  <p className="eyebrow">Draft preview</p>
                  <h2 id="lab-draft-title">Your recipe will take shape here.</h2>
                  <p>Ingredients, timing, and steps will stay visible while you refine the idea.</p>
                </div>
              )}
            </aside>
          </div>
        </section>
      ) : activeView === 'timer' ? <TimerView /> : (
      <div className="recipe-view" key={workingRecipe.id}>
      <section className="recipe-heading">
        <div>
          <p className="eyebrow">Tonight’s recipe {hasDraftChanges ? <span className="draft-badge">Customized draft</span> : null}</p>
          <h1>{workingRecipe.name}</h1>
          <p className="description">{workingRecipe.description}</p>
        </div>
        <div className="recipe-facts" aria-label="Recipe facts">
          <div><span>Total time</span><strong>{formatRecipeTime(workingRecipe.minutes)}</strong></div>
          <div><span>Calories</span><strong>{Math.round(workingRecipe.calories * scale)}</strong></div>
          <div><span>Protein</span><strong>{Math.round(workingRecipe.protein * scale)}g</strong></div>
        </div>
      </section>

      <div className="workspace">
        <aside className="ingredients-card">
          <div className="card-heading">
            <div><p className="eyebrow">Prep</p><h2>Ingredients</h2></div>
            <div className="serving-control" aria-label="Serving count">
              <button type="button" onClick={() => applyServingScale(servings - 1)} aria-label="Decrease servings">−</button>
              <span><strong>{servings}</strong> servings</span>
              <button type="button" onClick={() => applyServingScale(servings + 1)} aria-label="Increase servings">+</button>
            </div>
          </div>
          <ul className="ingredient-list" key={`${workingRecipe.id}-${step}`} ref={ingredientListRef}>
            {displayedIngredients.map(({ item, index, relevant }, position) => (
              <li key={item.name} className={`${checked.has(index) ? 'checked' : ''} ${relevant ? 'relevant' : ''}`} style={{ animationDelay: `${Math.min(position, 8) * 24}ms` }}>
                <button type="button" className="check" onClick={() => toggleIngredient(index)} aria-label={`Mark ${item.name} ${checked.has(index) ? 'unused' : 'ready'}`}>{checked.has(index) ? '✓' : ''}</button>
                <button type="button" className="ingredient-copy" onClick={() => toggleIngredient(index)}>
                  <strong>{formatIngredientQuantity(item)}</strong>
                  <span className="ingredient-name">
                    <span>{item.name}{relevant ? <em>Now</em> : null}</span>
                    {formatIngredientNote(item.note) ? <small>{formatIngredientNote(item.note)}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="cooking-column">
        <section className="step-card">
          <div className="progress-row">
            <span>Step {step + 1} of {workingRecipe.steps.length}</span>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className={`step-body ${isLongStep ? 'is-long' : ''}`}>
            <div className="step-number">{String(step + 1).padStart(2, '0')}</div>
            <p>{currentInstruction}</p>
          </div>
          <div className="step-actions">
            {step > 0 ? (
              <button className="secondary" type="button" onClick={() => goToStep(step - 1)}>← Previous</button>
            ) : <span />}
            {step < workingRecipe.steps.length - 1 ? (
              <button className="primary" type="button" onClick={() => goToStep(step + 1)}>Next step →</button>
            ) : (
              <button className="primary finish-recipe" type="button" onClick={finishRecipe}>Finish recipe ✓</button>
            )}
          </div>
        </section>
        <section className={`conversation-card voice-${voicePhase} ${alwaysListening ? 'is-listening' : ''} ${pendingEdit ? 'needs-answer' : ''} ${voicePanelNeedsRoom ? 'has-expanded-content' : ''}`} aria-label="Voice command output">
          <div className="voice-output-heading">
            <span><i aria-hidden="true" />{voiceStatusLabel}</span>
            {voiceMessages.length > 1 || pendingEdit ? <button type="button" onClick={() => setVoiceThreadOpen(true)}>Open conversation</button> : null}
          </div>
          <div className="conversation-log" aria-live="polite">
            <div className={`voice-message ${currentVoiceMessage?.role ?? 'assistant'}`} aria-label={currentVoiceMessage?.role === 'user' ? 'You said' : 'Hub response'}>
              <p>{currentVoiceMessage?.role === 'user' ? `“${currentVoiceMessage.text}”` : currentVoiceMessage?.text ?? READY_VOICE_MESSAGE}</p>
            </div>
          </div>
        </section>
        </div>
      </div>
      </div>
      )}
      {voiceThreadOpen ? (
        <div className="voice-thread-backdrop" role="presentation" onClick={() => setVoiceThreadOpen(false)}>
          <section className="voice-thread" role="dialog" aria-modal="true" aria-labelledby="voice-thread-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">Hub conversation</p>
                <h2 id="voice-thread-title">Work through it together</h2>
              </div>
              <button type="button" onClick={() => setVoiceThreadOpen(false)} aria-label="Close conversation">×</button>
            </header>
            <div className="voice-thread-messages" ref={conversationRef} aria-live="polite">
              {voiceMessages.map((message) => (
                <article className={`voice-thread-message ${message.role}`} key={message.id}>
                  <span>{message.role === 'user' ? 'You' : 'Hub'}</span>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
            <footer><span aria-hidden="true" />{voiceStatusLabel}. Keep speaking naturally.</footer>
          </section>
        </div>
      ) : null}
      <AttentionLayer reminder={attentionReminder} />
    </main>
  )
}

export default App
