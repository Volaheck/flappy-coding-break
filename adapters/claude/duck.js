import { DUCK_FRAMES } from "./art.js"
import { hexToRgb } from "./field.js"

// A row of a Flappy Duck frame as runs: transparent ones carry a length alone, opaque ones a colour, and
// partly transparent edge pixels a colour and an alpha to be mixed with whatever lies behind them.
function decodeRow(row) {
  const runs = []
  for (let index = 0; index < row.length;) {
    const token = row[index]
    if (token === ".") {
      runs.push({ length: parseInt(row[index + 1], 36) })
      index += 2
    } else if (token === "!") {
      runs.push({ length: 1, rgb: hexToRgb(`#${row.slice(index + 3, index + 9)}`), alpha: parseInt(row.slice(index + 1, index + 3), 16) / 255 })
      index += 9
    } else {
      runs.push({ length: parseInt(token, 36), hex: `#${row.slice(index + 1, index + 7)}` })
      index += 7
    }
  }
  return runs
}

const FRAMES = DUCK_FRAMES.frames.map((rows) => rows.map(decodeRow))
export const DUCK_PIXELS = DUCK_FRAMES.size

export function duckFrame(game) {
  return FRAMES[Math.floor(game.time * DUCK_FRAMES.fps) % FRAMES.length]
}
