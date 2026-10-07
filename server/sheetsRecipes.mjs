const tabs = ['Recipes', 'Ingredients', 'Steps', 'Serving Ideas', 'Notes']
const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const cell = (row, headers, ...names) => {
  const normalized = headers.map(normalizeHeader)
  const index = names.map(normalizeHeader).map((name) => normalized.indexOf(name)).find((candidate) => candidate >= 0)
  return index === undefined ? '' : row[index]
}
const number = (value, fallback = 0) => {
  if (value === '' || value === undefined || value === null) return fallback
  const direct = Number(value)
  if (Number.isFinite(direct)) return direct
  const approximate = String(value).match(/-?\d+(?:\.\d+)?/)
  return approximate ? Number(approximate[0]) : fallback
}
const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}
const parseQuantity = (value) => {
  if (value === '' || value === undefined || value === null) return undefined
  const parsed = parseJson(String(value), undefined)
  if (typeof parsed === 'number' || (parsed && typeof parsed === 'object')) return parsed
  const range = String(value).match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)\s*$/i)
  if (range) return { min: Number(range[1]), max: Number(range[2]) }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}
const serializeQuantity = (quantity) => quantity === undefined ? '' : typeof quantity === 'number' ? quantity : JSON.stringify(quantity)
const quoteTab = (tab) => `'${tab.replaceAll("'", "''")}'`

const rowsToObjects = (values = []) => {
  const [headers = [], ...rows] = values
  return { headers, rows: rows.filter((row) => row.some((value) => String(value || '').trim())) }
}

const asRecipe = (recipeRow, recipeHeaders, ingredientTable, stepTable, ideaTable, noteTable) => {
  const id = String(cell(recipeRow, recipeHeaders, 'recipe_id', 'id')).trim()
  const ingredientHeaders = ingredientTable.headers
  const ingredients = ingredientTable.rows
    .filter((row) => String(cell(row, ingredientHeaders, 'recipe_id')).trim() === id)
    .map((row, index) => ({
      id: String(cell(row, ingredientHeaders, 'ingredient_id', 'id') || `${id}-ingredient-${index + 1}`),
      ingredient: String(cell(row, ingredientHeaders, 'ingredient', 'name')),
      name: String(cell(row, ingredientHeaders, 'ingredient', 'name')),
      quantity: parseQuantity(cell(row, ingredientHeaders, 'quantity')),
      amount: number(parseQuantity(cell(row, ingredientHeaders, 'quantity'))?.min ?? parseQuantity(cell(row, ingredientHeaders, 'quantity')), 0),
      unit: String(cell(row, ingredientHeaders, 'unit')),
      sourceQuantity: String(cell(row, ingredientHeaders, 'source_quantity')) || undefined,
      sourceUnit: String(cell(row, ingredientHeaders, 'source_unit')) || undefined,
      notes: String(cell(row, ingredientHeaders, 'notes', 'note')) || undefined,
      note: String(cell(row, ingredientHeaders, 'notes', 'note')) || undefined,
      scalingBehavior: String(cell(row, ingredientHeaders, 'scaling_behavior') || 'linear'),
      roundingIncrement: number(cell(row, ingredientHeaders, 'rounding_increment'), undefined),
      quantityConfidence: String(cell(row, ingredientHeaders, 'quantity_confidence') || 'exact'),
      steps: String(cell(row, ingredientHeaders, 'steps', 'step_indexes')).split(',').map(Number).filter(Number.isFinite),
    }))
  const stepHeaders = stepTable.headers
  const structuredSteps = stepTable.rows
    .filter((row) => String(cell(row, stepHeaders, 'recipe_id')).trim() === id)
    .map((row, index) => ({
      id: String(cell(row, stepHeaders, 'step_id', 'id') || `${id}-step-${index + 1}`),
      section: String(cell(row, stepHeaders, 'section')) || undefined,
      order: number(cell(row, stepHeaders, 'order', 'step_order'), index + 1),
      instruction: String(cell(row, stepHeaders, 'instruction', 'step')),
      timerSeconds: number(cell(row, stepHeaders, 'timer_seconds'), undefined),
    }))
    .sort((a, b) => a.order - b.order)
  const ideas = ideaTable.rows.filter((row) => String(cell(row, ideaTable.headers, 'recipe_id')).trim() === id).map((row) => String(cell(row, ideaTable.headers, 'idea', 'serving_idea'))).filter(Boolean)
  const notes = noteTable.rows.filter((row) => String(cell(row, noteTable.headers, 'recipe_id')).trim() === id).map((row) => String(cell(row, noteTable.headers, 'note'))).filter(Boolean)
  const scalingMode = String(cell(recipeRow, recipeHeaders, 'scaling_mode') || 'servings')
  return {
    id,
    name: String(cell(recipeRow, recipeHeaders, 'name', 'title')),
    description: String(cell(recipeRow, recipeHeaders, 'description')),
    minutes: number(cell(recipeRow, recipeHeaders, 'minutes', 'total_minutes')),
    baseServings: number(cell(recipeRow, recipeHeaders, 'base_servings', 'servings'), 1),
    calories: number(cell(recipeRow, recipeHeaders, 'calories')),
    protein: number(cell(recipeRow, recipeHeaders, 'protein')),
    ingredients,
    steps: structuredSteps.map((step) => step.instruction),
    structuredSteps,
    scaling: {
      mode: scalingMode === 'anchor' ? 'anchor' : 'servings',
      anchorIngredientId: String(cell(recipeRow, recipeHeaders, 'anchor_ingredient_id')) || undefined,
      anchorIngredientName: String(cell(recipeRow, recipeHeaders, 'anchor_ingredient', 'anchor_ingredient_name')) || undefined,
      baseAnchorQuantity: number(cell(recipeRow, recipeHeaders, 'base_anchor_quantity'), undefined),
      baseAnchorUnit: String(cell(recipeRow, recipeHeaders, 'base_anchor_unit')) === 'g' ? 'g' : undefined,
      baseServings: number(cell(recipeRow, recipeHeaders, 'base_servings', 'servings'), 1),
    },
    source: {
      kind: String(cell(recipeRow, recipeHeaders, 'source_kind') || 'imported'),
      label: String(cell(recipeRow, recipeHeaders, 'source_label')) || undefined,
      url: String(cell(recipeRow, recipeHeaders, 'source_url')) || undefined,
      capturedAt: String(cell(recipeRow, recipeHeaders, 'source_captured_at')) || undefined,
    },
    servingIdeas: ideas,
    notes,
    updatedAt: String(cell(recipeRow, recipeHeaders, 'updated_at')) || undefined,
  }
}

const ensureHeaders = (table, required) => {
  const headers = [...table.headers]
  for (const header of required) if (!headers.map(normalizeHeader).includes(normalizeHeader(header))) headers.push(header)
  return { headers, rows: table.rows.map((row) => [...row]) }
}
const objectRow = (headers, object, existing = []) => headers.map((header, index) => {
  const key = normalizeHeader(header)
  return Object.hasOwn(object, key) ? object[key] : existing[index] ?? ''
})

export const createSheetsRecipeStore = ({ getAccessToken, getConfiguredSpreadsheetId, fetchImpl = fetch }) => {
  let discoveredSpreadsheetId = ''
  const api = async (url, init) => {
    const token = await getAccessToken()
    const response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Google Sheets request failed.'), { status: response.status })
    return payload
  }
  const spreadsheetId = async () => {
    const configured = getConfiguredSpreadsheetId()
    if (configured) return configured
    if (discoveredSpreadsheetId) return discoveredSpreadsheetId
    const query = encodeURIComponent("name = 'Hub Recipes' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false")
    const result = await api(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=10`)
    const match = result.files?.find((file) => file.name === 'Hub Recipes')
    if (!match?.id) throw Object.assign(new Error('The connected Google account does not contain a spreadsheet named “Hub Recipes”.'), { status: 404 })
    discoveredSpreadsheetId = match.id
    return match.id
  }
  const loadTables = async () => {
    const id = await spreadsheetId()
    const params = new URLSearchParams()
    tabs.forEach((tab) => params.append('ranges', `${quoteTab(tab)}!A:Z`))
    const result = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}`)
    const tables = Object.fromEntries(tabs.map((tab, index) => [tab, rowsToObjects(result.valueRanges?.[index]?.values || [])]))
    return { id, tables }
  }
  const list = async () => {
    const { tables } = await loadTables()
    const recipeTable = tables.Recipes
    return recipeTable.rows.map((row) => asRecipe(row, recipeTable.headers, tables.Ingredients, tables.Steps, tables['Serving Ideas'], tables.Notes)).filter((recipe) => recipe.id)
  }
  const save = async (recipe) => {
    const { id, tables } = await loadTables()
    const definitions = {
      Recipes: ['recipe_id', 'name', 'description', 'minutes', 'base_servings', 'calories', 'protein', 'scaling_mode', 'anchor_ingredient_id', 'anchor_ingredient', 'base_anchor_quantity', 'base_anchor_unit', 'source_kind', 'source_label', 'source_url', 'source_captured_at', 'updated_at'],
      Ingredients: ['recipe_id', 'ingredient_id', 'ingredient', 'quantity', 'unit', 'source_quantity', 'source_unit', 'notes', 'scaling_behavior', 'rounding_increment', 'quantity_confidence', 'steps'],
      Steps: ['recipe_id', 'step_id', 'section', 'order', 'instruction', 'timer_seconds'],
      'Serving Ideas': ['recipe_id', 'idea'],
      Notes: ['recipe_id', 'note'],
    }
    const prepared = Object.fromEntries(tabs.map((tab) => [tab, ensureHeaders(tables[tab], definitions[tab])]))
    const recipeObjects = [{
      recipe_id: recipe.id, name: recipe.name, description: recipe.description, minutes: recipe.minutes, base_servings: recipe.baseServings,
      calories: recipe.calories, protein: recipe.protein, scaling_mode: recipe.scaling?.mode || 'servings', anchor_ingredient_id: recipe.scaling?.anchorIngredientId || '',
      anchor_ingredient: recipe.scaling?.anchorIngredientName || '', base_anchor_quantity: recipe.scaling?.baseAnchorQuantity || '', base_anchor_unit: recipe.scaling?.baseAnchorUnit || '',
      source_kind: recipe.source?.kind || 'manual', source_label: recipe.source?.label || '', source_url: recipe.source?.url || '', source_captured_at: recipe.source?.capturedAt || '', updated_at: recipe.updatedAt || new Date().toISOString(),
    }]
    const ingredientObjects = recipe.ingredients.map((ingredient) => ({
      recipe_id: recipe.id, ingredient_id: ingredient.id || '', ingredient: ingredient.ingredient || ingredient.name, quantity: serializeQuantity(ingredient.quantity), unit: ingredient.unit || '',
      source_quantity: ingredient.sourceQuantity || '', source_unit: ingredient.sourceUnit || '', notes: ingredient.notes || ingredient.note || '', scaling_behavior: ingredient.scalingBehavior || 'linear',
      rounding_increment: ingredient.roundingIncrement || '', quantity_confidence: ingredient.quantityConfidence || 'exact', steps: (ingredient.steps || []).join(','),
    }))
    const stepObjects = (recipe.structuredSteps || recipe.steps.map((instruction, index) => ({ id: `${recipe.id}-step-${index + 1}`, order: index + 1, instruction }))).map((step) => ({
      recipe_id: recipe.id, step_id: step.id, section: step.section || '', order: step.order, instruction: step.instruction, timer_seconds: step.timerSeconds || '',
    }))
    const replacements = { Recipes: recipeObjects, Ingredients: ingredientObjects, Steps: stepObjects, 'Serving Ideas': (recipe.servingIdeas || []).map((idea) => ({ recipe_id: recipe.id, idea })), Notes: (recipe.notes || []).map((note) => ({ recipe_id: recipe.id, note })) }
    for (const tab of tabs) {
      const table = prepared[tab]
      const matchesRecipe = (row) => String(cell(row, table.headers, 'recipe_id', 'id')).trim() === recipe.id
      const firstExistingIndex = table.rows.findIndex(matchesRecipe)
      const insertionIndex = firstExistingIndex < 0 ? table.rows.length : table.rows.slice(0, firstExistingIndex).filter((row) => !matchesRecipe(row)).length
      const existing = table.rows.filter(matchesRecipe)
      table.rows = table.rows.filter((row) => String(cell(row, table.headers, 'recipe_id', 'id')).trim() !== recipe.id)
      const replacementRows = replacements[tab].map((entry, index) => objectRow(table.headers, entry, existing[index]))
      if (firstExistingIndex < 0) table.rows.push(...replacementRows)
      else table.rows.splice(insertionIndex, 0, ...replacementRows)
    }
    await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ranges: tabs.map((tab) => `${quoteTab(tab)}!A:Z`) }) })
    await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: tabs.map((tab) => ({ range: `${quoteTab(tab)}!A1`, majorDimension: 'ROWS', values: [prepared[tab].headers, ...prepared[tab].rows] })) }),
    })
  }
  return { list, save }
}

