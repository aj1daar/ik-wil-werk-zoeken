<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import { ref } from 'vue'

const model = defineModel<string>({ required: true })

withDefaults(defineProps<{
  id:                string
  label:             string
  placeholder?:      string
  autocomplete?:     string
  required?:         boolean
  minlength?:        number
  inputClass?:       string
  ariaDescribedby?:  string
  ariaInvalid?:      true | undefined
}>(), { inputClass: 'field-input' })

const visible = ref(false)
</script>

<template>
  <div>
    <label class="field-label" :for="id">{{ label }}</label>
    <div class="password-field">
      <input
        :id="id"
        :type="visible ? 'text' : 'password'"
        v-model="model"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :required="required"
        :minlength="minlength"
        :class="inputClass"
        :aria-describedby="ariaDescribedby"
        :aria-invalid="ariaInvalid"
      />
      <button
        type="button"
        @click="visible = !visible"
        class="btn-icon password-eye"
        :aria-label="visible ? 'Hide password' : 'Show password'"
      >
        <AppIcon name="eye" v-if="!visible" class="pw-icon" />
        <AppIcon name="eye-off" v-else class="pw-icon" />
      </button>
    </div>
  </div>
</template>

<style src="./style.css" scoped></style>
