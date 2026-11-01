"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { randomUUID } = require("node:crypto")

function claimPanel(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const id = randomUUID()
  const file = path.join(directory, "active-panel.json")
  const temporary = `${file}.${id}.tmp`
  fs.writeFileSync(temporary, JSON.stringify({ id }), { mode: 0o600 })
  fs.renameSync(temporary, file)
  return { id, active: true }
}

function panelStatus(id, directory) {
  try {
    return { id, active: JSON.parse(fs.readFileSync(path.join(directory, "active-panel.json"), "utf8")).id === id }
  } catch (error) {
    if (error.code === "ENOENT") return { id, active: false }
    throw error
  }
}

module.exports = { claimPanel, panelStatus }
