import type { Recipe, RecipeIngredient, RecipeQuantity, ScaleRequest } from '../recipeTypes'
import { isQuantityRange } from '../recipeTypes'
import { convertToGrams, quantityValue } from '../measurement/unitConversion'
import { normalizeRecipe } from '../normalize/normalizeRecipe'

const roundCanonical = (value: number) => Math.round(value * 10000) / 10000

const scaleQuantity = (quantity: RecipeQuantity | undefined, factor: number, ingredient: RecipeIngredient) => {
  if (quantity === undefined || ['to_taste', 'optional', 'non_scaling'].includes(ingredient.scalingBehavior || 'linear')) return quantity
  const increment = ingredient.roundingIncrement
  const apply = (value: number) => {
    const scaled = value * factor
    return roundCanonical(increment ? Math.round(scaled / increment) * increment : scaled)
  }
  return isQuantityRange(quantity)
    ? { min: apply(quantity.min), max: apply(quantity.max) }
    : apply(quantity)
}

export const getRecipeScaleFactor = (baseRecipe: Recipe, request: ScaleRequest) => {
  const normalized = normalizeRecipe(baseRecipe)
  if (request.mode === 'servings') return request.servings / Math.max(1, normalized.scaling?.baseServings ?? normalized.baseServings)
  const requestedGrams = convertToGrams(request.quantity, request.unit)
  const baseAnchor = normalized.scaling?.baseAnchorQuantity
  if (!requestedGrams || !baseAnchor) throw new Error('This recipe does not have a usable anchor quantity.')
  return requestedGrams / baseAnchor
}

export const scaleRecipe = (baseRecipe: Recipe, request: ScaleRequest): Recipe => {
  const normalized = normalizeRecipe(baseRecipe)
  const factor = getRecipeScaleFactor(normalized, request)
  const ingredients = normalized.ingredients.map((ingredient) => {
    const quantity = scaleQuantity(ingredient.quantity, factor, ingredient)
    return { ...ingredient, quantity, amount: quantityValue(quantity) ?? ingredient.amount }
  })
  return {
    ...normalized,
    ingredients,
    baseServings: request.mode === 'servings' ? request.servings : normalized.baseServings,
  }
}

