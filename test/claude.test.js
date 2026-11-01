import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { register } from "../adapters/claude/register.js"
import FlappyClient from "../adapters/claude/client.js"
import { createGame } from "../adapters/claude/core.js"

const PANE = "flappy-coding-break"
const elements = Object.fromEntries(["Box", "Text", "Button", "Client"].map((type) => [type, (props) => ({ type, props })]))
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }

function createHost(options = {}, surfaces = ["desktop"]) {
  const handlers = []
  const panes = new Map()
  const timers = new Map()
  const store = new Map()
  const opened = []
  const closed = []
  const commands = []
  let now = 0
  let timerId = 0
  const host = {
    command: { register: async (command) => { commands.push(command) } },
    session: { surfaces: async () => surfaces },
    store: { get: async (key) => store.get(key), set: async (key, value) => { store.set(key, value) } },
    clock: {
      after(ms, fn) {
        const id = ++timerId
        timers.set(id, { at: now + ms, fn })
        return { cancel: () => timers.delete(id) }
      },
    },
    ui: {
      log: () => {},
      invalidate: () => {},
      resolve: () => elements,
      panes: async () => [...panes.values()],
      open: async (pane) => {
        assert.ok(pane.focus === undefined || pane.focus === true)
        panes.set(pane.id, { ...pane, isShown: true, isPlaced: true })
        opened.push(pane)
      },
      close: async (pane) => {
        await emit("ui.close", { ...pane, origin: { kind: "plugin" } })
        panes.delete(pane.id)
        closed.push(pane.id)
      },
    },
  }
  function on(event, matcher, handler) {
    if (typeof matcher === "function") [handler, matcher] = [matcher, {}]
    handlers.push({ event, matcher, handler })
  }
  async function emit(event, input = {}) {
    let result
    for (const entry of handlers) {
      if (entry.event !== event || Object.entries(entry.matcher).some(([key, value]) => input[key] !== value)) continue
      result = await entry.handler(host, input, async () => ({ forwarded: true }))
    }
    return result
  }
  async function advance(ms) {
    const end = now + ms
    while (true) {
      const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end)
      if (!entry) break
      const [id, timer] = entry
      timers.delete(id)
      now = timer.at
      timer.fn()
      await flush()
    }
    now = end
    await flush()
  }
  const state = (phase, animating = phase === "playing", best = 0) => emit("ui.message", {
    requestId: PANE, element: "flappy-game", data: { type: "state", phase, animating, best },
  })
  register(on, options)
  return { emit, advance, state, panes, timers, opened, closed, commands, store }
}

test("Claude registers an immediate command and cancels the game for short turns", async () => {
  const host = createHost()
  await host.emit("session.start", { surface: "desktop", isInteractive: true })
  assert.equal(host.commands[0].immediate, true)
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(500)
  await host.emit("turn.complete", { turnId: "a", reason: "answer", isAborted: false })
  await host.advance(3000)
  assert.equal(host.opened.length, 0)
})

test("Claude auto-opens without taking focus and closes after an idle completion", async () => {
  const host = createHost()
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  assert.equal(host.opened.length, 1)
  assert.equal(host.opened[0].focus, undefined)
  await host.emit("turn.complete", { turnId: "a", reason: "answer", isAborted: false })
  await host.advance(1499)
  assert.ok(host.panes.has(PANE))
  await host.advance(1)
  assert.ok(!host.panes.has(PANE))
})

test("Claude keeps a playing or paused round, then closes after the game settles", async () => {
  const host = createHost()
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  await host.state("playing")
  await host.emit("turn.complete", { turnId: "a", reason: "aborted", isAborted: true })
  await host.advance(5000)
  assert.ok(host.panes.has(PANE))
  await host.state("paused", false)
  await host.advance(5000)
  assert.ok(host.panes.has(PANE))
  await host.state("over", true)
  await host.advance(2000)
  assert.ok(host.panes.has(PANE))
  await host.state("over", false, 10)
  await host.advance(1500)
  assert.ok(!host.panes.has(PANE))
  assert.equal(host.store.get("flappy.best"), 10)
})

test("Claude ignores subagent completions and stale main turns", async () => {
  const host = createHost()
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  await host.emit("turn.start", { turnId: "b" })
  await host.emit("turn.start", { turnId: "child-turn", agentId: "child" })
  await host.emit("turn.complete", { turnId: "a", reason: "answer" })
  await host.emit("turn.complete", { turnId: "b", agentId: "child", reason: "answer" })
  await host.advance(3000)
  assert.ok(host.panes.has(PANE))
  assert.equal(host.closed.length, 0)
  await host.emit("turn.complete", { turnId: "b", reason: "error", isAborted: false })
  await host.advance(1500)
  assert.ok(!host.panes.has(PANE))
})

test("Claude manually opened panes survive completion and manual close cancels pending timers", async () => {
  const host = createHost()
  await host.emit("turn.start", { turnId: "a" })
  await host.emit("command.run", { command: "flappy" })
  await host.advance(1000)
  assert.equal(host.opened.length, 1)
  assert.equal(host.opened[0].focus, true)
  await host.emit("turn.complete", { turnId: "a", reason: "answer" })
  await host.advance(4000)
  assert.ok(host.panes.has(PANE))
  await host.emit("command.run", { command: "flappy" })
  assert.ok(!host.panes.has(PANE))
  assert.equal(host.timers.size, 0)
})

test("Claude settings, unsupported surfaces, and session end respect scope", async () => {
  for (const [options, surfaces] of [[{ autoOpen: false }, ["desktop"]], [{}, ["vscode"]], [{}, []]]) {
    const host = createHost(options, surfaces)
    await host.emit("turn.start", { turnId: "a" })
    await host.advance(2000)
    assert.equal(host.opened.length, 0)
  }
  const host = createHost({ autoClose: false })
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  await host.emit("turn.complete", { turnId: "a", reason: "answer" })
  await host.advance(3000)
  assert.ok(host.panes.has(PANE))
  await host.emit("session.end", { reason: "clear" })
  assert.ok(!host.panes.has(PANE))
  assert.equal(host.timers.size, 0)
})

test("Claude only accepts valid state and never lowers a saved record", async () => {
  const host = createHost()
  await host.state("over", false, 20)
  await host.state("ready", true, 0)
  await host.emit("ui.message", { requestId: PANE, element: "flappy-game", data: { type: "state", phase: "over", animating: false, best: Infinity } })
  await host.emit("ui.message", { requestId: "unrelated", element: "flappy-game", data: { type: "state", phase: "over", animating: false, best: 100 } })
  assert.equal(host.store.get("flappy.best"), 20)
})

test("Claude pane loads a literal native Client module and forwards unrelated panes", async () => {
  const host = createHost()
  const tree = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true, scroll: { bodyRows: 30 } } })
  assert.equal(tree.type, "Client")
  assert.equal(tree.props.module, "./client.js")
  assert.equal(tree.props.props.focused, true)
  assert.deepEqual(await host.emit("ui.render", { component: "Pane", requestId: "other" }), { forwarded: true })
})

function createSurface() {
  let listener
  let pointer
  const timers = new Set()
  const posts = []
  const surface = {
    elements,
    columns: 44,
    rows: 29,
    state: undefined,
    setState: (state) => { surface.state = state },
    every: (ms, callback) => {
      const timer = { ms, callback }
      timers.add(timer)
      return () => timers.delete(timer)
    },
    onKey: (callback) => { listener = callback; return () => {} },
    onPointer: (callback) => { pointer = callback; return () => {} },
    post: (data) => posts.push(data),
  }
  return {
    surface, timers, posts,
    key: (key) => listener({ key }),
    pointer: (type, button = "left", position = { x: 4, y: 4 }) => pointer({ type, button, ...position }),
    frames: (count) => { for (let index = 0; index < count; index++) for (const timer of [...timers]) timer.callback() },
  }
}

test("Claude Client plays locally, pauses its timer, and posts state changes rather than frames", () => {
  const client = createSurface()
  const props = { best: 7, locale: "en", focused: true, status: "running", bodyRows: 28 }
  const tree = FlappyClient(props, client.surface)
  assert.equal(tree.type, "Box")
  assert.ok(JSON.stringify(tree).length < 100000)
  client.frames(10)
  assert.equal(client.posts.length, 1)
  client.key("w")
  assert.equal(client.surface.state.game.phase, "playing")
  client.frames(2)
  assert.equal(client.posts.length, 2)
  client.key("p")
  assert.equal(client.surface.state.game.phase, "paused")
  assert.equal(client.timers.size, 0)
  client.key("p")
  assert.equal(client.surface.state.game.phase, "playing")
  assert.equal(client.timers.size, 1)
  FlappyClient({ ...props, focused: false }, client.surface)
  assert.equal(client.surface.state.game.phase, "paused")
  assert.equal(client.timers.size, 0)
  client.pointer("down", "right")
  assert.equal(client.surface.state.game.phase, "paused")
  client.pointer("down")
  assert.equal(client.surface.state.game.phase, "playing")
})

function measuredRows(element) {
  if (element.type === "Text" || element.type === "Button") return 1
  const heights = element.props.children.map(measuredRows)
  return element.props.flexDirection === "row" ? Math.max(0, ...heights) : heights.reduce((sum, value) => sum + value, 0)
}

function allElements(element) {
  return [element, ...(element.props.children ?? []).filter((child) => typeof child !== "string").flatMap(allElements)]
}

test("Claude native drawing stays inside the host body height, including tiny panes", async () => {
  const host = createHost()
  for (const bodyRows of [0, 1, 2, 3, 4, 5, 12, 29, 30, 60]) {
    const entry = await host.emit("ui.render", {
      component: "Pane", requestId: PANE, surface: "desktop",
      props: { isFocused: true, scroll: { bodyRows } },
    })
    const client = createSurface()
    const drawing = FlappyClient(entry.props.props, client.surface)
    const height = measuredRows(drawing)
    assert.ok(height <= bodyRows, `${height} drawn rows exceed a ${bodyRows}-row pane`)
    assert.ok(height <= entry.props.height)
    if (bodyRows === 29) assert.equal(height, 29)
    for (const element of allElements(drawing)) {
      assert.equal(element.props.mono, undefined)
      if (element.type === "Text" && element.props.children.some((child) => typeof child !== "string")) assert.equal(element.props.wrap, "truncate")
    }
  }
})

test("Claude pointer input is limited to the board and does not double-trigger pause controls", () => {
  const client = createSurface()
  const props = { best: 0, locale: "en", focused: true, bodyRows: 29 }
  let tree = FlappyClient(props, client.surface)
  client.key("w")
  client.key("p")
  assert.equal(client.surface.state.game.phase, "paused")
  const controlsY = measuredRows(tree) - 1
  client.pointer("down", "left", { x: 2, y: controlsY })
  assert.equal(client.surface.state.game.phase, "paused")
  const pause = allElements(tree).find((element) => element.type === "Button" && element.props.key === "pause")
  pause.props.onPress()
  assert.equal(client.surface.state.game.phase, "playing")
  client.key("p")
  for (const position of [{ x: 2, y: 0 }, { x: 2, y: controlsY - 1 }, { x: 2, y: controlsY - 2 }, { x: -1, y: 3 }, { x: 44, y: 3 }]) {
    client.pointer("down", "left", position)
    assert.equal(client.surface.state.game.phase, "paused")
  }
  client.pointer("down", "left", { x: 2, y: 1, fine: { x: 2.2, y: 1.2 } })
  assert.equal(client.surface.state.game.phase, "playing")
  client.key("p")
  tree = FlappyClient({ ...props, bodyRows: 4 }, client.surface)
  client.pointer("down", "left", { x: 2, y: 1 })
  assert.equal(client.surface.state.game.phase, "paused")
  assert.equal(measuredRows(tree), 4)
})

test("Claude generated physics matches the shared implementation across the same round", () => {
  const require = createRequire(import.meta.url)
  const common = require("../game/core.cjs")
  const original = common.createGame(() => {}, { best: 9, random: () => 0.5 })
  const native = createGame(() => {}, { best: 9, random: () => 0.5 })
  original.press()
  native.press()
  for (let frame = 0; frame < 1200; frame++) {
    if (frame % 52 === 0) { original.press(); native.press() }
    original.step(common.constants.STEP)
    native.step(common.constants.STEP)
    assert.equal(native.bird.y, original.bird.y)
    assert.equal(native.score, original.score)
    assert.equal(native.phase, original.phase)
  }
})

test("Claude generated modules are current", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-claude.mjs", import.meta.url)), "--check"], { stdio: "pipe" })
})
