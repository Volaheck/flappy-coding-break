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
  const engines = []
  const statuses = new Map()
  const panels = new Map()
  let observer
  let current
  let id = 0
  const addSession = (name, state = "idle") => {
    const session = {
      id: name, key: `server:${name}`,
      server: { data: { session: { status: name => statuses.get(name) } } },
    }
    statuses.set(name, state)
    return session
  }
  const session = addSession("session-1")
  current = session
  const createEngine = () => {
    const engine = {
      transitions: [], focused: 0, disposed: false,
      setRunning(value) { this.transitions.push(value) },
      wake() {},
      focus() { this.focused++ },
      dispose() { this.disposed = true },
      mount: status => ({ root: { engine, status }, dispose() {} }),
    }
    engines.push(engine)
    return engine
  }
  const context = {
    module: { exports: {} },
    setTimeout: (fn) => { timers.set(++id, fn); return id },
    clearTimeout: (key) => timers.delete(key),
    require: (name) => {
      if (name === "@opencode/plugin/gui") return {
        Plugin: { define: value => value }, Panel: "Panel", Command: "Command", MenuItem: "MenuItem",
        createKeyed: (read, notify, options) => {
          let previous
          observer = () => {
            const next = read()
            if (!next) { previous = undefined; return }
            if (previous && options.equals(previous, next)) return
            previous = next
            notify(next)
          }
          observer()
        },
      }
      if (name === "solid-js") return { onCleanup: fn => cleanup.push(fn), untrack: fn => fn() }
      if (name.endsWith("canvas.cjs")) return { createEngine }
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
      state: (_, session) => panels.get(session.key) ?? "closed",
      open: (_, session) => { panels.set(session.key, "visible"); actions.push("open") },
      close: (_, session) => { panels.set(session.key, "closed"); actions.push("close") },
      toggle: (_, session) => { panels.set(session.key, panels.get(session.key) === "visible" ? "closed" : "visible") },
    },
  })
  return {
    actions, components, engines, session, addSession,
    setStatus: (value, session = current) => { statuses.set(session.id, value); observer() },
    setRunning: value => { statuses.set(current.id, value ? "running" : "idle"); observer() },
    switchSession: session => { current = session; observer() },
    leaveSession: () => { current = undefined; observer() },
    render: (session = current) => components.get("Panel").render({ session }),
    panel: (session = current) => panels.get(session.key) ?? "closed",
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()) },
    cleanup: () => cleanup.forEach(fn => fn()),
  }
}

test("OpenCode ends the round immediately when its agent becomes idle and keeps results visible", () => {
  const host = harness({ autoClose: true })
  host.setRunning(true)
  assert.deepEqual(host.engines[0].transitions, [true])
  assert.deepEqual(host.actions, [])
  host.flush()
  assert.deepEqual(host.actions, ["open"])
  host.setRunning(false)
  assert.deepEqual(host.engines[0].transitions, [true, false], "completion reaches the engine before any timer runs")
  host.flush()
  assert.deepEqual(host.actions, ["open"])
  host.flush()
  assert.equal(host.panel(), "visible")
  assert.equal(host.render().status(), "done")
  host.setRunning(true)
  assert.deepEqual(host.engines[0].transitions, [true, false, true], "the next answer unlocks the same game")
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
  assert.equal(host.panel(), "visible")
  assert.deepEqual(host.engines[0].transitions, [true, false])
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

test("OpenCode keeps other chats and subagent status changes isolated from the displayed game", () => {
  const host = harness()
  host.setRunning(true)
  const first = host.engines[0]
  const child = host.addSession("subagent", "running")
  host.setStatus("idle", child)
  assert.deepEqual(first.transitions, [true])
  const secondSession = host.addSession("session-2")
  host.switchSession(secondSession)
  const second = host.engines[1]
  assert.deepEqual(first.transitions, [true], "switching to an idle chat cannot end the first chat's game")
  assert.deepEqual(second.transitions, [], "an unseen idle session is not a completion")
  host.setRunning(true)
  host.setStatus("idle", host.session)
  assert.deepEqual(second.transitions, [true], "a background chat cannot complete the current game")
  host.switchSession(host.session)
  assert.deepEqual(first.transitions, [true, false], "the first chat reconciles its own known completion on return")
  assert.deepEqual(second.transitions, [true])
  const view = host.render()
  assert.equal(view.engine, first)
  host.components.get("Panel").enter()
  assert.equal(first.focused, 1)
  assert.equal(second.focused, 0)
  host.cleanup()
  assert.ok(host.engines.every(engine => engine.disposed))
})

test("unknown OpenCode status never unlocks or ends a game, and closing preserves completion", () => {
  const host = harness()
  host.setStatus(undefined)
  assert.deepEqual(host.engines[0].transitions, [])
  host.setRunning(true)
  host.setStatus(undefined)
  assert.deepEqual(host.engines[0].transitions, [true])
  host.setStatus("idle")
  assert.deepEqual(host.engines[0].transitions, [true, false])
  host.components.get("Panel").close({ session: host.session })
  const view = host.render()
  assert.equal(view.status(), "done")
  assert.deepEqual(host.engines[0].transitions, [true, false], "reopening results does not unlock or repeat completion")
  host.setStatus(undefined)
  assert.deepEqual(host.engines[0].transitions, [true, false])
  host.cleanup()
})

test("manual OpenCode toggles cancel a pending automatic opening", () => {
  const host = harness()
  host.setRunning(true)
  host.components.get("Command")().run()
  host.components.get("Command")().run()
  host.flush()
  assert.equal(host.panel(), "closed")
  assert.deepEqual(host.actions, [])
  host.cleanup()
})
