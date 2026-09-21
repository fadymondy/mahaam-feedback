import assert from "node:assert/strict"
import { test } from "node:test"

const { dataUrlToBlob, submit } = await import("../dist/esm/transport.js")

test("dataUrlToBlob decodes a base64 data URL", async () => {
  const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=")
  assert.equal(blob.type, "image/png")
  assert.equal(await blob.text(), "hello")
})

test("dataUrlToBlob handles a non-base64 data URL", async () => {
  const blob = dataUrlToBlob("data:text/plain,hello%20there")
  assert.equal(blob.type, "text/plain")
  assert.equal(await blob.text(), "hello there")
})

test("a function target is called as-is, with no HTTP", async () => {
  let seen
  const result = await submit((p) => { seen = p; return Promise.resolve({ key: "MH-1" }) }, { title: "x", issue_type: "bug" })
  assert.equal(seen.title, "x")
  assert.deepEqual(result, { key: "MH-1" })
})

test("an endpoint target posts multipart with screenshot as a file and meta as JSON", async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ key: "MH-2" }), { status: 201, headers: { "content-type": "application/json" } })
  }
  const out = await submit("https://x.test/api/feedback/embed", {
    title: "Broken", issue_type: "bug", screenshot: "data:image/png;base64,aGVsbG8=",
    meta: { build: "abc" }, body: "", // empty strings are dropped
  })
  assert.deepEqual(out, { key: "MH-2" })
  const form = calls[0].init.body
  assert.equal(form.get("title"), "Broken")
  assert.equal(form.get("meta"), JSON.stringify({ build: "abc" }))
  assert.equal(form.get("body"), null, "empty values must not be sent")
  assert.ok(typeof form.get("screenshot") === "object", "screenshot must be a file, not a string")
  assert.equal(calls[0].init.credentials, "include")
})

test("a rejected report throws with the status", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 403 })
  await assert.rejects(
    () => submit("https://x.test/api/feedback/embed", { title: "x", issue_type: "bug" }),
    /403/,
  )
})
