// Renders the app's logo mark into the PNG sizes Chrome asks for. The mark lives
// in one place (frontend/public/favicon.svg), so the toolbar icon can never drift
// from the one in the tab.
//
// Run from extension/: node scripts/icons.mjs
// Uses the same browser as the frontend screenshot run; PW_CHANNEL applies here too.
import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here   = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../frontend/public/favicon.svg')
const outDir = resolve(here, '../public/icons')
const SIZES  = [16, 32, 48, 128]

async function launch() {
  const channel = process.env.PW_CHANNEL ?? 'chrome'
  try {
    return await chromium.launch({ headless: true, channel: channel === 'chromium' ? undefined : channel })
  } catch (e) {
    throw new Error(`Could not start the "${channel}" browser (${e.message.split('\n')[0]}). ` +
      'Set PW_CHANNEL=msedge, or run `npx playwright install chromium` and set PW_CHANNEL=chromium.')
  }
}

const svg = await readFile(source, 'utf8')
await mkdir(outDir, { recursive: true })

const browser = await launch()
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    // A transparent page so the mark's own rounded corners stay rounded rather
    // than sitting on a white square.
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}` +
      `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
    const png = await page.screenshot({ omitBackground: true })
    await writeFile(resolve(outDir, `icon-${size}.png`), png)
    await page.close()
    console.log(`icon-${size}.png`)
  }
} finally {
  await browser.close()
}
