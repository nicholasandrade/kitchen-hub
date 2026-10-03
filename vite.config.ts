import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

type MonitorSnapshot = {
  capturedAt: string
  image: Buffer
  telemetry: unknown
}

function lanVisualMonitor(): Plugin {
  const snapshots = new Map<string, MonitorSnapshot>()

  const clientAddress = (address: string | undefined) =>
    (address ?? 'unknown').replace(/^::ffff:/, '')

  return {
    name: 'kitchen-hub-lan-visual-monitor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__kitchenhub/monitor', (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        let body = ''
        request.setEncoding('utf8')
        request.on('data', (chunk: string) => {
          body += chunk
          if (body.length > 10_000_000) request.destroy()
        })
        request.on('end', () => {
          try {
            const payload = JSON.parse(body) as {
              screenshot: string
              telemetry: unknown
            }
            const encodedImage = payload.screenshot.replace(
              /^data:image\/(?:jpeg|png);base64,/,
              '',
            )
            const address = clientAddress(request.socket.remoteAddress)
            snapshots.set(address, {
              capturedAt: new Date().toISOString(),
              image: Buffer.from(encodedImage, 'base64'),
              telemetry: payload.telemetry,
            })
            response.statusCode = 204
            response.end()
          } catch {
            response.statusCode = 400
            response.end('Invalid monitor payload')
          }
        })
      })

      server.middlewares.use('/__kitchenhub/clients', (_request, response) => {
        const clients = [...snapshots.entries()].map(([address, snapshot]) => ({
          address,
          capturedAt: snapshot.capturedAt,
          telemetry: snapshot.telemetry,
        }))
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(clients, null, 2))
      })

      server.middlewares.use('/__kitchenhub/screenshot', (request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        const requestedAddress = requestUrl.searchParams.get('ip')
        const snapshot = requestedAddress
          ? snapshots.get(requestedAddress)
          : [...snapshots.values()].at(-1)

        if (!snapshot) {
          response.statusCode = 404
          response.end('No Surface preview has arrived yet.')
          return
        }

        response.setHeader('Content-Type', 'image/jpeg')
        response.setHeader('Cache-Control', 'no-store')
        response.end(snapshot.image)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.KITCHEN_HUB_LAN_MONITOR === '1'
      ? [lanVisualMonitor()]
      : []),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
