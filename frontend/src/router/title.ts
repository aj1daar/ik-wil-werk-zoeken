export const APP_NAME = 'ik wil werk zoeken'

// Browser tab title: the page first (so it survives tab truncation), then the app.
export function pageTitle(page?: string): string {
  const p = page?.trim()
  return p ? `${p} | ${APP_NAME}` : APP_NAME
}
