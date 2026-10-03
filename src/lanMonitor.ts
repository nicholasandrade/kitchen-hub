import { toJpeg } from 'html-to-image'

type ElementMeasurement = {
  height: number
  width: number
  top: number
  bottom: number
  clientHeight: number
  scrollHeight: number
  overflowY: string
}

const measurementSelectors = [
  '.app-shell',
  '.recipe-heading',
  '.workspace',
  '.ingredients-card',
  '.cooking-column',
  '.step-card',
  '.step-body',
  '.step-actions',
  '.conversation-card',
]

function measureElement(selector: string): ElementMeasurement | null {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) return null

  const rect = element.getBoundingClientRect()
  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }
}

async function captureViewport() {
  if (document.visibilityState !== 'visible') return

  const measurements = Object.fromEntries(
    measurementSelectors.map((selector) => [selector, measureElement(selector)]),
  )
  document.documentElement.dataset.lanMonitorCapture = 'true'
  let screenshot: string
  try {
    screenshot = await toJpeg(document.documentElement, {
      backgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      height: window.innerHeight,
      width: window.innerWidth,
      canvasHeight: Math.round(
        window.innerHeight * Math.min(window.devicePixelRatio, 1.25),
      ),
      canvasWidth: Math.round(
        window.innerWidth * Math.min(window.devicePixelRatio, 1.25),
      ),
      cacheBust: true,
      filter: (node) =>
        !(
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLSelectElement
        ),
    })
  } finally {
    delete document.documentElement.dataset.lanMonitorCapture
  }

  await fetch('/__kitchenhub/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      screenshot,
      telemetry: {
        capturedAt: new Date().toISOString(),
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          visualWidth: window.visualViewport?.width,
          visualHeight: window.visualViewport?.height,
          visualScale: window.visualViewport?.scale,
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height,
        },
        userAgent: navigator.userAgent,
        documentHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        title: document.title,
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
        measurements,
      },
    }),
  })
}

export function startLanMonitor() {
  let captureInProgress = false

  const captureStyle = document.createElement('style')
  captureStyle.textContent = `
    html[data-lan-monitor-capture='true'] *,
    html[data-lan-monitor-capture='true'] *::before,
    html[data-lan-monitor-capture='true'] *::after {
      animation-delay: -10000s !important;
      animation-play-state: paused !important;
      caret-color: transparent !important;
      transition: none !important;
    }
  `
  document.head.append(captureStyle)

  const capture = async () => {
    if (captureInProgress) return
    captureInProgress = true
    try {
      await captureViewport()
    } catch (error) {
      console.debug('KitchenHub LAN monitor could not capture this frame.', error)
    } finally {
      captureInProgress = false
    }
  }

  window.addEventListener('load', () => void capture(), { once: true })
  window.addEventListener('resize', () => void capture())
  document.addEventListener('visibilitychange', () => void capture())
  window.setInterval(() => void capture(), 4_000)
  window.setTimeout(() => void capture(), 750)
}
