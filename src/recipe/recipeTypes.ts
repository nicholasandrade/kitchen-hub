export type QuantityRange = { min: number; max: number }
export type RecipeQuantity = number | QuantityRange

export type ScalingBehavior = 'linear' | 'bounded' | 'to_taste' | 'optional' | 'non_scaling'
export type QuantityConfidence = 'exact' | 'converted' | 'estimated'

export type RecipeIngredient = {
  id?: string
  ingredient?: string
  quantity?: RecipeQuantity
  unit: string
  sourceQuantity?: string
  sourceUnit?: string
  notes?: string
  scalingBehavior?: ScalingBehavior
  roundingIncrement?: number
  quantityConfidence?: QuantityConfidence

  // Compatibility fields used by the current Cook Mode presentation.
  name: string
  amount: number
  note?: string
  steps: number[]
}

export type RecipeStep = {
  id: string
  section?: string
  order: number
  instruction: string
  timerSeconds?: number
}

export type RecipeScaling = {
  mode: 'anchor' | 'servings'
  anchorIngredientId?: string
  anchorIngredientName?: string
  baseAnchorQuantity?: number
  baseAnchorUnit?: 'g'
  baseServings?: number
}

export type RecipeSource = {
  kind: 'generated' | 'pasted' | 'imported' | 'manual' | 'legacy'
  label?: string
  url?: string
  capturedAt?: string
}

export type Recipe = {
  id: string
  name: string
  description: string
  minutes: number
  baseServings: number
  calories: number
  protein: number
  ingredients: RecipeIngredient[]
  steps: string[]
  structuredSteps?: RecipeStep[]
  scaling?: RecipeScaling
  source?: RecipeSource
  servingIdeas?: string[]
  notes?: string[]
  validationWarnings?: string[]
  updatedAt?: string
}

export type ScaleRequest =
  | { mode: 'anchor'; quantity: number; unit: string; ingredient?: string }
  | { mode: 'servings'; servings: number }

export const isQuantityRange = (quantity: RecipeQuantity | undefined): quantity is QuantityRange =>
  Boolean(quantity && typeof quantity === 'object' && 'min' in quantity && 'max' in quantity)

