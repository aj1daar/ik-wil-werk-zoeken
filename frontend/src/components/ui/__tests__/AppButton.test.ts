import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppButton from '../AppButton.vue'

function mountBtn(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(AppButton, { props, slots: { default: slots.default ?? 'Click me' } })
}

// ── rendering ─────────────────────────────────────────────────────────────────

describe('AppButton – rendering', () => {
  it('renders a <button> element', () => {
    expect(mountBtn().find('button').exists()).toBe(true)
  })

  it('renders slot content', () => {
    const w = mountBtn({}, { default: 'Save changes' })
    expect(w.find('button').text()).toBe('Save changes')
  })

  it('defaults to type="button" to avoid accidental form submission', () => {
    expect(mountBtn().find('button').attributes('type')).toBe('button')
  })

  it('forwards type="submit" prop', () => {
    expect(mountBtn({ type: 'submit' }).find('button').attributes('type')).toBe('submit')
  })

  it('forwards type="reset" prop', () => {
    expect(mountBtn({ type: 'reset' }).find('button').attributes('type')).toBe('reset')
  })

  it('has the base app-btn class', () => {
    expect(mountBtn().find('button').classes()).toContain('app-btn')
  })

  it('forwards aria-label prop', () => {
    const w = mountBtn({ ariaLabel: 'Close dialog' })
    expect(w.find('button').attributes('aria-label')).toBe('Close dialog')
  })

  it('does not set aria-label when prop is absent', () => {
    expect(mountBtn().find('button').attributes('aria-label')).toBeUndefined()
  })
})

// ── variant classes ───────────────────────────────────────────────────────────

describe('AppButton – variant classes', () => {
  it('defaults to primary variant when variant prop is omitted', () => {
    expect(mountBtn().find('button').classes()).toContain('app-btn--primary')
  })

  it('applies app-btn--primary for variant="primary"', () => {
    expect(mountBtn({ variant: 'primary' }).find('button').classes()).toContain('app-btn--primary')
  })

  it('applies app-btn--secondary for variant="secondary"', () => {
    expect(mountBtn({ variant: 'secondary' }).find('button').classes()).toContain('app-btn--secondary')
  })

  it('applies app-btn--ghost for variant="ghost"', () => {
    expect(mountBtn({ variant: 'ghost' }).find('button').classes()).toContain('app-btn--ghost')
  })

  it('applies app-btn--icon for variant="icon"', () => {
    expect(mountBtn({ variant: 'icon' }).find('button').classes()).toContain('app-btn--icon')
  })

  it('applies app-btn--danger for variant="danger"', () => {
    expect(mountBtn({ variant: 'danger' }).find('button').classes()).toContain('app-btn--danger')
  })

  it('only has one variant class at a time', () => {
    const classes = mountBtn({ variant: 'ghost' }).find('button').classes()
    const variantClasses = classes.filter(c => c.startsWith('app-btn--'))
    expect(variantClasses).toHaveLength(1)
    expect(variantClasses[0]).toBe('app-btn--ghost')
  })
})

// ── disabled state ────────────────────────────────────────────────────────────

describe('AppButton – disabled state', () => {
  it('is not disabled by default', () => {
    expect((mountBtn().find('button').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('is disabled when disabled prop is true', () => {
    expect((mountBtn({ disabled: true }).find('button').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not fire click events when disabled', async () => {
    const handler = vi.fn()
    const w = mount(AppButton, {
      props: { disabled: true },
      slots: { default: 'Click' },
      attrs: { onClick: handler },
    })
    await w.find('button').trigger('click')
    expect(handler).not.toHaveBeenCalled()
  })
})

// ── click interaction ─────────────────────────────────────────────────────────

describe('AppButton – click interaction', () => {
  it('fires click events when enabled', async () => {
    const handler = vi.fn()
    const w = mount(AppButton, {
      slots: { default: 'Go' },
      attrs: { onClick: handler },
    })
    await w.find('button').trigger('click')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('fires click for every variant', async () => {
    const variants = ['primary', 'secondary', 'ghost', 'icon', 'danger'] as const
    for (const variant of variants) {
      const handler = vi.fn()
      const w = mount(AppButton, {
        props: { variant },
        slots: { default: variant },
        attrs: { onClick: handler },
      })
      await w.find('button').trigger('click')
      expect(handler).toHaveBeenCalledOnce()
    }
  })
})

// ── slot content ──────────────────────────────────────────────────────────────

describe('AppButton – slot content', () => {
  it('renders HTML slot content safely', () => {
    const w = mount(AppButton, { slots: { default: '<span>Label</span>' } })
    expect(w.find('button span').text()).toBe('Label')
  })

  it('renders empty when no slot is provided', () => {
    const w = mount(AppButton, { props: {} })
    expect(w.find('button').text()).toBe('')
  })
})
