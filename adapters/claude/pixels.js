import { constants } from "./core.js"

const PARALLAX = 0.25

const palette = {
  sky: "#71cdd6", cloud: "#e8f8f4", city: "#a7ddd6", bush: "#5fcf6e",
  grass: "#73bf2e", grassLight: "#9ce35c", dirt: "#ded895", dirtDark: "#c8bd70",
  edge: "#2f5314", pipe: "#74bf2e", shine: "#a5e866", shade: "#4b861d",
  bird: "#f8c63f", belly: "#fbe28f", outline: "#3b2a20", wing: "#fff6dc",
  beak: "#f6662b", eye: "#ffffff",
}

export function drawBoard(game, columns, rows, elements, surface) {
  const height = rows * 2
  const width = constants.MAX_W
  const pixels = new Array(columns * height).fill(palette.sky)
  const sx = columns / width
  const sy = height / constants.WORLD_H
  const rect = (x, y, w, h, color) => {
    const x0 = Math.max(0, Math.floor(x * sx))
    const x1 = Math.min(columns, Math.ceil((x + w) * sx))
    const y0 = Math.max(0, Math.floor(y * sy))
    const y1 = Math.min(height, Math.ceil((y + h) * sy))
    for (let row = y0; row < y1; row++) for (let col = x0; col < x1; col++) pixels[row * columns + col] = color
  }
  const ellipse = (cx, cy, rx, ry, color) => {
    for (let row = Math.max(0, Math.floor((cy - ry) * sy)); row < Math.min(height, Math.ceil((cy + ry) * sy)); row++) {
      for (let col = Math.max(0, Math.floor((cx - rx) * sx)); col < Math.min(columns, Math.ceil((cx + rx) * sx)); col++) {
        if (((col + 0.5) / sx - cx) ** 2 / rx ** 2 + ((row + 0.5) / sy - cy) ** 2 / ry ** 2 <= 1) pixels[row * columns + col] = color
      }
    }
  }
  for (let index = -1; index < 6; index++) {
    const x = index * 112 - ((game.scroll * PARALLAX) % 112)
    ellipse(x + 45, 290, 50, 25, palette.cloud)
    rect(x + 12, 300, 82, 18, palette.cloud)
    rect(x + 10, 338 - (index % 2) * 14, 44, 62, palette.city)
    ellipse(x + 45, 387, 55, 25, palette.bush)
  }
  for (const pipe of game.pipes) {
    const x = pipe.x - game.scroll
    const top = pipe.gap - constants.GAP / 2
    const bottom = pipe.gap + constants.GAP / 2
    for (const [y, h] of [[0, top], [bottom, constants.GROUND_Y - bottom]]) {
      rect(x, y, constants.PIPE_W, h, palette.edge)
      rect(x + 4, y, constants.PIPE_W - 8, h, palette.pipe)
      rect(x + 7, y, 8, h, palette.shine)
      rect(x + constants.PIPE_W - 12, y, 7, h, palette.shade)
    }
    for (const y of [top - constants.CAP_H, bottom]) {
      rect(x - constants.CAP_OVER, y, constants.CAP_W, constants.CAP_H, palette.edge)
      rect(x - constants.CAP_OVER + 4, y + 4, constants.CAP_W - 8, constants.CAP_H - 8, palette.pipe)
      rect(x + 3, y + 4, 10, constants.CAP_H - 8, palette.shine)
    }
  }
  rect(0, constants.GROUND_Y, width, constants.GROUND_H, palette.dirt)
  rect(0, constants.GROUND_Y, width, 5, palette.edge)
  rect(0, constants.GROUND_Y + 5, width, 14, palette.grassLight)
  rect(0, constants.GROUND_Y + 19, width, 7, palette.grass)
  for (let x = -20; x < width + 20; x += 24) {
    rect(x - (game.scroll % 24), constants.GROUND_Y + 7, 12, 9, palette.grass)
    rect(x, constants.GROUND_Y + 43, 3, 3, palette.dirtDark)
    rect(x + 12, constants.GROUND_Y + 73, 3, 3, palette.dirtDark)
  }
  const bx = constants.BIRD_X
  const by = game.bird.y
  ellipse(bx, by, 21, 16, palette.outline)
  ellipse(bx, by - 1, 18, 13, palette.bird)
  ellipse(bx + 3, by + 6, 14, 6, palette.belly)
  ellipse(bx - 9, by + Math.sin(game.bird.wing * Math.PI) * 3, 10, 6, palette.outline)
  ellipse(bx - 10, by + Math.sin(game.bird.wing * Math.PI) * 3 - 1, 7, 4, palette.wing)
  ellipse(bx + 11, by - 7, 8, 9, palette.eye)
  rect(bx + 13, by - 9, 4, 6, palette.outline)
  rect(bx + 11, by + 3, 17, 7, palette.outline)
  rect(bx + 12, by + 4, 14, 4, palette.beak)

  return surface === "terminal" ? halfBlockLines(pixels, columns, height, elements) : blockLines(pixels, columns, height, elements)
}

function runs(pixels, columns, from, sameRun) {
  const result = []
  let start = 0
  while (start < columns) {
    let end = start + 1
    while (end < columns && sameRun(from + start, from + end)) end++
    result.push([start, end])
    start = end
  }
  return result
}

function halfBlockLines(pixels, columns, height, { Text }) {
  const lines = []
  for (let y = 0; y < height; y += 2) {
    const top = y * columns
    const bottom = top + columns
    const spans = runs(pixels, columns, top, (a, b) => pixels[a] === pixels[b] && pixels[a + columns] === pixels[b + columns])
      .map(([start, end]) => Text({ color: pixels[top + start], backgroundColor: pixels[bottom + start], children: ["▀".repeat(end - start)] }))
    lines.push(Text({ wrap: "truncate", children: spans }))
  }
  return lines
}

// A remote surface's line height exceeds a glyph's, so half blocks leave gaps; two filled halves per cell do not.
function blockLines(pixels, columns, height, { Box }) {
  const half = (row) => Box({
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    children: runs(pixels, columns, row * columns, (a, b) => pixels[a] === pixels[b])
      .map(([start, end]) => Box({ width: end - start, flexShrink: 0, backgroundColor: pixels[row * columns + start] })),
  })
  const lines = []
  for (let y = 0; y < height; y += 2) {
    lines.push(Box({ flexDirection: "column", width: columns, height: 1, flexShrink: 0, children: [half(y), half(y + 1)] }))
  }
  return lines
}
