import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Check the staged server, without developer .env settings masking missing credentials.
const appRoot = resolve(process.argv[2])
const data = await mkdtemp(join(tmpdir(), 'hub-google-check-'))
const probe = createServer()
await new Promise((done, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', done) })
const port = probe.address().port
await new Promise(done => probe.close(done))
const child = spawn(process.execPath, [join(appRoot, 'server/index.mjs')], {
  cwd: appRoot,
  env: { ...process.env, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', KITCHEN_HUB_DATA_DIR: data, VOICE_SERVER_PORT: String(port) },
  stdio: 'ignore', windowsHide: true,
})
let launchError
child.on('error', error => { launchError = error })
try {
  let verified = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (launchError) throw new Error('Packaged server could not be launched.')
    if (child.exitCode !== null) throw new Error('Packaged server exited before Google configuration could be checked.')
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/calendar/status`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        const status = await response.json()
        if (!status.configured) throw new Error('Packaged server reports Google Sign-In is not configured.')
        verified = true
        break
      }
    } catch (error) {
      if (error.message === 'Packaged server reports Google Sign-In is not configured.') throw error
    }
    await new Promise(done => setTimeout(done, 100))
  }
  if (!verified) throw new Error('Packaged Google Sign-In status check timed out.')
  console.log('Packaged server reports Google Sign-In configured; credential values hidden.')
} finally {
  const closed = new Promise(done => child.once('close', done))
  if (child.exitCode === null && !launchError) { child.kill(); await closed }
  await rm(data, { recursive: true, force: true })
}
