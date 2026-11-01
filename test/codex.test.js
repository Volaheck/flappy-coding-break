import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const { applyEvent, readStatus } = require("../adapters/codex/state.cjs")
const { handleHook } = require("../adapters/codex/hook.cjs")
const { createHandler, RESOURCE_URI, MIME_TYPE } = require("../adapters/codex/server.cjs")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function stateDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flappy-codex-test-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

const event = (hook_event_name, session_id = "chat-a", turn_id = "turn-a", extra = {}) => ({ hook_event_name, session_id, turn_id, ...extra })
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }

test("new main turns supersede previous work and stay isolated across chats", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 110)
  applyEvent(event("UserPromptSubmit", "chat-b", "turn-a"), directory, 120)
  applyEvent(event("Stop"), directory, 130)
  assert.equal(readStatus("chat-a", directory, 140).state, "running")
  assert.equal(readStatus("chat-a", directory, 140).activeTurns, 1)
  assert.equal(readStatus("chat-a", directory, 140).updatedAt, 110)
  applyEvent(event("Interrupt", "chat-a", "turn-b"), directory, 150)
  assert.equal(readStatus("chat-a", directory, 160).state, "interrupted")
  assert.equal(readStatus("chat-b", directory, 160).state, "running")
  assert.equal(readStatus(null, directory, 160).state, "unlinked")
})

test("a missed Stop cannot keep the game running after the next turn ends", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 200)
  assert.equal(readStatus("chat-a", directory, 210).activeTurns, 1)
  applyEvent(event("Stop", "chat-a", "turn-b"), directory, 300)
  assert.deepEqual(readStatus("chat-a", directory, 310), { state: "response-ended", activeTurns: 0, updatedAt: 300 })
  applyEvent(event("UserPromptSubmit"), directory, 400)
  assert.equal(readStatus("chat-a", directory, 410).state, "response-ended", "a retry from the superseded turn cannot become current again")
})

test("same-turn continuation resumes without changing its original start", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("Stop"), directory, 200)
  applyEvent(event("UserPromptSubmit"), directory, 300)
  assert.equal(readStatus("chat-a", directory, 310).state, "running")
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 350)
  applyEvent(event("UserPromptSubmit"), directory, 400)
  assert.equal(readStatus("chat-a", directory, 410).updatedAt, 350)
})

test("a terminal event without its start cannot supersede a known active turn", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("Stop", "chat-a", "turn-b"), directory, 200)
  assert.equal(readStatus("chat-a", directory, 210).state, "running")
  assert.equal(readStatus("chat-a", directory, 210).updatedAt, 100)
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 300)
  assert.equal(readStatus("chat-a", directory, 310).updatedAt, 300)
  applyEvent(event("Stop", "chat-a", "turn-b"), directory, 400)
  assert.equal(readStatus("chat-a", directory, 410).state, "response-ended")
})

test("a new turn supersedes legacy running records and late stops preserve their start estimate", (t) => {
  const directory = stateDirectory(t)
  const hash = (value) => createHash("sha256").update(value).digest("hex")
  const turns = path.join(directory, "sessions", hash("chat-a"), "turns")
  fs.mkdirSync(turns, { recursive: true })
  fs.writeFileSync(path.join(turns, `${hash("turn-a")}.json`), JSON.stringify({ state: "running", updatedAt: 100 }))
  assert.equal(readStatus("chat-a", directory, 110).state, "running")
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 200)
  applyEvent(event("Stop"), directory, 300)
  assert.equal(readStatus("chat-a", directory, 310).state, "running")
  assert.equal(readStatus("chat-a", directory, 310).updatedAt, 200)
  assert.equal(JSON.parse(fs.readFileSync(path.join(turns, `${hash("turn-a")}.json`))).startedAt, 100)
  applyEvent(event("Stop", "chat-a", "turn-b"), directory, 400)
  assert.equal(readStatus("chat-a", directory, 410).activeTurns, 0)
})

test("Stop means a response ended; continuation and SessionEnd remain distinct", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("Stop", "chat-a", "turn-a", { stop_hook_active: false }), directory, 200)
  assert.equal(readStatus("chat-a", directory, 250).state, "response-ended")
  applyEvent(event("UserPromptSubmit", "chat-a", "continuation"), directory, 300)
  assert.equal(readStatus("chat-a", directory, 350).state, "running")
  applyEvent(event("SessionEnd"), directory, 400)
  assert.equal(readStatus("chat-a", directory, 450).state, "ended")
  applyEvent(event("Stop", "chat-a", "continuation"), directory, 500)
  assert.equal(readStatus("chat-a", directory, 510).state, "ended", "late Stop cannot reopen a closed session")
})

test("resuming clears abandoned running turns, while compaction preserves live work", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("SessionStart", "chat-a", "turn-a", { source: "resume" }), directory, 200)
  assert.equal(readStatus("chat-a", directory, 210).state, "unknown")
  applyEvent(event("Stop"), directory, 215)
  assert.equal(readStatus("chat-a", directory, 216).state, "unknown", "late events from before resume remain discarded")
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 220)
  applyEvent(event("SessionStart", "chat-a", "turn-b", { source: "compact" }), directory, 230)
  assert.equal(readStatus("chat-a", directory, 240).state, "running")
  assert.equal(readStatus("chat-a", directory, 240).activeTurns, 1)
})

test("subagent lifecycle cannot stop or auto-open the parent game", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("SubagentStart", "chat-a", "turn-a", { agent_id: "child" }), directory, 110)
  applyEvent(event("SubagentStop", "chat-a", "turn-a", { agent_id: "child" }), directory, 120)
  applyEvent(event("Stop", "chat-a", "turn-a", { agent_type: "worker" }), directory, 130)
  assert.equal(readStatus("chat-a", directory, 140).state, "running")
  assert.equal(handleHook(event("UserPromptSubmit", "child"), directory), null)
  assert.equal(readStatus("child", directory).state, "unknown")
})

test("hook requests opening once per turn and stores no prompts, transcripts, or paths", (t) => {
  const directory = stateDirectory(t)
  const sensitive = { prompt: "private prompt", transcript_path: "/private/transcript", cwd: "/private/project", last_assistant_message: "private response" }
  const first = handleHook(event("UserPromptSubmit", "../../escape", "turn", sensitive), directory)
  assert.equal(first.hookSpecificOutput.hookEventName, "UserPromptSubmit")
  assert.equal(handleHook(event("UserPromptSubmit", "../../escape", "turn", sensitive), directory), null)
  assert.ok(handleHook(event("UserPromptSubmit", "../../escape", "another-turn", sensitive), directory))
  assert.ok(handleHook(event("UserPromptSubmit", "other-chat", "turn", sensitive), directory))
  const readTree = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? readTree(path.join(folder, entry.name)) : fs.readFileSync(path.join(folder, entry.name), "utf8"))
  const stored = readTree(directory).join("\n")
  for (const value of Object.values(sensitive)) assert.equal(stored.includes(value), false)
  assert.equal(stored.includes("../../escape"), false)
})

test("legacy chat-level markers do not suppress new turn openings", (t) => {
  const directory = stateDirectory(t)
  const session = path.join(directory, "sessions", createHash("sha256").update("chat-a").digest("hex"))
  fs.mkdirSync(session, { recursive: true })
  fs.writeFileSync(path.join(session, "open-requested"), "1")
  assert.ok(handleHook(event("UserPromptSubmit"), directory))
  assert.equal(handleHook(event("UserPromptSubmit"), directory), null)
  assert.ok(handleHook(event("UserPromptSubmit", "chat-a", "turn-b"), directory))
  assert.equal(readStatus("chat-a", directory).activeTurns, 1)
})

test("parallel hook retries request one opening per turn while tracking only the current main turn", async (t) => {
  const directory = stateDirectory(t)
  const invoke = (turn) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "adapters/codex/hook.cjs")], { env: { ...process.env, FLAPPY_CODEX_DATA: directory }, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 && !stderr ? resolve(stdout.trim()) : reject(new Error(stderr || `Hook exited with ${code}`)))
    child.stdin.end(JSON.stringify(event("UserPromptSubmit", "chat-a", turn)))
  })
  for (const turn of ["turn-a", "turn-b"]) {
    const replies = await Promise.all(Array.from({ length: 8 }, () => invoke(turn)))
    assert.equal(replies.filter(Boolean).length, 1)
    assert.equal(JSON.parse(replies.find(Boolean)).hookSpecificOutput.hookEventName, "UserPromptSubmit")
  }
  assert.equal(readStatus("chat-a", directory).activeTurns, 1)
  applyEvent(event("Stop"), directory)
  assert.equal(readStatus("chat-a", directory).activeTurns, 1)
  applyEvent(event("Stop", "chat-a", "turn-b"), directory)
  assert.equal(readStatus("chat-a", directory).activeTurns, 0)
})

test("MCP exposes a native thread entrypoint and keeps status app-only", async (t) => {
  const handle = createHandler({ directory: stateDirectory(t), html: () => "<canvas></canvas>" })
  assert.equal((await handle(initialize)).result.protocolVersion, "2025-06-18")
  const listed = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })
  const open = listed.result.tools.find((tool) => tool.name === "open_flappy")
  const status = listed.result.tools.find((tool) => tool.name === "get_status")
  assert.equal(open._meta.ui.resourceUri, RESOURCE_URI)
  assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "thread" }])
  assert.deepEqual(status._meta.ui.visibility, ["app"])
  const resource = await handle({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: RESOURCE_URI } })
  assert.equal(resource.result.contents[0].mimeType, MIME_TYPE)
  assert.equal(resource.result.contents[0].text, "<canvas></canvas>")
  assert.deepEqual(resource.result.contents[0]._meta.ui.csp.connectDomains, [])
})

test("host thread identity takes priority and missing identity never chooses latest chat", async (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory)
  applyEvent(event("Stop", "chat-b"), directory)
  const handle = createHandler({ directory })
  await handle(initialize)
  const linked = await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_status", arguments: { session_id: "chat-b" }, _meta: { thread_id: "chat-a" } } })
  assert.equal(linked.result.structuredContent.sessionId, "chat-a")
  assert.equal(linked.result.structuredContent.status.state, "running")
  const unlinked = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_status" } })
  assert.equal(unlinked.result.structuredContent.status.state, "unlinked")
})

test("MCP rejects bad input without leaking filesystem errors", async (t) => {
  const handle = createHandler({ directory: stateDirectory(t) })
  assert.equal((await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })).error.code, -32002)
  await handle(initialize)
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null)
  assert.equal((await handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "file:///etc/passwd" } })).error.code, -32002)
  assert.equal((await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_status", arguments: { session_id: 42 } } })).error.code, -32602)
  assert.equal((await handle({ jsonrpc: "2.0", id: 4, method: "unknown" })).error.code, -32601)
  assert.equal((await handle([])).error.code, -32600)
})

test("stdio survives malformed lines, fragmented UTF-8, and notifications", async (t) => {
  const directory = stateDirectory(t)
  const child = spawn(process.execPath, [path.join(root, "adapters/codex/server.cjs")], { env: { ...process.env, FLAPPY_CODEX_DATA: directory }, stdio: ["pipe", "pipe", "pipe"] })
  t.after(() => child.kill())
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
  child.stdin.write("{bad json}\n" + JSON.stringify(initialize) + "\n" + JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n")
  const request = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: "птица", method: "tools/call", params: { name: "open_flappy", arguments: { session_id: "чат" } } }) + "\n")
  const split = request.indexOf(Buffer.from("п")) + 1
  child.stdin.write(request.subarray(0, split))
  child.stdin.end(request.subarray(split))
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr))) })
  const messages = stdout.trim().split("\n").map(JSON.parse)
  assert.equal(messages.length, 3)
  assert.equal(messages[0].error.code, -32700)
  assert.equal(messages[1].id, 1)
  assert.equal(messages[2].id, "птица")
  assert.equal(messages[2].result.structuredContent.sessionId, "чат")
  assert.equal(stderr, "")
})

async function embeddedApp() {
  let nextTimer = 0
  let closeRequests = 0
  let disposals = 0
  let reply = { result: { structuredContent: { sessionId: "chat-a", status: { state: "running" } } } }
  const timers = new Map()
  const listeners = new Map()
  const calls = []
  const running = []
  const notice = { textContent: "" }
  const parent = { postMessage(message) {
    calls.push(message)
    if (message.id === undefined || !message.method) return
    const response = message.method === "ui/initialize" ? { result: { hostContext: { displayMode: "fullscreen" } } } : reply
    queueMicrotask(() => listeners.get("message")({ source: parent, data: { jsonrpc: "2.0", id: message.id, ...response } }))
  } }
  const window = { parent, innerHeight: 700, openai: { requestClose: () => { closeRequests++ } }, addEventListener: (name, fn) => listeners.set(name, fn) }
  vm.runInNewContext(fs.readFileSync(path.join(root, "adapters/codex/app.js"), "utf8"), {
    window,
    document: { hidden: false, documentElement: { style: { setProperty() {} } }, getElementById: (id) => id === "notice" ? notice : { appendChild() {} } },
    navigator: { language: "en" },
    Flappy: { translate: () => (key) => key, createEngine: () => ({ mount: () => ({ root: {} }), wake() {}, dispose() { disposals++ }, setRunning: (value) => running.push(value) }) },
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer },
    clearTimeout: (id) => timers.delete(id),
  })
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  await settle()
  return {
    calls, running, notice,
    get closeRequests() { return closeRequests },
    get disposals() { return disposals },
    notify(data) {
      listeners.get("message")({ source: parent, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: data } } })
    },
    async poll(response) {
      reply = response
      const [id, timer] = [...timers.entries()].find(([, timer]) => timer.delay === 1000)
      timers.delete(id)
      timer.fn()
      await settle()
    },
    teardown() {
      listeners.get("message")({ source: parent, data: { jsonrpc: "2.0", id: "teardown", method: "ui/resource-teardown" } })
    },
  }
}

test("embedded game ends immediately on every terminal status and keeps its panel open", async () => {
  for (const state of ["response-ended", "interrupted", "ended"]) {
    const app = await embeddedApp()
    assert.deepEqual(app.running, [true])
    app.notify({ sessionId: "chat-a", autoOpened: true, status: { state } })
    assert.deepEqual(app.running, [true, false], "the stop signal is immediate, regardless of the round phase")
    for (let i = 0; i < 5; i++) await app.poll({ result: { structuredContent: { status: { state } } } })
    assert.equal(app.closeRequests, 0, "results remain visible even in an automatically opened panel")
    assert.equal(app.disposals, 0)
    assert.equal(app.calls.some((call) => call.method === "ui/message"), false)
    assert.ok(app.calls.filter((call) => call.method === "tools/call").every((call) => call.params.name === "get_status"))
    app.teardown()
    assert.equal(app.disposals, 1, "only host teardown disposes the game")
  }
})

test("unknown status and connection failures cannot unlock a finished game", async () => {
  const app = await embeddedApp()
  await app.poll({ result: { structuredContent: { status: { state: "response-ended" } } } })
  assert.deepEqual(app.running, [true, false])
  for (const state of ["unknown", "unlinked"]) {
    await app.poll({ result: { structuredContent: { status: { state } } } })
  }
  await app.poll({ result: { isError: true } })
  await app.poll({ error: { code: -32603, message: "Connection lost" } })
  await app.poll({ result: {} })
  assert.deepEqual(app.running, [true, false], "loss of status preserves the game's last known lock")
  assert.equal(app.closeRequests, 0)
  await app.poll({ result: { structuredContent: { status: { state: "running" } } } })
  assert.deepEqual(app.running, [true, false, true], "only a running response enables another round")
  assert.equal(app.notice.textContent, "")
  app.teardown()
})
