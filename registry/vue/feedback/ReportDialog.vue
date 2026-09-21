<script lang="ts">
import type { FeedbackPayload } from "@mahaam/feedback-core"
import type { FeedbackLabels } from "./labels"

/** What the form edits. In edit mode the host seeds it from the stored report. */
export type FeedbackDraft = {
  title?: string | null
  body?: string | null
  issue_type?: string | null
  priority?: string | null
  screenshot?: string | null
  selector?: string | null
}

/**
 * What `submit` receives. In create mode this is the full wire payload —
 * page context plus the console and network recorded since the app mounted.
 * In edit mode it carries only the form fields: the page context was recorded
 * when the issue was first filed, and editing later would record the wrong page.
 */
export type FeedbackSubmission = FeedbackPayload & { priority?: string }

/** What the `body` slot is handed, so a host can swap in a markdown editor. */
export type BodyEditorSlotProps = {
  id: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  rows: number
}

export type ReportDialogProps = {
  /** Dialog visibility. Use `v-model:open`. */
  open: boolean
  /** Throw to keep the dialog open and show the error. */
  submit: (submission: FeedbackSubmission) => Promise<unknown>
  mode?: "create" | "edit"
  initial?: FeedbackDraft
  locale?: "en" | "ar"
  labels?: Partial<FeedbackLabels>
  types?: readonly string[]
  typeLabels?: Record<string, string>
  /** Omit (or pass []) to hide the priority field. */
  priorities?: readonly string[]
  priorityLabels?: Record<string, string>
  defaultType?: string
  defaultPriority?: string
  /** Prefix for input ids, so two reporters on a page do not collide. */
  idPrefix?: string
}
</script>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue"
import {
  CameraIcon,
  CrosshairIcon,
  ImageIcon,
  SendIcon,
  XIcon,
} from "lucide-vue-next"

// Peer contract: your app's own shadcn-vue ui/* components, so the reporter
// matches your theme.
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import {
  HIDE_MARKER,
  captureElement,
  captureViewport,
  consoleSnapshot,
  diagnosticsCounts,
  networkSnapshot,
  pageContext,
  pickElement,
  selectorFor,
} from "@mahaam/feedback-core"
import { FEEDBACK_LABELS, fillLabel } from "./labels"

const DEFAULT_TYPES = ["bug", "feature", "question"]

const props = withDefaults(defineProps<ReportDialogProps>(), {
  mode: "create",
  locale: "en",
  defaultType: "bug",
  defaultPriority: "medium",
  idPrefix: "feedback",
})

const emit = defineEmits<{
  (e: "update:open", open: boolean): void
}>()

defineSlots<{
  /** Replaces the plain Textarea, e.g. with a markdown editor. */
  body?: (props: BodyEditorSlotProps) => unknown
  /** Host-only fields, rendered last in the form. The host owns their state. */
  extra?: () => unknown
}>()

const labels = computed<FeedbackLabels>(() => ({
  ...FEEDBACK_LABELS[props.locale],
  ...props.labels,
}))
const editing = computed(() => props.mode === "edit")
const types = computed(() => props.types ?? DEFAULT_TYPES)
const priorities = computed(() => props.priorities ?? [])
const showPriority = computed(() => priorities.value.length > 0)

const title = ref("")
const body = ref("")
const issueType = ref(props.defaultType)
const priority = ref(props.defaultPriority)
const screenshot = ref<string | null>(null)
const selector = ref<string | null>(null)
const saving = ref(false)
const busy = ref<"screenshot" | "element" | null>(null)
// The dialog stays mounted during a capture and hides itself instead of
// closing: closing it dropped everything typed so far, and reopening fought
// the enter animation.
const hidden = ref(false)
const error = ref<string | null>(null)

const fileInput = useTemplateRef<HTMLInputElement>("fileInput")
// Read once per open: the counts should describe what will be attached, not
// tick upward while the form is being filled in.
const diagnostics = ref(diagnosticsCounts())

// Reset whenever the dialog opens, so a cancelled edit does not leak into
// the next one.
watch(
  () => [props.open, props.initial] as const,
  () => {
    if (!props.open) return
    title.value = props.initial?.title ?? ""
    body.value = props.initial?.body ?? ""
    issueType.value = props.initial?.issue_type ?? props.defaultType
    priority.value = props.initial?.priority ?? props.defaultPriority
    screenshot.value = props.initial?.screenshot ?? null
    selector.value = props.initial?.selector ?? null
    diagnostics.value = diagnosticsCounts()
    error.value = null
  },
  { immediate: true },
)

const id = (name: string) => `${props.idPrefix}-${name}`

function setOpen(next: boolean) {
  emit("update:open", next)
}

async function onSubmit() {
  if (!title.value.trim()) return
  saving.value = true
  error.value = null
  try {
    const fields: FeedbackSubmission = {
      title: title.value.trim(),
      body: body.value.trim() || undefined,
      issue_type: issueType.value,
      priority: showPriority.value ? priority.value : undefined,
      screenshot: screenshot.value ?? undefined,
      selector: selector.value ?? undefined,
    }
    await props.submit(
      editing.value
        ? fields
        : {
            ...fields,
            ...pageContext(),
            // Recorded continuously since the app mounted, so this covers what
            // happened BEFORE the dialog was opened.
            console_log: consoleSnapshot() || undefined,
            network_log: networkSnapshot() || undefined,
          },
    )
    setOpen(false)
  } catch (err) {
    error.value = err instanceof Error ? err.message : labels.value.failed
  } finally {
    saving.value = false
  }
}

async function grabScreenshot() {
  busy.value = "screenshot"
  error.value = null
  hidden.value = true
  // One frame, so the dialog is actually off-screen before the rasteriser
  // walks the DOM.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
  try {
    screenshot.value = await captureViewport()
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : labels.value.screenshotFailed
  } finally {
    hidden.value = false
    busy.value = null
  }
}

async function grabElement() {
  busy.value = "element"
  error.value = null
  hidden.value = true
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  try {
    const picked = await pickElement({ hint: labels.value.pickHint })
    if (picked) {
      selector.value = selectorFor(picked.anchor)
      const shot = await captureElement(picked.element)
      if (shot) screenshot.value = shot
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : labels.value.pickFailed
  } finally {
    hidden.value = false
    busy.value = null
  }
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    screenshot.value = String(reader.result)
  }
  reader.readAsDataURL(file)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) readFile(file)
  input.value = ""
}

const hideAttrs = computed<Record<string, string>>(() => {
  const attrs: Record<string, string> = {}
  if (hidden.value) attrs[HIDE_MARKER] = ""
  return attrs
})
</script>

<template>
  <!--
    A modal dialog renders a backdrop over the whole page and takes the page
    out of the pointer-event tree, so document.elementFromPoint answered with
    one full-viewport node and the picker could only ever select "the page".
    Going non-modal for the duration is what makes picking possible at all.
  -->
  <Dialog :open="open" :modal="!hidden" @update:open="setOpen">
    <DialogContent
      v-bind="hideAttrs"
      :class="hidden ? 'sm:max-w-xl pointer-events-none opacity-0' : 'sm:max-w-xl'"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <DialogHeader>
          <DialogTitle>{{ editing ? labels.editTitle : labels.reportTitle }}</DialogTitle>
          <DialogDescription>
            {{ editing ? labels.editHint : fillLabel(labels.reportHint, diagnostics) }}
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-4">
          <div class="grid gap-2">
            <Label :for="id('title')">{{ labels.title }}</Label>
            <Input
              :id="id('title')"
              v-model="title"
              dir="auto"
              :placeholder="labels.titlePlaceholder"
              required
            />
          </div>

          <div :class="showPriority ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'">
            <div class="grid gap-2">
              <Label :for="id('type')">{{ labels.type }}</Label>
              <Select v-model="issueType">
                <SelectTrigger :id="id('type')" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="t in types" :key="t" :value="t">
                    {{ typeLabels?.[t] ?? t }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="showPriority" class="grid gap-2">
              <Label :for="id('priority')">{{ labels.priority }}</Label>
              <Select v-model="priority">
                <SelectTrigger :id="id('priority')" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="p in priorities" :key="p" :value="p">
                    {{ priorityLabels?.[p] ?? p }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="grid gap-2">
            <Label :for="id('body')">{{ labels.details }}</Label>
            <slot
              name="body"
              :id="id('body')"
              :value="body"
              :on-value-change="(v: string) => (body = v)"
              :placeholder="labels.bodyPlaceholder"
              :rows="7"
            >
              <Textarea
                :id="id('body')"
                v-model="body"
                dir="auto"
                :rows="7"
                :placeholder="labels.bodyPlaceholder"
              />
            </slot>
          </div>

          <div v-if="!editing" class="grid gap-2">
            <Label>{{ labels.attach }}</Label>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                class="gap-2"
                :disabled="busy !== null"
                @click="grabScreenshot"
              >
                <CameraIcon />
                {{ busy === "screenshot" ? labels.capturing : labels.screenshot }}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                class="gap-2"
                :disabled="busy !== null"
                @click="grabElement"
              >
                <CrosshairIcon />
                {{ busy === "element" ? labels.picking : labels.selectElement }}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                class="gap-2"
                :disabled="busy !== null"
                @click="fileInput?.click()"
              >
                <ImageIcon />
                {{ labels.image }}
              </Button>

              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                hidden
                @change="onFileChange"
              />
            </div>
          </div>

          <p
            v-if="selector"
            class="flex items-center gap-2 font-mono text-xs text-muted-foreground"
          >
            <CrosshairIcon class="size-3.5" />
            <span dir="ltr" class="truncate">{{ selector }}</span>
          </p>

          <div
            v-if="screenshot"
            class="relative overflow-hidden rounded-lg border border-border"
          >
            <!-- A data URL, so an image optimiser would add nothing. -->
            <img
              :src="screenshot"
              :alt="labels.attachedCapture"
              class="max-h-48 w-full bg-muted/30 object-contain"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              :aria-label="labels.removeAttachment"
              class="absolute top-2 end-2 size-7"
              @click="
                () => {
                  screenshot = null
                  selector = null
                }
              "
            >
              <XIcon />
            </Button>
          </div>

          <slot name="extra" />
        </div>

        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>

        <DialogFooter>
          <Button type="submit" class="gap-2" :disabled="saving || !title.trim()">
            <SendIcon />
            {{ saving ? labels.saving : editing ? labels.submitEdit : labels.submitReport }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
