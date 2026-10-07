import type { RecipeIngredient } from '../recipeTypes'
import { isQuantityRange } from '../recipeTypes'

const fractions: Array<[number, string]> = [[.125, '⅛'], [.25, '¼'], [1 / 3, '⅓'], [.375, '⅜'], [.5, '½'], [.625, '⅝'], [2 / 3, '⅔'], [.75, '¾'], [.875, '⅞']]

const formatVolume = (value: number) => {
  const whole = Math.floor(value)
  const remainder = value - whole
  const nearest = fractions.reduce((best, entry) => Math.abs(entry[0] - remainder) < Math.abs(best[0] - remainder) ? entry : best, fractions[0])
  if (remainder < .06) return String(whole)
  if (Math.abs(nearest[0] - remainder) < .07) return `${whole || ''}${nearest[1]}`
  return value.toFixed(1).replace(/\.0$/, '')
}

const formatSingle = (value: number, unit: string) => {
  if (unit === 'g' && value >= 1000) return `${(value / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} kg`
  const rounded = unit === 'g' ? Math.round(value) : ['tbsp', 'tsp', 'cup'].includes(unit) ? formatVolume(value) : value.toFixed(1).replace(/\.0$/, '')
  return `${rounded} ${unit}`.trim()
}

export const formatIngredientQuantity = (ingredient: RecipeIngredient) => {
  if (ingredient.scalingBehavior === 'to_taste') return 'to taste'
  if (ingredient.quantity === undefined) return ingredient.scalingBehavior === 'optional' ? 'optional' : ''
  const prefix = ingredient.quantityConfidence === 'estimated' ? '~' : ''
  if (isQuantityRange(ingredient.quantity)) {
    const min = formatSingle(ingredient.quantity.min, ingredient.unit || '')
    const max = formatSingle(ingredient.quantity.max, ingredient.unit || '')
    return `${prefix}${min}–${max}`
  }
  return `${prefix}${formatSingle(ingredient.quantity, ingredient.unit || '')}`
}

