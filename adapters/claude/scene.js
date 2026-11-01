import { constants } from "./core.js"
import { COLORS, boardAspect, fieldLayout } from "./field.js"

const { GROUND_Y, BIRD_X, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP } = constants
const BLADE_STEP = 24
const WING = [0, 1, 2, 1]
const BIRD_PIXEL = 1.5
const BIRD_HALF_W = 18
const BIRD_HALF_H = 14
const EPSILON = 1e-6

const PIPE_BANDS = [[2, "pipeEdge"], [5, "pipeLight"], [6, "pipeShine"], [6, "pipeLight"], [17, "pipe"], [14, "pipeDark"], [2, "pipeEdge"]]
const CAP_BANDS = [[2, "pipeEdge"], [6, "pipeLight"], [7, "pipeShine"], [7, "pipeLight"], [20, "pipe"], [16, "pipeDark"], [2, "pipeEdge"]]

const insideEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const insideRect = (x, y, x0, y0, w, h) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h

function birdColor(x, y, frame) {
  const wingY = 1.5 + [-3.6, 0, 3.4][frame]
  const angle = [-0.35, 0, 0.3][frame]
  const wx = (x + 6.5) * Math.cos(angle) + (y - wingY) * Math.sin(angle)
  const wy = -(x + 6.5) * Math.sin(angle) + (y - wingY) * Math.cos(angle)
  if (insideEllipse(wx, wy, 0, 0, 7.6, 4.8)) return COLORS.wing
  if (insideEllipse(wx, wy, 0, 0, 9.4, 6.6)) return COLORS.outline
  if ((x - 8.4) ** 2 + (y + 4.2) ** 2 <= 2.4 ** 2) return "#1b1b1b"
  if ((x - 6.5) ** 2 + (y + 4.5) ** 2 <= 5.2 ** 2) return "#ffffff"
  if ((x - 6.5) ** 2 + (y + 4.5) ** 2 <= 6.8 ** 2) return COLORS.outline
  if (insideRect(x, y, 7, 0.6, 11.5, 2.8)) return COLORS.beak
  if (insideRect(x, y, 7, 4.4, 9.5, 2.2)) return COLORS.beakLow
  if (insideRect(x, y, 5.5, -0.9, 15, 9)) return COLORS.outline
  if (insideEllipse(x, y, 0, 0, 15, 11.5)) {
    if (insideEllipse(x, y, -8, 9, 10, 5)) return COLORS.shade
    if (insideEllipse(x, y, 4, 7, 13, 7)) return COLORS.belly
    return COLORS.body
  }
  if (insideEllipse(x, y, 0, 0, 16.8, 13.3)) return COLORS.outline
  return null
}

function birdSprite(frame) {
  const rects = []
  for (let x0 = -BIRD_HALF_W; x0 < BIRD_HALF_W; x0 += BIRD_PIXEL) {
    let run
    for (let y0 = -BIRD_HALF_H; y0 < BIRD_HALF_H; y0 += BIRD_PIXEL) {
      const color = birdColor(x0 + BIRD_PIXEL / 2, y0 + BIRD_PIXEL / 2, frame)
      if (run && run.color === color) run.y1 = y0 + BIRD_PIXEL
      else {
        if (run?.color) rects.push(run)
        run = { x0, x1: x0 + BIRD_PIXEL, y0, y1: y0 + BIRD_PIXEL, color }
      }
    }
    if (run?.color) rects.push(run)
  }
  return rects
}

const BIRD_SPRITES = [0, 1, 2].map(birdSprite)

function bands(x, y0, y1, layout, rects) {
  let left = x
  for (const [width, color] of layout) {
    rects.push({ x0: left, x1: left + width, y0, y1, color: COLORS[color] })
    left += width
  }
}

function pipeRects(game, top) {
  const rects = []
  for (const pipe of game.pipes) {
    const x = pipe.x - game.scroll
    const gapTop = pipe.gap - GAP / 2
    const gapBottom = pipe.gap + GAP / 2
    bands(x, -top - 2, gapTop - CAP_H, PIPE_BANDS, rects)
    bands(x, gapBottom + CAP_H, GROUND_Y, PIPE_BANDS, rects)
    for (const capTop of [gapTop - CAP_H, gapBottom]) {
      bands(x - CAP_OVER, capTop, capTop + CAP_H, CAP_BANDS, rects)
      rects.push({ x0: x - CAP_OVER, x1: x - CAP_OVER + CAP_W, y0: capTop, y1: capTop + 2, color: COLORS.pipeEdge })
      rects.push({ x0: x - CAP_OVER, x1: x - CAP_OVER + CAP_W, y0: capTop + CAP_H - 2, y1: capTop + CAP_H, color: COLORS.pipeEdge })
    }
  }
  return rects
}

function groundRects(game, field, bottom) {
  const rects = [
    { x0: 0, x1: field, y0: GROUND_Y, y1: bottom, color: COLORS.dirt },
    { x0: 0, x1: field, y0: GROUND_Y, y1: GROUND_Y + 15, color: COLORS.grass },
  ]
  for (let x = -(game.scroll % BLADE_STEP) - BLADE_STEP; x < field; x += BLADE_STEP) {
    rects.push({ x0: x + 4, x1: x + 16, y0: GROUND_Y + 3, y1: GROUND_Y + 15, color: COLORS.grassLight })
  }
  rects.push(
    { x0: 0, x1: field, y0: GROUND_Y, y1: GROUND_Y + 3, color: COLORS.grassEdge },
    { x0: 0, x1: field, y0: GROUND_Y + 15, y1: GROUND_Y + 18, color: COLORS.grassShade },
    { x0: 0, x1: field, y0: GROUND_Y + 18, y1: GROUND_Y + 20, color: COLORS.dirtLine },
  )
  return rects
}

function birdRects(game) {
  const frame = game.phase === "over" ? 1 : WING[Math.floor(game.bird.wing) % WING.length]
  return BIRD_SPRITES[frame].map((rect) => ({ ...rect, x0: rect.x0 + BIRD_X, x1: rect.x1 + BIRD_X, y0: rect.y0 + game.bird.y, y1: rect.y1 + game.bird.y }))
}

function paintColumn(rects, height) {
  let segments = [{ y0: 0, y1: height, color: null }]
  for (const rect of rects) {
    const y0 = Math.max(0, rect.y0)
    const y1 = Math.min(height, rect.y1)
    if (y1 <= y0) continue
    const next = []
    for (const segment of segments) {
      if (segment.y1 <= y0 || segment.y0 >= y1) {
        next.push(segment)
        continue
      }
      if (segment.y0 < y0) next.push({ ...segment, y1: y0 })
      next.push({ y0: Math.max(segment.y0, y0), y1: Math.min(segment.y1, y1), color: rect.color })
      if (segment.y1 > y1) next.push({ ...segment, y0: y1 })
    }
    segments = next
  }
  const merged = []
  for (const segment of segments) {
    const last = merged[merged.length - 1]
    if (last && last.color === segment.color) last.y1 = segment.y1
    else merged.push({ ...segment })
  }
  return merged
}

const grow = (value) => Math.round(value * 1000) / 1000

// A layer of full-height strips: flex items grow from nothing, so each strip's share of the width, and each
// segment's share of its strip, is its size in view units, wherever that falls between cells.
function layer(rects, view, Box) {
  const clipped = []
  for (const rect of rects) {
    const x0 = Math.max(view.left, rect.x0 + view.left)
    const x1 = Math.min(view.left + view.field, rect.x1 + view.left)
    if (x1 - x0 > EPSILON) clipped.push({ x0, x1, y0: rect.y0 + view.top, y1: rect.y1 + view.top, color: rect.color })
  }
  const edges = [...new Set([0, view.width, ...clipped.flatMap((rect) => [rect.x0, rect.x1])])].sort((a, b) => a - b)
  const strips = []
  for (let index = 0; index < edges.length - 1; index++) {
    const from = edges[index]
    const to = edges[index + 1]
    if (to - from <= EPSILON) continue
    const segments = paintColumn(clipped.filter((rect) => rect.x0 <= from + EPSILON && rect.x1 >= to - EPSILON), view.height)
    const signature = segments.map((segment) => `${grow(segment.y1)}${segment.color}`).join()
    const last = strips[strips.length - 1]
    if (last && last.signature === signature) last.width += to - from
    else strips.push({ width: to - from, segments, signature })
  }
  return Box({
    position: "absolute", top: 0, left: 0, width: "100%", height: "100%", flexDirection: "row",
    children: strips.map(({ width, segments }) => segments.length === 1 && segments[0].color === null
      ? Box({ flexGrow: grow(width) })
      : Box({
        flexDirection: "column", flexGrow: grow(width),
        children: segments.map((segment) => Box(segment.color === null
          ? { flexGrow: grow(segment.y1 - segment.y0) }
          : { flexGrow: grow(segment.y1 - segment.y0), backgroundColor: segment.color })),
      })),
  })
}

// The moving part of the Desktop board, drawn over the pane's still SVG scenery.
export function drawScene(game, columns, rows, { Box }) {
  const view = fieldLayout(boardAspect(columns, rows))
  const bottom = view.height - view.top
  return Box({
    position: "relative", width: "100%", height: rows, flexShrink: 0,
    children: [
      layer(pipeRects(game, view.top), view, Box),
      layer(groundRects(game, view.field, bottom), view, Box),
      layer(birdRects(game), view, Box),
    ],
  })
}
