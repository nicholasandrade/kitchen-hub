import type { Recipe } from '../recipeTypes'
import { normalizeRecipe } from '../normalize/normalizeRecipe'

export interface RecipeRepository {
  list(): Promise<Recipe[]>
  get(id: string): Promise<Recipe | null>
  search(query: string): Promise<Recipe[]>
  save(recipe: Recipe): Promise<void>
  update(recipe: Recipe): Promise<void>
  refresh(): Promise<Recipe[]>
}

const CACHE_KEY = 'kitchen-hub:recipes:cache:v2'
const LEGACY_KEY = 'kitchen-hub:saved-recipes'

const readCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY) || localStorage.getItem(LEGACY_KEY)
    return cached ? (JSON.parse(cached) as Recipe[]).map(normalizeRecipe) : []
  } catch {
    return []
  }
}

const writeCache = (recipes: Recipe[]) => localStorage.setItem(CACHE_KEY, JSON.stringify(recipes))

const mergeRecipe = (recipes: Recipe[], recipe: Recipe) => [
  ...recipes.filter((item) => item.id !== recipe.id),
  recipe,
]

const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Hub Recipes could not be reached.')
  return result as T
}

export class SheetsRecipeRepository implements RecipeRepository {
  async list() {
    try {
      return await this.refresh()
    } catch {
      return readCache()
    }
  }

  async refresh() {
    const result = await requestJson<{ recipes: Recipe[] }>('/api/recipes')
    const recipes = result.recipes.map(normalizeRecipe)
    writeCache(recipes)
    return recipes
  }

  async get(id: string) {
    const cached = readCache().find((recipe) => recipe.id === id)
    if (cached) return cached
    try {
      const result = await requestJson<{ recipe: Recipe | null }>(`/api/recipes/${encodeURIComponent(id)}`)
      if (!result.recipe) return null
      const recipe = normalizeRecipe(result.recipe)
      writeCache(mergeRecipe(readCache(), recipe))
      return recipe
    } catch {
      return null
    }
  }

  async search(query: string) {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return this.list()
    const cached = readCache().filter((recipe) =>
      `${recipe.name} ${recipe.description} ${recipe.ingredients.map((ingredient) => ingredient.ingredient || ingredient.name).join(' ')}`
        .toLowerCase().includes(normalizedQuery),
    )
    if (cached.length) return cached
    try {
      const result = await requestJson<{ recipes: Recipe[] }>(`/api/recipes/search?q=${encodeURIComponent(query)}`)
      return result.recipes.map(normalizeRecipe)
    } catch {
      return []
    }
  }

  async save(recipe: Recipe) {
    const normalized = normalizeRecipe(recipe)
    await requestJson('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: normalized }),
    })
    writeCache(mergeRecipe(readCache(), normalized))
  }

  async update(recipe: Recipe) {
    const normalized = normalizeRecipe(recipe)
    await requestJson(`/api/recipes/${encodeURIComponent(normalized.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: normalized }),
    })
    writeCache(mergeRecipe(readCache(), normalized))
  }
}

export const sheetsRecipeRepository = new SheetsRecipeRepository()

