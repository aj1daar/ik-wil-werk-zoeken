// Find layout inconsistencies a screenshot makes you squint for: the kind a
// reviewer spots on a real phone and asks "why is that arrow on its own line?"
//
//   pnpm audit:layout                              # every device, every state
//   pnpm audit:layout --viewports=iphone-se,desktop
//   pnpm audit:layout --only=companies             # states whose name contains this
//
// Needs `pnpm dev` and the API running. Walks the whole app, not one page:
// signed-out pages, every tab and filter, empty and error states, modals,
// dialogs, the phone menu, and the admin panel.
//
//   IWWZ_TOKEN, or IWWZ_EMAIL + IWWZ_PASSWORD   an account with realistic data
//        (around a hundred applications, so pagination shows "…"); admin
//        states run only if this account is an admin
//   IWWZ_EMPTY_EMAIL + IWWZ_EMPTY_PASSWORD      optional: an account with no
//        applications, for the empty states
//
// Measured in a real browser, per device and state:
//   orphan           a wrapped row that leaves one item alone on its last line
//   height-mismatch  controls side by side in one row at different heights
//   spills-out       an element poking past its parent's edge
//   clipped-text     text cut off with no ellipsis
//   glyph-icon       a character (‹ › × ✓ ★) standing in for an icon
// and across every page at once:
//   cross-page       the same kind of element (primary button, text input,
//                    page title, card, chip) drawn at different sizes on
//                    different pages
// Exits non-zero when it finds any, or when a state couldn't be reached.

import { chromium } from 'playwright-core'

const env  = process.env
const BASE = (env.IWWZ_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const API  = (env.IWWZ_API ?? 'http://localhost:7198').replace(/\/$/, '')
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v = 'true'] = a.replace(/^--/, '').split('='); return [k, v] }))

async function signIn(email, password) {
  const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) })
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: HTTP ${res.status}`)
  return (await res.json()).token
}
const roleOf = token => { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role } catch { return 'user' } }

const tokens = {
  public: null,
  user: env.IWWZ_TOKEN ?? (env.IWWZ_EMAIL && env.IWWZ_PASSWORD ? await signIn(env.IWWZ_EMAIL, env.IWWZ_PASSWORD) : undefined),
  empty: env.IWWZ_EMPTY_EMAIL && env.IWWZ_EMPTY_PASSWORD ? await signIn(env.IWWZ_EMPTY_EMAIL, env.IWWZ_EMPTY_PASSWORD) : undefined,
}
if (!tokens.user) throw new Error('Set IWWZ_TOKEN, or IWWZ_EMAIL and IWWZ_PASSWORD')
const isAdmin = roleOf(tokens.user) === 'admin'

const VIEWPORTS = {
  'iphone-15-pro-max': { width: 430, height: 932, mobile: true },
  'iphone-se':         { width: 375, height: 667, mobile: true },
  'galaxy-s24':        { width: 360, height: 780, mobile: true },
  'ipad-mini':         { width: 744, height: 1133, mobile: true },
  'desktop':           { width: 1440, height: 900, mobile: false },
}

// ── the app, state by state ──────────────────────────────────────────────────
const click = (p, sel) => p.locator(sel).first().click()
const byName = (p, role, name) => p.getByRole(role, { name }).first().click()
const phoneMenu = async p => { if (await p.locator('button[aria-label="Toggle navigation menu"]').isVisible()) await click(p, 'button[aria-label="Toggle navigation menu"]'); else throw new Error('SKIP') }
const openFirstApplication = p => click(p, 'button.row-open')
const openCompany = async (p, name) => { await p.fill('input[aria-label="Search companies"]', name); await p.waitForTimeout(300); await click(p, 'button.tile-name') }

const STATES = [
  // signed out
  { as: 'public', name: 'login', route: '/login' },
  { as: 'public', name: 'login+error', route: '/login', act: async p => { await p.fill('input[type=email]', 'nobody@example.com'); await p.fill('input[type=password]', 'wrong-password'); await p.keyboard.press('Enter'); await p.waitForTimeout(600) } },
  { as: 'public', name: 'register', route: '/register' },
  { as: 'public', name: 'register+error', route: '/register', act: async p => { await p.fill('input[type=email]', 'bad'); await p.keyboard.press('Enter') } },
  { as: 'public', name: 'forgot-password', route: '/forgot-password' },
  { as: 'public', name: 'forgot-password+sent', route: '/forgot-password', act: async p => { await p.fill('#fp-email', 'nobody@example.com'); await p.keyboard.press('Enter'); await p.waitForTimeout(600) } },
  { as: 'public', name: 'reset-password', route: '/reset-password?token=abc' },
  { as: 'public', name: 'reset-password+mismatch', route: '/reset-password?token=abc', act: async p => { await p.fill('#new-password', 'first-password'); await p.fill('#confirm-password', 'other-password'); await p.keyboard.press('Enter') } },
  { as: 'public', name: 'verify-email+no-token', route: '/verify-email' },
  { as: 'public', name: 'verify-email+expired', route: '/verify-email?token=expired' },
  { as: 'public', name: 'confirm-email-change+bad', route: '/confirm-email-change?token=bad' },

  // dashboard
  { as: 'user', name: 'home', route: '/' },
  { as: 'user', name: 'home+phone-menu', route: '/', act: phoneMenu },
  ...['Last week', 'Last month', 'Last 3 months', 'Last 6 months'].map(r => ({ as: 'user', name: `home+${r.toLowerCase().replace(/ /g, '-')}`, route: '/', act: p => byName(p, 'button', r) })),
  { as: 'user', name: 'home+custom-range', route: '/', act: p => byName(p, 'button', 'Custom') },

  // my applications
  { as: 'user', name: 'applications', route: '/applications' },
  { as: 'user', name: 'applications+filters', route: '/applications', act: p => click(p, '.btn-filter-toggle') },
  { as: 'user', name: 'applications+bulk', route: '/applications', act: async p => { await p.locator('.row-checkbox').nth(0).check(); await p.locator('.row-checkbox').nth(1).check() } },
  { as: 'user', name: 'applications+page5', route: '/applications', act: async p => { for (let i = 0; i < 4; i++) await byName(p, 'button', 'Next page') } },
  { as: 'user', name: 'applications+last-page', route: '/applications', act: async p => { await p.getByRole('button', { name: /^\d+$/ }).last().click() } },
  { as: 'user', name: 'applications+every-status-tab', route: '/applications', each: async p => {
      const n = await p.locator('.status-tab').count()
      return Array.from({ length: n }, (_, i) => async () => { await p.locator('.status-tab').nth(i).click() })
    } },
  { as: 'user', name: 'applications+no-results', route: '/applications', act: p => p.fill('input[aria-label="Search applications"]', 'zzzz no such company') },
  { as: 'user', name: 'applications+sort-company', route: '/applications', act: async p => { await click(p, '.btn-filter-toggle'); await p.locator('select').filter({ hasText: 'Newest first' }).first().selectOption('company') } },
  { as: 'user', name: 'new-application', route: '/applications', act: p => click(p, '.btn-new') },
  { as: 'user', name: 'new-application+errors', route: '/applications', act: async p => { await click(p, '.btn-new'); await byName(p, 'button', 'Add application') } },
  { as: 'user', name: 'new-application+locations', route: '/applications', act: async p => {
      await click(p, '.btn-new')
      const input = p.getByPlaceholder('Type city and press Enter…')
      for (const c of ['Amsterdam', 'Rotterdam', "'s-Hertogenbosch", 'Eindhoven', 'Utrecht']) { await input.fill(c); await input.press('Enter') }
    } },
  { as: 'user', name: 'new-application+discard', route: '/applications', act: async p => { await click(p, '.btn-new'); await p.fill('#company-name', 'Acme'); await byName(p, 'button', 'Cancel') } },
  { as: 'user', name: 'application-panel', route: '/applications', act: openFirstApplication },
  { as: 'user', name: 'application-panel+change-status', route: '/applications', act: async p => { await openFirstApplication(p); await click(p, '.sh-add-btn') } },
  { as: 'user', name: 'application-panel+activity', route: '/applications', act: async p => { await openFirstApplication(p); await click(p, '.history-toggle') } },
  { as: 'user', name: 'application-panel+delete', route: '/applications', act: async p => { await openFirstApplication(p); await p.locator('.modal-box .btn-danger').last().click() } },
  { as: 'user', name: 'application-panel+date-picker', route: '/applications', act: async p => { await openFirstApplication(p); const t = p.locator('.modal-box button.dp-trigger').first(); if (await t.count()) await t.click(); else throw new Error('SKIP') } },

  // companies
  { as: 'user', name: 'companies', route: '/companies' },
  { as: 'user', name: 'companies+filters', route: '/companies', act: p => click(p, '.btn-filter-toggle') },
  { as: 'user', name: 'companies+tags', route: '/companies', act: p => byName(p, 'button', /Tags/) },
  { as: 'user', name: 'companies+tag-included', route: '/companies', act: async p => { await byName(p, 'button', /Tags/); await click(p, '.tag-toggle') } },
  { as: 'user', name: 'companies+tag-excluded', route: '/companies', act: async p => { await byName(p, 'button', /Tags/); await click(p, '.tag-toggle'); await click(p, '.tag-toggle') } },
  { as: 'user', name: 'companies+deep-page', route: '/companies', act: async p => { await p.getByRole('button', { name: /^\d+$/ }).last().click(); for (let i = 0; i < 3; i++) await byName(p, 'button', 'Previous page') } },
  { as: 'user', name: 'companies+no-results', route: '/companies', act: p => p.fill('input[aria-label="Search companies"]', 'zzzz no such company') },
  { as: 'user', name: 'companies+interested-only', route: '/companies', act: p => p.selectOption('select[aria-label="List view"]', 'interested') },
  { as: 'user', name: 'company-modal', route: '/companies', act: p => click(p, 'button.tile-name') },
  { as: 'user', name: 'company-modal+details', route: '/companies', act: p => openCompany(p, '1 Cube') },
  { as: 'user', name: 'company-modal+edit', route: '/companies', admin: true, act: async p => { await openCompany(p, '1 Cube'); await byName(p, 'button', 'Edit') } },

  // profile and admin
  { as: 'user', name: 'profile', route: '/profile' },
  { as: 'user', name: 'profile+password-mismatch', route: '/profile', act: async p => { await p.fill('#cur-pw', 'old-password'); await p.fill('#new-pw', 'first-password'); await p.fill('#conf-pw', 'other-password'); await p.locator('#conf-pw').press('Enter') } },
  { as: 'user', name: 'profile+delete-confirm', route: '/profile', act: p => byName(p, 'button', 'Delete my account') },
  { as: 'user', name: 'admin', route: '/admin', admin: true },

  // an account with nothing in it yet
  { as: 'empty', name: 'empty:home', route: '/' },
  { as: 'empty', name: 'empty:applications', route: '/applications' },
  { as: 'empty', name: 'empty:companies-interested', route: '/companies', act: p => p.selectOption('select[aria-label="List view"]', 'interested') },
]

// ── the measurements ─────────────────────────────────────────────────────────
function measure() {
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const sig = el => {
    const part = e => e.tagName.toLowerCase() + [...e.classList].filter(c => !/^(router-link|v-|data-)/.test(c)).slice(0, 2).map(c => '.' + c).join('')
    return (el.parentElement ? part(el.parentElement) + ' > ' : '') + part(el)
  }
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28)
  const out = []

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const cs = getComputedStyle(el)
    const kids = [...el.children].filter(k => visible(k) && !['absolute', 'fixed'].includes(getComputedStyle(k).position))

    // orphan: a wrapped row whose last line holds one item under a fuller line.
    // A line is the band of items whose vertical middles overlap, so a short
    // "…" centred beside tall buttons still counts as the same line.
    if (cs.display.includes('flex') && cs.flexWrap === 'wrap' && cs.flexDirection.startsWith('row') && kids.length >= 3) {
      const lines = []
      for (const k of kids) {
        const r = k.getBoundingClientRect(), mid = (r.top + r.bottom) / 2
        const line = lines.find(l => mid >= l.top && mid <= l.bottom)
        if (line) { line.items.push(k); line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom) }
        else lines.push({ top: r.top, bottom: r.bottom, items: [k] })
      }
      lines.sort((a, b) => a.top - b.top)
      if (lines.length > 1) {
        const last = lines[lines.length - 1], prev = lines[lines.length - 2]
        const lone = last.items[0]
        // Not orphans: a free-flowing cloud of chips or tags (any wrap leaves
        // some last line), an item that fills the row on purpose, and the
        // follow-up badge that takes its own line on phones by design
        const chipCloud = kids.every(k => /chip|tag/.test(k.className))
        const fullRow = lone.getBoundingClientRect().width >= el.clientWidth * 0.9
        if (last.items.length === 1 && prev.items.length >= 3 && !chipCloud && !fullRow && !lone.classList.contains('followup-badge'))
          out.push({ kind: 'orphan', sig: sig(el), detail: `"${label(last.items[0]) || sig(last.items[0])}" alone on line ${lines.length} (line above has ${prev.items.length})` })
      }
    }

    // height-mismatch: controls side by side in one row at different heights
    if ((cs.display.includes('flex') && cs.flexDirection.startsWith('row')) || cs.display.includes('grid')) {
      const controls = kids.filter(k => k.matches('button, a.btn-primary, a.btn-ghost, a.btn-secondary, input:not([type=checkbox]):not([type=radio]), select, .status-tab, .page-btn, .range-btn, .btn-filter-toggle'))
      const rows = []
      for (const k of controls) {
        const r = k.getBoundingClientRect(), mid = (r.top + r.bottom) / 2
        const row = rows.find(x => mid >= x.top && mid <= x.bottom)
        if (row) { row.items.push([k, r]); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom) }
        else rows.push({ top: r.top, bottom: r.bottom, items: [[k, r]] })
      }
      for (const row of rows) {
        if (row.items.length < 2) continue
        const hs = row.items.map(([, r]) => Math.round(r.height))
        if (Math.max(...hs) - Math.min(...hs) > 2)
          out.push({ kind: 'height-mismatch', sig: sig(el), detail: row.items.map(([k, r]) => `${label(k) || k.tagName}=${Math.round(r.height)}`).join(', ') })
      }
    }

    // clipped-text: text cut off without an ellipsis (screen-reader text is
    // clipped on purpose)
    if (el.children.length === 0 && !el.classList.contains('sr-only') && el.textContent.trim()
        && (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis')
      out.push({ kind: 'clipped-text', sig: sig(el), detail: `"${label(el)}" ${el.scrollWidth}px in ${el.clientWidth}px` })

    // spills-out: a child past its parent's right edge, outside scroll areas
    const p = el.parentElement
    if (p && p !== document.body && !['absolute', 'fixed'].includes(cs.position)) {
      let anc = p, inScroller = false
      while (anc && !inScroller) { if (/(auto|scroll)/.test(getComputedStyle(anc).overflowX)) inScroller = true; anc = anc.parentElement }
      if (!inScroller) {
        const spill = Math.round(el.getBoundingClientRect().right - p.getBoundingClientRect().right)
        if (spill > 2 && p.getBoundingClientRect().width > 0) out.push({ kind: 'spills-out', sig: sig(el), detail: `${spill}px past ${sig(p)}` })
      }
    }
  }

  // glyph-icon: a lone character standing in for an icon
  for (const el of document.querySelectorAll('button, a, span')) {
    if (el.children.length === 0 && /^[‹›«»←→↑↓✓✔★☆✕×▾▸]$/.test(el.textContent.trim()) && visible(el))
      out.push({ kind: 'glyph-icon', sig: sig(el), detail: `"${el.textContent.trim()}" (${label(el)})` })
  }
  return out
}

// The same kind of thing should look the same wherever it appears. Each kind
// is sampled on every page, and a kind drawn more than one way is reported
// with where each variant lives.
function sampleKinds() {
  const KINDS = {
    // Sign-in and register use a larger form on purpose: its own kinds
    'primary button':   '.btn-primary',
    'auth button':      '.btn-submit',
    'secondary button': '.btn-secondary, .btn-ghost:not(.nav-signout):not(.nav-admin), .btn-list',
    'danger button':    '.btn-danger',
    'text input':       'input.field-input:not([type=checkbox]), input.filter-input, .dp-trigger',
    'auth input':       'input.auth-input',
    'select':           'select.field-input, select.filter-input',
    // "Next up" is the board's headline, meant to be bigger than a page title
    'page title':       'h1:not(.board-title)',
    'section title':    '.card-title, .section-title, .chart-title, .st-title',
    'card':             '.card, .admin-card, .skeleton-card, .reasons-wrap, .area-wrap',
    // The sign-in card floats on the bare page, so it keeps its island shadow
    'auth card':        '.auth-card',
    'status chip':      '.chip:not(.chip--sm), .status-chip:not(.chip--sm)',
    'small chip':       '.chip--sm',
  }
  const out = []
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  for (const [kind, sel] of Object.entries(KINDS)) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) || el.closest('.loading-region, [aria-hidden="true"]')) continue
      const cs = getComputedStyle(el), r = el.getBoundingClientRect()
      const radius = cs.borderTopLeftRadius
      const fp = kind.endsWith('card')
        ? `radius ${radius}, border ${cs.borderTopWidth} ${cs.borderTopStyle}, ${cs.boxShadow === 'none' ? 'flat' : 'shadow'}`
        : kind.includes('title')
          ? `${cs.fontSize} / ${cs.fontWeight}`
          : `height ${Math.round(r.height)}px, text ${cs.fontSize} / ${cs.fontWeight}, radius ${radius}`
      const cls = [...el.classList].slice(0, 2).map(c => '.' + c).join('') || el.tagName.toLowerCase()
      out.push({ kind, fp, example: `${cls} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 22)}"` })
    }
  }
  return out
}

// ── run ──────────────────────────────────────────────────────────────────────
const wanted = args.viewports ? args.viewports.split(',') : Object.keys(VIEWPORTS)
for (const v of wanted) if (!VIEWPORTS[v]) throw new Error(`Unknown viewport "${v}" (use ${Object.keys(VIEWPORTS).join(', ')})`)
const states = STATES.filter(s => (!args.only || s.name.includes(args.only)) && (!s.admin || isAdmin) && (s.as !== 'empty' || tokens.empty))

const channel = env.PW_CHANNEL ?? 'chrome'
const browser = await chromium.launch({ headless: true, channel: channel === 'chromium' ? undefined : channel })
const findings = new Map()
const kinds = new Map()   // `${viewport}|${kind}` -> Map(fingerprint -> { states, examples })
const unreachable = []
let visited = 0

for (const vpName of wanted) {
  const v = VIEWPORTS[vpName]
  const pages = {}
  for (const as of ['public', 'user', 'empty']) {
    if (as !== 'public' && !tokens[as]) continue
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, reducedMotion: 'reduce' })
    if (tokens[as]) await ctx.addInitScript(t => sessionStorage.setItem('token', t), tokens[as])
    pages[as] = await ctx.newPage()
  }

  const sample = async (page, stateName) => {
    for (const { kind, fp, example } of await page.evaluate(sampleKinds)) {
      const key = `${vpName}|${kind}`
      if (!kinds.has(key)) kinds.set(key, new Map())
      const variants = kinds.get(key)
      if (!variants.has(fp)) variants.set(fp, { states: new Set(), examples: new Set() })
      const v = variants.get(fp)
      v.states.add(stateName)
      if (v.examples.size < 2) v.examples.add(example)
    }
  }

  const record = (stateName, list) => {
    visited++
    for (const f of list) {
      const key = `${f.kind}|${f.sig}`
      if (!findings.has(key)) findings.set(key, { ...f, where: new Set(), examples: new Set() })
      const e = findings.get(key)
      e.where.add(`${vpName}:${stateName}`)
      if (e.examples.size < 2) e.examples.add(f.detail)
    }
  }

  for (const s of states) {
    const page = pages[s.as]
    try {
      await page.goto(BASE + s.route, { waitUntil: 'networkidle' })
      if (s.each) {
        const steps = await s.each(page)
        for (const [i, step] of steps.entries()) { await step(); await page.waitForTimeout(250); record(`${s.name}#${i + 1}`, await page.evaluate(measure)); await sample(page, `${s.name}#${i + 1}`) }
      } else {
        if (s.act) { await s.act(page); await page.waitForTimeout(350) }
        record(s.name, await page.evaluate(measure))
        await sample(page, s.name)
      }
    } catch (e) {
      if (!String(e).includes('SKIP')) unreachable.push(`${vpName}:${s.name} — ${String(e).split('\n')[0].slice(0, 120)}`)
    }
  }
  for (const pg of Object.values(pages)) await pg.context().close()
}
await browser.close()

console.log(`Checked ${visited} screens: ${states.length} states on ${wanted.length} devices.`)
const order = ['orphan', 'height-mismatch', 'spills-out', 'clipped-text', 'glyph-icon']
for (const kind of order) {
  const items = [...findings.values()].filter(f => f.kind === kind)
  if (!items.length) continue
  console.log(`\n## ${kind} (${items.length})`)
  for (const f of items) {
    const w = [...f.where]
    console.log(`- ${f.sig}\n    ${[...f.examples].join(' | ')}\n    at ${w.slice(0, 4).join(', ')}${w.length > 4 ? ` +${w.length - 4}` : ''}`)
  }
}
const crossPage = [...kinds.entries()].filter(([, variants]) => variants.size > 1)
if (crossPage.length) {
  console.log(`\n## cross-page (${crossPage.length})`)
  for (const [key, variants] of crossPage) {
    const [vp, kind] = key.split('|')
    console.log(`- ${kind} on ${vp}: ${variants.size} variants`)
    for (const [fp, v] of [...variants.entries()].sort((a, b) => b[1].states.size - a[1].states.size)) {
      const st = [...v.states]
      console.log(`    ${fp}  | ${[...v.examples].join(', ')}  | at ${st.slice(0, 3).join(', ')}${st.length > 3 ? ` +${st.length - 3}` : ''}`)
    }
  }
}
if (unreachable.length) {
  console.log(`\n## could not reach (${unreachable.length})`)
  for (const u of unreachable) console.log(`- ${u}`)
}
if (findings.size === 0 && unreachable.length === 0 && crossPage.length === 0) console.log('\nNo layout inconsistencies found.')
else process.exitCode = 1
