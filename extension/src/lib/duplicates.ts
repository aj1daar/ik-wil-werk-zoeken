import type { ApplicationSummary } from './api'

// A finished application is no reason to warn about a new one: the same four
// statuses the app treats as closed in NewApplicationModal.
const TERMINAL = new Set(['Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])

/**
 * An open application at the same company, if there is one. Matched on the
 * sponsor id when the company came from the register, and on the name otherwise,
 * so a typed name still finds the row saved from the dropdown.
 *
 * Two roles at one company is normal, so this only ever warns.
 */
export function findOpenApplication(
  applications: readonly ApplicationSummary[],
  companyName: string,
  sponsorCompanyId?: string,
): ApplicationSummary | null {
  const open = applications.filter(a => !TERMINAL.has(a.status))

  if (sponsorCompanyId) {
    const bySponsor = open.find(a => a.sponsorCompanyId === sponsorCompanyId)
    if (bySponsor) return bySponsor
  }

  const name = companyName.trim().toLowerCase()
  if (name.length === 0) return null
  return open.find(a => a.companyName.trim().toLowerCase() === name) ?? null
}
