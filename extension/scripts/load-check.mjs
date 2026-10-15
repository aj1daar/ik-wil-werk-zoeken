// Loads the built extension into a real Chrome, the way chrome://extensions
// "Load unpacked" does, and checks what only a real load can tell us: that the
// manifest is accepted, that the pinned key gives the extension ID the site
// will have to address, that the service worker starts and really does set the
// panel behaviour, and that the panel runs on its own chrome-extension origin
// with the genuine chrome.* APIs rather than the shims scripts/panel-shot.mjs
// has to fake for a plain page.
//
// Chrome 137 and later ignore --load-extension, so the extension goes in over
// CDP (Extensions.loadUnpacked), which needs --enable-unsafe-extension-debugging.
// Playwright then attaches to the same browser to drive the panel page.
//
// Run from extension/ after a build: node scripts/load-check.mjs
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const dist  = resolve(here, '../dist')
const shots = resolve(here, '../screenshots')

// The ID the manifest's pinned key exists to guarantee. The site's Connect
// button hands the session token to exactly this ID, so a change here is a
// change the site has to be told about.
const EXPECTED_ID = 'hfciboolclaodhipoanmijjjidglnjff'

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const API = {
  'POST /api/dashboard/parse-job-link': {
    company: 'Adyen N.V.', position: 'Senior Backend Engineer',
    locations: ['Amsterdam'], source: 'jsonld',
  },
  'GET /api/dashboard/sponsors/lookup': {
    query: 'Adyen N.V.',
    exact: { id: 'c1', name: 'Adyen N.V.', city: 'Amsterdam', coreIndustry: 'Payments' },
    matches: [{ id: 'c1', name: 'Adyen N.V.', city: 'Amsterdam', coreIndustry: 'Payments' }],
  },
  'GET /api/dashboard/applications': [],
  'POST /api/dashboard/applications': {
    id: 'a2', companyName: 'Adyen N.V.', position: 'Senior Backend Engineer',
    status: 'Applied', appliedAt: '2026-10-14T00:00:00.000Z',
  },
}

const problems = []
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) problems.push(label)
}
const wait = ms => new Promise(r => setTimeout(r, ms))

// A token that is live for an hour, so the panel goes straight to the form.
function token() {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

const profile = await mkdtemp(join(tmpdir(), 'iwwz-ext-'))
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  '--enable-unsafe-extension-debugging',
  ...(process.env.HEADED ? [] : ['--headless=new']),
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' })

// Chrome writes the port it actually took into the profile.
let port = null
for (let i = 0; i < 60 && port === null; i++) {
  try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim() }
  catch { await wait(250) }
}
if (!port) throw new Error('Chrome did not open a DevTools port. Set CHROME_PATH if Chrome is elsewhere.')

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()

// A small CDP client, because Playwright cannot reach browser-level domains, and
// loading an extension and talking to its service worker are both browser level.
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((ok, fail) => {
  socket.addEventListener('open', ok)
  socket.addEventListener('error', () => fail(new Error('Could not open the CDP socket')))
})
let nextId = 1
const waiting = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message)
    waiting.delete(message.id)
  }
})
function cdp(method, params = {}, sessionId) {
  return new Promise(ok => {
    const id = nextId++
    waiting.set(id, ok)
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}

let browser
try {
  const loaded = await cdp('Extensions.loadUnpacked', { path: dist })
  if (loaded.error) throw new Error(`Chrome refused the unpacked extension: ${loaded.error.message}`)
  const id = loaded.result.id
  check(id === EXPECTED_ID, `extension ID ${id}${id === EXPECTED_ID ? '' : `, expected ${EXPECTED_ID}`}`)

  // The service worker running at all is what a broken manifest or a top-level
  // throw would cost us first.
  let worker = null
  for (let i = 0; i < 20 && !worker; i++) {
    const targets = (await cdp('Target.getTargets')).result.targetInfos
    worker = targets.find(t => t.type === 'service_worker' && t.url.includes(id)) ?? null
    if (!worker) await wait(250)
  }
  check(worker !== null, 'the service worker started')

  if (worker) {
    const attached = await cdp('Target.attachToTarget', { targetId: worker.targetId, flatten: true })
    const sessionId = attached.result.sessionId
    const ask = async expression => (await cdp('Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true }, sessionId)).result?.result?.value

    // Not cosmetic: a side panel nothing opens is a panel the user cannot reach,
    // and setPanelBehavior failing is silent.
    // The worker sets this as it starts, so a read the instant its target appears
    // can beat it there.
    let behavior = null
    for (let i = 0; i < 20; i++) {
      behavior = await ask('chrome.sidePanel.getPanelBehavior()')
      if (behavior?.openPanelOnActionClick === true) break
      await wait(250)
    }
    check(behavior?.openPanelOnActionClick === true,
      `the toolbar icon opens the panel (openPanelOnActionClick: ${behavior?.openPanelOnActionClick})`)

    const manifest = await ask('chrome.runtime.getManifest()')
    check(manifest?.manifest_version === 3, `manifest version ${manifest?.manifest_version}`)
    check(manifest?.side_panel?.default_path === 'sidepanel/index.html',
      `side panel path ${manifest?.side_panel?.default_path}`)
  }

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]
  // No origin: Chrome calls a chrome-extension origin opaque and refuses a
  // per-origin grant, and the panel needs to read the clipboard the way the
  // manifest's clipboardRead permission lets it.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await context.route('**/api.nogoibay.org/**', async route => {
    const url = new URL(route.request().url())
    const key = `${route.request().method()} ${url.pathname}`
    const body = API[key]
    if (body === undefined) {
      problems.push(`no canned response for ${key}`)
      return route.fulfill({ status: 500, body: '{}' })
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  const page = await context.newPage()
  // Roughly the width Chrome gives a side panel, so the shot below is the shape
  // the panel really has.
  await page.setViewportSize({ width: 400, height: 900 })
  page.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`) })
  page.on('pageerror', e => problems.push(`page error: ${e.message}`))

  const panel = `chrome-extension://${id}/sidepanel/index.html`

  // Nothing in chrome.storage.session is what a fresh install looks like.
  await page.goto(panel)
  await page.waitForSelector('form', { timeout: 10000 })
  check(await page.locator('#panel-email').count() === 1, 'a fresh install asks for sign-in')

  // Real chrome.storage.session and a real clipboard, so this is the panel's own
  // token and clipboard handling rather than a stand-in for it.
  await page.evaluate(async value => { await chrome.storage.session.set({ iwwzToken: value }) }, token())
  await page.evaluate(() => navigator.clipboard.writeText('https://careers.adyen.com/jobs/1234'))

  await page.goto(panel)
  await page.waitForSelector('#panel-company', { timeout: 10000 })
  check(await page.inputValue('#panel-company') === 'Adyen N.V.', 'the copied link filled in the company')
  check(await page.inputValue('#panel-position') === 'Senior Backend Engineer', 'and the position')
  check((await page.inputValue('#panel-url')).includes('careers.adyen.com'), 'and the link itself')

  // The verdict waits until the field is not focused, so this covers that gate too.
  await page.click('.panel-title')
  await page.waitForSelector('.verdict--sponsor', { timeout: 5000 })
  check(await page.locator('.verdict--sponsor').count() === 1, 'the sponsor verdict is shown')

  await page.click('form button[type="submit"]')
  await page.waitForSelector('.panel-saved-line', { timeout: 10000 })
  check(true, 'the application saved')

  // One shot from the real extension origin, as evidence this ran where it says
  // it ran. The light and dark set lives in scripts/panel-shot.mjs.
  await mkdir(shots, { recursive: true })
  await page.screenshot({ path: join(shots, 'loaded-in-chrome.png'), fullPage: true })

  const stored = await page.evaluate(() => chrome.storage.session.get(null))
  check(typeof stored.iwwzToken === 'string', 'the token stayed in chrome.storage.session')
} finally {
  await browser?.close()
  socket.close()
  chrome.kill()
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('\nLoaded in Chrome: pinned ID, panel opener set, copied link through to a saved application.')
