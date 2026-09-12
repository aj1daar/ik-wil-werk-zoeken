import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProfileView from '../ProfileView.vue'
import { useAuthStore } from '../../../stores/auth'

vi.mock('../../../api', () => ({
  api: {
    updateProfile:  vi.fn(),
    changePassword: vi.fn(),
    changeEmail:    vi.fn(),
    deleteAccount:  vi.fn(),
  },
}))

import { api } from '../../../api'

const USER = {
  userId: 'u1',
  email: 'someone@example.com',
  firstName: 'Jan',
  lastName: 'de Vries',
  role: 'user',
  preferences: { targetRole: 'Frontend Engineer', location: 'Amsterdam', workType: 'hybrid' },
}

type Wrapper = ReturnType<typeof mount>

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
    ],
  })
}

async function mountView(user: Record<string, unknown> | null = USER) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'token'
  auth.user = user as never
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(ProfileView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, auth }
}

const setValue = (wrapper: Wrapper, selector: string, value: string) =>
  wrapper.find(selector).setValue(value)

const valueOf = (wrapper: Wrapper, selector: string) =>
  (wrapper.find(selector).element as HTMLInputElement).value

beforeEach(() => vi.clearAllMocks())

// ── what it shows ────────────────────────────────────────────────────────────

describe('ProfileView – rendering', () => {
  it('names the signed-in account', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('.profile-notice').text()).toContain('someone@example.com')
  })

  it('fills the form from the stored profile', async () => {
    const { wrapper } = await mountView()
    expect(valueOf(wrapper, '#p-firstName')).toBe('Jan')
    expect(valueOf(wrapper, '#p-lastName')).toBe('de Vries')
    expect(valueOf(wrapper, '#p-role')).toBe('Frontend Engineer')
    expect(valueOf(wrapper, '#p-loc')).toBe('Amsterdam')
    expect((wrapper.find('#p-work').element as HTMLSelectElement).value).toBe('hybrid')
  })

  it('renders with no user at all rather than throwing', async () => {
    const { wrapper } = await mountView(null)
    expect(valueOf(wrapper, '#p-firstName')).toBe('')
    expect((wrapper.find('#p-work').element as HTMLSelectElement).value).toBe('any')
  })
})

// ── personal information ─────────────────────────────────────────────────────

describe('ProfileView – saving the profile', () => {
  it('trims what it sends and reports success', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue({ ...USER } as never)
    const { wrapper } = await mountView()

    await setValue(wrapper, '#p-firstName', '  Janneke  ')
    await setValue(wrapper, '#p-role', '  Vue Developer  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({
      firstName: 'Janneke',
      lastName: 'de Vries',
      preferences: { targetRole: 'Vue Developer', location: 'Amsterdam', workType: 'hybrid' },
    })
    expect(wrapper.text()).toContain('Profile saved.')
  })

  it('shows what went wrong when the save fails', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue(new Error('Name fields must not exceed 100 characters'))
    const { wrapper } = await mountView()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Name fields must not exceed 100 characters')
    expect(wrapper.text()).not.toContain('Profile saved.')
  })
})

// ── password ─────────────────────────────────────────────────────────────────

describe('ProfileView – changing the password', () => {
  async function submitPassword(wrapper: Wrapper, current: string, next: string, confirm: string) {
    await setValue(wrapper, '#cur-pw', current)
    await setValue(wrapper, '#new-pw', next)
    await setValue(wrapper, '#conf-pw', confirm)
    await wrapper.findAll('form')[1].trigger('submit')
    await flushPromises()
  }

  it('refuses a mismatched confirmation without calling the API', async () => {
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'old-password', 'new-password-1', 'new-password-2')
    expect(api.changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Passwords do not match.')
  })

  it('refuses a password under 8 characters without calling the API', async () => {
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'old-password', 'short7!', 'short7!')
    expect(api.changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Password must be at least 8 characters.')
  })

  it('accepts exactly 8 characters', async () => {
    vi.mocked(api.changePassword).mockResolvedValue(undefined as never)
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'old-password', '12345678', '12345678')
    expect(api.changePassword).toHaveBeenCalledWith('old-password', '12345678')
  })

  it('clears all three fields after a successful change', async () => {
    vi.mocked(api.changePassword).mockResolvedValue(undefined as never)
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'old-password', 'new-password', 'new-password')

    expect(wrapper.text()).toContain('Password updated.')
    expect(valueOf(wrapper, '#cur-pw')).toBe('')
    expect(valueOf(wrapper, '#new-pw')).toBe('')
    expect(valueOf(wrapper, '#conf-pw')).toBe('')
  })

  it('keeps what was typed when the API rejects it', async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new Error('Current password is incorrect'))
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'wrong-password', 'new-password', 'new-password')

    expect(wrapper.text()).toContain('Current password is incorrect')
    expect(valueOf(wrapper, '#cur-pw')).toBe('wrong-password')
  })

  it('does not write the new password into the markup', async () => {
    vi.mocked(api.changePassword).mockResolvedValue(undefined as never)
    const { wrapper } = await mountView()
    await submitPassword(wrapper, 'old-password', 'hunter2-hunter2', 'hunter2-hunter2')
    expect(wrapper.html()).not.toContain('hunter2-hunter2')
  })
})

// ── email address ────────────────────────────────────────────────────────────

describe('ProfileView – changing the email address', () => {
  async function submitEmail(wrapper: Wrapper, email: string, password = 'old-password') {
    await setValue(wrapper, '#em-new', email)
    await setValue(wrapper, '#em-pw', password)
    await wrapper.findAll('form')[2].trigger('submit')
    await flushPromises()
  }

  const REFUSED = ['not-an-email', 'missing@dot', 'two@@example.com', '   ', 'spaces in@example.com']

  it.each(REFUSED)('refuses %s without calling the API', async email => {
    const { wrapper } = await mountView()
    await submitEmail(wrapper, email)
    expect(api.changeEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Please enter a valid email address.')
  })

  it('trims and lowercases the address before sending it', async () => {
    vi.mocked(api.changeEmail).mockResolvedValue(undefined as never)
    const { wrapper } = await mountView()
    await submitEmail(wrapper, '  NEW@Example.COM  ')
    expect(api.changeEmail).toHaveBeenCalledWith('old-password', 'new@example.com')
  })

  it('names the address the link went to and clears the form', async () => {
    vi.mocked(api.changeEmail).mockResolvedValue(undefined as never)
    const { wrapper } = await mountView()
    await submitEmail(wrapper, 'new@example.com')

    expect(wrapper.text()).toContain('A confirmation link has been sent to new@example.com')
    expect(valueOf(wrapper, '#em-new')).toBe('')
    expect(valueOf(wrapper, '#em-pw')).toBe('')
  })

  it('reports an API refusal and keeps the form as it was', async () => {
    vi.mocked(api.changeEmail).mockRejectedValue(new Error('An account with this email already exists'))
    const { wrapper } = await mountView()
    await submitEmail(wrapper, 'taken@example.com')

    expect(wrapper.text()).toContain('An account with this email already exists')
    expect(valueOf(wrapper, '#em-new')).toBe('taken@example.com')
  })

  it('cannot be submitted until both fields are filled', async () => {
    const { wrapper } = await mountView()
    const button = () => wrapper.findAll('form')[2].find('button[type="submit"]')
    expect(button().attributes('disabled')).toBeDefined()

    await setValue(wrapper, '#em-new', 'new@example.com')
    expect(button().attributes('disabled')).toBeDefined()

    await setValue(wrapper, '#em-pw', 'old-password')
    expect(button().attributes('disabled')).toBeUndefined()
  })
})

// ── deleting the account ─────────────────────────────────────────────────────

describe('ProfileView – deleting the account', () => {
  const dangerButton = (wrapper: Wrapper, startsWith: string) =>
    wrapper.findAll('.danger-zone button').find(b => b.text().startsWith(startsWith))!

  it('asks for confirmation before deleting anything', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('.delete-confirm').exists()).toBe(false)

    await dangerButton(wrapper, 'Delete my account').trigger('click')

    expect(wrapper.find('.delete-confirm').exists()).toBe(true)
    expect(api.deleteAccount).not.toHaveBeenCalled()
  })

  it('backs out again on Cancel', async () => {
    const { wrapper } = await mountView()
    await dangerButton(wrapper, 'Delete my account').trigger('click')
    await dangerButton(wrapper, 'Cancel').trigger('click')

    expect(wrapper.find('.delete-confirm').exists()).toBe(false)
    expect(api.deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes and sends the user to the sign-in page', async () => {
    vi.mocked(api.deleteAccount).mockResolvedValue(undefined as never)
    const { wrapper, router } = await mountView()

    await dangerButton(wrapper, 'Delete my account').trigger('click')
    await dangerButton(wrapper, 'Yes, delete').trigger('click')
    await flushPromises()

    expect(api.deleteAccount).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('stays put and says why when the delete fails', async () => {
    vi.mocked(api.deleteAccount).mockRejectedValue(new Error('Could not delete account'))
    const { wrapper, router } = await mountView()

    await dangerButton(wrapper, 'Delete my account').trigger('click')
    await dangerButton(wrapper, 'Yes, delete').trigger('click')
    await flushPromises()

    expect(wrapper.find('.danger-error').text()).toBe('Could not delete account')
    expect(wrapper.find('.danger-error').attributes('role')).toBe('alert')
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('.delete-confirm').exists()).toBe(false)
  })
})
