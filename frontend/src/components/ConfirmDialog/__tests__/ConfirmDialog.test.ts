import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ConfirmDialog from '../ConfirmDialog.vue'

// Teleported to body, so assertions read the document rather than the wrapper
function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    props: { message: 'This cannot be undone.', ...props },
    attachTo: document.body,
  })
}

const dialog = () => document.querySelector('.cd-dialog')!
const press  = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

afterEach(() => { document.body.innerHTML = '' })

describe('ConfirmDialog – rendering', () => {
  it('shows the message and the default title and labels', () => {
    mountDialog()
    expect(document.querySelector('.cd-message')!.textContent).toBe('This cannot be undone.')
    expect(document.querySelector('.cd-title')!.textContent).toBe('Are you sure?')
    expect(document.querySelector('.cd-cancel')!.textContent).toBe('Cancel')
    expect(document.querySelector('.cd-confirm')!.textContent).toBe('OK')
  })

  it('uses the labels it is given', () => {
    mountDialog({ title: 'Delete account', confirmLabel: 'Delete it', cancelLabel: 'Keep it' })
    expect(document.querySelector('.cd-title')!.textContent).toBe('Delete account')
    expect(document.querySelector('.cd-confirm')!.textContent).toBe('Delete it')
    expect(document.querySelector('.cd-cancel')!.textContent).toBe('Keep it')
  })

  it('puts the destructive class on the confirm button when asked', () => {
    mountDialog({ confirmClass: 'btn-danger' })
    expect(document.querySelector('.cd-confirm')!.className).toContain('btn-danger')
  })

  it('renders an empty message without crashing', () => {
    mountDialog({ message: '' })
    expect(document.querySelector('.cd-message')!.textContent).toBe('')
  })

  it('escapes markup in the message instead of rendering it', () => {
    mountDialog({ message: '<img src=x onerror="alert(1)">' })
    const message = document.querySelector('.cd-message')!
    expect(message.querySelector('img')).toBeNull()
    expect(message.textContent).toBe('<img src=x onerror="alert(1)">')
  })
})

describe('ConfirmDialog – accessibility', () => {
  it('is an alertdialog that names its own title and message', () => {
    mountDialog()
    expect(dialog().getAttribute('role')).toBe('alertdialog')
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(dialog().getAttribute('aria-labelledby')).toBe('cd-title')
    expect(dialog().getAttribute('aria-describedby')).toBe('cd-msg')
    expect(document.querySelector('.cd-title')!.id).toBe('cd-title')
    expect(document.querySelector('#cd-msg')).not.toBeNull()
  })
})

describe('ConfirmDialog – answering', () => {
  let wrapper: ReturnType<typeof mountDialog>
  beforeEach(() => { wrapper = mountDialog() })

  it('confirms when the confirm button is clicked', async () => {
    ;(document.querySelector('.cd-confirm') as HTMLElement).click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('cancels when the cancel button is clicked', async () => {
    ;(document.querySelector('.cd-cancel') as HTMLElement).click()
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('cancels on Escape', () => {
    press('Escape')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('ignores other keys', () => {
    press('Enter')
    press('a')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('stops listening for Escape once it is gone', () => {
    wrapper.unmount()
    press('Escape')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('cancels when the backdrop itself is pressed', async () => {
    const backdrop = document.querySelector('.cd-backdrop') as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not cancel when the press starts inside the dialog', async () => {
    dialog().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })
})
