"use strict"

const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const { createHash, randomUUID } = require("node:crypto")

const MAX_AGE = 24 * 60 * 60 * 1000
const turnEvents = { UserPromptSubmit: "running", Stop: "response-ended", Interrupt: "interrupted" }

function dataDirectory(env = process.env) {
  return env.FLAPPY_CODEX_DATA || path.join(env.CODEX_HOME || path.join(os.homedir(), ".codex"), "flappy-coding-break")
}

function key(value) {
  return createHash("sha256").update(value).digest("hex")
}

function identifier(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 ? value : null
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null
    throw error
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(temporary, file)
}

function applyEvent(event, directory = dataDirectory(), now = Date.now()) {
  const sessionId = identifier(event?.session_id)
  if (!sessionId) return null
  const name = event.hook_event_name
  if (name === "SubagentStart") {
    const agentId = identifier(event.agent_id)
    if (agentId) writeJson(path.join(directory, "subagents", key(agentId)), { parent: key(sessionId) })
    return null
  }
  if (event.agent_id || event.agent_type || name === "SubagentStop" || readJson(path.join(directory, "subagents", key(sessionId)))) return null
  const session = path.join(directory, "sessions", key(sessionId))
  if (name === "SessionEnd" || name === "SessionStart") {
    const previous = readJson(path.join(session, "lifecycle.json"))
    const resetAt = name === "SessionStart" && event.source !== "compact" ? now : previous?.resetAt ?? 0
    writeJson(path.join(session, "lifecycle.json"), { event: name, updatedAt: now, resetAt })
    return { sessionId, event: name }
  }
  const state = turnEvents[name]
  const turnId = identifier(event.turn_id)
  if (!state || !turnId) return null
  writeJson(path.join(session, "turns", `${key(turnId)}.json`), { state, updatedAt: now })
  return { sessionId, turnId, event: name }
}

function claimOpenRequest(sessionId, turnId, directory = dataDirectory()) {
  if (!identifier(sessionId) || !identifier(turnId)) return false
  const file = path.join(directory, "sessions", key(sessionId), "turns", `${key(turnId)}.open-requested`)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  try {
    fs.writeFileSync(file, "1", { flag: "wx", mode: 0o600 })
    return true
  } catch (error) {
    if (error.code === "EEXIST") return false
    throw error
  }
}

function readStatus(sessionId, directory = dataDirectory(), now = Date.now()) {
  if (!identifier(sessionId)) return { state: "unlinked", activeTurns: 0 }
  const session = path.join(directory, "sessions", key(sessionId))
  const lifecycle = readJson(path.join(session, "lifecycle.json"))
  let files
  try {
    files = fs.readdirSync(path.join(session, "turns"))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    files = []
  }
  const turns = files.filter((file) => file.endsWith(".json")).map((file) => readJson(path.join(session, "turns", file)))
    .filter((turn) => turn && Number.isFinite(turn.updatedAt) && turn.updatedAt >= (lifecycle?.resetAt ?? 0) && now - turn.updatedAt < MAX_AGE)
  const latest = turns.sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (lifecycle?.event === "SessionEnd" && lifecycle.updatedAt >= (latest?.updatedAt ?? 0)) {
    return { state: "ended", activeTurns: 0, updatedAt: lifecycle.updatedAt }
  }
  const activeTurns = turns.filter((turn) => turn.state === "running").length
  return { state: activeTurns ? "running" : latest?.state ?? "unknown", activeTurns, updatedAt: latest?.updatedAt ?? lifecycle?.updatedAt ?? null }
}

module.exports = { dataDirectory, identifier, applyEvent, claimOpenRequest, readStatus }
