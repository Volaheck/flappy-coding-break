import { constants } from "./core.js"
import { DUCK, DUCK_FRAMES } from "./art.js"
import { hexToRgb } from "./field.js"
import { duckScale, duckTilt } from "./theme.js"

// A row of a duck raster as runs: transparent ones carry a length alone, opaque ones a colour, and
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
const ANGLES = DUCK_FRAMES.angles.map((degrees) => (degrees * Math.PI) / 180)
const BASE_PIXEL = (constants.DUCK_SIZE / DUCK.size) * (DUCK_FRAMES.span / DUCK_FRAMES.size)

// The pre-tilted raster nearest the duck's lean, centred on its collider, and the world size of one of
// its pixels, swelling with a fresh flap.
export function duckRaster(game) {
  const tilt = duckTilt(game.phase, game.bird.angle)
  let nearest = 0
  for (let index = 1; index < ANGLES.length; index++) if (Math.abs(ANGLES[index] - tilt) < Math.abs(ANGLES[nearest] - tilt)) nearest = index
  const pixel = BASE_PIXEL * duckScale(game.phase, game.bird.wing)
  return { rows: FRAMES[nearest], pixel, span: DUCK_FRAMES.size * pixel }
}
