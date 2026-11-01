import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
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

test("agent status stays isolated across chats and overlapping turns", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("UserPromptSubmit", "chat-a", "turn-b"), directory, 110)
  applyEvent(event("UserPromptSubmit", "chat-b", "turn-a"), directory, 120)
  applyEvent(event("Stop"), directory, 130)
  assert.equal(readStatus("chat-a", directory, 140).state, "running")
  assert.equal(readStatus("chat-a", directory, 140).activeTurns, 1)
  applyEvent(event("Interrupt", "chat-a", "turn-b"), directory, 150)
  assert.equal(readStatus("chat-a", directory, 160).state, "interrupted")
  assert.equal(readStatus("chat-b", directory, 160).state, "running")
  assert.equal(readStatus(null, directory, 160).state, "unlinked")
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
})

test("resuming clears abandoned running turns, while compaction preserves live work", (t) => {
  const directory = stateDirectory(t)
  applyEvent(event("UserPromptSubmit"), directory, 100)
  applyEvent(event("SessionStart", "chat-a", "turn-a", { source: "resume" }), directory, 200)
  assert.equal(readStatus("chat-a", directory, 210).state, "unknown")
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

test("hook requests opening once and stores no prompts, transcripts, or paths", (t) => {
  const directory = stateDirectory(t)
  const sensitive = { prompt: "private prompt", transcript_path: "/private/transcript", cwd: "/private/project", last_assistant_message: "private response" }
  const first = handleHook(event("UserPromptSubmit", "../../escape", "turn", sensitive), directory)
  assert.equal(first.hookSpecificOutput.hookEventName, "UserPromptSubmit")
  assert.equal(handleHook(event("UserPromptSubmit", "../../escape", "another-turn", sensitive), directory), null)
  const readTree = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? readTree(path.join(folder, entry.name)) : fs.readFileSync(path.join(folder, entry.name), "utf8"))
  const stored = readTree(directory).join("\n")
  for (const value of Object.values(sensitive)) assert.equal(stored.includes(value), false)
  assert.equal(stored.includes("../../escape"), false)
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

test("embedded bridge polls without model calls and only closes an idle automatic game", async () => {
  async function run(autoOpened, closeSupported = true) {
    let now = 100
    let engaged = true
    let phase = "playing"
    let closed = 0
    let nextTimer = 0
    let agentState = "running"
    const timers = new Map()
    const listeners = new Map()
    const calls = []
    const notice = { textContent: "" }
    const parent = { postMessage(message) {
      calls.push(message)
      if (!message.id) return
      const result = message.method === "ui/initialize" ? { hostContext: { displayMode: "fullscreen" } } : { structuredContent: { sessionId: "chat-a", status: { state: agentState } } }
      queueMicrotask(() => listeners.get("message")({ source: parent, data: { jsonrpc: "2.0", id: message.id, result } }))
    } }
    const window = { parent, innerHeight: 700, openai: closeSupported ? { requestClose: () => { closed++ } } : {}, addEventListener: (name, fn) => listeners.set(name, fn) }
    vm.runInNewContext(fs.readFileSync(path.join(root, "adapters/codex/app.js"), "utf8"), {
      window,
      document: { hidden: false, documentElement: { style: { setProperty() {} } }, getElementById: (id) => id === "notice" ? notice : { appendChild() {} } },
      navigator: { language: "en" },
      Flappy: { translate: () => (key) => key, createEngine: () => ({ mount: () => ({ root: {} }), wake() {}, dispose() {}, engaged: () => engaged, phase: () => phase }) },
      Date: { now: () => now },
      setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer },
      clearTimeout: (id) => timers.delete(id),
    })
    const settle = () => new Promise((resolve) => setImmediate(resolve))
    await settle()
    listeners.get("message")({ source: parent, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { sessionId: "chat-a", autoOpened, status: { state: "running" } } } } })
    async function tick() {
      const [id, timer] = [...timers.entries()].find(([, timer]) => timer.delay === 1000)
      timers.delete(id)
      timer.fn()
      await settle()
    }
    agentState = "response-ended"
    await tick()
    now += 5000
    await tick()
    assert.equal(closed, 0, "an active round must not be interrupted")
    engaged = false
    phase = "paused"
    await tick()
    assert.equal(closed, 0, "a paused round must remain resumable")
    phase = "over"
    await tick()
    assert.equal(closed, autoOpened && closeSupported ? 1 : 0)
    assert.equal(calls.some((call) => call.method === "ui/message"), false)
    assert.ok(calls.filter((call) => call.method === "tools/call").every((call) => call.params.name === "get_status"))
  }
  await run(true)
  await run(false)
  await run(true, false)
})
