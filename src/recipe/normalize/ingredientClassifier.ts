const liquidNames = /\b(water|broth|stock|soy sauce|fish sauce|vinegar|wine|oil|mirin|juice|milk|cream)\b/i
const dryVolumeExceptions = /\b(sugar|flour|cornstarch|baking powder|baking soda)\b/i
const anchorCandidates = /\b(chicken|beef|pork|lamb|turkey|fish|cod|salmon|tuna|shrimp|tofu|tempeh|potato|noodles|pasta|rice|beans|chickpeas)\b/i

export const classifyIngredient = (ingredient: string) => {
  if (liquidNames.test(ingredient)) return 'liquid' as const
  if (dryVolumeExceptions.test(ingredient)) return 'dry-volume' as const
  return 'solid' as const
}

export const isLikelyAnchorIngredient = (ingredient: string) => anchorCandidates.test(ingredient)

