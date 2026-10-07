export type IngredientCountConversion = {
  aliases: string[]
  unitAliases: string[]
  grams: number
}

export const ingredientConversionTable: IngredientCountConversion[] = [
  { aliases: ['garlic', 'garlic clove', 'garlic cloves'], unitAliases: ['clove', 'cloves'], grams: 3 },
  { aliases: ['scallion', 'scallions', 'green onion', 'green onions'], unitAliases: ['', 'piece', 'pieces', 'scallion', 'scallions'], grams: 15 },
  { aliases: ['jalapeno', 'jalapeño', 'jalapenos', 'jalapeños'], unitAliases: ['', 'piece', 'pieces', 'pepper', 'peppers'], grams: 14 },
  { aliases: ['large onion'], unitAliases: ['', 'onion', 'onions', 'piece', 'pieces'], grams: 250 },
  { aliases: ['onion', 'yellow onion', 'white onion', 'red onion'], unitAliases: ['', 'onion', 'onions', 'piece', 'pieces'], grams: 180 },
  { aliases: ['bell pepper', 'bell peppers'], unitAliases: ['', 'pepper', 'peppers', 'piece', 'pieces'], grams: 160 },
]

export const findCountConversion = (ingredient: string, unit = '') => {
  const normalizedIngredient = ingredient.toLowerCase().trim()
  const normalizedUnit = unit.toLowerCase().trim()
  return ingredientConversionTable.find((entry) =>
    entry.aliases.some((alias) => normalizedIngredient.includes(alias))
    && entry.unitAliases.includes(normalizedUnit),
  )
}

