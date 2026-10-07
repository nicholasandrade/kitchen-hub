import type { QuantityRange, RecipeQuantity } from '../recipeTypes'
import { isQuantityRange } from '../recipeTypes'

const vulgarFractions: Record<string, number> = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 }

const unitAliases: Record<string, string> = {
  lbs: 'lb', pound: 'lb', pounds: 'lb', ounces: 'oz', ounce: 'oz', kilograms: 'kg', kilogram: 'kg', grams: 'g', gram: 'g',
  cups: 'cup', tablespoons: 'tbsp', tablespoon: 'tbsp', teaspoons: 'tsp', teaspoon: 'tsp', milliliters: 'ml', milliliter: 'ml',
  liters: 'l', liter: 'l', cloves: 'clove', pieces: 'piece', cans: 'can', scallions: 'scallion', onions: 'onion', peppers: 'pepper',
}

export const normalizeUnit = (unit = '') => unitAliases[unit.toLowerCase().trim()] ?? unit.toLowerCase().trim()

const parseNumber = (source: string) => {
  const text = source.trim()
  if (vulgarFractions[text] !== undefined) return vulgarFractions[text]
  const mixedVulgar = text.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/)
  if (mixedVulgar) return Number(mixedVulgar[1]) + vulgarFractions[mixedVulgar[2]]
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : undefined
}

export const parseQuantity = (source: string | number | RecipeQuantity | undefined): RecipeQuantity | undefined => {
  if (typeof source === 'number') return Number.isFinite(source) ? source : undefined
  if (source && typeof source === 'object') return source
  if (!source) return undefined
  const parts = source.trim().split(/\s*(?:-|–|to)\s*/i)
  if (parts.length === 2) {
    const min = parseNumber(parts[0])
    const max = parseNumber(parts[1])
    return min !== undefined && max !== undefined ? { min, max } : undefined
  }
  return parseNumber(source)
}

export const mapQuantity = (quantity: RecipeQuantity, transform: (value: number) => number): RecipeQuantity =>
  isQuantityRange(quantity)
    ? { min: transform(quantity.min), max: transform(quantity.max) }
    : transform(quantity)

export const quantityValue = (quantity: RecipeQuantity | undefined) =>
  quantity === undefined ? undefined : isQuantityRange(quantity) ? quantity.min : quantity

export const convertWeightToGrams = (quantity: RecipeQuantity, unit: string): RecipeQuantity | undefined => {
  const normalized = normalizeUnit(unit)
  const factor = normalized === 'lb' ? 453.59237 : normalized === 'oz' ? 28.349523125 : normalized === 'kg' ? 1000 : normalized === 'g' ? 1 : undefined
  return factor === undefined ? undefined : mapQuantity(quantity, (value) => value * factor)
}

export const convertToGrams = (quantity: number, unit: string) => {
  const converted = convertWeightToGrams(quantity, unit)
  return typeof converted === 'number' ? converted : undefined
}

export const isWeightUnit = (unit: string) => ['lb', 'oz', 'kg', 'g'].includes(normalizeUnit(unit))
export const isVolumeUnit = (unit: string) => ['cup', 'tbsp', 'tsp', 'ml', 'l'].includes(normalizeUnit(unit))

export const quantityRange = (quantity: RecipeQuantity): QuantityRange =>
  isQuantityRange(quantity) ? quantity : { min: quantity, max: quantity }

