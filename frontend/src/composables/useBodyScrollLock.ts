import { onUnmounted, watch, type Ref } from 'vue'

// iOS Safari lets the page behind a fixed-position modal backdrop keep
// scrolling/rubber-banding underneath — this locks <body> scroll while any
// modal is open. Reference-counted so nested/sibling modals don't unlock
// each other early.
let lockCount = 0
let previousOverflow = ''

function lock() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

function unlock() {
  if (lockCount === 0) return
  lockCount--
  if (lockCount === 0) document.body.style.overflow = previousOverflow
}

export function useBodyScrollLock(isOpen: Ref<boolean> | (() => boolean) = () => true) {
  const getOpen = typeof isOpen === 'function' ? isOpen : () => isOpen.value
  let locked = false

  watch(getOpen, (open) => {
    if (open && !locked) { lock(); locked = true }
    else if (!open && locked) { unlock(); locked = false }
  }, { immediate: true })

  onUnmounted(() => {
    if (locked) { unlock(); locked = false }
  })
}
