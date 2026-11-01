#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { StringDecoder } = require("node:string_decoder")
const { dataDirectory, identifier, readStatus } = require("./state.cjs")
const { version } = require("../../package.json")

const RESOURCE_URI = "ui://flappy-coding-break/game-v1.html"
const MIME_TYPE = "text/html;profile=mcp-app"
const MAX_MESSAGE = 4 * 1024 * 1024
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const inputSchema = { type: "object", properties: { session_id: { type: "string", minLength: 1, maxLength: 256 } }, additionalProperties: false }
const openSchema = { ...inputSchema, properties: { ...inputSchema.properties, auto_opened: { type: "boolean", description: "True only for the automatic opening requested by the Flappy startup hook." } } }
const tools = [
  {
    name: "open_flappy",
    title: "Flappy Bird",
    description: "Open Flappy Bird inside the Codex desktop chat side panel. Call once to show the game, then continue working. Requires an MCP Apps UI host; never opens an external window.",
    inputSchema: openSchema,
    annotations,
    _meta: {
      ui: { resourceUri: RESOURCE_URI, visibility: ["model", "app"] },
      "openai/ui": { entrypoints: [{ type: "thread" }], preferredModelDisplayMode: "fullscreen" },
    },
  },
  {
    name: "get_status",
    title: "Flappy agent status",
    description: "Read current-chat lifecycle status for the game UI. This local read never invokes the model.",
    inputSchema,
    annotations,
    _meta: { ui: { visibility: ["app"] }, "openai/visibility": "private", "openai/widgetAccessible": true },
  },
]

function resourceHtml() {
  const bundle = fs.readFileSync(path.join(__dirname, "../../web/game.js"), "utf8")
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  const script = `${bundle}\n;\n${app}`.replace(/<\/script/gi, "<\\/script")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flappy Bird</title><style>
    :root{color-scheme:light dark;--game-height:100vh}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100vh;overflow:hidden}body{font-family:system-ui,sans-serif}#game{width:100%;height:var(--game-height);min-height:360px}#notice{position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:12px;line-height:1.3;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none}#notice:empty{display:none}
  </style></head><body><main id="game" aria-label="Flappy Bird"></main><div id="notice" role="status" aria-live="polite"></div><script>${script}</script></body></html>`
}

function rpcError(code, message) {
  return Object.assign(new Error(message), { code })
}

function sessionFrom(params) {
  return identifier(params?._meta?.thread_id) || identifier(params?._meta?.threadId) || identifier(params?.arguments?.session_id)
}

function createHandler({ directory = dataDirectory(), html = resourceHtml } = {}) {
  let initialized = false
  return async function handle(message) {
    if (!message || Array.isArray(message) || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string" || ("id" in message && typeof message.id !== "string" && typeof message.id !== "number")) {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }
    }
    const { id, method, params = {} } = message
    if (!("id" in message)) return null
    try {
      if (!params || typeof params !== "object" || Array.isArray(params)) throw rpcError(-32602, "Invalid params")
      let result
      if (method === "initialize") {
        if (typeof params.protocolVersion !== "string" || !params.clientInfo || !params.capabilities) throw rpcError(-32602, "Invalid initialize params")
        initialized = true
        result = { protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"].includes(params.protocolVersion) ? params.protocolVersion : "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "flappy-coding-break", title: "Flappy Coding Break", version } }
      } else if (method === "ping") {
        result = {}
      } else {
        if (!initialized) throw rpcError(-32002, "Server not initialized")
        if (method === "tools/list") result = { tools }
        else if (method === "resources/list") result = { resources: [{ uri: RESOURCE_URI, name: "Flappy Bird", mimeType: MIME_TYPE }] }
        else if (method === "resources/templates/list") result = { resourceTemplates: [] }
        else if (method === "resources/read") {
          if (params.uri !== RESOURCE_URI) throw rpcError(-32002, "Resource not found")
          result = { contents: [{ uri: RESOURCE_URI, mimeType: MIME_TYPE, text: html(), _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } } }] }
        } else if (method === "tools/call") {
          if (!tools.some((tool) => tool.name === params.name)) throw rpcError(-32602, "Unknown tool")
          const args = params.arguments ?? {}
          const allowed = params.name === "open_flappy" ? ["session_id", "auto_opened"] : ["session_id"]
          if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some((key) => !allowed.includes(key)) || (args.session_id !== undefined && !identifier(args.session_id)) || (args.auto_opened !== undefined && typeof args.auto_opened !== "boolean")) throw rpcError(-32602, "Invalid tool arguments")
          const sessionId = sessionFrom(params)
          const status = readStatus(sessionId, directory)
          result = {
            content: [{ type: "text", text: params.name === "open_flappy" ? "Flappy Bird is available in this chat's embedded app panel. Keep working; the game updates its own status." : status.state }],
            structuredContent: { sessionId, status, ...(params.name === "open_flappy" ? { autoOpened: args.auto_opened === true } : {}) },
          }
        } else throw rpcError(-32601, "Method not found")
      }
      return { jsonrpc: "2.0", id, result }
    } catch (error) {
      return { jsonrpc: "2.0", id, error: { code: Number.isInteger(error.code) ? error.code : -32603, message: Number.isInteger(error.code) ? error.message : "Flappy could not complete the request" } }
    }
  }
}

function serve(input = process.stdin, output = process.stdout, options) {
  const handle = createHandler(options)
  const decoder = new StringDecoder("utf8")
  let buffer = ""
  let oversized = false
  let queue = Promise.resolve()
  function send(value) { if (value) output.write(`${JSON.stringify(value)}\n`) }
  function line(value) {
    if (!value.trim()) return
    queue = queue.then(async () => {
      let request
      try { request = JSON.parse(value) } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return }
      send(await handle(request))
    })
  }
  input.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk)
    let newline
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const value = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (oversized || value.length > MAX_MESSAGE) send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Message too large" } })
      else line(value)
      oversized = false
    }
    if (buffer.length > MAX_MESSAGE) { buffer = ""; oversized = true }
  })
  input.on("end", () => {
    buffer += decoder.end()
    if (!oversized) line(buffer)
  })
  output.on("error", (error) => { if (error.code !== "EPIPE") throw error })
}

if (require.main === module) serve()

module.exports = { RESOURCE_URI, MIME_TYPE, tools, createHandler, resourceHtml, serve }
