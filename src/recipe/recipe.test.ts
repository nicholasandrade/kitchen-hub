import { describe, expect, it } from 'vitest'
import {
  extractStepTimerSeconds,
  normalizeIngredient,
  normalizeRecipe,
  normalizeUnit,
  parseQuantity,
  scaleRecipe,
  type Recipe,
} from './index'

const ingredient = (name: string, sourceQuantity: string, sourceUnit: string, notes = '') =>
  normalizeIngredient({ name, amount: 0, unit: sourceUnit, sourceQuantity, sourceUnit, notes, steps: [] })

const makeRecipe = (ingredients: Recipe['ingredients'], baseServings = 4): Recipe => normalizeRecipe({
  id: 'test-recipe', name: 'Test recipe', description: '', minutes: 30, baseServings,
  calories: 100, protein: 10, ingredients, steps: ['Simmer for 30 minutes.'],
})

describe('measurement normalization', () => {
  it.each([
    ['4.5', 'lb', 2041.165665],
    ['2', 'lb', 907.18474],
  ])('converts %s %s chicken to grams', (amount, unit, grams) => {
    const result = ingredient('chicken thighs', amount, unit)
    expect(result.unit).toBe('g')
    expect(result.quantity).toBeCloseTo(grams, 4)
    expect(result.quantityConfidence).toBe('converted')
    expect(result.sourceQuantity).toBe(amount)
    expect(result.sourceUnit).toBe(unit)
  })

  it('estimates nine garlic cloves as 27 grams', () => {
    const result = ingredient('garlic', '9', 'cloves')
    expect(result.quantity).toBe(27)
    expect(result.unit).toBe('g')
    expect(result.quantityConfidence).toBe('estimated')
  })

  it.each([
    ['scallions', '4–5', 'scallions', 60, 75],
    ['jalapeños', '2–3', 'peppers', 28, 42],
  ])('estimates count ranges for %s', (name, amount, unit, min, max) => {
    const result = ingredient(name, amount, unit)
    expect(result.quantity).toEqual({ min, max })
    expect(result.scalingBehavior).toBe('bounded')
    expect(result.quantityConfidence).toBe('estimated')
  })

  it('marks a large onion estimate and preserves its source', () => {
    const result = ingredient('large onion', '1', 'onion')
    expect(result.quantity).toBe(250)
    expect(result.quantityConfidence).toBe('estimated')
    expect(result.sourceQuantity).toBe('1')
    expect(result.sourceUnit).toBe('onion')
  })

  it.each([
    ['fish sauce', '3', 'tbsp'],
    ['olive oil', '2', 'tbsp'],
    ['sugar', '2', 'tbsp'],
  ])('keeps %s volume-based', (name, amount, unit) => {
    const result = ingredient(name, amount, unit)
    expect(result.quantity).toBe(Number(amount))
    expect(result.unit).toBe(unit)
    expect(result.quantityConfidence).toBe('exact')
  })

  it('keeps salt to taste qualitative', () => {
    const result = ingredient('salt', '', '', 'to taste')
    expect(result.quantity).toBeUndefined()
    expect(result.scalingBehavior).toBe('to_taste')
  })

  it.each(['lb', 'oz', 'kg', 'g', 'cup', 'tbsp', 'tsp', 'ml'])('parses and normalizes %s', (unit) => {
    expect(normalizeUnit(unit)).toBe(unit)
    expect(parseQuantity('1½')).toBe(1.5)
  })
})

describe('recipe scaling and timers', () => {
  it('scales an anchor recipe from the immutable base every time', () => {
    const base = makeRecipe([
      ingredient('chicken thighs', '4.5', 'lb'),
      ingredient('fish sauce', '3', 'tbsp'),
    ])
    const threePounds = scaleRecipe(base, { mode: 'anchor', quantity: 3, unit: 'lb', ingredient: 'chicken thighs' })
    const fourPounds = scaleRecipe(base, { mode: 'anchor', quantity: 4, unit: 'lb', ingredient: 'chicken thighs' })
    expect(threePounds.ingredients[0].quantity).toBeCloseTo(1360.77711, 4)
    expect(fourPounds.ingredients[0].quantity).toBeCloseTo(1814.36948, 4)
    expect(base.ingredients[0].quantity).toBeCloseTo(2041.165665, 4)
    expect(fourPounds.ingredients[1].quantity).toBeCloseTo(3 * 4 / 4.5, 4)
  })

  it('scales both endpoints of bounded quantities', () => {
    const base = makeRecipe([ingredient('jalapeños', '2–3', 'peppers')])
    const scaled = scaleRecipe(base, { mode: 'servings', servings: 8 })
    expect(scaled.ingredients[0].quantity).toEqual({ min: 56, max: 84 })
  })

  it('scales serving-based sauces', () => {
    const base = makeRecipe([ingredient('soy sauce', '2', 'tbsp')], 4)
    const scaled = scaleRecipe(base, { mode: 'servings', servings: 6 })
    expect(scaled.ingredients[0].quantity).toBe(3)
  })

  it('preserves deliberate timer metadata from a step', () => {
    const recipe = makeRecipe([ingredient('broth', '2', 'cup')])
    expect(recipe.structuredSteps?.[0].timerSeconds).toBe(1800)
    expect(extractStepTimerSeconds('Rest off heat.')).toBeUndefined()
  })
})
