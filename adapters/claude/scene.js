import { constants } from "./core.js"
import { birdPose, PIXEL } from "./bird.js"
import { COLORS, backdropAt, gradientAt, hexToRgb, mixRgb, rgbToHex } from "./field.js"

const { GROUND_Y, WORLD_H, BIRD_X, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP, RESTART_DELAY } = constants
const PIPE_STOPS = [[0, COLORS.pipeDark], [0.07, COLORS.pipeLight], [0.16, COLORS.pipeShine], [0.28, COLORS.pipeLight], [0.55, COLORS.pipe], [0.85, COLORS.pipeDark], [1, COLORS.pipeEdge]]
const BAND_TOLERANCE = 10
const EDGE = 2
const BLADE_STEP = 24
const BLADE_ROWS = 3
const DIRT_STOPS = [[0, COLORS.dirt], [1, COLORS.dirtLow]]
const DIRT_BANDS = 5
const EPSILON = 1e-4
const MEDALS = [[40, "🏆"], [30, "🥇"], [20, "🥈"], [10, "🥉"]]

const grow = (value) => Math.round(value * 1000) / 1000

// Stripes approximating the Canvas pipe gradient: a new stripe starts where the colour drifts past the tolerance.
function gradientBands(width) {
  const step = 0.25
  const bands = []
  let start = 0
  let samples = []
  const mean = (list) => [0, 1, 2].map((channel) => list.reduce((sum, color) => sum + color[channel], 0) / list.length)
  for (let x = 0; x < width; x += step) {
    const color = gradientAt(PIPE_STOPS, (x + step / 2) / width)
    const next = [...samples, color]
    const average = mean(next)
    if (samples.length > 0 && next.some((sample) => sample.some((value, channel) => Math.abs(value - average[channel]) > BAND_TOLERANCE))) {
      bands.push({ from: start, to: x, rgb: mean(samples) })
      start = x
      samples = [color]
    } else samples = next
  }
  bands.push({ from: start, to: width, rgb: mean(samples) })
  return bands
}

function paint(bands, from, to, hex) {
  const result = []
  for (const band of bands) {
    if (band.to <= from || band.from >= to) result.push(band)
    else {
      if (band.from < from) result.push({ ...band, to: from })
      if (band.to > to) result.push({ ...band, from: to })
    }
  }
  result.push({ from, to, hex })
  return result.sort((a, b) => a.from - b.from)
}

const withHex = (bands) => bands.map((band) => ({ from: band.from, to: band.to, hex: band.hex ?? rgbToHex(band.rgb) }))
const edged = (bands, width) => paint(paint(withHex(bands), 0, EDGE, COLORS.pipeEdge), width - EDGE, width, COLORS.pipeEdge)

const BODY_BANDS = edged(gradientBands(PIPE_W), PIPE_W)
const CAP_BANDS = edged(gradientBands(CAP_W), CAP_W)
const CAP_INNER = gradientBands(CAP_W).filter((band) => band.to > EDGE && band.from < CAP_W - EDGE)
const capAverage = [0, 1, 2].map((channel) => CAP_INNER.reduce((sum, band) => sum + band.rgb[channel] * (band.to - band.from), 0)
  / CAP_INNER.reduce((sum, band) => sum + band.to - band.from, 0))
const CAP_LIGHT = edged([{ from: 0, to: CAP_W, rgb: mixRgb(capAverage, [255, 255, 255], 0.28) }], CAP_W)
const CAP_DARK = edged([{ from: 0, to: CAP_W, rgb: mixRgb(capAverage, [0, 0, 0], 0.18) }], CAP_W)
const CAP_EDGE = [{ from: 0, to: CAP_W, hex: COLORS.pipeEdge }]
const CAP_ROWS = [[EDGE, CAP_EDGE], [3, CAP_LIGHT], [CAP_H - 2 * EDGE - 6, CAP_BANDS], [3, CAP_DARK], [EDGE, CAP_EDGE]]
const BODY_ROW = [{ from: -CAP_OVER, to: 0, hex: null }, ...BODY_BANDS, { from: PIPE_W, to: PIPE_W + CAP_OVER, hex: null }]

function bandColor(bands, x) {
  return (bands.find((band) => x >= band.from && x < band.to) ?? bands[bands.length - 1]).hex
}

function runs(cells, Box) {
  const merged = []
  for (const cell of cells) {
    if (cell.width <= EPSILON) continue
    const last = merged[merged.length - 1]
    if (last && last.hex === cell.hex) last.width += cell.width
    else merged.push({ ...cell })
  }
  return merged.map((cell) => Box(cell.hex ? { flexGrow: grow(cell.width), backgroundColor: cell.hex } : { flexGrow: grow(cell.width) }))
}

// One strip of bands (in the band list's own x) shifted to `offset`, cut to the window [from, to].
function bandRow(bands, offset, from, to, height, Box) {
  const cells = []
  for (const band of bands) {
    const x0 = Math.max(from, offset + band.from)
    const x1 = Math.min(to, offset + band.to)
    if (x1 > x0) cells.push({ width: x1 - x0, hex: band.hex })
  }
  return Box({ flexDirection: "row", flexGrow: grow(height), children: runs(cells, Box) })
}

// Every layer is placed by explicit cells over the board rows, so it lands on the board whichever box it is
// measured from.
const layer = (Box, view, children) => Box({ position: "absolute", top: 0, left: 0, width: "100%", height: view.rows, flexDirection: "row", children })
const spacer = (Box, size) => Box({ flexGrow: grow(Math.max(0, size)) })

function pipesLayer(game, view, Box) {
  const children = [spacer(Box, view.left)]
  let cursor = 0
  for (const pipe of game.pipes) {
    const x = pipe.x - game.scroll
    const from = Math.max(cursor, x - CAP_OVER)
    const to = Math.min(view.field, x + PIPE_W + CAP_OVER)
    if (to - from <= EPSILON) continue
    children.push(spacer(Box, from - cursor))
    cursor = to
    const gapTop = pipe.gap - GAP / 2
    const gapBottom = pipe.gap + GAP / 2
    const cap = () => CAP_ROWS.map(([height, bands]) => bandRow(bands, x - CAP_OVER, from, to, height, Box))
    children.push(Box({
      flexDirection: "column", flexGrow: grow(to - from),
      children: [
        bandRow(BODY_ROW, x, from, to, gapTop - CAP_H + view.top, Box),
        ...cap(),
        spacer(Box, GAP),
        ...cap(),
        bandRow(BODY_ROW, x, from, to, GROUND_Y - gapBottom - CAP_H, Box),
        spacer(Box, view.height - view.top - GROUND_Y),
      ],
    }))
  }
  children.push(spacer(Box, view.field - cursor), spacer(Box, view.width - view.left - view.field))
  return layer(Box, view, children)
}

function bladeShift(depth) {
  return (8 * (15 - depth)) / 12
}

function groundLayer(game, view, Box) {
  const field = view.field
  const full = (height, hex) => Box({ flexGrow: grow(height), backgroundColor: hex })
  const offset = -(game.scroll % BLADE_STEP)
  const blades = []
  for (let index = 0; index < BLADE_ROWS; index++) {
    const height = 12 / BLADE_ROWS
    const shift = bladeShift(3 + height * (index + 0.5))
    const cells = []
    let x = 0
    for (let origin = offset - BLADE_STEP; origin < field; origin += BLADE_STEP) {
      const from = Math.max(x, origin + shift)
      const to = Math.min(field, origin + shift + 12)
      if (to <= from) continue
      cells.push({ width: from - x, hex: COLORS.grass }, { width: to - from, hex: COLORS.grassLight })
      x = to
    }
    cells.push({ width: field - x, hex: COLORS.grass })
    blades.push(Box({ flexDirection: "row", flexGrow: grow(height), children: runs(cells, Box) }))
  }
  const dirt = []
  const dirtHeight = WORLD_H - GROUND_Y - 20
  for (let index = 0; index < DIRT_BANDS; index++) {
    const offsetY = 20 + ((index + 0.5) / DIRT_BANDS) * dirtHeight
    dirt.push(full(dirtHeight / DIRT_BANDS, rgbToHex(gradientAt(DIRT_STOPS, (offsetY - 18) / (WORLD_H - GROUND_Y - 18)))))
  }
  return layer(Box, view, [
    spacer(Box, view.left),
    Box({
      flexDirection: "column", flexGrow: grow(field),
      children: [
        spacer(Box, GROUND_Y + view.top),
        full(3, COLORS.grassEdge),
        ...blades,
        full(3, COLORS.grassShade),
        full(2, COLORS.dirtLine),
        ...dirt,
        full(view.height - view.top - WORLD_H, COLORS.dirtLow),
      ],
    }),
    spacer(Box, view.width - view.left - field),
  ])
}

function pipeColorAt(game, x, y) {
  for (const pipe of game.pipes) {
    const local = x - (pipe.x - game.scroll)
    const gapTop = pipe.gap - GAP / 2
    const gapBottom = pipe.gap + GAP / 2
    for (const capTop of [gapTop - CAP_H, gapBottom]) {
      if (local < -CAP_OVER || local >= PIPE_W + CAP_OVER || y < capTop || y >= capTop + CAP_H) continue
      let depth = y - capTop
      for (const [height, bands] of CAP_ROWS) {
        if (depth < height) return bandColor(bands, local + CAP_OVER)
        depth -= height
      }
    }
    if (local >= 0 && local < PIPE_W && (y < gapTop - CAP_H || (y >= gapBottom + CAP_H && y < GROUND_Y))) return bandColor(BODY_BANDS, local)
  }
  return undefined
}

function groundColorAt(game, x, y) {
  const depth = y - GROUND_Y
  if (depth < 3) return COLORS.grassEdge
  if (depth < 15) {
    const along = (((x - bladeShift(depth) + (game.scroll % BLADE_STEP)) % BLADE_STEP) + BLADE_STEP) % BLADE_STEP
    return along < 12 ? COLORS.grassLight : COLORS.grass
  }
  if (depth < 18) return COLORS.grassShade
  if (depth < 20) return COLORS.dirtLine
  return rgbToHex(gradientAt(DIRT_STOPS, (depth - 18) / (WORLD_H - GROUND_Y - 18)))
}

function behindBird(game, x, y) {
  if (y >= GROUND_Y) return hexToRgb(groundColorAt(game, x, y))
  const pipe = pipeColorAt(game, x, y)
  return pipe ? hexToRgb(pipe) : backdropAt(x, y)
}

function birdLayer(game, view, Box) {
  const pose = birdPose(game)
  const left = BIRD_X + pose.x
  const top = game.bird.y + pose.y
  const rows = []
  let skipped = 0
  pose.rows.forEach((cells, row) => {
    const y = top + row * PIXEL
    if (y + view.top < 0 || y + PIXEL + view.top > view.height) {
      if (rows.length === 0) skipped++
      return
    }
    const painted = cells.map((cell, column) => {
      if (!cell) return { width: PIXEL, hex: null }
      if (cell.hex) return { width: PIXEL, hex: cell.hex }
      const behind = behindBird(game, left + (column + 0.5) * PIXEL, y + PIXEL / 2)
      return { width: PIXEL, hex: rgbToHex(mixRgb(behind, cell.rgb, cell.coverage)) }
    })
    rows.push(Box({ flexDirection: "row", flexGrow: PIXEL, children: runs(painted, Box) }))
  })
  const above = top + skipped * PIXEL + view.top
  return layer(Box, view, [
    spacer(Box, view.left + left),
    Box({
      flexDirection: "column", flexGrow: grow(pose.columns * PIXEL),
      children: [spacer(Box, above), ...rows, spacer(Box, view.height - above - rows.length * PIXEL)],
    }),
    spacer(Box, view.width - view.left - left - pose.columns * PIXEL),
  ])
}

// The moving part of the Desktop board, drawn over the pane's still SVG scenery: absolute layers sized to the board.
export function drawScene(game, view, { Box }) {
  return [pipesLayer(game, view, Box), groundLayer(game, view, Box), birdLayer(game, view, Box)]
}

// The Canvas version's heads-up display: score, agent status, start, pause and result screens.
export function drawHud(game, view, rows, status, t, { Box, Text }) {
  const overlays = []
  const rowAt = (y) => Math.round(((y + view.top) / view.height) * rows)
  const place = (y, child, lift = 0) => overlays.push(Box({
    position: "absolute", top: Math.max(0, Math.min(rows - 1, rowAt(y) - lift)), left: 0, width: "100%",
    flexDirection: "row", justifyContent: "center", children: [child],
  }))
  const plate = (children, tone = {}) => Box({
    flexDirection: "column", alignItems: "center", paddingX: 1,
    backgroundColor: COLORS.plate, borderStyle: "round", borderColor: COLORS.plateEdge, ...tone, children,
  })
  const line = (text, props = {}) => Text({ wrap: "truncate", color: "#ffffff", children: [text], ...props })
  const phase = game.phase

  if (phase === "playing" || phase === "paused") {
    place(-view.top + 54, plate([line(String(game.score), { size: "title", weight: "bold", tabular: true })]), 1)
  }
  if (status === "running" || status === "done") {
    place(GROUND_Y + 58, Box({
      flexDirection: "row", alignItems: "center", paddingX: 1,
      backgroundColor: COLORS.plate, borderStyle: "round", borderColor: COLORS.plateEdge,
      children: [
        Text({ color: status === "running" ? COLORS.running : COLORS.done, children: ["● "] }),
        line(t(`status.${status}`), { weight: "bold", size: "footnote" }),
      ],
    }))
  }

  if (phase === "ready") {
    place(112, plate([line(t("title"), { size: "title", weight: "bold" })]), 1)
    place(290, plate([
      line(t("start"), { weight: "bold" }),
      ...(game.best > 0 ? [line(`${t("best")}: ${game.best}`, { size: "footnote" })] : []),
      line(t("keys"), { size: "caption", color: "#cfe8ec" }),
    ]))
    return overlays
  }
  if (phase === "paused") {
    place(172, plate([line(t("paused"), { size: "title", weight: "bold" }), line(t("resume"), { size: "footnote" })]), 1)
    return overlays
  }
  if (phase !== "over" && phase !== "finished") return overlays

  const finished = phase === "finished"
  const elapsed = game.time - game.deadAt
  const screen = []
  if (finished || elapsed >= 0.25) {
    screen.push(plate([line(t(finished ? "finished" : "over"), { size: finished ? "heading" : "title", weight: "bold", color: COLORS.over })]))
  }
  if (finished || elapsed >= 0.4) {
    const medal = MEDALS.find(([score]) => game.score >= score)
    const label = (text) => Text({ size: "caption", weight: "bold", color: COLORS.boardLabel, children: [text] })
    const number = (value) => Text({ size: "heading", weight: "bold", tabular: true, color: COLORS.boardEdge, children: [String(value)] })
    screen.push(Box({
      flexDirection: "row", alignItems: "center", columnGap: 2, paddingX: 1,
      backgroundColor: COLORS.board, borderStyle: "round", borderColor: COLORS.boardEdge,
      children: [
        Box({ flexDirection: "column", alignItems: "center", children: [
          label(t("medal")),
          Text(medal ? { size: "title", children: [medal[1]] } : { size: "title", color: COLORS.boardEmpty, children: ["●"] }),
        ] }),
        Box({ flexDirection: "column", alignItems: "flex-end", children: [
          label(t("score")),
          number(game.score),
          label(t("best")),
          Box({ flexDirection: "row", alignItems: "center", columnGap: 1, children: [
            ...(game.record ? [Box({ paddingX: 1, backgroundColor: COLORS.record, borderStyle: "round", borderColor: COLORS.record, children: [
              Text({ size: "caption", weight: "bold", color: "#ffffff", children: [t("record")] }),
            ] })] : []),
            number(game.best),
          ] }),
        ] }),
      ],
    }))
  }
  if (finished || elapsed >= RESTART_DELAY) {
    screen.push(plate([line(t(game.locked ? "waiting" : "restart"), { size: "footnote", weight: "bold" })]))
  }
  if (screen.length > 0) place(104, Box({ flexDirection: "column", alignItems: "center", rowGap: 1, children: screen }), 1)
  return overlays
}
