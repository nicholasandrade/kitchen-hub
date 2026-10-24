import { installerUrl } from './installerUpdates.mjs'

const REPOSITORY_URL = 'https://github.com/nicholasandrade/kitchen-hub'
const LATEST_URL = `${REPOSITORY_URL}/releases/latest`
const VERSION = /^v?(\d+\.\d+\.\d+(?:\.\d+)?)$/
const TAG_PATH = /^\/nicholasandrade\/kitchen-hub\/releases\/tag\/v(\d+\.\d+\.\d+(?:\.\d+)?)$/

function isNewer(latest, current) {
  const left = latest.split('.').map(BigInt)
  const right = current.split('.').map(BigInt)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0n) - (right[index] ?? 0n)
    if (difference !== 0n) return difference > 0n
  }
  return false
}

export function createUpdateService({ currentVersion, fetchImpl = fetch, now = Date.now }) {
  const current = typeof currentVersion === 'string' && VERSION.exec(currentVersion)?.[1]
  if (!current) throw new Error('The installed app version must be a numeric version.')
  let pending = null
  let cached = null
  let cacheUntil = 0
  let retryAt = 0
  let lastError = null

  async function request() {
    const controller = new AbortController()
    let timer
    try {
      const response = await Promise.race([
        fetchImpl(LATEST_URL, { method: 'HEAD', redirect: 'follow', signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error('Update check timed out after 10 seconds.'))
          }, 10_000)
        }),
      ])
      let latestVersion = null
      let releaseUrl = ''
      if (response.status === 404 && response.url !== LATEST_URL) {
        throw new Error('GitHub returned an untrusted or invalid release URL.')
      }
      if (response.status === 404) {
        throw new Error('GitHub releases are inaccessible (HTTP 404). A private repository requires authenticated update access. This does not mean Hub is up to date.')
      }
      if (response.status !== 404) {
        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            const retryAfter = response.headers?.get('retry-after')
            const delay = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter.trim())
              ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now()
            if (Number.isFinite(delay)) retryAt = Math.max(retryAt, now() + delay)
          }
          throw new Error(`GitHub release check failed (HTTP ${response.status}).`)
        }
        let url
        try { url = new URL(response.url) } catch { throw new Error('GitHub returned an invalid release URL.') }
        const tag = TAG_PATH.exec(url.pathname)
        if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !tag) {
          throw new Error('GitHub returned an untrusted or invalid release URL.')
        }
        latestVersion = tag[1]
        releaseUrl = `${REPOSITORY_URL}/releases/tag/v${latestVersion}`
      }
      const result = {
        currentVersion, latestVersion,
        updateAvailable: latestVersion !== null && isNewer(latestVersion, current),
        releaseUrl, checkedAt: new Date(now()).toISOString(),
        installerUrl: latestVersion ? installerUrl(latestVersion) : '',
      }
      cached = result
      cacheUntil = now() + 5000
      lastError = null
      retryAt = 0
      return result
    } catch (cause) {
      lastError = new Error(`Could not check for updates: ${cause instanceof Error ? cause.message : String(cause)}`)
      retryAt = Math.max(retryAt, now() + 30_000)
      throw lastError
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    check() {
      if (pending) return pending
      if (lastError && now() < retryAt) return Promise.reject(lastError)
      if (cached && now() < cacheUntil) return Promise.resolve(cached)
      pending = request().finally(() => { pending = null })
      return pending
    },
  }
}

