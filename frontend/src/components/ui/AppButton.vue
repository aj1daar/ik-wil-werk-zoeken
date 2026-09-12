<template>
  <button
    :type="type ?? 'button'"
    :class="['app-btn', `app-btn--${variant ?? 'primary'}`]"
    :disabled="disabled"
    :aria-label="ariaLabel"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  ariaLabel?: string
}>()
</script>

<style scoped>
.app-btn {
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, color 0.15s, border-color 0.15s;
}
.app-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* primary — ink, matching .btn-primary in style.css */
.app-btn--primary {
  background: var(--col-invert-bg);
  color: var(--col-invert-text);
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  border: none;
}
.app-btn--primary:hover:not(:disabled) { opacity: 0.88; }

/* secondary */
.app-btn--secondary {
  background: transparent;
  color: var(--col-accent);
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--col-accent);
}
.app-btn--secondary:hover:not(:disabled) {
  background: var(--col-accent-lt);
}

/* ghost */
.app-btn--ghost {
  background: transparent;
  color: var(--col-muted);
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--col-border);
}
.app-btn--ghost:hover:not(:disabled) { background: var(--col-raised); color: var(--col-text); }

/* icon */
.app-btn--icon {
  background: none;
  border: none;
  color: var(--col-subtle);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.app-btn--icon:hover:not(:disabled) { color: var(--col-muted); }

/* danger */
.app-btn--danger {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--col-error);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--col-error) 35%, transparent);
  border-radius: var(--radius);
}
.app-btn--danger:hover:not(:disabled) { background: var(--col-error-lt); }
</style>
