import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const dataDirectory = process.env.KITCHEN_HUB_DATA_DIR || root
const envPath = join(dataDirectory, '.env')
const readLocalEnv = () => {
  const values = {}
  if (!existsSync(envPath)) return values
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}
const getConfig = () => {
  const local = readLocalEnv()
  const apiKey = process.env.OPENAI_API_KEY || local.OPENAI_API_KEY || ''
  return {
    apiKey,
    configured: /^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey),
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || local.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    commandModel: process.env.OPENAI_COMMAND_MODEL || local.OPENAI_COMMAND_MODEL || 'gpt-5-mini',
    wakePhrase: process.env.KITCHEN_HUB_WAKE_PHRASE || local.KITCHEN_HUB_WAKE_PHRASE || 'Kitchen Hub',
  }
}
const port = Number(process.env.VOICE_SERVER_PORT || readLocalEnv().VOICE_SERVER_PORT || 8787)
const wakeListenerUrl = process.env.KITCHEN_HUB_WAKE_LISTENER_URL || 'http://127.0.0.1:8788'
const wakeClients = new Set()

const allowedActions = [
  'next_step', 'previous_step', 'go_to_step', 'start_over',
  'set_servings', 'adjust_servings', 'ingredient_quantity',
  'check_ingredient', 'uncheck_ingredient', 'scroll_ingredients',
  'remove_ingredient', 'save_changes', 'discard_changes',
  'pause_listening', 'unknown',
]

const commandSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: allowedActions },
    step: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    servings: { anyOf: [{ type: 'integer', minimum: 1, maximum: 12 }, { type: 'null' }] },
    delta: { anyOf: [{ type: 'integer', minimum: -8, maximum: 8 }, { type: 'null' }] },
    ingredient: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    direction: { anyOf: [{ type: 'string', enum: ['up', 'down'] }, { type: 'null' }] },
    response: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['action', 'step', 'servings', 'delta', 'ingredient', 'direction', 'response', 'confidence'],
  additionalProperties: false,
}

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

const saveLocalEnvValue = async (name, value) => {
  await mkdir(dataDirectory, { recursive: true })
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : await readFile(join(root, '.env.example'), 'utf8')
  const nextLine = `${name}=${value}`
  const pattern = new RegExp(`^\\s*${name}=.*$`, 'm')
  const next = pattern.test(existing)
    ? existing.replace(pattern, nextLine)
    : `${existing.trimEnd()}\n${nextLine}\n`
  await writeFile(envPath, next, { encoding: 'utf8', mode: 0o600 })
}

const saveOpenAIKey = async (request, response) => {
  const body = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}')
  const apiKey = String(body.apiKey || '').trim()
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    return sendJson(response, 400, { error: 'Enter a valid OpenAI API key.' })
  }

  const validation = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!validation.ok) {
    const payload = await validation.json().catch(() => ({}))
    return sendJson(response, 400, { error: payload?.error?.message || 'OpenAI rejected this API key.' })
  }

  await saveLocalEnvValue('OPENAI_API_KEY', apiKey)
  return sendJson(response, 200, { configured: true })
}

const saveWakePhrase = async (request, response) => {
  const body = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}')
  const phrase = String(body.phrase || '').trim().replace(/\s+/g, ' ')
  if (!/^[A-Za-z0-9][A-Za-z0-9 '-]{1,31}$/.test(phrase)) {
    return sendJson(response, 400, { error: 'Use 2–32 letters, numbers, spaces, apostrophes, or hyphens.' })
  }

  let listenerResponse
  try {
    listenerResponse = await fetch(`${wakeListenerUrl}/keyword`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase }),
    })
  } catch {
    return sendJson(response, 503, { error: 'The local wake listener is not running. Start it and try again.' })
  }
  const listenerResult = await listenerResponse.json().catch(() => ({}))
  if (!listenerResponse.ok) return sendJson(response, 400, { error: listenerResult.error || 'The local model could not use that wake phrase.' })

  await saveLocalEnvValue('KITCHEN_HUB_WAKE_PHRASE', phrase)
  return sendJson(response, 200, { phrase })
}

const openWakeEvents = (request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })
  response.write('event: ready\ndata: {}\n\n')
  wakeClients.add(response)
  request.on('close', () => wakeClients.delete(response))
}

const publishWakeEvent = async (request, response) => {
  const body = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}')
  const event = JSON.stringify({ phrase: String(body.phrase || 'Kitchen Hub'), at: Date.now() })
  for (const client of wakeClients) client.write(`event: wake\ndata: ${event}\n\n`)
  return sendJson(response, 200, { delivered: wakeClients.size })
}

const readBody = async (request, limit = 15 * 1024 * 1024) => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('request-too-large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const openAIRequest = async (path, init) => {
  const { apiKey, configured } = getConfig()
  if (!configured) throw new Error('missing-api-key')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`https://api.openai.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: controller.signal,
    })
    const payload = await response.json()
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `OpenAI request failed (${response.status})`)
      error.status = response.status
      throw error
    }
    return payload
  } finally {
    clearTimeout(timeout)
  }
}

const transcribe = async (request, response) => {
  const audio = await readBody(request)
  if (!audio.length) return sendJson(response, 400, { error: 'No audio was received.' })
  const contentType = String(request.headers['content-type'] || 'audio/webm').split(';')[0]
  const extension = contentType.includes('ogg') ? 'ogg'
    : contentType.includes('mp4') ? 'm4a'
      : contentType.includes('wav') ? 'wav'
        : 'webm'
  const vocabulary = decodeURIComponent(String(request.headers['x-kitchen-vocabulary'] || '')).slice(0, 1500)
  const form = new FormData()
  const { transcriptionModel } = getConfig()
  form.append('file', new Blob([audio], { type: contentType }), `kitchen-command.${extension}`)
  form.append('model', transcriptionModel)
  form.append('language', 'en')
  if (vocabulary) form.append('prompt', `Kitchen cooking commands. Recipe vocabulary: ${vocabulary}`)
  const result = await openAIRequest('/v1/audio/transcriptions', { method: 'POST', body: form })
  return sendJson(response, 200, { text: String(result.text || '').trim() })
}

const createCommand = async (request, response) => {
  const body = JSON.parse((await readBody(request, 256 * 1024)).toString('utf8'))
  if (!body.transcript || typeof body.transcript !== 'string') return sendJson(response, 400, { error: 'A transcript is required.' })

  const { commandModel } = getConfig()
  const result = await openAIRequest('/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: commandModel,
      instructions: [
        'Convert a spoken Kitchen Hub request into exactly one safe application command.',
        'Use only the supplied action enum. Never invent ingredient names that were not spoken or present in context.',
        'Step numbers spoken by the user are one-based. Use null for every field irrelevant to the selected action.',
        'The response is a short confirmation of what the app will do. For unknown or ambiguous requests, choose unknown and ask one concise clarifying question.',
      ].join(' '),
      input: JSON.stringify({ transcript: body.transcript, context: body.context || {} }),
      text: { format: { type: 'json_schema', name: 'kitchen_command', strict: true, schema: commandSchema } },
    }),
  })

  const outputText = result.output_text || result.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('')
  if (!outputText) throw new Error('The command service returned no structured output.')
  const command = JSON.parse(outputText)
  if (!allowedActions.includes(command.action)) throw new Error('invalid-command')
  return sendJson(response, 200, command)
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
}

const serveStatic = async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(?:\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  let path = join(dist, requested === '/' ? 'index.html' : requested)
  try {
    const info = await stat(path)
    if (info.isDirectory()) path = join(path, 'index.html')
  } catch {
    path = join(dist, 'index.html')
  }
  const file = await readFile(path)
  response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream' })
  response.end(file)
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/voice/health') {
      const { configured, transcriptionModel, commandModel, wakePhrase } = getConfig()
      return sendJson(response, 200, { configured, transcriptionModel, commandModel, wakePhrase })
    }
    if (request.method === 'PUT' && request.url === '/api/settings/openai-key') return await saveOpenAIKey(request, response)
    if (request.method === 'PUT' && request.url === '/api/settings/wake-phrase') return await saveWakePhrase(request, response)
    if (request.method === 'GET' && request.url === '/api/wake/events') return openWakeEvents(request, response)
    if (request.method === 'POST' && request.url === '/api/wake') return await publishWakeEvent(request, response)
    if (request.method === 'POST' && request.url?.startsWith('/api/voice/transcribe')) return await transcribe(request, response)
    if (request.method === 'POST' && request.url === '/api/voice/command') return await createCommand(request, response)
    if (request.url?.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found.' })
    return await serveStatic(request, response)
  } catch (error) {
    const missingKey = error instanceof Error && error.message === 'missing-api-key'
    const tooLarge = error instanceof Error && error.message === 'request-too-large'
    const status = missingKey ? 503 : tooLarge ? 413 : Number(error?.status) || 500
    const message = missingKey
      ? 'Voice service is not configured. Add OPENAI_API_KEY to the server environment.'
      : tooLarge ? 'The audio recording was too large.'
        : error instanceof Error ? error.message : 'Voice service failed.'
    console.error(error)
    sendJson(response, status, { error: message })
  }
})

server.listen(port, '127.0.0.1', () => {
  const { configured } = getConfig()
  console.log(`Kitchen Hub voice server listening on http://127.0.0.1:${port}`)
  console.log(configured ? 'OpenAI voice service configured.' : 'OPENAI_API_KEY is not set; health checks work but voice requests will return 503.')
})
