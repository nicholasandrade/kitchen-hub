import type { Recipe } from './App'

export type RecipeDraft = {
  id: string
  prompt: string
  response: string
  recipe: Recipe
  updatedAt: string
}

export interface RecipeRepository {
  loadDraft(): RecipeDraft | null
  saveDraft(draft: RecipeDraft): void
  discardDraft(): void
  loadSavedRecipes(): Recipe[]
  saveRecipe(recipe: Recipe): Recipe[]
}

const DRAFT_KEY = 'kitchen-hub:recipe-lab:draft'
const RECIPES_KEY = 'kitchen-hub:saved-recipes'

const read = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export const localRecipeRepository: RecipeRepository = {
  loadDraft: () => read<RecipeDraft | null>(DRAFT_KEY, null),
  saveDraft: (draft) => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)),
  discardDraft: () => localStorage.removeItem(DRAFT_KEY),
  loadSavedRecipes: () => read<Recipe[]>(RECIPES_KEY, []),
  saveRecipe: (recipe) => {
    const current = read<Recipe[]>(RECIPES_KEY, [])
    const next = [...current.filter((item) => item.id !== recipe.id), recipe]
    localStorage.setItem(RECIPES_KEY, JSON.stringify(next))
    return next
  },
}
