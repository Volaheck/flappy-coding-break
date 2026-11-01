import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

const source = readFileSync(new URL("../adapters/opencode/gui.cjs", import.meta.url), "utf8")

test("published OpenCode bundle loads using only the host's two allowed dependencies", () => {
  const imports = []
  const module = { exports: {} }
  const require = name => {
    imports.push(name)
    if (name === "@opencode/plugin/gui") return { Plugin: { define: value => value } }
    if (name === "solid-js") return {}
    throw new Error(`OpenCode cannot require ${name}`)
  }
  const bundle = readFileSync(new URL("../gui-experimental.cjs", import.meta.url), "utf8")
  new Function("require", "module", "exports", bundle)(require, module, module.exports)
  assert.equal(typeof module.exports.setup, "function")
  assert.equal(module.exports.i18n.ru.title, "Flappy Bird")
  assert.deepEqual(imports.sort(), ["@opencode/plugin/gui", "solid-js"])
})

function harness(options = {}) {
  const timers = new Map()
  const components = new Map()
  const cleanup = []
  const actions = []
  let observer
  let running = false
  let engaged = false
  let panel = "closed"
  let current
  let id = 0
  const session = {
    id: "session-1", key: "server:session-1",
    server: { data: { session: { status: () => running ? "running" : "idle" } } },
  }
  current = session
  const engine = {
    engaged: () => engaged, wake() {}, focus() {}, dispose() {},
    mount: () => ({ root: {}, dispose() {} }),
  }
  const context = {
    module: { exports: {} },
    setTimeout: (fn) => { timers.set(++id, fn); return id },
    clearTimeout: (key) => timers.delete(key),
    require: (name) => {
      if (name === "@opencode/plugin/gui") return {
        Plugin: { define: value => value }, Panel: "Panel", Command: "Command", MenuItem: "MenuItem",
        createKeyed: (read, notify) => { observer = () => notify(read()) },
      }
      if (name === "solid-js") return { onCleanup: fn => cleanup.push(fn), untrack: fn => fn() }
      if (name.endsWith("canvas.cjs")) return { createEngine: () => engine }
      if (name.endsWith("i18n.cjs")) return { messages: {} }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }
  vm.runInNewContext(source, context)
  context.module.exports.setup({
    id: "flappy", t: key => key, options,
    sessions: { current: () => current },
    add: (kind, value) => components.set(kind, value),
    layout: {
      state: () => panel,
      open: () => { panel = "visible"; actions.push("open") },
      close: () => { panel = "closed"; actions.push("close") },
      toggle: () => { panel = panel === "closed" ? "visible" : "closed" },
    },
  })
  return {
    actions, components,
    setEngaged: value => { engaged = value },
    setRunning: value => { running = value; observer() },
    leaveSession: () => { current = undefined },
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()) },
    cleanup: () => cleanup.forEach(fn => fn()),
  }
}

test("OpenCode auto-opens while working and defers closing until the round ends", () => {
  const host = harness()
  host.setRunning(true)
  assert.deepEqual(host.actions, [])
  host.flush()
  assert.deepEqual(host.actions, ["open"])
  host.setEngaged(true)
  host.setRunning(false)
  host.flush()
  assert.deepEqual(host.actions, ["open"])
  host.setEngaged(false)
  host.flush()
  assert.deepEqual(host.actions, ["open", "close"])
  host.cleanup()
})

test("OpenCode does not auto-close a manually opened panel", () => {
  const host = harness()
  host.components.get("Command")().run()
  host.setRunning(true)
  host.flush()
  host.setRunning(false)
  host.flush()
  assert.deepEqual(host.actions, [])
  host.cleanup()
})

test("OpenCode options and switching away cancel an automatic opening", () => {
  const disabled = harness({ autoOpen: false })
  disabled.setRunning(true)
  disabled.flush()
  assert.deepEqual(disabled.actions, [])
  disabled.cleanup()
  const switched = harness()
  switched.setRunning(true)
  switched.leaveSession()
  switched.flush()
  assert.deepEqual(switched.actions, [])
  switched.cleanup()
})
