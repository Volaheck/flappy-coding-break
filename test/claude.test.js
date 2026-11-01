import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { register } from "../adapters/claude/register.js"
import FlappyClient from "../adapters/claude/client.js"
import { createGame } from "../adapters/claude/core.js"

const PANE = "flappy-coding-break"
const elements = Object.fromEntries(["Box", "Text", "Button", "Client", "Svg"].map((type) => [type, (props) => ({ type, props })]))
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }

function createHost(options = {}, surfaces = ["desktop"], shared = {}) {
  const handlers = []
  const panes = new Map()
  const timers = new Map()
  const store = shared.store ?? new Map()
  const opened = []
  const closed = []
  const commands = []
  const invalidations = []
  let now = 0
  let timerId = 0
  const host = {
    command: { register: async (command) => { commands.push(command) } },
    session: { surfaces: async () => surfaces, id: async () => shared.sessionId ?? "test-session" },
    store: { get: async (key) => store.get(key), set: async (key, value) => { store.set(key, value) } },
    clock: {
      now: async () => now,
      after(ms, fn) {
        const id = ++timerId
        timers.set(id, { at: now + ms, fn })
        return { cancel: () => timers.delete(id) }
      },
      every(ms, fn) {
        const id = ++timerId
        timers.set(id, { at: now + ms, interval: ms, fn })
        return { cancel: () => timers.delete(id) }
      },
    },
    ui: {
      log: () => {},
      invalidate: (event) => { invalidations.push(event) },
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
      if (timer.interval) timer.at += timer.interval
      else timers.delete(id)
      now = timer.interval ? timer.at - timer.interval : timer.at
      timer.fn()
      await flush()
    }
    now = end
    await flush()
  }
  const state = (phase, animating = phase === "playing", best = 0, lastScore = 0, score = lastScore) => emit("ui.message", {
    requestId: PANE, element: "flappy-game", data: { type: "state", phase, animating, best, lastScore, score },
  })
  register(on, options)
  return { emit, advance, state, panes, timers, opened, closed, commands, store, invalidations, api: host }
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

test("Claude auto-opens without taking focus and leaves completion results visible", async () => {
  const host = createHost()
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  assert.equal(host.opened.length, 1)
  assert.equal(host.opened[0].focus, undefined)
  await host.emit("turn.complete", { turnId: "a", reason: "answer", isAborted: false })
  await host.advance(10000)
  assert.ok(host.panes.has(PANE))
  assert.equal(host.closed.length, 0)
  assert.equal(host.timers.size, 1, "ownership is checked only while the result pane remains open")
  const tree = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true, scroll: { bodyRows: 29 } } })
  assert.equal(clientOf(tree).props.props.status, "done")
})

test("Claude persists the final score without auto-closing, including legacy autoClose true", async () => {
  const host = createHost({ autoClose: true })
  await host.emit("turn.start", { turnId: "a" })
  await host.advance(1000)
  await host.state("playing")
  await host.emit("turn.complete", { turnId: "a", reason: "aborted", isAborted: true })
  await host.advance(5000)
  assert.ok(host.panes.has(PANE))
  await host.state("finished", false, 10, 7)
  await host.advance(10000)
  assert.ok(host.panes.has(PANE))
  assert.equal(host.store.get("flappy.best"), 10)
  assert.equal(host.store.get("flappy.lastScore"), 7)
  await host.state("ready", true, 10, 0)
  assert.equal(host.store.get("flappy.lastScore"), 7)
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
  let tree = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true } })
  assert.equal(clientOf(tree).props.props.status, "running")
  await host.emit("turn.complete", { turnId: "b", reason: "error", isAborted: false })
  await host.advance(1500)
  assert.ok(host.panes.has(PANE))
  tree = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true } })
  assert.equal(clientOf(tree).props.props.status, "done")
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
  assert.equal(clientOf(tree).props.module, "./client.js")
  assert.equal(clientOf(tree).props.props.focused, true)
  assert.ok(allElements(tree).find((element) => element.type === "Svg").props.source.startsWith("<svg"))
  const terminal = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "terminal", props: { isFocused: true, scroll: { bodyRows: 30 } } })
  assert.equal(terminal.type, "Client")
  assert.deepEqual(await host.emit("ui.render", { component: "Pane", requestId: "other" }), { forwarded: true })
})

test("a new Claude pane closes older sessions, saves their latest score, and leaves unrelated panes alone", async () => {
  for (const oldAuto of [false, true]) {
    const store = new Map([["flappy.best", 20]])
    const older = createHost({}, ["desktop"], { store, sessionId: "older" })
    const newer = createHost({}, ["desktop"], { store, sessionId: "newer" })
    if (oldAuto) {
      await older.emit("turn.start", { turnId: "old" })
      await older.advance(1000)
    } else await older.emit("command.run", { command: "flappy" })
    older.panes.set("unrelated", { id: "unrelated" })
    await older.state("playing", true, 3, 2, 9)
    if (oldAuto) await newer.emit("command.run", { command: "flappy" })
    else {
      await newer.emit("turn.start", { turnId: "new" })
      await newer.advance(1000)
    }
    const owner = store.get("flappy.pane.owner")
    await older.advance(1000)
    assert.deepEqual(older.closed, [PANE])
    assert.ok(older.panes.has("unrelated"))
    assert.ok(newer.panes.has(PANE))
    assert.equal(store.get("flappy.pane.owner"), owner, "the older session never overwrites the new claim")
    assert.equal(store.get("flappy.best"), 20, "closing an old session cannot lower another session's record")
    assert.equal(store.get("flappy.lastScore"), 9)
    assert.equal(older.timers.size, 0)
    await older.advance(10000)
    assert.deepEqual(older.closed, [PANE])
    await newer.emit("session.end", { reason: "other" })
    assert.equal(newer.timers.size, 0)
  }
})

test("Claude redraws and repeated turn starts do not reclaim ownership of an existing pane", async () => {
  const store = new Map()
  const older = createHost({}, ["desktop"], { store, sessionId: "older" })
  const newer = createHost({}, ["desktop"], { store, sessionId: "newer" })
  await older.emit("command.run", { command: "flappy" })
  const first = store.get("flappy.pane.owner")
  await older.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: {} })
  await older.emit("turn.start", { turnId: "same-pane" })
  await older.advance(1000)
  assert.equal(store.get("flappy.pane.owner"), first)
  assert.equal(older.opened.length, 1)
  await newer.emit("command.run", { command: "flappy" })
  const next = store.get("flappy.pane.owner")
  await older.emit("turn.start", { turnId: "pending-open" })
  await older.advance(3000)
  assert.equal(older.opened.length, 1, "superseding cancels the old session's pending auto-open")
  assert.equal(store.get("flappy.pane.owner"), next)
})

test("the newest Claude pane refreshes the record saved when an older live game closes", async () => {
  const store = new Map()
  const older = createHost({}, ["desktop"], { store, sessionId: "older" })
  const newer = createHost({}, ["desktop"], { store, sessionId: "newer" })
  await older.emit("command.run", { command: "flappy" })
  await older.state("playing", true, 0, 0, 8)
  await newer.emit("command.run", { command: "flappy" })
  const render = () => newer.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true } })
  const client = createSurface()
  FlappyClient(clientOf(await render()).props.props, client.surface)
  assert.equal(client.surface.state.game.best, 0)
  await older.advance(1000)
  assert.equal(store.get("flappy.best"), 8)
  await newer.advance(1000)
  assert.deepEqual(newer.invalidations, ["ui.render"])
  const updated = FlappyClient(clientOf(await render()).props.props, client.surface)
  assert.equal(client.surface.state.game.best, 8)
  assert.match(JSON.stringify(updated), /Best: 8/)
  assert.equal(client.surface.state.game.phase, "ready", "the record refresh does not start or end a round")
  await newer.advance(1000)
  assert.equal(newer.invalidations.length, 1, "an unchanged record does not trigger another redraw")
})

test("a delayed Claude ownership read cannot close a pane reopened after the read started", async () => {
  const store = new Map()
  const host = createHost({}, ["desktop"], { store, sessionId: "session" })
  await host.emit("command.run", { command: "flappy" })
  let resolveOwner
  const originalGet = host.api.store.get
  host.api.store.get = (key) => key === "flappy.pane.owner"
    ? new Promise((resolve) => { resolveOwner = resolve })
    : originalGet(key)
  await host.advance(1000)
  assert.equal(typeof resolveOwner, "function")
  await host.emit("command.run", { command: "flappy" })
  host.api.store.get = originalGet
  await host.emit("command.run", { command: "flappy" })
  const reopenedOwner = store.get("flappy.pane.owner")
  resolveOwner("another-session:old-observation")
  await flush()
  assert.ok(host.panes.has(PANE))
  assert.equal(host.closed.length, 1, "only the explicit manual close occurred")
  assert.equal(store.get("flappy.pane.owner"), reopenedOwner)
  await host.advance(1000)
  assert.ok(host.panes.has(PANE))
})

test("Claude claims ownership only after the host actually opened the pane", async () => {
  const store = new Map([["flappy.pane.owner", "existing-session:existing-pane"]])
  const host = createHost({}, ["desktop"], { store })
  host.api.ui.open = async () => {}
  await host.emit("command.run", { command: "flappy" })
  assert.equal(store.get("flappy.pane.owner"), "existing-session:existing-pane")
  assert.equal(host.timers.size, 0)
})

test("Claude reloads resume watching existing panes without claiming them again", async () => {
  const store = new Map([["flappy.pane.owner", "newer:claim"]])
  const host = createHost({}, ["desktop"], { store, sessionId: "older" })
  host.panes.set(PANE, { id: PANE })
  await host.emit("session.start", {})
  assert.equal(store.get("flappy.pane.owner"), "newer:claim")
  await host.advance(1000)
  assert.equal(host.panes.has(PANE), false)
  assert.equal(host.timers.size, 0)
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

test("Claude Client reports score changes once without posting every animation frame", () => {
  const client = createSurface()
  FlappyClient({ best: 0, lastScore: 0, locale: "en", focused: true, status: "running", bodyRows: 29 }, client.surface)
  client.key("w")
  client.frames(3)
  const beforeScore = client.posts.length
  client.surface.state.game.score = 1
  client.frames(1)
  assert.equal(client.posts.length, beforeScore + 1)
  assert.equal(client.posts.at(-1).score, 1)
  client.frames(3)
  assert.equal(client.posts.length, beforeScore + 1)
})

test("Claude finishes live and paused rounds immediately, freezes the result, and locks every input", () => {
  for (const paused of [false, true]) {
    const client = createSurface()
    const props = { best: 5, lastScore: 3, locale: "en", focused: true, status: "running", bodyRows: 29 }
    FlappyClient(props, client.surface)
    client.key("w")
    client.surface.state.game.score = 9
    if (paused) client.key("p")
    const tree = FlappyClient({ ...props, status: "done" }, client.surface)
    const game = client.surface.state.game
    assert.equal(game.phase, "finished")
    assert.equal(game.locked, true)
    assert.equal(game.score, 9)
    assert.equal(game.lastScore, 9)
    assert.equal(game.best, 9)
    assert.equal(client.timers.size, 0)
    assert.equal(allElements(tree).filter((element) => element.type === "Button").length, 0)
    assert.ok(JSON.stringify(tree).includes("Round complete"))
    assert.ok(JSON.stringify(tree).includes("Score: 9"))
    assert.ok(JSON.stringify(tree).includes("Play again when the agent starts working"))
    const position = game.bird.y
    client.frames(100)
    client.key("w")
    client.key("p")
    client.pointer("down")
    FlappyClient({ ...props, status: "done" }, client.surface)
    FlappyClient({ ...props, status: "" }, client.surface)
    assert.equal(game.phase, "finished")
    assert.equal(game.locked, true)
    assert.equal(game.score, 9)
    assert.equal(game.bird.y, position)
    assert.equal(client.posts.filter((entry) => entry.phase === "finished").length, 1)
    FlappyClient(props, client.surface)
    assert.equal(game.phase, "finished")
    assert.equal(game.locked, false)
    assert.equal(game.score, 9)
    client.key("w")
    assert.equal(game.phase, "playing")
    assert.equal(game.score, 0)
  }
})

test("Claude reopens a completed response with its persisted score and best", async () => {
  const host = createHost()
  host.store.set("flappy.best", 12)
  host.store.set("flappy.lastScore", 8)
  await host.emit("session.start", { surface: "desktop", isInteractive: true })
  await host.emit("turn.start", { turnId: "a" })
  await host.emit("turn.complete", { turnId: "a", reason: "answer" })
  const entry = await host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true } })
  const client = createSurface()
  const drawing = FlappyClient(clientOf(entry).props.props, client.surface)
  assert.equal(client.surface.state.game.score, 8)
  assert.equal(client.surface.state.game.best, 12)
  assert.equal(client.surface.state.game.locked, true)
  const texts = textsOf(drawing)
  for (const expected of ["Round complete", "8", "12", "Play again when the agent starts working", "Agent is done"]) assert.ok(texts.includes(expected), expected)
  assert.equal(client.timers.size, 0)
})

function textsOf(tree) {
  return allElements(tree).filter((element) => element.type === "Text").map((element) => element.props.children.filter((child) => typeof child === "string").join("").trim())
}

function desktopClient(status = "running", bodyRows = 29, columns = 27) {
  const client = createSurface()
  client.surface.columns = columns
  const props = { best: 5, locale: "en", focused: true, status, bodyRows, surface: "desktop" }
  return { client, props, draw: () => FlappyClient(props, client.surface) }
}

test("Claude desktop shows the Canvas heads-up display for every phase and the agent's status", () => {
  const { client, props, draw } = desktopClient()
  let texts = textsOf(draw())
  for (const expected of ["Flappy Bird", "Click to start", "Best: 5", "Agent is working…"]) assert.ok(texts.includes(expected), expected)
  client.key("w")
  client.surface.state.game.score = 3
  const playing = draw()
  const score = allElements(playing).find((element) => element.type === "Text" && element.props.size === "title")
  assert.deepEqual(score.props.children, ["3"])
  client.key("p")
  texts = textsOf(draw())
  assert.ok(texts.includes("Paused") && texts.includes("3"))
  client.key("p")
  const game = client.surface.state.game
  game.score = 21
  game.bird.y = 1000
  client.frames(3)
  assert.equal(game.phase, "over")
  game.deadAt = game.time - 1
  texts = textsOf(draw())
  for (const expected of ["Game Over", "Score", "21", "Best", "🥈", "Click or Space to play again"]) assert.ok(texts.includes(expected), expected)
  props.status = "done"
  texts = textsOf(draw())
  for (const expected of ["Round complete", "Play again when the agent starts working", "Agent is done"]) assert.ok(texts.includes(expected), expected)
})

test("Claude desktop board layers are placed by explicit cells and leave the controls row in the flow", () => {
  for (const bodyRows of [9, 12, 29, 31]) {
    const { client, draw } = desktopClient("running", bodyRows)
    draw()
    client.key("w")
    client.frames(30)
    const tree = draw()
    const rows = bodyRows - 1
    const flow = tree.props.children.filter((child) => child.props.position !== "absolute")
    assert.equal(flow[0].props.height, rows)
    assert.equal(flow.length, 2)
    const overlays = tree.props.children.filter((child) => child.props.position === "absolute")
    assert.ok(overlays.length >= 4)
    for (const overlay of overlays) {
      assert.ok(Number.isInteger(overlay.props.top) && overlay.props.top >= 0 && overlay.props.top < rows)
      if (overlay.props.height !== undefined) assert.equal(overlay.props.height, rows)
    }
  }
  const { draw } = desktopClient("running", 8)
  assert.ok(allElements(draw()).every((element) => element.props.position !== "absolute"))
})

test("Claude desktop board stays well inside the Client tree bounds in its busiest frames", () => {
  for (const columns of [20, 27, 48, 120]) {
    const { client, draw } = desktopClient("running", 31, columns)
    draw()
    const game = client.surface.state.game
    game.press()
    game.scroll = 300
    game.pipes.length = 0
    game.pipes.push({ x: 384, gap: 230 }, { x: 560, gap: 170 }, { x: 736, gap: 300 })
    for (const angle of [-0.42, 0.4, 1.2, Math.PI / 2]) {
      game.bird.angle = angle
      game.bird.y = 236
      const tree = draw()
      const size = JSON.stringify(tree).length
      assert.ok(size < 80000, `${size} characters at ${columns} columns`)
      assert.ok(allElements(tree).length < 1500)
    }
  }
})

test("Claude desktop bird has smoothed edges finished against what lies behind it", () => {
  const { client, draw } = desktopClient()
  draw()
  const game = client.surface.state.game
  game.bird.y = 200
  const plain = new Set(["#f8c63f", "#fbe28f", "#e6a12a", "#3b2a20", "#ffffff", "#1b1b1b", "#f6662b", "#df4a16", "#fff6dc"])
  const bird = draw().props.children.filter((child) => child.props.position === "absolute")[2]
  const colors = allElements(bird).map((element) => element.props.backgroundColor).filter(Boolean)
  assert.ok(colors.some((color) => plain.has(color)))
  assert.ok(colors.filter((color) => !plain.has(color)).length > 20)
})

test("Claude desktop scenery takes the width the Client last laid out", async () => {
  const host = createHost()
  const render = () => host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true, bodyColumns: 44, scroll: { bodyRows: 29 } } })
  const scenery = (tree) => allElements(tree).find((element) => element.type === "Svg").props.source
  const wide = scenery(await render())
  await host.emit("ui.message", { requestId: PANE, element: "flappy-game", data: { type: "state", phase: "ready", animating: true, best: 0, score: 0, columns: 27 } })
  const narrow = scenery(await render())
  assert.notEqual(narrow, wide)
  assert.ok(Number(narrow.match(/height="(\d+)"/)[1]) > Number(wide.match(/height="(\d+)"/)[1]))
})

function clientOf(tree) {
  return allElements(tree).find((element) => element.type === "Client")
}

function measuredRows(element) {
  if (element.type === "Text" || element.type === "Button") return 1
  if (typeof element.props.height === "number") return element.props.height
  const heights = (element.props.children ?? []).map(measuredRows)
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
    const drawing = FlappyClient(clientOf(entry).props.props, client.surface)
    const height = measuredRows(drawing)
    assert.ok(height <= bodyRows, `${height} drawn rows exceed a ${bodyRows}-row pane`)
    assert.ok(height <= clientOf(entry).props.height)
    if (bodyRows === 29) assert.equal(height, 29)
    for (const element of allElements(drawing)) {
      assert.equal(element.props.mono, undefined)
      if (element.type === "Text" && element.props.children.some((child) => typeof child !== "string")) assert.equal(element.props.wrap, "truncate")
    }
  }
})

test("Claude desktop moves the board locally over a still Svg scene while the terminal keeps half blocks", async () => {
  for (const [surface, halfBlocks] of [["desktop", false], ["terminal", true]]) {
    const client = createSurface()
    const drawing = FlappyClient({ best: 0, locale: "en", focused: true, bodyRows: 29, surface }, client.surface)
    assert.equal(JSON.stringify(drawing).includes("▀"), halfBlocks)
    assert.equal(allElements(drawing).some((element) => element.type === "Box" && element.props.backgroundColor), !halfBlocks)
    assert.ok(client.posts.every((post) => post.frame === undefined))
    assert.ok(JSON.stringify(drawing).length < 100000)
  }
  const host = createHost()
  const render = () => host.emit("ui.render", { component: "Pane", requestId: PANE, surface: "desktop", props: { isFocused: true, scroll: { bodyRows: 29 } } })
  const source = allElements(await render()).find((element) => element.type === "Svg").props.source
  await host.emit("ui.message", { requestId: PANE, element: "flappy-game", data: { type: "state", phase: "playing", animating: true, best: 0, score: 4 } })
  assert.equal(allElements(await render()).find((element) => element.type === "Svg").props.source, source)
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
