import type { Recipe } from './App'

export type CookingSession = {
  baseRecipe: Recipe
  workingRecipe: Recipe
  step: number
  servings: number
  checkedIngredients: number[]
  hasDraftChanges: boolean
}

export interface CookingSessionRepository {
  load(defaultRecipe: Recipe): CookingSession | null
  save(session: CookingSession): void
  clear(): void
}

const SESSION_KEY = 'kitchen-hub:cooking-session:v1'
const LEGACY_ACTIVE_KEY = 'kitchen-hub:has-active-recipe'

const cloneRecipe = (recipe: Recipe): Recipe => ({
  ...recipe,
  ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, steps: [...ingredient.steps] })),
  steps: [...recipe.steps],
})

export const localCookingSessionRepository: CookingSessionRepository = {
  load: (defaultRecipe) => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const session = JSON.parse(saved) as CookingSession
        if (!session.baseRecipe?.id || !session.workingRecipe?.id) return null
        return {
          ...session,
          step: Math.max(0, Math.min(session.workingRecipe.steps.length - 1, Number(session.step) || 0)),
          servings: Math.max(1, Number(session.servings) || session.workingRecipe.baseServings),
          checkedIngredients: Array.isArray(session.checkedIngredients) ? session.checkedIngredients : [],
          hasDraftChanges: Boolean(session.hasDraftChanges),
        }
      }
      if (localStorage.getItem(LEGACY_ACTIVE_KEY) === 'false') return null
      return {
        baseRecipe: defaultRecipe,
        workingRecipe: cloneRecipe(defaultRecipe),
        step: 0,
        servings: defaultRecipe.baseServings,
        checkedIngredients: [],
        hasDraftChanges: false,
      }
    } catch {
      return null
    }
  },
  save: (session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    localStorage.setItem(LEGACY_ACTIVE_KEY, 'true')
  },
  clear: () => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.setItem(LEGACY_ACTIVE_KEY, 'false')
  },
}
