import type { RecipeIngredient, RecipeQuantity, ScalingBehavior } from '../recipeTypes'
import { isQuantityRange } from '../recipeTypes'
import { findCountConversion } from '../measurement/ingredientConversionTable'
import { convertWeightToGrams, isWeightUnit, normalizeUnit, parseQuantity, quantityValue } from '../measurement/unitConversion'
import { classifyIngredient } from './ingredientClassifier'

export type IngredientSource = Partial<RecipeIngredient> & {
  name?: string
  ingredient?: string
  amount?: number
}

const inferBehavior = (name: string, quantity: RecipeQuantity | undefined, source: IngredientSource): ScalingBehavior => {
  const text = `${name} ${source.notes ?? source.note ?? ''}`.toLowerCase()
  if (/\bto taste\b|\bas needed\b|\bfor finishing\b|\bgarnish\b/.test(text)) return 'to_taste'
  if (/\boptional\b/.test(text)) return 'optional'
  if (source.scalingBehavior) return source.scalingBehavior
  return isQuantityRange(quantity) ? 'bounded' : 'linear'
}

export const normalizeIngredient = (source: IngredientSource, index = 0, recipeId = 'recipe'): RecipeIngredient => {
  const name = String(source.ingredient || source.name || '').trim()
  const sourceQuantity = String(source.sourceQuantity ?? (source.quantity !== undefined ? (typeof source.quantity === 'number' ? source.quantity : `${source.quantity.min}-${source.quantity.max}`) : source.amount ?? '')).trim()
  const sourceUnit = String(source.sourceUnit ?? source.unit ?? '').trim()
  const parsed = parseQuantity(source.quantity !== undefined ? source.quantity : (sourceQuantity || source.amount || undefined))
  const normalizedSourceUnit = normalizeUnit(source.unit ?? sourceUnit)
  const countConversion = parsed && classifyIngredient(name) === 'solid' ? findCountConversion(name, normalizedSourceUnit) : undefined

  let quantity = parsed
  let unit = normalizedSourceUnit
  let quantityConfidence = source.quantityConfidence ?? 'exact' as RecipeIngredient['quantityConfidence']

  if (parsed && isWeightUnit(normalizedSourceUnit)) {
    quantity = convertWeightToGrams(parsed, normalizedSourceUnit)
    unit = 'g'
    if (normalizedSourceUnit !== 'g') quantityConfidence = 'converted'
  } else if (parsed && countConversion) {
    quantity = typeof parsed === 'number'
      ? parsed * countConversion.grams
      : { min: parsed.min * countConversion.grams, max: parsed.max * countConversion.grams }
    unit = 'g'
    quantityConfidence = 'estimated'
  }

  const scalingBehavior = inferBehavior(name, quantity, source)
  if (scalingBehavior === 'to_taste' || scalingBehavior === 'optional') quantity = parsed

  return {
    ...source,
    id: source.id || `${recipeId}-ingredient-${index + 1}`,
    ingredient: name,
    name,
    quantity,
    amount: quantityValue(quantity) ?? (Number(source.amount) || 0),
    unit,
    sourceQuantity: sourceQuantity || undefined,
    sourceUnit: sourceUnit || undefined,
    notes: source.notes ?? source.note,
    note: source.notes ?? source.note,
    scalingBehavior,
    quantityConfidence,
    roundingIncrement: source.roundingIncrement,
    steps: Array.isArray(source.steps) ? source.steps : [],
  }
}

