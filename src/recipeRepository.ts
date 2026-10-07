import type { Recipe } from './recipe/recipeTypes'
import { normalizeRecipe } from './recipe/normalize/normalizeRecipe'
export { sheetsRecipeRepository, type RecipeRepository } from './recipe/storage/sheetsRecipeRepository'

export type RecipeDraft = {
  id: string
  prompt: string
  response: string
  recipe: Recipe
  updatedAt: string
}

export interface LocalRecipeLabRepository {
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

export const localRecipeRepository: LocalRecipeLabRepository = {
  loadDraft: () => read<RecipeDraft | null>(DRAFT_KEY, null),
  saveDraft: (draft) => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)),
  discardDraft: () => localStorage.removeItem(DRAFT_KEY),
  loadSavedRecipes: () => read<Recipe[]>(RECIPES_KEY, []).map(normalizeRecipe),
  saveRecipe: (recipe) => {
    const current = read<Recipe[]>(RECIPES_KEY, [])
    const normalized = normalizeRecipe(recipe)
    const next = [...current.filter((item) => item.id !== normalized.id), normalized]
    localStorage.setItem(RECIPES_KEY, JSON.stringify(next))
    return next
  },
}
