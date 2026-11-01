import { constants } from "./core.js"
import { CITY, CLOUDS } from "./art.js"
import { DUCK_PIXELS, duckFrame } from "./duck.js"
import { CITY_OFFSETS, hexToRgb, mixRgb, outlineAt, rgbToHex, wrap } from "./field.js"
import { THEME } from "./theme.js"

const { GROUND_Y, BIRD_X, DUCK_SIZE, PIPE_W, GAP } = constants
const ART = THEME.artScale
const CRATE = THEME.crate
const SKY = [hexToRgb(THEME.sky.inner), hexToRgb(THEME.sky.outer)]
// The sky's radial fade in a few steps, so neighbouring cells share a colour and a terminal line stays short.
const SKY_STEPS = Array.from({ length: 7 }, (_, step) => rgbToHex(mixRgb(SKY[0], SKY[1], step / 6)))

export function drawBoard(game, columns, rows, elements) {
  return halfBlockLines(paint(game, columns, rows * 2), columns, rows * 2, elements)
}

const grids = new WeakMap()

// A duck frame as one colour (or nothing) per pixel, for sampling at terminal resolution.
function duckGrid(frame) {
  let grid = grids.get(frame)
  if (grid) return grid
  grid = frame.map((runs) => {
    const row = []
    for (const run of runs) {
      const color = run.hex ?? (run.rgb && run.alpha >= 0.5 ? rgbToHex(run.rgb) : null)
      for (let index = 0; index < run.length; index++) row.push(color)
    }
    return row
  })
  grids.set(frame, grid)
  return grid
}

function crateColor(u, v) {
  if (v < 2) return CRATE.light
  if (v >= 50) return CRATE.seam
  if (u < 7 || u >= 45 || v < 7 || v >= 45) return CRATE.face
  return CRATE.panel
}

function paint(game, width, height) {
  const scale = Math.min(height / constants.WORLD_H, width / constants.MIN_W)
  const field = Math.min(width / scale, constants.MAX_W)
  const left = Math.floor((width - field * scale) / 2)
  const right = left + Math.ceil(field * scale)
  const top = (height / scale - constants.WORLD_H) * constants.TOP_SHARE
  const pixels = new Array(width * height).fill(null)
  const span = height / scale
  const grid = duckGrid(duckFrame(game))
  const pixel = DUCK_SIZE / DUCK_PIXELS
  for (let column = left; column < right; column++) {
    const x = (column + 0.5 - left) / scale
    const band = THEME.band.y + outlineAt(CLOUDS.points, wrap(x / ART, CLOUDS.width)) * ART
    const cities = CITY.map((layer, index) => THEME.city.base - (layer.height - outlineAt(layer.points, wrap((x - CITY_OFFSETS[index]) / ART, layer.width))) * ART)
    const pipe = game.pipes.find((entry) => x >= entry.x - game.scroll && x < entry.x - game.scroll + PIPE_W)
    for (let row = 0; row < height; row++) {
      const y = (row + 0.5) / scale - top
      let color
      const duckX = Math.floor((x - BIRD_X + DUCK_SIZE / 2) / pixel)
      const duckY = Math.floor((y - game.bird.y + DUCK_SIZE / 2) / pixel)
      if (duckY >= 0 && duckY < grid.length && duckX >= 0) color = grid[duckY][duckX]
      if (!color && pipe && y < GROUND_Y + 6) {
        const gapTop = pipe.gap - GAP / 2
        const gapBottom = pipe.gap + GAP / 2
        if (y < gapTop) color = crateColor(x - pipe.x + game.scroll, wrap(y - gapTop, PIPE_W))
        else if (y > gapBottom) color = crateColor(x - pipe.x + game.scroll, wrap(y - gapBottom, PIPE_W))
      }
      if (!color) {
        if (y >= band) color = THEME.band.color
        else if (y >= cities[1]) color = CITY[1].color
        else if (y >= cities[0]) color = CITY[0].color
        else {
          const distance = Math.hypot((x - field / 2) / (field / 2), (y + top - span / 2) / (span / 2))
          color = SKY_STEPS[Math.max(0, Math.min(6, Math.round(((distance - 0.5) / 0.5) * 6)))]
        }
      }
      pixels[row * width + column] = color
    }
  }
  return pixels
}

function runs(pixels, width, from, sameRun) {
  const result = []
  let start = 0
  while (start < width) {
    let end = start + 1
    while (end < width && sameRun(from + start, from + end)) end++
    result.push([start, end])
    start = end
  }
  return result
}

function halfBlockLines(pixels, width, height, { Text }) {
  const lines = []
  for (let y = 0; y < height; y += 2) {
    const top = y * width
    const bottom = top + width
    const spans = runs(pixels, width, top, (a, b) => pixels[a] === pixels[b] && pixels[a + width] === pixels[b + width])
      .map(([start, end]) => pixels[top + start] === null
        ? Text({ children: [" ".repeat(end - start)] })
        : Text({ color: pixels[top + start], backgroundColor: pixels[bottom + start], children: ["▀".repeat(end - start)] }))
    lines.push(Text({ wrap: "truncate", children: spans }))
  }
  return lines
}
