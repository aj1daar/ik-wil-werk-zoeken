// Screenshot the app's pages at desktop and phone size, in light and dark,
// and flag the things a screenshot alone hides: page errors, console errors,
// sideways scrolling on narrow screens, a token that bounced to /login, and
// serious accessibility problems (axe-core, including colour contrast).
//
//   pnpm screenshots                              # every page, both sizes, both themes
//   pnpm screenshots --routes=/,/applications --viewports=mobile --themes=dark
//   pnpm screenshots --viewports=phones            # every phone profile
//   pnpm screenshots --viewports=iphone-15-pro-max,ipad-mini
//   pnpm screenshots --a11y=false                 # skip the accessibility check
//
// Needs `pnpm dev` and the API running. Signed-in pages need either
//   IWWZ_TOKEN=<jwt>                 or   IWWZ_EMAIL=... IWWZ_PASSWORD=...
// Without either, only the public pages (/login, /register) are captured.
//
// Uses the Chrome already installed on the machine (PW_CHANNEL=chrome, the
// default). PW_CHANNEL=msedge works too; PW_CHANNEL=chromium uses a browser
// fetched with `npx playwright install chromium`.

import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

const env  = process.env
const BASE = (env.IWWZ_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const API  = (env.IWWZ_API ?? 'http://localhost:7198').replace(/\/$/, '')
const OUT  = env.IWWZ_SHOTS_DIR ?? 'screenshots'

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
  return [key, value]
}))
const list = (value, fallback) => (value ?? fallback).split(',').map(s => s.trim()).filter(Boolean)

const PUBLIC_ROUTES = ['/login', '/register']
const APP_ROUTES    = ['/', '/applications', '/companies', '/profile']

// Real devices, in CSS pixels — the number the layout actually sees, not the
// marketing resolution. iPhone 15 Pro Max is the reference phone (it is what
// the app is used on); iPhone SE is the narrowest screen still worth passing,
// and Galaxy S24 is the narrowest common Android. Tablets land between the
// phone rules and the desktop ones, which is where layouts tend to fall over.
const PHONE = { isMobile: true, hasTouch: true }

const VIEWPORTS = {
  'iphone-15-pro-max': { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, ...PHONE },
  'iphone-15':         { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, ...PHONE },
  'iphone-se':         { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, ...PHONE },
  'galaxy-s24':        { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, ...PHONE },
  'pixel-8':           { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, ...PHONE },
  'ipad-mini':         { viewport: { width: 744, height: 1133 }, deviceScaleFactor: 2, ...PHONE },
  'ipad-pro-11':       { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, ...PHONE },
  desktop:             { viewport: { width: 1440, height: 900 } },
  wide:                { viewport: { width: 1920, height: 1080 } },
}

// Shorthands. `mobile` is the reference phone, so an older command still works
// and still means "check this on a phone".
const VIEWPORT_GROUPS = {
  mobile:  ['iphone-15-pro-max'],
  phones:  ['iphone-15-pro-max', 'iphone-15', 'iphone-se', 'galaxy-s24', 'pixel-8'],
  tablets: ['ipad-mini', 'ipad-pro-11'],
  all:     Object.keys(VIEWPORTS),
}

function expandViewports(names) {
  const out = []
  for (const name of names) {
    for (const vp of VIEWPORT_GROUPS[name] ?? [name]) if (!out.includes(vp)) out.push(vp)
  }
  return out
}

// Freeze motion so a shot never lands mid-transition
const NO_MOTION = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'

async function getToken() {
  if (env.IWWZ_TOKEN) return env.IWWZ_TOKEN
  if (!env.IWWZ_EMAIL || !env.IWWZ_PASSWORD) return null
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.IWWZ_EMAIL, password: env.IWWZ_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Sign-in failed: HTTP ${res.status} from ${API}/api/auth/login`)
  return (await res.json()).token
}

function slug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

async function launch() {
  const channel = env.PW_CHANNEL ?? 'chrome'
  try {
    return await chromium.launch({ headless: true, channel: channel === 'chromium' ? undefined : channel })
  } catch (e) {
    throw new Error(`Could not start the "${channel}" browser (${e.message.split('\n')[0]}). ` +
      'Set PW_CHANNEL=msedge, or run `npx playwright install chromium` and set PW_CHANNEL=chromium.')
  }
}

async function main() {
  const token     = await getToken()
  const routes    = list(args.routes, (token ? APP_ROUTES : PUBLIC_ROUTES).join(','))
  const themes    = list(args.themes, 'light,dark')
  const viewports = expandViewports(list(args.viewports, 'desktop,mobile'))
  const checkA11y = args.a11y !== 'false'

  for (const t of themes)    if (!['light', 'dark'].includes(t)) throw new Error(`Unknown theme "${t}" (use light, dark)`)
  for (const v of viewports) if (!VIEWPORTS[v]) throw new Error(
    `Unknown viewport "${v}" (devices: ${Object.keys(VIEWPORTS).join(', ')}; groups: ${Object.keys(VIEWPORT_GROUPS).join(', ')})`)
  if (!token) console.log('No IWWZ_TOKEN or IWWZ_EMAIL/IWWZ_PASSWORD set: capturing public pages only.')

  await mkdir(OUT, { recursive: true })
  const browser  = await launch()
  const problems = []
  let label = ''

  try {
    for (const vp of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme, reducedMotion: 'reduce' })
        await context.addInitScript(({ token, theme }) => {
          try {
            localStorage.setItem('iwwz_theme', theme)
            localStorage.setItem('iwwz_onboarded', '1') // keep the one-time welcome banner out of the shots
            if (token) sessionStorage.setItem('token', token)
          } catch { /* storage blocked: shots still work, just unauthenticated */ }
        }, { token, theme })

        const page = await context.newPage()
        page.on('pageerror', e => problems.push(`${label}: page error: ${e.message}`))
        page.on('console', m => { if (m.type() === 'error') problems.push(`${label}: console error: ${m.text()}`) })

        for (const route of routes) {
          label = `${vp}/${theme} ${route}`
          await page.goto(BASE + route, { waitUntil: 'networkidle' })
          if (token && route !== '/login' && new URL(page.url()).pathname === '/login') {
            problems.push(`${label}: sent to /login, so the token was rejected or has expired`)
          }
          await page.addStyleTag({ content: NO_MOTION })
          await page.evaluate(() => document.fonts.ready)
          await page.waitForTimeout(250)

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          if (overflow > 1) problems.push(`${label}: content is ${overflow}px wider than the screen`)

          // Accessibility: axe-core against the real rendered page, so colour
          // contrast is checked in each theme. Serious and critical only.
          if (checkA11y) {
            await page.addScriptTag({ path: AXE_PATH })
            const violations = await page.evaluate(async () => {
              const { violations } = await window.axe.run(document, { resultTypes: ['violations'] })
              return violations.map(v => ({
                id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
                example: v.nodes[0]?.target?.join(' '),
              }))
            })
            for (const v of violations) {
              if (v.impact === 'serious' || v.impact === 'critical') {
                problems.push(`${label}: accessibility (${v.impact}) ${v.help} [${v.id}, ${v.count} element(s), e.g. ${v.example}]`)
              }
            }
          }

          const file = join(OUT, `${vp}-${theme}-${slug(route)}.png`)
          await page.screenshot({ path: file, fullPage: true })
          console.log(`saved ${file}`)
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`)
    for (const p of problems) console.log(`  - ${p}`)
    process.exitCode = 1
  } else {
    console.log(`\nNo page errors, console errors, sideways scrolling${checkA11y ? ' or serious accessibility problems' : ''} found.`)
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
