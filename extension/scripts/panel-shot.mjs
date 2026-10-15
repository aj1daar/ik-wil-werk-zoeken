// Looks at the built side panel in a real browser, light and dark, at the width
// Chrome actually gives it, and fails on console errors, sideways scrolling or
// serious accessibility problems. The same bar the app's own `pnpm screenshots`
// run holds the app to.
//
// The panel is an extension page, so two things have to be faked to open it as a
// plain page: the chrome.* APIs it touches, and the API it calls. Both are
// shimmed here and nowhere in the shipped code.
//
// Run from extension/ after a build: node scripts/panel-shot.mjs
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here    = fileURLToPath(new URL('.', import.meta.url))
const dist    = resolve(here, '../dist')
const shots   = resolve(here, '../screenshots')
const axePath = resolve(here, '../node_modules/axe-core/axe.min.js')

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.json': 'application/json', '.svg': 'image/svg+xml',
}

function serve(root) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0])
    const file = join(root, path === '/' ? '/sidepanel/index.html' : path)
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file')
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

// A token that is live for an hour, so the panel goes straight to the form.
function token() {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

const CHROME_SHIM = signedIn => `
  const store = ${signedIn ? `{ iwwzToken: '${token()}' }` : '{}'};
  globalThis.chrome = {
    runtime: { id: 'panel-shot' },
    storage: { session: {
      get: async keys => {
        if (keys == null) return { ...store };
        const wanted = typeof keys === 'string' ? [keys] : keys;
        return Object.fromEntries(wanted.filter(k => k in store).map(k => [k, store[k]]));
      },
      set: async items => { Object.assign(store, items); },
      remove: async keys => { for (const k of (typeof keys === 'string' ? [keys] : keys)) delete store[k]; },
    } },
    sidePanel: { setPanelBehavior: async () => {} },
  };
`

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
  'GET /api/dashboard/applications': [{
    id: 'a1', companyName: 'Adyen N.V.', position: 'Backend Engineer',
    status: 'Applied', appliedAt: '2026-10-03T00:00:00.000Z', sponsorCompanyId: 'c1',
  }],
  'POST /api/dashboard/applications': {
    id: 'a2', companyName: 'Adyen N.V.', position: 'Senior Backend Engineer',
    status: 'Applied', appliedAt: '2026-10-09T00:00:00.000Z',
  },
}

async function launch() {
  const channel = process.env.PW_CHANNEL ?? 'chrome'
  try {
    return await chromium.launch({ headless: true, channel: channel === 'chromium' ? undefined : channel })
  } catch (e) {
    throw new Error(`Could not start the "${channel}" browser (${e.message.split('\n')[0]}). ` +
      'Set PW_CHANNEL=msedge, or run `npx playwright install chromium` and set PW_CHANNEL=chromium.')
  }
}

const problems = []

async function capture(browser, base, { name, theme, signedIn, clipboard, after }) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  await context.addInitScript(CHROME_SHIM(signedIn))
  if (clipboard) {
    await context.addInitScript(`
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: async () => ${JSON.stringify(clipboard)} },
      });
    `)
  }

  await context.route('**/api.nogoibay.org/**', async route => {
    const url  = new URL(route.request().url())
    const key  = `${route.request().method()} ${url.pathname}`
    const body = API[key]
    if (body === undefined) {
      problems.push(`${name}: no canned response for ${key}`)
      return route.fulfill({ status: 500, body: '{}' })
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  const page = await context.newPage()
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`${name}: console error — ${message.text()}`)
  })
  page.on('pageerror', error => problems.push(`${name}: page error — ${error.message}`))

  await page.goto(base, { waitUntil: 'networkidle' })
  if (after) await after(page)
  await page.waitForTimeout(250)

  const width = await page.evaluate(() =>
    ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  if (width.scroll > width.client + 1) {
    problems.push(`${name}: scrolls sideways (${width.scroll}px in ${width.client}px)`)
  }

  await page.addScriptTag({ path: axePath })
  const axe = await page.evaluate(async () =>
    await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
  for (const violation of axe.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      const where = violation.nodes.map(node => node.target.join(' ')).join(', ')
      problems.push(`${name}: ${violation.impact} — ${violation.id} on ${where}`)
    }
  }

  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
  console.log(`${name}.png`)
  await context.close()
}

const server  = await serve(dist)
const base    = `http://127.0.0.1:${server.address().port}/sidepanel/index.html`
const browser = await launch()

await mkdir(shots, { recursive: true })

try {
  for (const theme of ['light', 'dark']) {
    await capture(browser, base, { name: `signed-out-${theme}`, theme, signedIn: false })
    await capture(browser, base, {
      name: `no-link-${theme}`, theme, signedIn: true, clipboard: 'some notes, not a link',
    })
    await capture(browser, base, {
      name: `parsed-${theme}`, theme, signedIn: true, clipboard: 'https://careers.adyen.com/jobs/1234',
    })
    await capture(browser, base, {
      name: `saved-${theme}`, theme, signedIn: true, clipboard: 'https://careers.adyen.com/jobs/1234',
      after: async page => {
        await page.click('form button[type="submit"]')
        await page.waitForSelector('.panel-saved-line')
      },
    })
  }
} finally {
  await browser.close()
  server.close()
}

await writeFile(join(shots, 'problems.txt'), problems.join('\n') + '\n')

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('\nNo console errors, no sideways scrolling, no serious axe violations.')
