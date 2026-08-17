import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useBodyScrollLock } from '../useBodyScrollLock'

function mountAlwaysLocked() {
  const C = defineComponent({
    setup() {
      useBodyScrollLock()
      return () => null
    },
  })
  return mount(C)
}

function mountToggleable(initial: boolean) {
  const isOpen = ref(initial)
  const C = defineComponent({
    setup() {
      useBodyScrollLock(() => isOpen.value)
      return () => null
    },
  })
  return { wrapper: mount(C), isOpen }
}

describe('useBodyScrollLock', () => {
  it('locks body scroll while the component is mounted', () => {
    const w = mountAlwaysLocked()
    expect(document.body.style.overflow).toBe('hidden')
    w.unmount()
  })

  it('restores the previous overflow value on unmount', () => {
    document.body.style.overflow = 'auto'
    const w = mountAlwaysLocked()
    expect(document.body.style.overflow).toBe('hidden')
    w.unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('does not lock when the source getter starts false', () => {
    const { wrapper } = mountToggleable(false)
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('locks and unlocks as the source getter toggles', async () => {
    const { wrapper, isOpen } = mountToggleable(false)
    isOpen.value = true
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    isOpen.value = false
    await wrapper.vm.$nextTick()
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('keeps body locked while any of two nested locks is still open', async () => {
    document.body.style.overflow = ''
    const outer = mountAlwaysLocked()
    const inner = mountAlwaysLocked()
    expect(document.body.style.overflow).toBe('hidden')

    inner.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    outer.unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
