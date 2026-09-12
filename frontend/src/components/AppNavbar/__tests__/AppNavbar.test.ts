import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import AppNavbar from '../AppNavbar.vue'
import { useApplicationsStore } from '../../../stores/applications'
import type { Application, ApplicationStatus } from '../../../api'

function makeApp(id: string, status: ApplicationStatus): Application {
  return {
    id, userId: 'u1', companyName: 'Acme', position: 'Engineer', appliedAt: '2026-01-01T00:00:00Z',
    status, locations: [], updatedAt: '2026-01-01T00:00:00Z',
  }
}

async function mountNav(statuses: ApplicationStatus[]) {
  setActivePinia(createPinia())
  useApplicationsStore().applications = statuses.map((s, i) => makeApp(`a${i}`, s))
  const blank = { template: '<div/>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/applications', '/companies', '/profile', '/login', '/admin'].map(path => ({ path, component: blank })),
  })
  await router.push('/')
  await router.isReady()
  const w = mount(AppNavbar, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

const appsLink = (w: Awaited<ReturnType<typeof mountNav>>) =>
  w.findAll('.nav-link').find(l => l.text().startsWith('My applications'))!

describe('AppNavbar – open applications badge', () => {
  beforeEach(() => sessionStorage.clear())

  it('labels the nav item in sentence case', async () => {
    const w = await mountNav([])
    expect(appsLink(w).exists()).toBe(true)
    expect(w.text()).not.toContain('My Applications')
  })

  it('counts only open applications', async () => {
    const w = await mountNav(['Applied', 'InterviewScheduled', 'OnHold', 'Rejected', 'Withdrawn', 'Accepted', 'Ghosted'])
    expect(appsLink(w).find('.nav-badge').text()).toBe('3')
  })

  it('hides the bare number from screen readers and says what it counts instead', async () => {
    const w = await mountNav(['Applied', 'Assessment'])
    const link = appsLink(w)
    expect(link.find('.nav-badge').attributes('aria-hidden')).toBe('true')
    expect(link.find('.sr-only').text()).toBe('(2 open)')
  })

  it('gives sighted users the same meaning on hover', async () => {
    const w = await mountNav(['Applied'])
    expect(appsLink(w).find('.nav-badge').attributes('title')).toBe('1 open applications')
  })

  it('shows no badge and no hidden text when nothing is open', async () => {
    const w = await mountNav(['Rejected', 'Ghosted'])
    expect(appsLink(w).find('.nav-badge').exists()).toBe(false)
    expect(appsLink(w).find('.sr-only').exists()).toBe(false)
  })
})
