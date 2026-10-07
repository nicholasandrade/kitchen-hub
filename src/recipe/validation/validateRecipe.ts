import type { Recipe } from '../recipeTypes'
import { isLikelyAnchorIngredient } from '../normalize/ingredientClassifier'

export type RecipeValidation = { valid: boolean; warnings: string[] }

export const validateRecipe = (recipe: Recipe): RecipeValidation => {
  const warnings: string[] = []
  if (!recipe.ingredients.length) warnings.push('This recipe does not have any ingredients.')
  if (!recipe.steps.length) warnings.push('This recipe does not have any cooking steps.')
  recipe.ingredients.forEach((ingredient) => {
    if (ingredient.quantity === undefined && !['to_taste', 'optional', 'non_scaling'].includes(ingredient.scalingBehavior || '')) {
      warnings.push(`${ingredient.ingredient || ingredient.name} has no quantity, so it may not scale reliably.`)
    }
  })
  if (recipe.scaling?.mode === 'anchor') {
    const anchor = recipe.ingredients.find((ingredient) => ingredient.id === recipe.scaling?.anchorIngredientId)
      ?? recipe.ingredients.find((ingredient) => isLikelyAnchorIngredient(ingredient.ingredient || ingredient.name))
    if (!anchor) warnings.push('The scaling anchor could not be identified.')
    if (!recipe.scaling.baseAnchorQuantity) warnings.push('The main ingredient has no base quantity for scaling.')
  }
  return { valid: Boolean(recipe.name && recipe.ingredients.length && recipe.steps.length), warnings }
}

