import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { localRecipeRepository, type RecipeDraft } from './recipeRepository'
import { localCookingSessionRepository } from './cookingSessionRepository'

export type Ingredient = { name: string; amount: number; unit: string; note?: string; steps: number[] }
export type Recipe = {
  id: string; name: string; description: string; minutes: number; baseServings: number
  calories: number; protein: number; ingredients: Ingredient[]; steps: string[]
}
type PendingEdit =
  | { kind: 'ingredient-choice'; ingredient: Ingredient }
  | { kind: 'addition-details'; name: string; stepIndex?: number; amount?: number; unit?: string; note?: string }
type VoiceMessage = { id: number; role: 'user' | 'assistant'; text: string }
type VoicePhase = 'off' | 'ready' | 'hearing' | 'processing' | 'error'
type CalendarEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean
  location: string; description: string; link: string
}
type CalendarConnectionState = 'loading' | 'setup' | 'ready' | 'connecting' | 'connected' | 'error'
type CalendarLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
const READY_VOICE_MESSAGE = 'Ready for a voice command.'
type VoiceCommand = {
  action: 'next_step' | 'previous_step' | 'go_to_step' | 'start_over' |
    'set_servings' | 'adjust_servings' | 'ingredient_quantity' |
    'check_ingredient' | 'uncheck_ingredient' | 'scroll_ingredients' |
    'remove_ingredient' | 'save_changes' | 'discard_changes' |
    'pause_listening' | 'unknown'
  step: number | null
  servings: number | null
  delta: number | null
  ingredient: string | null
  direction: 'up' | 'down' | null
  response: string
  confidence: number
}
type ThemeId = 'architectural' | 'warm' | 'mineral' | 'cyberpunk' | 'retro' | 'terracotta' | 'vaporwave' | 'seventies' | 'candy' | 'blueprint' | 'tavern'

const DEFAULT_WAKE_PHRASE = 'Kitchen Hub'
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
const recipe: Recipe = {
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
}

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
]

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
  ingredients: source.ingredients.map((item) => ({ ...item, steps: [...item.steps] })),
  steps: [...source.steps],
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

const formatTimer = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

const createFixtureDraft = (prompt: string): RecipeDraft => {
  const vegetarian = /vegetarian|meatless|tofu|beans/i.test(prompt)
  const recipeName = vegetarian ? 'Crispy Chickpea Herb Bowls' : 'Lemon Pepper Chicken & Greens'
  const protein = vegetarian ? 21 : 46
  const mainIngredient: Ingredient = vegetarian
    ? { name: 'chickpeas', amount: 2, unit: 'cans', note: 'drained and dried', steps: [0, 2] }
    : { name: 'chicken thighs', amount: 1.5, unit: 'lb', steps: [0, 2] }
  const draftRecipe: Recipe = {
    id: `lab-${Date.now()}`,
    name: recipeName,
    description: vegetarian
      ? 'Crisp chickpeas, lemony greens, and herbed yogurt over warm grains.'
      : 'Golden chicken, tender greens, and a bright lemon pan sauce for a practical weeknight dinner.',
    minutes: 35,
    baseServings: 4,
    calories: vegetarian ? 510 : 590,
    protein,
    ingredients: [
      mainIngredient,
      { name: 'lemon', amount: 1, unit: '', note: 'zested and juiced', steps: [0, 2] },
      { name: 'garlic', amount: 3, unit: 'cloves', note: 'finely grated', steps: [0] },
      { name: 'mixed greens', amount: 6, unit: 'cups', steps: [1, 2] },
      { name: 'cooked grains', amount: 3, unit: 'cups', steps: [2] },
      { name: 'plain yogurt', amount: 0.5, unit: 'cup', steps: [2] },
    ],
    steps: [
      vegetarian
        ? 'Season the chickpeas with lemon zest, garlic, salt, and pepper. Sear until crisp and deeply golden.'
        : 'Season the chicken with lemon zest, garlic, salt, and plenty of black pepper. Sear until deeply golden and cooked through.',
      'Wilt the greens in the same pan with a splash of water and a pinch of salt.',
      `Spoon the grains into bowls. Add the greens and ${vegetarian ? 'chickpeas' : 'sliced chicken'}, then finish with lemon juice and yogurt.`,
    ],
  }
  return {
    id: draftRecipe.id,
    prompt,
    response: `I shaped that into ${recipeName}. It stays weeknight-friendly, uses one pan, and leaves the final seasoning flexible. Review the draft before you save it.`,
    recipe: draftRecipe,
    updatedAt: new Date().toISOString(),
  }
}

function App() {
  const [restoredSession] = useState(() => localCookingSessionRepository.load(recipe))
  const [baseRecipe, setBaseRecipe] = useState<Recipe>(() => restoredSession?.baseRecipe ?? recipe)
  const [workingRecipe, setWorkingRecipe] = useState<Recipe>(() => restoredSession?.workingRecipe ?? cloneRecipe(recipe))
  const [hasActiveRecipe, setHasActiveRecipe] = useState(() => Boolean(restoredSession))
  const [servings, setServings] = useState(() => restoredSession?.servings ?? recipe.baseServings)
  const [step, setStep] = useState(() => restoredSession?.step ?? 0)
  const [checked, setChecked] = useState<Set<number>>(() => new Set(restoredSession?.checkedIngredients ?? []))
  const [alwaysListening, setAlwaysListening] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('off')
  const [micLevel, setMicLevel] = useState(0)
  const [, setTranscript] = useState('Tap the microphone, then speak naturally.')
  const [, setNotice] = useState('Ready when you are')
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([
    { id: 0, role: 'assistant', text: READY_VOICE_MESSAGE },
  ])
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null)
  const [hasDraftChanges, setHasDraftChanges] = useState(() => restoredSession?.hasDraftChanges ?? false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryRecipes, setLibraryRecipes] = useState<Recipe[]>(() => {
    const saved = localRecipeRepository.loadSavedRecipes()
    return [...recipes, ...saved.filter((savedRecipe) => !recipes.some((item) => item.id === savedRecipe.id))]
  })
  const [activeView, setActiveView] = useState<'home' | 'cooking' | 'recipe-lab' | 'timer'>('home')
  const [labDraft, setLabDraft] = useState<RecipeDraft | null>(() => localRecipeRepository.loadDraft())
  const [labPrompt, setLabPrompt] = useState('')
  const [labStatus, setLabStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle')
  const [timerDuration, setTimerDuration] = useState(10 * 60)
  const [timerRemaining, setTimerRemaining] = useState(10 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'root' | 'appearance' | 'connections'>('root')
  const [openAIKey, setOpenAIKey] = useState('')
  const [openAIStatus, setOpenAIStatus] = useState<'loading' | 'connected' | 'empty' | 'saving' | 'error'>('loading')
  const [openAIMessage, setOpenAIMessage] = useState('')
  const [wakePhrase, setWakePhrase] = useState(DEFAULT_WAKE_PHRASE)
  const [wakePhraseDraft, setWakePhraseDraft] = useState(DEFAULT_WAKE_PHRASE)
  const [wakePhraseStatus, setWakePhraseStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [wakePhraseMessage, setWakePhraseMessage] = useState('')
  const [calendarConnection, setCalendarConnection] = useState<CalendarConnectionState>('loading')
  const [calendarLoadState, setCalendarLoadState] = useState<CalendarLoadState>('idle')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
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

  const scale = servings / workingRecipe.baseServings
  const progress = ((step + 1) / workingRecipe.steps.length) * 100
  const currentInstruction = workingRecipe.steps[step]
  const isLongStep = currentInstruction.length > 115
  const currentVoiceMessage = voiceMessages[voiceMessages.length - 1]
  const voicePanelNeedsRoom = Boolean(pendingEdit)
    || voicePhase === 'error'
    || (currentVoiceMessage?.text !== READY_VOICE_MESSAGE && currentVoiceMessage?.text.length > 72)
  const scaledIngredients = useMemo(
    () => workingRecipe.ingredients.map((item) => ({ ...item, amount: item.amount * scale })),
    [scale, workingRecipe.ingredients],
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

  const formatCalendarTime = (event: CalendarEvent) => {
    if (event.allDay) return 'All day'
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(event.start))
  }

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

  useEffect(() => {
    if (!hasActiveRecipe) return
    localCookingSessionRepository.save({
      baseRecipe,
      workingRecipe,
      step,
      servings,
      checkedIngredients: [...checked],
      hasDraftChanges,
    })
  }, [baseRecipe, checked, hasActiveRecipe, hasDraftChanges, servings, step, workingRecipe])

  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimerRemaining((current) => {
        if (current <= 1) {
          setTimerRunning(false)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning])

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [voiceMessages])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [activeView])

  const addVoiceMessage = (role: VoiceMessage['role'], text: string) => {
    setVoiceMessages([{ id: voiceMessageIdRef.current++, role, text }])
  }

  const showVoiceStatus = (text: string) => {
    setTranscript(text)
    addVoiceMessage('assistant', text)
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
    setMicLevel(0)
  }

  const pauseHandsFree = () => {
    shouldListenRef.current = false
    wakeWindowUntilRef.current = 0
    if (wakeWindowTimerRef.current) clearTimeout(wakeWindowTimerRef.current)
    wakeWindowTimerRef.current = null
    setAlwaysListening(false)
    setVoicePhase('off')
    stopMicrophoneMeter()
    setNotice('Hands-free listening paused')
    setTranscript('Hands-free listening is paused.')
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

  const handleCommand = (rawCommand: string) => {
    const command = rawCommand.toLowerCase().trim().replace(/[.?!]+$/, '')

    if (/\b(?:pause|stop)\s+(?:hands[- ]free|listening|microphone|mic)\b/.test(command)) {
      pauseHandsFree()
      showVoiceStatus('Listening paused. Tap the microphone when you are ready to resume.')
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
        setServings(value)
        servingsRef.current = value
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
      servingsRef.current = bounded
      setServings(bounded)
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
      if (ingredient) {
        updateDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, index) => index === ingredientIndex ? { ...item, amount: offered.amount, unit: offered.unit } : item) }))
        setNotice(`${ingredient.name} amount updated`)
        showVoiceStatus(`Updating this draft to ${formatAmount(offered.amount)} ${offered.unit} ${ingredient.name}.`)
      } else {
        setPending({ kind: 'ingredient-choice', ingredient: offered })
        setNotice('Replace or add?')
        setTranscript(`Should ${formatAmount(offered.amount)} ${offered.unit} ${offered.name} replace the cod, or should I add it as a separate ingredient?`)
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
      const currentScale = servingsRef.current / currentRecipe.baseServings
      const response = `${formatAmount(ingredient.amount * currentScale)} ${ingredient.unit} ${ingredient.name}`.trim()
      setNotice(response)
      showVoiceStatus(response)
      return
    }
    const response = 'I didn’t catch that command. Please try saying it another way.'
    setNotice('I didn’t catch a kitchen command yet')
    showVoiceStatus(response)
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
          const next = Math.max(1, Math.min(12, command.servings))
          servingsRef.current = next
          setServings(next)
        }
        break
      case 'adjust_servings': {
        const next = Math.max(1, Math.min(12, servingsRef.current + (command.delta ?? 0)))
        servingsRef.current = next
        setServings(next)
        break
      }
      case 'ingredient_quantity':
        if (ingredient) {
          const currentScale = servingsRef.current / currentRecipe.baseServings
          command.response = `${formatAmount(ingredient.amount * currentScale)} ${ingredient.unit} ${ingredient.name}`.trim()
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
        pauseHandsFree()
        break
      case 'unknown':
        break
    }
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
            hasDraftChanges,
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
          await fetch('http://127.0.0.1:8788/audio', {
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
      setMicLevel(Math.min(1, rms * 7))
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

  const toggleListening = async () => {
    if (shouldListenRef.current) {
      pauseHandsFree()
      return
    }
    if (!window.MediaRecorder) {
      setNotice('Voice recording is unavailable')
      const response = 'This browser cannot record microphone audio. Open Kitchen Hub in current Chrome or Edge.'
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
      setNotice('Microphone is unavailable')
      const response = error instanceof DOMException && error.name === 'NotAllowedError'
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
    pauseHandsFree()
    setBaseRecipe(selected)
    workingRecipeRef.current = fresh
    setWorkingRecipe(fresh)
    servingsRef.current = selected.baseServings
    setServings(selected.baseServings)
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
    pauseHandsFree()
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
      setCalendarMessage('')
      return nextState
    } catch (error) {
      setCalendarConnection('error')
      setCalendarMessage(error instanceof Error ? error.message : 'Could not reach the local calendar service.')
      return 'error' as CalendarConnectionState
    }
  }

  const loadTodayCalendar = async () => {
    setCalendarLoadState('loading')
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const query = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone })
      const response = await fetch(`/api/calendar/today?${query}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Today’s calendar could not be loaded.')
      const events = Array.isArray(result.events) ? result.events as CalendarEvent[] : []
      setCalendarEvents(events)
      setCalendarLoadState(events.length ? 'ready' : 'empty')
      setCalendarMessage('')
    } catch (error) {
      setCalendarLoadState('error')
      setCalendarMessage(error instanceof Error ? error.message : 'Today’s calendar could not be loaded.')
    }
  }

  const connectGoogleCalendar = () => {
    setCalendarConnection('connecting')
    setCalendarMessage('Complete the Google sign-in window to connect your calendar.')
    window.open('/api/calendar/oauth/start', 'kitchen-hub-google-calendar', 'popup=yes,width=620,height=760')
    const startedAt = Date.now()
    const poll = window.setInterval(async () => {
      const state = await loadCalendarStatus()
      if (state === 'connected') {
        window.clearInterval(poll)
        void loadTodayCalendar()
      } else if (Date.now() - startedAt > 120_000) {
        window.clearInterval(poll)
        setCalendarConnection(state === 'error' ? 'error' : 'ready')
      }
    }, 1500)
  }

  const disconnectGoogleCalendar = async () => {
    try {
      const response = await fetch('/api/calendar/connection', { method: 'DELETE' })
      if (!response.ok) throw new Error('Google Calendar could not be disconnected.')
      setCalendarConnection('ready')
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

  const chooseTimer = (minutes: number) => {
    const seconds = minutes * 60
    setTimerDuration(seconds)
    setTimerRemaining(seconds)
    setTimerRunning(false)
  }

  const runLabPrompt = (prompt = labPrompt) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || labStatus === 'loading') return
    setLabPrompt(cleanPrompt)
    setLabStatus('loading')
    window.setTimeout(() => {
      try {
        const nextDraft = createFixtureDraft(cleanPrompt)
        localRecipeRepository.saveDraft(nextDraft)
        setLabDraft(nextDraft)
        setLabPrompt('')
        setLabStatus('idle')
      } catch {
        setLabStatus('error')
      }
    }, 650)
  }

  const discardLabDraft = () => {
    localRecipeRepository.discardDraft()
    setLabDraft(null)
    setLabPrompt('')
    setLabStatus('idle')
  }

  const saveLabRecipe = (startCooking: boolean) => {
    if (!labDraft) return
    const savedRecipes = localRecipeRepository.saveRecipe(labDraft.recipe)
    setLibraryRecipes([...recipes, ...savedRecipes.filter((savedRecipe) => !recipes.some((item) => item.id === savedRecipe.id))])
    setLabStatus('saved')
    if (startCooking) {
      openRecipe(labDraft.recipe)
      setActiveView('cooking')
    }
  }

  return (
    <main className="app-shell" data-theme={theme} data-view={activeView}>
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => { setLibraryOpen(false); setActiveView('home') }} aria-label="Go to Hub home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M15 12v24M33 12v24M15 24h18" /><circle cx="24" cy="24" r="3.5" /></svg>
          </span>
        </button>
        <div className="topbar-actions">
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setActiveView('recipe-lab')}>Recipe Lab</button> : null}
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setActiveView('timer')}>Timer</button> : null}
          {activeView === 'home' ? <button className="ghost-button" type="button" onClick={() => setLibraryOpen(true)}>Recipes</button> : null}
          {activeView !== 'home' ? <button className="ghost-button" type="button" onClick={() => { setLibraryOpen(false); setActiveView('home') }}>Home</button> : null}
          {activeView === 'cooking' || activeView === 'recipe-lab' ? <button className="ghost-button" type="button" onClick={() => setActiveView(activeView === 'recipe-lab' ? 'cooking' : 'recipe-lab')}>{activeView === 'recipe-lab' ? 'Cook Mode' : 'Recipe Lab'}</button> : null}
          {activeView === 'cooking' || activeView === 'recipe-lab' ? <button className="ghost-button" type="button" aria-label="Open recipe library" onClick={() => setLibraryOpen(true)}>Recipes</button> : null}
        </div>
      </header>

      <button className="settings-button" type="button" aria-label="Open settings" title="Settings" onClick={openSettings}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
          <path d="M19.43 15.1a1.7 1.7 0 0 0 .34 1.88l.06.06-2.79 2.79-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4.14v-.01a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.79-2.79.06-.06a1.7 1.7 0 0 0 .34-1.88A1.7 1.7 0 0 0 3.01 14H3V10h.01a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.79-2.79.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.93 3.08V3h4.14v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.79 2.79-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.99 10H21v4h-.01a1.7 1.7 0 0 0-1.56 1.1Z" />
        </svg>
      </button>

      {settingsOpen ? (
        <div className="library-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className={`settings-panel ${settingsPage === 'appearance' ? 'appearance-open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="library-heading">
              <div className="settings-heading-copy">
                {settingsPage !== 'root' ? <button type="button" className="settings-back" onClick={() => setSettingsPage('root')} aria-label="Back to settings">←</button> : null}
                <div><p className="eyebrow">{settingsPage === 'root' ? 'Hub' : 'Settings'}</p><h2 id="settings-title">{settingsPage === 'appearance' ? 'Appearance' : settingsPage === 'connections' ? 'Connections' : 'Settings'}</h2></div>
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
                <button type="button" className="settings-row" onClick={() => setSettingsPage('connections')}>
                  <span className="settings-row-icon" aria-hidden="true">⌁</span>
                  <span className="settings-row-copy"><strong>Connections</strong><small>OpenAI voice and Google Calendar</small></span>
                  <span className="settings-row-value">{openAIStatus === 'connected' && calendarConnection === 'connected' ? 'All connected' : openAIStatus === 'loading' || calendarConnection === 'loading' ? 'Checking…' : calendarConnection === 'ready' ? 'Google sign-in' : calendarConnection === 'setup' ? 'Calendar unavailable' : 'Setup required'}<b aria-hidden="true">›</b></span>
                </button>
              </div>
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
                    <p>{openAIStatus === 'connected' ? 'Voice transcription and command understanding are ready.' : openAIStatus === 'loading' ? 'Contacting the local Kitchen Hub service…' : openAIStatus === 'saving' ? 'The local service is securely checking this key with OpenAI…' : openAIMessage || 'Add an API key to enable production voice control.'}</p>
                  </div>
                </div>
                <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void saveOpenAIKey() }}>
                  <label htmlFor="openai-api-key">OpenAI API key</label>
                  <input id="openai-api-key" type="password" value={openAIKey} onChange={(event) => setOpenAIKey(event.target.value)} placeholder={openAIStatus === 'connected' ? 'Enter a new key to replace the current one' : 'sk-…'} autoComplete="off" spellCheck={false} />
                  <small>The key is saved only in this Hub’s private local data file. It is never stored in the browser.</small>
                  <button type="submit" disabled={!openAIKey.trim() || openAIStatus === 'saving'}>{openAIStatus === 'saving' ? 'Verifying…' : openAIStatus === 'connected' ? 'Replace key' : 'Connect OpenAI'}</button>
                </form>
                <form className="connection-form wake-phrase-form" onSubmit={(event) => { event.preventDefault(); void saveWakePhrase() }}>
                  <div className="connection-form-heading">
                    <div><label htmlFor="wake-phrase">Wake phrase</label><p>Current phrase: “{wakePhrase}”</p></div>
                    <span className={`wake-save-state ${wakePhraseStatus}`}>{wakePhraseStatus === 'saving' ? 'Updating…' : wakePhraseStatus === 'saved' ? 'Updated' : wakePhraseStatus === 'error' ? 'Try again' : 'Local'}</span>
                  </div>
                  <input id="wake-phrase" type="text" value={wakePhraseDraft} onChange={(event) => { setWakePhraseDraft(event.target.value); setWakePhraseStatus('idle'); setWakePhraseMessage('') }} maxLength={32} placeholder="Kitchen Hub" autoComplete="off" spellCheck={false} />
                  <small>Use two to four distinctive words that are easy to pronounce. The local wake model reloads immediately.</small>
                  {wakePhraseMessage ? <p className={`connection-feedback ${wakePhraseStatus}`}>{wakePhraseMessage}</p> : null}
                  <button type="submit" disabled={wakePhraseDraft.trim().length < 2 || wakePhraseDraft.trim() === wakePhrase || wakePhraseStatus === 'saving'}>{wakePhraseStatus === 'saving' ? 'Updating…' : 'Change wake phrase'}</button>
                </form>
                <section className="calendar-connection" aria-labelledby="google-calendar-settings-title">
                  <div className={`connection-status calendar-${calendarConnection}`}>
                    <span aria-hidden="true" />
                    <div>
                      <strong id="google-calendar-settings-title">{calendarConnection === 'connected' ? 'Google Calendar connected' : calendarConnection === 'connecting' ? 'Connecting Google Calendar' : calendarConnection === 'ready' ? 'Google Calendar' : calendarConnection === 'loading' ? 'Checking Google Calendar' : calendarConnection === 'error' ? 'Calendar needs attention' : 'Google Sign-In unavailable'}</strong>
                      <p>{calendarConnection === 'connected' ? 'Today’s events and kitchen reminders are available on Home.' : calendarConnection === 'setup' ? 'This development build does not have KitchenHub’s public Google client ID yet.' : calendarMessage || 'Sign in once to grant read-only calendar access.'}</p>
                    </div>
                  </div>
                  {calendarConnection === 'ready' || calendarConnection === 'connecting' ? <button className="calendar-connect-button" type="button" disabled={calendarConnection === 'connecting'} onClick={connectGoogleCalendar}>{calendarConnection === 'connecting' ? 'Waiting for Google…' : 'Sign in with Google'}</button> : null}
                  {calendarConnection === 'connected' ? <div className="calendar-connection-actions"><button type="button" onClick={() => void loadTodayCalendar()}>Refresh calendar</button><button type="button" className="secondary" onClick={() => void disconnectGoogleCalendar()}>Disconnect</button></div> : null}
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
              <button type="button" className="library-close" onClick={() => setLibraryOpen(false)} aria-label="Close recipe library">×</button>
            </div>
            <div className="recipe-grid">
              {libraryRecipes.map((item) => (
                <button type="button" className={`recipe-tile ${hasActiveRecipe && item.id === baseRecipe.id ? 'active' : ''}`} key={item.id} onClick={() => openRecipe(item)}>
                  <span className="recipe-tile-number">{String(libraryRecipes.indexOf(item) + 1).padStart(2, '0')}</span>
                  <span className="recipe-tile-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
                  <span className="recipe-tile-meta">{item.minutes} min · {item.baseServings} servings</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeView === 'home' ? (
        <section className="hub-home" aria-label="Hub home">
          <div className="hub-layout">
            <button className={`hub-card cooking-app ${hasActiveRecipe ? '' : 'is-empty'}`} type="button" onClick={() => hasActiveRecipe ? setActiveView('cooking') : setLibraryOpen(true)}>
              <span className="hub-card-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48"><path d="M10 24h28v5a12 12 0 0 1-12 12h-4A12 12 0 0 1 10 29v-5Z"/><path d="M7 24h34M18 18c-3-4 3-5 0-9M27 18c-3-4 3-5 0-9"/></svg>
              </span>
              {hasActiveRecipe ? (
                <span className="hub-card-copy"><span className="hub-card-kicker">Continue cooking</span><strong>{workingRecipe.name}</strong><small>Step {step + 1} of {workingRecipe.steps.length} · {workingRecipe.minutes} minutes</small></span>
              ) : (
                <span className="hub-card-copy"><span className="hub-card-kicker">Ready when you are</span><strong>Choose your next recipe</strong><small>Browse saved recipes or start with an idea from Recipe Lab.</small></span>
              )}
              <span className="hub-card-action">{hasActiveRecipe ? 'Open cooking' : 'Choose a recipe'} <b aria-hidden="true">→</b></span>
            </button>
            <section className="calendar-card" aria-labelledby="calendar-title">
              <header className="calendar-heading">
                <div><p className="eyebrow">Today</p><h2 id="calendar-title">{todayLabel}</h2></div>
                <span className="calendar-source">Google Calendar</span>
              </header>
              <div className="calendar-content" aria-live="polite">
                {calendarConnection === 'loading' || calendarLoadState === 'loading' ? (
                  <div className="calendar-skeleton" aria-label="Loading today’s calendar"><i /><i /><i /><i /></div>
                ) : calendarConnection !== 'connected' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">31</span><strong>{calendarConnection === 'setup' ? 'Google Sign-In is not ready in this build.' : 'Bring your day into the kitchen.'}</strong><p>{calendarConnection === 'setup' ? 'Once KitchenHub’s public client ID is added, this becomes a one-tap sign-in.' : 'Sign in once to see today’s schedule and prep reminders.'}</p>{calendarConnection === 'ready' ? <button type="button" onClick={connectGoogleCalendar}>Sign in with Google</button> : null}</div>
                ) : calendarLoadState === 'error' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">!</span><strong>Today’s schedule didn’t load.</strong><p>{calendarMessage}</p><button type="button" onClick={() => void loadTodayCalendar()}>Try again</button></div>
                ) : calendarLoadState === 'empty' ? (
                  <div className="calendar-state"><span className="calendar-state-icon" aria-hidden="true">✓</span><strong>Nothing scheduled today.</strong><p>Your day is clear. New Google Calendar events will appear here.</p><button type="button" onClick={() => void loadTodayCalendar()}>Refresh</button></div>
                ) : (
                  <ol className="calendar-events">
                    {calendarEvents.slice(0, 6).map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.start}>{formatCalendarTime(event)}</time>
                        <span><strong>{event.title}</strong>{event.location ? <small>{event.location}</small> : null}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
            <section className="reminder-banner" aria-label="Kitchen reminder">
              <span className="reminder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></span>
              <div className="reminder-copy">
                <p className="eyebrow">Kitchen reminder</p>
                <strong>{calendarConnection !== 'connected' ? 'Connect your calendar for prep reminders.' : calendarLoadState === 'loading' ? 'Checking today’s reminders…' : reminderEvent ? reminderEvent.title : 'No kitchen reminders for today.'}</strong>
              </div>
              {reminderEvent ? <time dateTime={reminderEvent.start}>{formatCalendarTime(reminderEvent)}</time> : calendarConnection === 'ready' ? <button type="button" onClick={connectGoogleCalendar}>Sign in</button> : null}
            </section>
          </div>
        </section>
      ) : activeView === 'recipe-lab' ? (
        <section className="recipe-lab" aria-labelledby="lab-title">
          <header className="lab-heading">
            <div>
              <p className="eyebrow">Cooking · Recipe Lab</p>
              <h1 id="lab-title">Turn an idea into dinner.</h1>
              <p>Explore freely here. Nothing enters your recipe library until you approve it.</p>
            </div>
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

              <form className="lab-composer" onSubmit={(event) => { event.preventDefault(); runLabPrompt() }}>
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
                  <div className="lab-draft-heading"><div><p className="eyebrow">Current draft</p><h2 id="lab-draft-title">{labDraft.recipe.name}</h2></div><span>{labDraft.recipe.minutes} min · {labDraft.recipe.baseServings} servings</span></div>
                  <p className="lab-draft-description">{labDraft.recipe.description}</p>
                  <div className="lab-draft-summary">
                    <section><span>Ingredients</span><strong>{labDraft.recipe.ingredients.length}</strong><small>{labDraft.recipe.ingredients.slice(0, 4).map((item) => item.name).join(', ')}</small></section>
                    <section><span>Method</span><strong>{labDraft.recipe.steps.length} steps</strong><small>{labDraft.recipe.steps[0]}</small></section>
                  </div>
                  {labStatus === 'saved' ? <p className="lab-saved" role="status">Saved to your recipe library.</p> : null}
                  <div className="lab-draft-actions">
                    <button className="lab-primary" type="button" onClick={() => saveLabRecipe(true)}>Save & cook</button>
                    <button type="button" onClick={() => saveLabRecipe(false)}>Save to library</button>
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
      ) : activeView === 'timer' ? (
        <section className={`timer-view ${timerRemaining === 0 ? 'is-complete' : ''}`} aria-labelledby="timer-title">
          <div className="timer-heading">
            <p className="eyebrow">Kitchen timer</p>
            <h1 id="timer-title">{timerRemaining === 0 ? 'Time’s up.' : timerRunning ? 'Timer running' : timerRemaining < timerDuration ? 'Timer paused' : 'Set a timer'}</h1>
            <p>{timerRemaining === 0 ? 'Your timer has finished.' : 'Keep it visible from anywhere in the room.'}</p>
          </div>
          <div className="timer-stage" aria-live="polite" aria-atomic="true">
            <span className="timer-display">{formatTimer(timerRemaining)}</span>
            <span className="timer-status">{timerRemaining === 0 ? 'Complete' : timerRunning ? 'Counting down' : 'Ready'}</span>
          </div>
          <div className="timer-controls">
            <div className="timer-presets" aria-label="Timer presets">
              {[5, 10, 15, 30].map((minutes) => <button type="button" className={timerDuration === minutes * 60 ? 'active' : ''} aria-pressed={timerDuration === minutes * 60} key={minutes} onClick={() => chooseTimer(minutes)}>{minutes} min</button>)}
            </div>
            <div className="timer-actions">
              {timerRemaining === 0 ? (
                <button className="timer-primary" type="button" onClick={() => { setTimerRemaining(timerDuration); setTimerRunning(true) }}>Start again</button>
              ) : (
                <button className="timer-primary" type="button" onClick={() => setTimerRunning((running) => !running)}>{timerRunning ? 'Pause' : timerRemaining < timerDuration ? 'Resume' : 'Start timer'}</button>
              )}
              <button className="timer-secondary" type="button" onClick={() => { setTimerRunning(false); setTimerRemaining(timerDuration) }}>Reset</button>
            </div>
          </div>
        </section>
      ) : (
      <div className="recipe-view" key={workingRecipe.id}>
      <section className="recipe-heading">
        <div>
          <p className="eyebrow">Tonight’s recipe {hasDraftChanges ? <span className="draft-badge">Customized draft</span> : null}</p>
          <h1>{workingRecipe.name}</h1>
          <p className="description">{workingRecipe.description}</p>
        </div>
        <div className="recipe-facts" aria-label="Recipe facts">
          <div><span>Time</span><strong>{workingRecipe.minutes} min</strong></div>
          <div><span>Calories</span><strong>{Math.round(workingRecipe.calories * scale)}</strong></div>
          <div><span>Protein</span><strong>{Math.round(workingRecipe.protein * scale)}g</strong></div>
        </div>
      </section>

      <div className="workspace">
        <aside className="ingredients-card">
          <div className="card-heading">
            <div><p className="eyebrow">Prep</p><h2>Ingredients</h2></div>
            <div className="serving-control" aria-label="Serving count">
              <button type="button" onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Decrease servings">−</button>
              <span><strong>{servings}</strong> servings</span>
              <button type="button" onClick={() => setServings(Math.min(8, servings + 1))} aria-label="Increase servings">+</button>
            </div>
          </div>
          <ul className="ingredient-list" key={`${workingRecipe.id}-${step}`} ref={ingredientListRef}>
            {displayedIngredients.map(({ item, index, relevant }, position) => (
              <li key={item.name} className={`${checked.has(index) ? 'checked' : ''} ${relevant ? 'relevant' : ''}`} style={{ animationDelay: `${Math.min(position, 8) * 24}ms` }}>
                <button type="button" className="check" onClick={() => toggleIngredient(index)} aria-label={`Mark ${item.name} ${checked.has(index) ? 'unused' : 'ready'}`}>{checked.has(index) ? '✓' : ''}</button>
                <button type="button" className="ingredient-copy" onClick={() => toggleIngredient(index)}>
                  <strong>{formatAmount(item.amount)} {item.unit}</strong>
                  <span className="ingredient-name">{item.name}{item.note ? <small>, {item.note}</small> : null}{relevant ? <em>Now</em> : null}</span>
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
        <section className={`conversation-card voice-${voicePhase} ${alwaysListening ? 'is-listening' : ''} ${pendingEdit ? 'needs-answer' : ''} ${voicePanelNeedsRoom ? 'has-expanded-content' : ''}`} aria-label="Voice conversation">
          <div className="conversation-log" ref={conversationRef} aria-live="polite">
            {voiceMessages.map((message) => (
              <div className={`voice-message ${message.role}`} key={message.id} aria-label={message.role === 'user' ? 'You said' : 'Kitchen Hub response'}>
                <p>{message.role === 'user' ? `“${message.text}”` : message.text}</p>
              </div>
            ))}
          </div>
          <div className="voice-control">
            {alwaysListening ? <span className="mic-meter" aria-label="Microphone activity"><i style={{ height: `${10 + micLevel * 20}px` }} /><i style={{ height: `${14 + micLevel * 28}px` }} /><i style={{ height: `${8 + micLevel * 17}px` }} /></span> : null}
            <button className="mic-button" type="button" onClick={toggleListening} aria-label={alwaysListening ? `Pause hands-free listening. Status: ${voicePhase}` : 'Enable OpenAI hands-free listening'}>
              <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 29a7 7 0 0 0 7-7V12a7 7 0 1 0-14 0v10a7 7 0 0 0 7 7Z"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7M17 42h14"/></svg>
            </button>
          </div>
        </section>
        </div>
      </div>
      </div>
      )}
    </main>
  )
}

export default App
