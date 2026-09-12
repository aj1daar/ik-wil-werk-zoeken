import { mount, flushPromises } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPasswordView from '../ForgotPasswordView.vue'

vi.mock('../../../api', () => ({ api: { forgotPassword: vi.fn() } }))

import { api } from '../../../api'

type Wrapper = ReturnType<typeof mount>

function mountView() {
  return mount(ForgotPasswordView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

async function submit(wrapper: Wrapper, email: string) {
  await wrapper.find('#fp-email').setValue(email)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())

describe('ForgotPasswordView – asking for a link', () => {
  it('normalises the address before sending it', async () => {
    vi.mocked(api.forgotPassword).mockResolvedValue(undefined as never)
    const wrapper = mountView()
    await submit(wrapper, '  SOMEONE@Example.COM  ')
    expect(api.forgotPassword).toHaveBeenCalledWith('someone@example.com')
  })

  it('does nothing at all on an empty address', async () => {
    const wrapper = mountView()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.forgotPassword).not.toHaveBeenCalled()
  })

  it('keeps the submit button out of reach until something is typed', async () => {
    const wrapper = mountView()
    const button = () => wrapper.find('button[type="submit"]')
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('#fp-email').setValue('someone@example.com')
    expect(button().attributes('disabled')).toBeUndefined()
  })
})

describe('ForgotPasswordView – after submitting', () => {
  it('gives away nothing about whether the account exists', async () => {
    vi.mocked(api.forgotPassword).mockResolvedValue(undefined as never)
    const wrapper = mountView()
    await submit(wrapper, 'someone@example.com')

    const text = wrapper.text()
    expect(text).toContain('Check your email')
    expect(text).toContain('If an account with')
    expect(text).toContain('someone@example.com')
    expect(text).toContain('The link expires in 1 hour.')
  })

  it('replaces the form, so the same address cannot be hammered', async () => {
    vi.mocked(api.forgotPassword).mockResolvedValue(undefined as never)
    const wrapper = mountView()
    await submit(wrapper, 'someone@example.com')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows the API error and keeps the form when the request fails', async () => {
    vi.mocked(api.forgotPassword).mockRejectedValue(new Error('Too many requests. Try again later.'))
    const wrapper = mountView()
    await submit(wrapper, 'someone@example.com')

    const error = wrapper.find('.auth-error')
    expect(error.text()).toBe('Too many requests. Try again later.')
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('#fp-email').attributes('aria-invalid')).toBe('true')
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    vi.mocked(api.forgotPassword).mockRejectedValue('nope')
    const wrapper = mountView()
    await submit(wrapper, 'someone@example.com')
    expect(wrapper.find('.auth-error').text()).toBe('Something went wrong. Please try again.')
  })

  it('clears an earlier error on the next attempt', async () => {
    vi.mocked(api.forgotPassword).mockRejectedValueOnce(new Error('Too many requests. Try again later.'))
    const wrapper = mountView()
    await submit(wrapper, 'someone@example.com')
    expect(wrapper.find('.auth-error').exists()).toBe(true)

    vi.mocked(api.forgotPassword).mockResolvedValue(undefined as never)
    await submit(wrapper, 'someone@example.com')
    expect(wrapper.find('.auth-error').exists()).toBe(false)
  })
})
