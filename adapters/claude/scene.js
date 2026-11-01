import { constants } from "./core.js"
import { duckRaster } from "./duck.js"
import { hexToRgb, mixRgb, rgbToHex, sceneAt } from "./field.js"
import { phraseKind, STREAKS, streakAt, THEME } from "./theme.js"

const { GROUND_Y, BIRD_X, PIPE_W, GAP, RESTART_DELAY } = constants
const { crate: CRATE, ui: UI } = THEME
const EPSILON = 1e-4

// A crate as Desktop draws it: horizontal parts across its width, vertical parts down its height, in its
// own 0..PIPE_W units; the planked panel sits where both are "panel".
const ACROSS = [[0, 7, CRATE.face], [7, 19.3, CRATE.panel], [19.3, 20.5, CRATE.plank], [20.5, 31.5, CRATE.panel], [31.5, 32.7, CRATE.plank], [32.7, 45, CRATE.panel], [45, PIPE_W, CRATE.face]]
const DOWN = [[0, 2, CRATE.light], [2, 7, CRATE.face], [7, 45, "panel"], [45, 50, CRATE.face], [50, 51.5, CRATE.shade], [51.5, PIPE_W, CRATE.seam]]

const grow = (value) => Math.round(value * 1000) / 1000

// Colours under a veil of black, as the pane's scenery is while a result or the pause screen shows.
const veiled = new Map()
function veil(hex, amount) {
  if (!hex || amount === 0) return hex
  const key = `${hex}:${amount}`
  let color = veiled.get(key)
  if (!color) {
    color = rgbToHex(mixRgb(hexToRgb(hex), [0, 0, 0], amount))
    veiled.set(key, color)
  }
  return color
}

function runs(cells, Box, dim = 0) {
  const merged = []
  for (const cell of cells) {
    if (cell.width <= EPSILON) continue
    const last = merged[merged.length - 1]
    if (last && last.hex === cell.hex) last.width += cell.width
    else merged.push({ ...cell })
  }
  return merged.map((cell) => Box(cell.hex ? { flexGrow: grow(cell.width), backgroundColor: veil(cell.hex, dim) } : { flexGrow: grow(cell.width) }))
}

const spacer = (Box, size) => Box({ flexGrow: grow(Math.max(0, size)) })
// Every layer is placed by explicit cells over the board rows, so it lands on the board whichever box it is
// measured from.
const layer = (Box, view, key, children, flexDirection = "row") => Box({ key, position: "absolute", top: 0, left: 0, width: "100%", height: view.rows, flexDirection, children })

// The part of one crate between `top` and `bottom` of its own height, cut across to [from, to].
function crate(top, bottom, from, to, Box, dim) {
  const rows = []
  for (const [y0, y1, color] of DOWN) {
    const height = Math.min(bottom, y1) - Math.max(top, y0)
    if (height <= EPSILON) continue
    if (color !== "panel") {
      rows.push(Box({ flexGrow: grow(height), backgroundColor: veil(color, dim) }))
      continue
    }
    const cells = ACROSS.map(([x0, x1, hex]) => ({ width: Math.min(to, x1) - Math.max(from, x0), hex }))
    rows.push(Box({ flexDirection: "row", flexGrow: grow(height), children: runs(cells, Box, dim) }))
  }
  return Box({ flexDirection: "column", flexGrow: grow(bottom - top), children: rows })
}

function cratesLayer(game, view, Box, dim) {
  const children = [spacer(Box, view.left)]
  let cursor = 0
  for (const pipe of game.pipes) {
    const x = pipe.x - game.scroll
    const from = Math.max(cursor, x)
    const to = Math.min(view.field, x + PIPE_W)
    if (to - from <= EPSILON) continue
    children.push(spacer(Box, from - cursor))
    cursor = to
    const gapTop = pipe.gap - GAP / 2 + view.top
    const gapBottom = pipe.gap + GAP / 2 + view.top
    const ground = GROUND_Y + 6 + view.top
    const column = []
    // Crates stack up from the gap, the highest cut by the top of the board, and down to the clouds.
    const above = Math.ceil(gapTop / PIPE_W)
    for (let index = above - 1; index >= 0; index--) {
      const bottom = gapTop - index * PIPE_W
      column.push(crate(Math.max(0, PIPE_W - bottom), PIPE_W, from - x, to - x, Box, dim))
    }
    column.push(spacer(Box, GAP))
    for (let y = gapBottom; y < ground; y += PIPE_W) column.push(crate(0, Math.min(PIPE_W, ground - y), from - x, to - x, Box, dim))
    column.push(spacer(Box, view.height - ground))
    children.push(Box({ flexDirection: "column", flexGrow: grow(to - from), children: column }))
  }
  children.push(spacer(Box, view.field - cursor), spacer(Box, view.width - view.left - view.field))
  return layer(Box, view, "crates", children)
}

function duckLayer(game, view, Box, dim) {
  const { rows: raster, pixel, span } = duckRaster(game)
  const left = BIRD_X - span / 2
  const top = game.bird.y - span / 2
  const rows = []
  let skipped = 0
  let trailing = 0
  raster.forEach((runsOfRow, row) => {
    const y = top + row * pixel
    const outside = y + view.top < 0 || y + pixel + view.top > view.height
    if (outside || runsOfRow.length === 0) {
      if (rows.length === 0) skipped++
      else trailing++
      return
    }
    for (; trailing > 0; trailing--) rows.push(spacer(Box, pixel))
    const cells = []
    let x = 0
    for (const run of runsOfRow) {
      const width = run.length * pixel
      if (run.hex) cells.push({ width, hex: run.hex })
      else if (run.rgb) cells.push({ width, hex: rgbToHex(mixRgb(sceneAt(game, view, left + x + width / 2, y + pixel / 2), run.rgb, run.alpha)) })
      else cells.push({ width, hex: null })
      x += width
    }
    cells.push({ width: span - x, hex: null })
    rows.push(Box({ flexDirection: "row", flexGrow: grow(pixel), children: runs(cells, Box, dim) }))
  })
  const above = top + skipped * pixel + view.top
  return layer(Box, view, "duck", [
    spacer(Box, view.left + left),
    Box({
      flexDirection: "column", flexGrow: grow(span),
      children: [spacer(Box, above), ...rows, spacer(Box, view.height - above - rows.length * pixel)],
    }),
    spacer(Box, view.width - view.left - left - span),
  ])
}

// Speed lines stream back from the plane while it flies, each blended into the scene behind it.
function streaksLayer(game, view, Box, dim) {
  const children = []
  let cursor = 0
  for (const line of STREAKS.map((streak) => streakAt(streak, game.time)).sort((a, b) => a.y - b.y)) {
    const y = game.bird.y + line.y - 0.9 + view.top
    if (y < cursor || y + 1.8 > view.height) continue
    const behind = sceneAt(game, view, BIRD_X + (line.from + line.to) / 2, game.bird.y + line.y)
    children.push(spacer(Box, y - cursor), Box({
      flexDirection: "row", flexGrow: 1.8,
      children: [
        spacer(Box, view.left + BIRD_X + line.from),
        Box({ flexGrow: grow(line.to - line.from), backgroundColor: veil(rgbToHex(mixRgb(behind, [255, 255, 255], line.alpha)), dim) }),
        spacer(Box, view.width - view.left - BIRD_X - line.to),
      ],
    }))
    cursor = y + 1.8
  }
  children.push(spacer(Box, view.height - cursor))
  return layer(Box, view, "streaks", children, "column")
}

// How much of black veils the scene: Flappy Duck darkens it under a result and the pause screen.
export function sceneDim(game) {
  if (game.phase === "over" || game.phase === "finished") return THEME.ui.veil.result
  return game.phase === "paused" ? THEME.ui.veil.paused : 0
}

// The moving part of the Desktop board, drawn over the pane's still SVG scenery: absolute layers sized to the board.
export function drawScene(game, view, { Box }) {
  const dim = sceneDim(game)
  const flying = game.phase === "ready" || game.phase === "playing"
  return [cratesLayer(game, view, Box, dim), ...(flying ? [streaksLayer(game, view, Box, dim)] : []), duckLayer(game, view, Box, dim)]
}

function phrase(game, t) {
  const phrases = t(`phrases.${phraseKind(game.score, game.record)}`)
  if (!Array.isArray(phrases)) return ""
  let hash = 2166136261
  for (const value of [game.deadAt, game.score, game.best]) hash = Math.imul(hash ^ Math.round(value * 1000), 16777619)
  return phrases[(hash >>> 0) % phrases.length]
}

// Words gathered into lines of at most `width` characters; Text has no centring of its own wrapped lines.
function lines(value, width) {
  const result = []
  for (const word of value.split(" ")) {
    const line = result.length ? `${result[result.length - 1]} ${word}` : word
    if (result.length && line.length <= width) result[result.length - 1] = line
    else result.push(word)
  }
  return result
}

// Flappy Duck's heads-up display: the score pill, the start and pause screens, the result card and the
// agent's status on the clouds.
export function drawHud(game, view, rows, status, t, { Box, Text }) {
  const overlays = []
  const rowAt = (y) => Math.round(((y + view.top) / view.height) * rows)
  const place = (y, child, lift = 0) => overlays.push(Box({
    position: "absolute", top: Math.max(0, Math.min(rows - 1, rowAt(y) - lift)), left: 0, width: "100%",
    flexDirection: "row", justifyContent: "center", children: [child],
  }))
  const pill = (children, background = UI.pillSolid) => Box({
    flexDirection: "row", alignItems: "center", paddingX: 1, backgroundColor: background, borderStyle: "round", borderColor: background, children,
  })
  const text = (value, props = {}) => Text({ wrap: "truncate", color: UI.text, children: [value], ...props })
  const phase = game.phase
  const elapsed = game.time - game.deadAt
  const shaded = phase === "finished" || (phase === "over" && elapsed >= 0.25)

  if (phase === "playing" || phase === "paused") place(-view.top + 24, pill([text(`${t("score")}: ${game.score}`, { weight: "bold" })]))
  if (phase === "ready") {
    place(112, text(t("start"), { size: "title", weight: "bold" }), 1)
    if (game.best > 0) place(146, pill([text(`${t("best")}: ${game.best}`, { weight: "bold", size: "footnote" })]))
    place(330, text(t("keys"), { size: "caption", weight: "semibold" }))
  }
  if (phase === "paused") {
    place(166, text(t("paused"), { size: "title", weight: "bold" }), 1)
    place(200, pill([text(t("resume"), { size: "footnote", weight: "semibold" })]))
  }
  if (shaded) {
    const card = [
      text(t(phase === "finished" ? "finished" : "over"), { size: "footnote", weight: "semibold", color: UI.hintSolid }),
      text(String(game.score), { size: "title", weight: "bold", tabular: true }),
    ]
    if (game.record) card.push(pill([text(t("record").toUpperCase(), { size: "caption", weight: "bold", color: UI.record })], UI.recordBgSolid))
    card.push(
      text("— — — — — — — —", { size: "caption", color: UI.hintSolid }),
      ...lines(phrase(game, t), Math.max(14, Math.round(Math.min(28, view.columns - 4) * 1.25))).map((line) => text(line, { size: "footnote", weight: "semibold" })),
    )
    if (game.locked) card.push(text(t("waiting"), { size: "caption", weight: "semibold", color: UI.hintSolid }))
    else if (phase === "finished" || elapsed >= RESTART_DELAY) card.push(pill([text(`↻  ${t("restart")}`, { size: "footnote", weight: "semibold" })], UI.pillOnDark))
    card.push(Box({
      flexDirection: "row", width: Math.max(12, Math.min(26, view.columns - 4)), paddingX: 1,
      backgroundColor: UI.pillOnDark, borderStyle: "round", borderColor: UI.pillOnDark,
      children: [text(t("bestScore"), { size: "footnote", weight: "semibold" }), Box({ flexGrow: 1 }), text(String(game.best), { weight: "bold", tabular: true })],
    }))
    place(100, Box({ flexDirection: "column", alignItems: "center", rowGap: 1, children: card }), 1)
  }
  if (UI.status[status]) {
    const dark = sceneDim(game) > 0
    place(GROUND_Y + 64, pill([
      Text({ color: UI.status[status], children: ["● "] }),
      text(t(`status.${status}`), { size: "footnote", weight: "semibold", color: dark ? UI.text : UI.statusTextSolid }),
    ], dark ? UI.pillOnDark : UI.statusBgSolid))
  }
  return overlays
}
