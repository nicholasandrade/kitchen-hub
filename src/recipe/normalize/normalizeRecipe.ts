import type { Recipe, RecipeStep } from '../recipeTypes'
import { normalizeIngredient } from './normalizeIngredient'
import { determineScalingAnchor } from '../scaling/determineScalingAnchor'

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const extractStepTimerSeconds = (instruction: string) => {
  const match = instruction.match(/\b(?:for|about)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i)
  if (!match) return undefined
  const amount = Number(match[1])
  if (/^h/i.test(match[2])) return Math.round(amount * 3600)
  if (/^s/i.test(match[2])) return Math.round(amount)
  return Math.round(amount * 60)
}

export const normalizeRecipe = (source: Recipe): Recipe => {
  const id = source.id || slugify(source.name) || `recipe-${Date.now()}`
  const ingredients = source.ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index, id))
  const structuredSteps: RecipeStep[] = (source.structuredSteps?.length
    ? source.structuredSteps
    : source.steps.map((instruction, index) => ({
      id: `${id}-step-${index + 1}`,
      order: index + 1,
      instruction,
      timerSeconds: extractStepTimerSeconds(instruction),
    })))
    .map((step, index) => ({
      ...step,
      id: step.id || `${id}-step-${index + 1}`,
      order: step.order || index + 1,
      timerSeconds: step.timerSeconds ?? extractStepTimerSeconds(step.instruction),
    }))
  const steps = structuredSteps.sort((a, b) => a.order - b.order).map((step) => step.instruction)
  const scaling = source.scaling?.mode
    ? { ...source.scaling, baseServings: source.scaling.baseServings ?? source.baseServings }
    : determineScalingAnchor(ingredients, source.baseServings)

  return {
    ...source,
    id,
    ingredients,
    steps,
    structuredSteps,
    scaling,
    source: source.source ?? { kind: 'legacy', capturedAt: new Date().toISOString() },
    updatedAt: source.updatedAt ?? new Date().toISOString(),
  }
}

