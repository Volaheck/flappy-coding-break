import { constants } from "./core.js"

const PARALLAX = 0.25

const palette = {
  sky: "#71cdd6", cloud: "#e8f8f4", city: "#a7ddd6", bush: "#5fcf6e",
  grass: "#73bf2e", grassLight: "#9ce35c", dirt: "#ded895", dirtDark: "#c8bd70",
  edge: "#2f5314", pipe: "#74bf2e", shine: "#a5e866", shade: "#4b861d",
  bird: "#f8c63f", belly: "#fbe28f", outline: "#3b2a20", wing: "#fff6dc",
  beak: "#f6662b", eye: "#ffffff",
}

// Cells are about twice as tall as wide: the terminal splits each in two, Desktop's taller cells into finer flex pixels.
const CELL_ASPECT = { terminal: 2, desktop: 2.2 }
const DESKTOP_SUBDIVISION = 2

export function drawBoard(game, columns, rows, elements, surface) {
  if (surface === "terminal") return halfBlockLines(paint(game, columns, rows * 2), columns, rows * 2, elements)
  const width = columns * DESKTOP_SUBDIVISION
  const height = Math.max(1, Math.round(rows * (CELL_ASPECT[surface] ?? CELL_ASPECT.desktop) * DESKTOP_SUBDIVISION))
  return [flexBoard(paint(game, width, height), width, height, columns, rows, elements)]
}

function paint(game, width, height) {
  const scale = Math.min(height / constants.WORLD_H, width / constants.MIN_W)
  const field = Math.min(width / scale, constants.MAX_W)
  const left = Math.floor((width - field * scale) / 2)
  const right = left + Math.ceil(field * scale)
  const top = (height / scale - constants.WORLD_H) * constants.TOP_SHARE
  const pixels = new Array(width * height).fill(null)
  for (let row = 0; row < height; row++) pixels.fill(palette.sky, row * width + left, row * width + right)
  const toX = (x) => left + x * scale
  const toY = (y) => (y + top) * scale
  const rect = (x, y, w, h, color) => {
    const x0 = Math.max(left, Math.floor(toX(x)))
    const x1 = Math.min(right, Math.ceil(toX(x + w)))
    const y0 = Math.max(0, Math.floor(toY(y)))
    const y1 = Math.min(height, Math.ceil(toY(y + h)))
    if (x1 <= x0) return
    for (let row = y0; row < y1; row++) pixels.fill(color, row * width + x0, row * width + x1)
  }
  const ellipse = (cx, cy, rx, ry, color) => {
    for (let row = Math.max(0, Math.floor(toY(cy - ry))); row < Math.min(height, Math.ceil(toY(cy + ry))); row++) {
      for (let col = Math.max(left, Math.floor(toX(cx - rx))); col < Math.min(right, Math.ceil(toX(cx + rx))); col++) {
        const x = (col + 0.5 - left) / scale
        const y = (row + 0.5) / scale - top
        if ((x - cx) ** 2 / rx ** 2 + (y - cy) ** 2 / ry ** 2 <= 1) pixels[row * width + col] = color
      }
    }
  }
  for (let index = -1; index < Math.ceil(field / 112) + 1; index++) {
    const x = index * 112 - ((game.scroll * PARALLAX) % 112)
    ellipse(x + 45, 290, 50, 25, palette.cloud)
    rect(x + 12, 300, 82, 18, palette.cloud)
    rect(x + 10, 338 - (index % 2) * 14, 44, 62, palette.city)
    ellipse(x + 45, 387, 55, 25, palette.bush)
  }
  for (const pipe of game.pipes) {
    const x = pipe.x - game.scroll
    const gapTop = pipe.gap - constants.GAP / 2
    const gapBottom = pipe.gap + constants.GAP / 2
    for (const [y, h] of [[-top, gapTop + top], [gapBottom, constants.GROUND_Y - gapBottom]]) {
      rect(x, y, constants.PIPE_W, h, palette.edge)
      rect(x + 4, y, constants.PIPE_W - 8, h, palette.pipe)
      rect(x + 7, y, 8, h, palette.shine)
      rect(x + constants.PIPE_W - 12, y, 7, h, palette.shade)
    }
    for (const y of [gapTop - constants.CAP_H, gapBottom]) {
      rect(x - constants.CAP_OVER, y, constants.CAP_W, constants.CAP_H, palette.edge)
      rect(x - constants.CAP_OVER + 4, y + 4, constants.CAP_W - 8, constants.CAP_H - 8, palette.pipe)
      rect(x + 3, y + 4, 10, constants.CAP_H - 8, palette.shine)
    }
  }
  const below = height / scale
  rect(0, constants.GROUND_Y, field, below, palette.dirt)
  rect(0, constants.GROUND_Y, field, 5, palette.edge)
  rect(0, constants.GROUND_Y + 5, field, 14, palette.grassLight)
  rect(0, constants.GROUND_Y + 19, field, 7, palette.grass)
  for (let x = -24; x < field + 24; x += 24) {
    rect(x - (game.scroll % 24), constants.GROUND_Y + 7, 12, 9, palette.grass)
    rect(x, constants.GROUND_Y + 43, 3, 3, palette.dirtDark)
    rect(x + 12, constants.GROUND_Y + 73, 3, 3, palette.dirtDark)
  }
  const bx = constants.BIRD_X
  const by = game.bird.y
  const flap = Math.sin(game.bird.wing * Math.PI) * 3
  ellipse(bx, by, 21, 16, palette.outline)
  ellipse(bx, by, 18, 13, palette.bird)
  ellipse(bx + 2, by + 7, 13, 5, palette.belly)
  ellipse(bx - 9, by + flap, 9, 6, palette.outline)
  ellipse(bx - 9, by + flap, 7, 4, palette.wing)
  ellipse(bx + 9, by - 6, 7, 7, palette.eye)
  rect(bx + 11, by - 8, 3, 5, palette.outline)
  rect(bx + 14, by + 1, 13, 8, palette.outline)
  rect(bx + 15, by + 2, 11, 6, palette.beak)
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

// Empty flex items grow from zero, so each run's share of its row is its pixel count; identical rows merge into one.
function flexBoard(pixels, width, height, columns, rows, { Box }) {
  const groups = []
  let previous = ""
  for (let y = 0; y < height; y++) {
    const from = y * width
    const signature = pixels.slice(from, from + width).join()
    if (signature === previous) {
      groups[groups.length - 1].count++
      continue
    }
    previous = signature
    groups.push({ from, count: 1 })
  }
  return Box({
    flexDirection: "column", width: columns, height: rows, flexShrink: 0,
    children: groups.map(({ from, count }) => Box({
      flexDirection: "row", flexGrow: count,
      children: runs(pixels, width, from, (a, b) => pixels[a] === pixels[b]).map(([start, end]) => {
        const backgroundColor = pixels[from + start]
        return Box(backgroundColor === null ? { flexGrow: end - start } : { flexGrow: end - start, backgroundColor })
      }),
    })),
  })
}
