# mahaam-feedback

The **Mahaam Feedback** widget — a "Report a problem" flow you drop into a web app. The user
points at the broken element, the widget grabs a screenshot plus console and network diagnostics,
and files it as an issue in [Mahaam](https://mahaam.app).

This is the **frontend** product. It authenticates with a public key (`pfk_...`) and posts to the
feedback intake. For backend error monitoring — unhandled exceptions, a DSN, Sentry-shaped — use
the separate Mahaam SDK: [Go](https://github.com/fadymondy/mahaam-go),
[Node](https://www.npmjs.com/package/@mahaam/sdk),
[Python](https://pypi.org/project/mahaam-sdk/), [PHP](https://packagist.org/packages/mahaam/sdk).
A project has one key for each; install either, both, or neither.

## What's in here

| Path | Ships as | What it is |
|---|---|---|
| `packages/core` | `@mahaam/feedback-core` on npm | Framework-agnostic logic: screenshot capture, element picker, console/network diagnostics, the report transport. No UI, no framework. |
| `registry/react` | shadcn registry item `feedback` | React UI, built on **your app's own** `@/components/ui/*`. |
| `registry/vue` | shadcn registry item `feedback-vue` | The same UI for Vue 3 / shadcn-vue. |

The UI is distributed as a **shadcn registry item**, not an npm component package. That is
deliberate: the components import your project's own `button`, `dialog`, `input`, `select` and
`textarea`, so the reporter inherits your theme, your radius, your fonts and your RTL setup
instead of shipping a second copy of Radix that never quite matches.

## Install — React

```bash
npx shadcn@latest add https://mahaam.app/r/feedback.json
npm i @mahaam/feedback-core
```

Or register the namespace once in `components.json` and install by name:

```json
{ "registries": { "@mahaam": "https://mahaam.app/r/{name}.json" } }
```

```bash
npx shadcn@latest add @mahaam/feedback
```

```tsx
import { FeedbackLauncher } from "@/components/mahaam/feedback-launcher"

<FeedbackLauncher
  target="https://console.mahaam.app/api/feedback/embed"
  submitOptions={{ headers: { "X-Mahaam-Key": process.env.NEXT_PUBLIC_MAHAAM_FEEDBACK_KEY! } }}
  locale="en"
/>
```

Peers it expects from your shadcn kit: `button`, `dialog`, `field`, `input`, `select`, `textarea`.
The CLI installs any you're missing.

## Install — Vue

```bash
npx shadcn-vue@latest add https://mahaam.app/r/feedback-vue.json
npm i @mahaam/feedback-core
```

Peers: `button`, `dialog`, `input`, `label`, `select`, `textarea`.

## Install — plain script tag

For a site that isn't React or Vue, the hosted bundle needs no build step:

```html
<script src="https://console.mahaam.app/embed/v1.js" data-key="pfk_..." defer></script>
```

Options: `data-locale="ar"`, `data-theme="light|dark"`, `data-position="start"`,
`data-launcher="false"` (then call `window.MahaamFeedback.open()`).

## Using the core on its own

You don't need our UI at all. Build your own form and hand the payload to `submit`:

```ts
import { submit, captureViewport, pageContext, consoleSnapshot } from "@mahaam/feedback-core"

await submit("https://console.mahaam.app/api/feedback/embed", {
  title: "Checkout button does nothing",
  issue_type: "bug",
  screenshot: await captureViewport(),
  console_log: consoleSnapshot(),
  ...pageContext(),
})
```

`submit` also accepts a function instead of a URL, for a backend whose API isn't the plain
multipart intake.

## Localisation

English and Arabic ship in `labels.ts`, and the UI is built to work in both LTR and RTL. Pass
`locale="ar"`, or override any individual string via the `labels` prop.

## License

MIT
