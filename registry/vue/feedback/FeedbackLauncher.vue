<script lang="ts">
import type { SubmitFn, SubmitOptions } from "@mahaam/feedback-core"
import type { ReportDialogProps } from "./ReportDialog.vue"

export type FeedbackLauncherProps = Omit<
  ReportDialogProps,
  "open" | "submit" | "mode" | "initial"
> & {
  /** An endpoint (multipart POST) or a host submitter. */
  target: string | SubmitFn
  submitOptions?: SubmitOptions
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg"
  class?: string
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue"
import { MessageSquarePlusIcon } from "lucide-vue-next"

import { Button } from "@/components/ui/button"

import { submit } from "@mahaam/feedback-core"
import { FEEDBACK_LABELS } from "./labels"
import ReportDialog, { type FeedbackSubmission } from "./ReportDialog.vue"

const props = withDefaults(defineProps<FeedbackLauncherProps>(), {
  variant: "outline",
  size: "sm",
})

const emit = defineEmits<{
  /** Fired after a successful submit, e.g. to toast. */
  (e: "submitted", result: unknown): void
}>()

defineSlots<{
  /** Replaces the default icon + label inside the button. */
  default?: () => unknown
  body?: (props: {
    id: string
    value: string
    onValueChange: (value: string) => void
    placeholder: string
    rows: number
  }) => unknown
  extra?: () => unknown
}>()

const open = ref(false)

const label = computed(
  () => props.labels?.launcher ?? FEEDBACK_LABELS[props.locale ?? "en"].launcher,
)

/** The props ReportDialog owns, forwarded untouched. */
const dialogProps = computed(() => ({
  locale: props.locale,
  labels: props.labels,
  types: props.types,
  typeLabels: props.typeLabels,
  priorities: props.priorities,
  priorityLabels: props.priorityLabels,
  defaultType: props.defaultType,
  defaultPriority: props.defaultPriority,
  idPrefix: props.idPrefix,
}))

async function send(payload: FeedbackSubmission) {
  const result = await submit(props.target, payload, props.submitOptions)
  emit("submitted", result)
  return result
}
</script>

<template>
  <Button :variant="variant" :size="size" :class="props.class" @click="open = true">
    <slot>
      <MessageSquarePlusIcon />
      {{ label }}
    </slot>
  </Button>

  <ReportDialog v-bind="dialogProps" v-model:open="open" :submit="send">
    <template v-if="$slots.body" #body="slotProps">
      <slot name="body" v-bind="slotProps" />
    </template>
    <template v-if="$slots.extra" #extra>
      <slot name="extra" />
    </template>
  </ReportDialog>
</template>
