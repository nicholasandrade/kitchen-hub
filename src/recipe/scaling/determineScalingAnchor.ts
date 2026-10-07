import type { RecipeIngredient, RecipeScaling } from '../recipeTypes'
import { quantityValue } from '../measurement/unitConversion'
import { isLikelyAnchorIngredient } from '../normalize/ingredientClassifier'

export const determineScalingAnchor = (ingredients: RecipeIngredient[], baseServings: number): RecipeScaling => {
  const eligible = ingredients.filter((ingredient) =>
    ingredient.unit === 'g'
    && quantityValue(ingredient.quantity) !== undefined
    && ingredient.scalingBehavior !== 'optional'
    && ingredient.scalingBehavior !== 'to_taste',
  )
  const anchor = eligible.find((ingredient) => isLikelyAnchorIngredient(ingredient.ingredient || ingredient.name))
    ?? eligible[0]
  const quantity = anchor ? quantityValue(anchor.quantity) : undefined
  if (!anchor || !quantity) return { mode: 'servings', baseServings }
  return {
    mode: 'anchor',
    anchorIngredientId: anchor.id,
    anchorIngredientName: anchor.ingredient || anchor.name,
    baseAnchorQuantity: quantity,
    baseAnchorUnit: 'g',
    baseServings,
  }
}

