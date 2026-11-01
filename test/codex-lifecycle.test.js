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
const { createHandler } = require("../adapters/codex/server.cjs")
const { createGame, constants } = require("../game/core.cjs")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runHook(directory, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "adapters/codex/hook.cjs")], {
      env: { ...process.env, FLAPPY_CODEX_DATA: directory },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("close", (code) => {
      if (code !== 0 || stderr) return reject(new Error(stderr || `Hook exited with ${code}`))
      resolve(stdout.trim() ? JSON.parse(stdout) : null)
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

// Exercise the shipped app's status handling; only its rendering and host transport are simulated.
async function connectApp(t, handle, sessionId, game) {
  let nextTimer = 0
  let lastStatus
  const timers = new Map()
  const listeners = new Map()
  const notice = { textContent: "" }
  const parent = { postMessage(message) {
    if (message.id === undefined || !message.method) return
    Promise.resolve().then(async () => {
      if (message.method === "ui/initialize") {
        return { jsonrpc: "2.0", id: message.id, result: { hostContext: { displayMode: "fullscreen" } } }
      }
      assert.equal(message.method, "tools/call")
      assert.equal(message.params.name, "get_status")
      const reply = await handle({ ...message, params: { ...message.params, _meta: { thread_id: sessionId } } })
      assert.equal(reply.error, undefined)
      lastStatus = reply.result.structuredContent.status
      return reply
    }).then((data) => listeners.get("message")({ source: parent, data }))
  } }
  vm.runInNewContext(fs.readFileSync(path.join(root, "adapters/codex/app.js"), "utf8"), {
    window: { parent, innerHeight: 700, addEventListener: (name, listener) => listeners.set(name, listener) },
    document: {
      hidden: false,
      documentElement: { style: { setProperty() {} } },
      getElementById: (id) => id === "notice" ? notice : { appendChild() {} },
    },
    navigator: { language: "en" },
    Flappy: {
      translate: () => (key) => key,
      createEngine: () => ({ mount: () => ({ root: {} }), wake() {}, dispose() {}, setRunning: game.setRunning }),
    },
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay }); return nextTimer },
    clearTimeout: (id) => timers.delete(id),
  })
  t.after(() => listeners.get("pagehide")())
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  await settle()
  return {
    get status() { return lastStatus },
    async poll() {
      const scheduled = [...timers.entries()].find(([, timer]) => timer.delay === 1000)
      assert.ok(scheduled, "the app schedules its own status polling")
      const [id, timer] = scheduled
      timers.delete(id)
      await timer.fn()
      await settle()
      return lastStatus
    },
  }
}

test("native hook processes recover a lost Stop and finish the embedded round on the current response", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flappy-codex-lifecycle-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const sessionId = "019a0000-0000-7000-8000-000000000001"
  const payload = (hook_event_name, turn_id) => ({
    session_id: sessionId,
    turn_id,
    hook_event_name,
    cwd: path.join(directory, "nonexistent-project"),
    transcript_path: path.join(directory, "nonexistent-transcript.jsonl"),
    permission_mode: "never",
    model: "test-model",
    ...(hook_event_name === "UserPromptSubmit"
      ? { prompt: "Synthetic integration test prompt" }
      : { stop_hook_active: false, last_assistant_message: "Synthetic completed response" }),
  })
  const oldTurn = "019a0000-0000-7000-8000-000000000002"
  const currentTurn = "019a0000-0000-7000-8000-000000000003"
  const opening = await runHook(directory, payload("UserPromptSubmit", oldTurn))
  assert.equal(opening.hookSpecificOutput.hookEventName, "UserPromptSubmit")

  const resultFile = path.join(directory, "result.json")
  const saved = { best: 0, lastScore: 0 }
  const writes = { best: 0, score: 0 }
  const persist = () => fs.writeFileSync(resultFile, JSON.stringify(saved))
  const game = createGame(() => {}, {
    random: () => 0.5,
    saveBest: (best) => { saved.best = best; writes.best++; persist() },
    saveScore: (lastScore) => { saved.lastScore = lastScore; writes.score++; persist() },
  })
  const handle = createHandler({ directory })
  const initialized = await handle({ jsonrpc: "2.0", id: "init", method: "initialize", params: {
    protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lifecycle-test", version: "1" },
  } })
  assert.equal(initialized.error, undefined)
  const app = await connectApp(t, handle, sessionId, game)
  assert.equal(app.status.state, "running")
  game.press()
  for (let steps = 0; game.score < 3 && steps < 3000; steps++) {
    if (game.bird.y >= constants.READY_Y && game.bird.vy > 0) game.press()
    game.step(constants.STEP)
    assert.equal(game.phase, "playing", "the round earns its score by passing pipes")
  }
  assert.equal(game.score, 3)

  // The old Stop was lost during an upgrade. A new main turn must supersede that stale start.
  await runHook(directory, payload("UserPromptSubmit", currentTurn))
  assert.equal((await app.poll()).activeTurns, 1)
  assert.equal(app.status.state, "running")
  assert.equal(game.phase, "playing")
  assert.equal(fs.existsSync(resultFile), false)

  // Never deliver oldTurn's Stop: the current response must finish the game despite its stale record.
  assert.equal(await runHook(directory, payload("Stop", currentTurn)), null)
  assert.equal((await app.poll()).state, "response-ended")
  assert.equal(app.status.activeTurns, 0)
  assert.equal(game.phase, "finished")
  assert.equal(game.locked, true)
  assert.equal(game.score, 3)
  assert.equal(game.best, 3)
  assert.deepEqual(JSON.parse(fs.readFileSync(resultFile, "utf8")), { best: 3, lastScore: 3 })

  const finalPosition = { y: game.bird.y, scroll: game.scroll, time: game.time }
  game.press()
  game.toggle()
  game.step(1)
  await app.poll()
  assert.equal(game.phase, "finished", "input cannot restart the game until the next response starts")
  assert.deepEqual({ y: game.bird.y, scroll: game.scroll, time: game.time }, finalPosition)
  assert.deepEqual(writes, { best: 1, score: 1 }, "repeat status polls do not save or finish twice")
  const reloaded = createGame(() => {}, JSON.parse(fs.readFileSync(resultFile, "utf8")))
  reloaded.setRunning(false)
  assert.equal(reloaded.score, 3, "a remounted completed game retains its final result")
  assert.equal(reloaded.best, 3)
})
