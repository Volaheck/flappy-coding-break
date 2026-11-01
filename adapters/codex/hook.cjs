#!/usr/bin/env node
"use strict"

const { applyEvent, claimOpenRequest, dataDirectory } = require("./state.cjs")

function handleHook(event, directory = dataDirectory()) {
  const result = applyEvent(event, directory)
  if (result?.event !== "UserPromptSubmit" || !claimOpenRequest(result.sessionId, result.turnId, directory)) return null
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `Flappy Coding Break is installed. At the start of this turn in Codex desktop with embedded MCP Apps, open or show the game once with the flappy-coding-break open_flappy tool (session_id: ${JSON.stringify(result.sessionId)}, auto_opened: true), then continue the user's task. Do this for each new turn, even if the game was opened earlier in this chat. The UI tracks status itself; do not poll it with model tools. If embedded UI is unavailable, skip opening it. Never launch an external browser or window.`,
    },
  }
}

if (require.main === module) {
  let input = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    input += chunk
    if (input.length > 4 * 1024 * 1024) process.exit(0)
  })
  process.stdin.on("end", () => {
    try {
      const output = handleHook(JSON.parse(input))
      if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
    } catch {
      process.stderr.write("Flappy Coding Break could not update its local status.\n")
    }
  })
}

module.exports = { handleHook }
