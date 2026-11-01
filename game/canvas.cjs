"use strict"

const { createGame } = require("./core.cjs")
const { STEP, MAX_FRAME, MAX_STEPS, WORLD_H, GROUND_Y, GROUND_H, MIN_W, MAX_W, TOP_SHARE, BIRD_X, BIRD_R, BIRD_W, BIRD_H, READY_Y, CEILING, GRAVITY, FLAP, MAX_FALL, SPEED, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP, SPACING, PIPE_MARGIN, GAP_SHIFT, RESTART_DELAY } = require("./constants.cjs")

const BEST_KEY = "opencode.flappybird.best"
const SCORE_KEY = "flappy-coding-break.lastScore"
const ENGAGED_FOR = 3000



const WING = [0, 1, 2, 1]


const BACKDROP_W = 288
const GROUND_W = 168
const PARALLAX = 0.25

const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif'
const FLAP_KEYS = new Set(["Space", "ArrowUp", "KeyW", "Enter", "NumpadEnter"])

const COLORS = {
  skyTop: "#3fb3c3",
  skyMid: "#71cdd6",
  skyLow: "#a8e3e6",
  cloud: "#e8f8f4",
  cloudShade: "#d3efec",
  city: "#a7ddd6",
  cityEdge: "#8ccac2",
  window: "#c9eee8",
  bush: "#5fcf6e",
  bushDark: "#43b157",
  grass: "#73bf2e",
  grassLight: "#9ce35c",
  grassEdge: "#3b6a17",
  grassShade: "#558f22",
  dirt: "#ded895",
  dirtLow: "#d2c97f",
  dirtLine: "#c8bd70",
  dirtDeep: "#d2c97f",
  pipeEdge: "#2f5314",
  pipeDark: "#4b861d",
  pipe: "#74bf2e",
  pipeLight: "#a5e866",
  pipeShine: "#d4f7ad",
  outline: "#3b2a20",
  body: "#f8c63f",
  belly: "#fbe28f",
  shade: "#e6a12a",
  wing: "#fff6dc",
  beak: "#f6662b",
  beakLow: "#df4a16",
  board: "#ded895",
  boardEdge: "#543847",
  boardLabel: "#e07535",
  boardEmpty: "#cdc283",
  record: "#e5432f",
  pill: "rgba(12, 30, 38, 0.74)",
  running: "#ffd166",
  done: "#7ee787",
}

const MEDALS = [
  { score: 40, fill: "#eef1f4", ring: "#a6adb5", shine: "#ffffff" },
  { score: 30, fill: "#f6c445", ring: "#b98414", shine: "#fff1b8" },
  { score: 20, fill: "#d9dde2", ring: "#8d949c", shine: "#ffffff" },
  { score: 10, fill: "#e19a5c", ring: "#a15d24", shine: "#ffd7b0" },
]

const TEXT = {
  score: { weight: 800, fill: "#ffffff", stroke: "#3b2a20", line: 0.16 },
  title: { weight: 800, fill: "#ffffff", stroke: "#3b2a20", line: 0.16 },
  over: { weight: 800, fill: "#fca148", stroke: "#5a2d0c", line: 0.16 },
  hint: { weight: 700, fill: "#ffffff", stroke: "#2a3b40", line: 0.2 },
  small: { weight: 650, fill: "#ffffff", stroke: "#2a3b40", line: 0.2 },
}

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)
const lerp = (from, to, amount) => from + (to - from) * amount
const ease = (amount) => 1 - Math.pow(1 - clamp(amount, 0, 1), 3)

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function writeBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.max(value, readBest())))
  } catch {}
}

function readScore() {
  try {
    const value = Number(localStorage.getItem(SCORE_KEY))
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function writeScore(value) {
  try {
    localStorage.setItem(SCORE_KEY, String(value))
  } catch {}
}

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}


function createSurface(width, height) {
  const surface = document.createElement("canvas")
  surface.width = Math.max(1, Math.ceil(width))
  surface.height = Math.max(1, Math.ceil(height))
  return surface
}

function paintTile(width, height, k, paint) {
  const surface = createSurface(width * k, height * k)
  const g = surface.getContext("2d")
  g.scale(surface.width / width, surface.height / height)
  paint(g)
  return { surface, sx: width / surface.width, sy: height / surface.height }
}

function circle(g, x, y, radius) {
  g.beginPath()
  g.arc(x, y, radius, 0, Math.PI * 2)
  g.fill()
}

function wrapped(width, x, draw) {
  draw(x - width)
  draw(x)
  draw(x + width)
}

function star(g, x, y, outer, inner) {
  g.beginPath()
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  g.closePath()
  g.fill()
}

function building(g, x, top, width) {
  g.fillStyle = COLORS.city
  g.fillRect(x, top, width, GROUND_Y - top)
  g.fillStyle = COLORS.cityEdge
  g.fillRect(x, top, width, 2)
  g.fillRect(x + width - 2, top, 2, GROUND_Y - top)
  g.fillStyle = COLORS.window
  for (let y = top + 6; y < 356; y += 9) {
    for (let column = x + 4; column < x + width - 5; column += 7) g.fillRect(column, y, 3, 4)
  }
}

function paintBackdrop(k) {
  return paintTile(BACKDROP_W, GROUND_Y, k, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, GROUND_Y)
    sky.addColorStop(0, COLORS.skyTop)
    sky.addColorStop(0.6, COLORS.skyMid)
    sky.addColorStop(1, COLORS.skyLow)
    g.fillStyle = sky
    g.fillRect(0, 0, BACKDROP_W, GROUND_Y)

    const random = seeded(11)
    g.fillStyle = "rgba(255, 255, 255, 0.85)"
    for (const [x, y, size] of [
      [46, 74, 1],
      [178, 146, 0.75],
      [244, 38, 0.55],
    ]) {
      wrapped(BACKDROP_W, x, (left) => {
        circle(g, left, y, 13 * size)
        circle(g, left + 15 * size, y - 7 * size, 17 * size)
        circle(g, left + 32 * size, y - 2 * size, 13 * size)
        circle(g, left + 44 * size, y + 3 * size, 9 * size)
        g.fillRect(left, y, 44 * size, 12 * size)
      })
    }

    const bumps = 13
    const bump = BACKDROP_W / bumps
    g.fillStyle = COLORS.cloudShade
    for (let index = 0; index < bumps; index++) {
      const radius = 18 + random() * 12
      const y = 322 - random() * 8
      wrapped(BACKDROP_W, index * bump, (x) => circle(g, x, y, radius))
    }
    g.fillRect(0, 322, BACKDROP_W, GROUND_Y - 322)
    g.fillStyle = COLORS.cloud
    for (let index = 0; index < bumps; index++) {
      const radius = 14 + random() * 10
      const y = 332 - random() * 6
      wrapped(BACKDROP_W, (index + 0.5) * bump, (x) => circle(g, x, y, radius))
    }
    g.fillRect(0, 332, BACKDROP_W, GROUND_Y - 332)

    for (let left = 0; left < BACKDROP_W; ) {
      const width = 16 + Math.floor(random() * 4) * 6
      const top = 362 - (34 + random() * 46)
      wrapped(BACKDROP_W, left, (x) => building(g, x, top, width))
      left += width - 2
    }

    const shrubs = 12
    const shrub = BACKDROP_W / shrubs
    g.fillStyle = COLORS.bushDark
    for (let index = 0; index < shrubs; index++) {
      const radius = 15 + random() * 9
      wrapped(BACKDROP_W, index * shrub + shrub / 2, (x) => circle(g, x, 372, radius))
    }
    g.fillStyle = COLORS.bush
    for (let index = 0; index < shrubs; index++) {
      const radius = 13 + random() * 9
      wrapped(BACKDROP_W, index * shrub, (x) => circle(g, x, 380, radius))
    }
    g.fillRect(0, 380, BACKDROP_W, GROUND_Y - 380)
  })
}

function paintGround(k) {
  return paintTile(GROUND_W, GROUND_H, k, (g) => {
    const dirt = g.createLinearGradient(0, 18, 0, GROUND_H)
    dirt.addColorStop(0, COLORS.dirt)
    dirt.addColorStop(1, COLORS.dirtLow)
    g.fillStyle = dirt
    g.fillRect(0, 0, GROUND_W, GROUND_H)
    g.fillStyle = COLORS.grass
    g.fillRect(0, 0, GROUND_W, 15)
    g.fillStyle = COLORS.grassLight
    for (let x = -24; x < GROUND_W + 24; x += 24) {
      g.beginPath()
      g.moveTo(x, 15)
      g.lineTo(x + 12, 15)
      g.lineTo(x + 20, 3)
      g.lineTo(x + 8, 3)
      g.closePath()
      g.fill()
    }
    g.fillStyle = COLORS.grassEdge
    g.fillRect(0, 0, GROUND_W, 3)
    g.fillStyle = COLORS.grassShade
    g.fillRect(0, 15, GROUND_W, 3)
    g.fillStyle = COLORS.dirtLine
    g.fillRect(0, 18, GROUND_W, 2)
  })
}

function pipeGradient(g, width) {
  const shade = g.createLinearGradient(0, 0, width, 0)
  shade.addColorStop(0, COLORS.pipeDark)
  shade.addColorStop(0.07, COLORS.pipeLight)
  shade.addColorStop(0.16, COLORS.pipeShine)
  shade.addColorStop(0.28, COLORS.pipeLight)
  shade.addColorStop(0.55, COLORS.pipe)
  shade.addColorStop(0.85, COLORS.pipeDark)
  shade.addColorStop(1, COLORS.pipeEdge)
  return shade
}

function paintPipeBody(k) {
  return paintTile(PIPE_W, 4, k, (g) => {
    g.fillStyle = pipeGradient(g, PIPE_W)
    g.fillRect(0, 0, PIPE_W, 4)
    g.fillStyle = COLORS.pipeEdge
    g.fillRect(0, 0, 2, 4)
    g.fillRect(PIPE_W - 2, 0, 2, 4)
  }).surface
}

function paintPipeCap(k) {
  return paintTile(CAP_W, CAP_H, k, (g) => {
    g.fillStyle = pipeGradient(g, CAP_W)
    g.fillRect(0, 0, CAP_W, CAP_H)
    g.fillStyle = "rgba(255, 255, 255, 0.28)"
    g.fillRect(2, 2, CAP_W - 4, 3)
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(2, CAP_H - 5, CAP_W - 4, 3)
    g.strokeStyle = COLORS.pipeEdge
    g.lineWidth = 2
    g.strokeRect(1, 1, CAP_W - 2, CAP_H - 2)
  }).surface
}

function paintBird(k, frame) {
  return paintTile(BIRD_W, BIRD_H, k, (g) => {
    const body = () => {
      g.beginPath()
      g.ellipse(0, 0, 15, 11.5, 0, 0, Math.PI * 2)
    }
    g.translate(BIRD_W / 2, BIRD_H / 2)
    g.lineJoin = "round"
    g.lineWidth = 1.7
    g.strokeStyle = COLORS.outline

    body()
    g.fillStyle = COLORS.body
    g.fill()
    g.save()
    body()
    g.clip()
    g.fillStyle = COLORS.belly
    g.beginPath()
    g.ellipse(4, 7, 13, 7, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = COLORS.shade
    g.beginPath()
    g.ellipse(-8, 9, 10, 5, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
    body()
    g.stroke()

    g.fillStyle = "#ffffff"
    g.beginPath()
    g.arc(6.5, -4.5, 5.4, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = "#1b1b1b"
    circle(g, 8.4, -4.2, 2.2)

    g.fillStyle = COLORS.beak
    g.beginPath()
    g.roundRect(6, -0.6, 13.5, 4.4, 2)
    g.fill()
    g.stroke()
    g.fillStyle = COLORS.beakLow
    g.beginPath()
    g.roundRect(6, 3.4, 11.5, 4, 2)
    g.fill()
    g.stroke()

    g.save()
    g.translate(-6.5, 1.5 + [-3.6, 0, 3.4][frame])
    g.rotate([-0.35, 0, 0.3][frame])
    g.fillStyle = COLORS.wing
    g.beginPath()
    g.ellipse(0, 0, 7.6, 4.8, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.restore()
  }).surface
}

let measurer

function measureText(font, value) {
  measurer ??= createSurface(1, 1).getContext("2d")
  measurer.font = font
  return measurer.measureText(value).width
}

function paintText(value, size, style, k) {
  const px = size * k
  const font = `${style.weight} ${px}px ${FONT}`
  const line = Math.max(1.5, px * style.line)
  const pad = line + 2
  const surface = createSurface(measureText(font, value) + pad * 2, px * 1.3 + pad * 2)
  const g = surface.getContext("2d")
  const x = surface.width / 2
  const y = surface.height / 2 + px * 0.05
  g.font = font
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.lineJoin = "round"
  g.lineWidth = line
  g.strokeStyle = style.stroke
  g.strokeText(value, x, y)
  g.fillStyle = style.fill
  g.fillText(value, x, y)
  return { surface, width: surface.width / k, height: surface.height / k }
}

function paintPill(value, tone, k) {
  const px = 11.5 * k
  const font = `700 ${px}px ${FONT}`
  const dot = 7 * k
  const padding = 9 * k
  const space = 6 * k
  const surface = createSurface(padding * 2 + dot + space + measureText(font, value), 22 * k)
  const g = surface.getContext("2d")
  g.fillStyle = COLORS.pill
  g.beginPath()
  g.roundRect(0, 0, surface.width, surface.height, surface.height / 2)
  g.fill()
  g.fillStyle = tone === "done" ? COLORS.done : COLORS.running
  circle(g, padding + dot / 2, surface.height / 2, dot / 2)
  g.font = font
  g.textBaseline = "middle"
  g.fillStyle = "#ffffff"
  g.fillText(value, padding + dot + space, surface.height / 2 + px * 0.05)
  return { surface, width: surface.width / k, height: surface.height / k }
}

function paintBoard(score, best, record, labels, k) {
  const width = 220
  const height = 112
  const surface = createSurface(width * k, height * k)
  const g = surface.getContext("2d")
  g.scale(surface.width / width, surface.height / height)

  g.fillStyle = COLORS.board
  g.strokeStyle = COLORS.boardEdge
  g.lineWidth = 3
  g.beginPath()
  g.roundRect(1.5, 1.5, width - 3, height - 3, 10)
  g.fill()
  g.stroke()
  g.strokeStyle = "rgba(255, 255, 255, 0.55)"
  g.lineWidth = 1.5
  g.beginPath()
  g.roundRect(5.5, 5.5, width - 11, height - 11, 7)
  g.stroke()

  const right = width - 16
  g.textBaseline = "middle"
  g.lineJoin = "round"
  g.font = `800 10.5px ${FONT}`
  g.fillStyle = COLORS.boardLabel
  g.textAlign = "center"
  g.fillText(labels.medal, 54, 22)
  g.textAlign = "right"
  g.fillText(labels.score, right, 22)
  g.fillText(labels.best, right, 66)

  const number = `800 22px ${FONT}`
  g.font = number
  g.lineWidth = 4
  g.strokeStyle = COLORS.boardEdge
  g.fillStyle = "#ffffff"
  for (const [value, y] of [
    [score, 44],
    [best, 88],
  ]) {
    g.strokeText(String(value), right, y)
    g.fillText(String(value), right, y)
  }

  const medal = MEDALS.find((entry) => score >= entry.score)
  g.beginPath()
  g.arc(54, 68, 23, 0, Math.PI * 2)
  g.fillStyle = medal ? medal.fill : COLORS.boardEmpty
  g.fill()
  if (medal) {
    g.lineWidth = 3
    g.strokeStyle = medal.ring
    g.stroke()
    g.fillStyle = medal.ring
    star(g, 54, 69, 11, 4.6)
    g.fillStyle = medal.shine
    circle(g, 45, 59, 3.5)
  }

  if (record) {
    const end = right - measureText(number, String(best)) - 8
    g.font = `800 8px ${FONT}`
    const badge = measureText(g.font, labels.record) + 10
    g.fillStyle = COLORS.record
    g.beginPath()
    g.roundRect(end - badge, 82, badge, 12, 6)
    g.fill()
    g.fillStyle = "#ffffff"
    g.textAlign = "center"
    g.fillText(labels.record, end - badge / 2, 88.5)
  }

  return { surface, width, height }
}


function createView(game, t, status, wake, touch) {
  const root = document.createElement("div")
  const surface = document.createElement("canvas")
  root.tabIndex = 0
  root.setAttribute("role", "application")
  root.setAttribute("aria-label", "Flappy Bird")
  root.style.cssText =
    "position:relative;display:flex;justify-content:center;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;outline:none;user-select:none;-webkit-user-select:none;touch-action:none;"
  surface.style.cssText = "display:block;flex:none;height:100%;cursor:pointer;"
  root.append(surface)

  const g = surface.getContext("2d", { alpha: false })
  const matrix = new DOMMatrix()
  const sprites = new Map()
  const layout = { width: 0, height: 0, ratio: 0, k: 1, field: MIN_W, top: 0, bottom: 0, ready: false }
  let art
  let artTimer = 0
  let shown = false

  function buildArt() {
    clearTimeout(artTimer)
    const k = layout.k
    const backdrop = paintBackdrop(k)
    const ground = paintGround(k)
    art = {
      k,
      backdrop: { pattern: g.createPattern(backdrop.surface, "repeat-x"), sx: backdrop.sx, sy: backdrop.sy },
      ground: { pattern: g.createPattern(ground.surface, "repeat-x"), sx: ground.sx, sy: ground.sy },
      body: paintPipeBody(k),
      cap: paintPipeCap(k),
      birds: [0, 1, 2].map((frame) => paintBird(k, frame)),
    }
    wake()
  }

  function measure() {
    const width = root.clientWidth
    const height = root.clientHeight
    const ratio = window.devicePixelRatio || 1
    if (width === layout.width && height === layout.height && ratio === layout.ratio) return
    layout.width = width
    layout.height = height
    layout.ratio = ratio
    layout.ready = width > 1 && height > 1
    if (!layout.ready) return
    const scale = Math.min(height / WORLD_H, width / MIN_W)
    const fieldPx = Math.min(width, Math.round(MAX_W * scale))
    const extra = height / scale - WORLD_H
    layout.field = fieldPx / scale
    layout.top = extra * TOP_SHARE
    layout.bottom = extra - layout.top
    layout.k = scale * ratio
    surface.style.width = `${fieldPx}px`
    const deviceWidth = Math.round(fieldPx * ratio)
    const deviceHeight = Math.round(height * ratio)
    if (surface.width !== deviceWidth) surface.width = deviceWidth
    if (surface.height !== deviceHeight) surface.height = deviceHeight
    if (!art) return buildArt()
    if (art.k === layout.k) return
    clearTimeout(artTimer)
    artTimer = setTimeout(buildArt, 120)
  }

  function sprite(name, value, paint) {
    const cached = sprites.get(name)
    if (cached && cached.value === value && cached.k === layout.k) return cached
    const next = paint()
    next.value = value
    next.k = layout.k
    sprites.set(name, next)
    return next
  }

  function text(name, value, size, style) {
    return sprite(name, value, () => paintText(value, size, style, layout.k))
  }

  function stamp(image, cx, cy, alpha = 1) {
    const k = layout.k
    const x = Math.round((cx - image.width / 2) * k) / k
    const y = Math.round((cy + layout.top - image.height / 2) * k) / k - layout.top
    if (alpha !== 1) g.globalAlpha = alpha
    g.drawImage(image.surface, x, y, image.width, image.height)
    if (alpha !== 1) g.globalAlpha = 1
  }

  function fill(layer, x, y) {
    matrix.a = layer.sx
    matrix.b = 0
    matrix.c = 0
    matrix.d = layer.sy
    matrix.e = x
    matrix.f = y
    layer.pattern.setTransform(matrix)
    g.fillStyle = layer.pattern
  }

  function cover() {
    g.fillRect(0, -layout.top - 1, layout.field, layout.top + WORLD_H + layout.bottom + 2)
  }

  function drawWorld(scroll) {
    const field = layout.field
    if (layout.top > 0) {
      g.fillStyle = COLORS.skyTop
      g.fillRect(0, -layout.top - 1, field, layout.top + 1.5)
    }
    fill(art.backdrop, -((scroll * PARALLAX) % BACKDROP_W), 0)
    g.fillRect(0, 0, field, GROUND_Y)

    const pipes = game.pipes
    for (let index = 0; index < pipes.length; index++) {
      const pipe = pipes[index]
      const x = pipe.x - scroll
      if (x > field + CAP_OVER || x + PIPE_W + CAP_OVER < 0) continue
      const top = pipe.gap - GAP / 2
      const bottom = pipe.gap + GAP / 2
      g.drawImage(art.body, x, -layout.top - 2, PIPE_W, top - CAP_H + layout.top + 2.5)
      g.drawImage(art.cap, x - CAP_OVER, top - CAP_H, CAP_W, CAP_H)
      g.drawImage(art.cap, x - CAP_OVER, bottom, CAP_W, CAP_H)
      g.drawImage(art.body, x, bottom + CAP_H - 0.5, PIPE_W, GROUND_Y - bottom - CAP_H + 0.5)
    }

    fill(art.ground, -(scroll % GROUND_W), GROUND_Y)
    g.fillRect(0, GROUND_Y, field, GROUND_H)
    if (layout.bottom > 0) {
      g.fillStyle = COLORS.dirtDeep
      g.fillRect(0, WORLD_H - 0.5, field, layout.bottom + 1.5)
    }
  }

  function drawBird(alpha) {
    const bird = game.bird
    const frame = game.phase === "over" ? 1 : WING[Math.floor(bird.wing) % WING.length]
    g.save()
    g.translate(BIRD_X, lerp(bird.prevY, bird.y, alpha))
    g.rotate(lerp(bird.prevAngle, bird.angle, alpha))
    g.drawImage(art.birds[frame], -BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H)
    g.restore()
  }

  function drawHud() {
    const center = layout.field / 2
    const phase = game.phase
    const tone = status()

    if (phase === "paused") {
      g.fillStyle = "rgba(8, 24, 32, 0.42)"
      cover()
    }
    if (phase === "playing" || phase === "paused") {
      stamp(text("score", String(game.score), 40, TEXT.score), center, -layout.top + 54)
    }
    if (tone) {
      const value = t(tone === "running" ? "status.running" : "status.done")
      stamp(
        sprite("status", `${tone}:${value}`, () => paintPill(value, tone, layout.k)),
        center,
        GROUND_Y + 58,
      )
    }

    if (phase === "ready") {
      stamp(text("title", "Flappy Bird", 32, TEXT.title), center, 112)
      stamp(text("start", t("start"), 15, TEXT.hint), center, 290)
      if (game.best > 0) stamp(text("best", `${t("best")}: ${game.best}`, 13, TEXT.small), center, 314)
      stamp(text("keys", t("keys"), 11, TEXT.small), center, 336)
      return
    }

    if (phase === "paused") {
      stamp(text("paused", t("paused"), 30, TEXT.title), center, 172)
      stamp(text("resume", t("resume"), 14, TEXT.hint), center, 208)
      return
    }

    if (phase !== "over" && phase !== "finished") return
    const finished = phase === "finished"
    const elapsed = game.time - game.deadAt
    const title = finished ? 1 : ease((elapsed - 0.25) / 0.3)
    if (title > 0) stamp(text("over", t(finished ? "finished" : "over"), finished ? 23 : 28, TEXT.over), center, 104 - (1 - title) * 14, title)
    const board = finished ? 1 : ease((elapsed - 0.4) / 0.35)
    if (board > 0) {
      const labels = { score: t("score"), best: t("best"), medal: t("medal"), record: t("record") }
      const value = [game.score, game.best, game.record, labels.score, labels.best, labels.medal, labels.record].join("|")
      stamp(
        sprite("board", value, () => paintBoard(game.score, game.best, game.record, labels, layout.k)),
        center,
        198 + (1 - board) * 36,
        board,
      )
    }
    const hint = finished ? 1 : ease((elapsed - RESTART_DELAY) / 0.25)
    if (hint > 0) stamp(text("restart", t(game.locked ? "waiting" : "restart"), game.locked ? 10 : 14, TEXT.hint), center, 284, hint)
  }

  function draw(alpha) {
    if (window.devicePixelRatio !== layout.ratio) measure()
    if (!layout.ready || !art) return
    g.setTransform(layout.k, 0, 0, layout.k, 0, layout.top * layout.k)
    g.imageSmoothingEnabled = true
    drawWorld(lerp(game.prevScroll, game.scroll, alpha))
    drawBird(alpha)
    drawHud()
    if (game.flash > 0) {
      g.globalAlpha = game.flash * 0.85
      g.fillStyle = "#ffffff"
      cover()
      g.globalAlpha = 1
    }
  }

  const onPointer = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    if (document.activeElement !== root) root.focus({ preventScroll: true })
    touch()
    game.press()
    wake()
  }

  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const flap = FLAP_KEYS.has(event.code)
    if (!flap && event.code !== "KeyP") return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    touch()
    if (flap) game.press()
    else game.toggle()
    wake()
  }

  const onBlur = () => {
    game.pause()
    wake()
  }

  const resize = new ResizeObserver(() => {
    measure()
    wake()
  })
  const visibility = new IntersectionObserver((entries) => {
    shown = entries[entries.length - 1].isIntersecting
    wake()
  })
  resize.observe(root)
  visibility.observe(root)
  root.addEventListener("pointerdown", onPointer)
  root.addEventListener("keydown", onKey)
  root.addEventListener("blur", onBlur)

  return {
    root,
    draw,
    visible: () => shown && layout.ready && root.isConnected && document.visibilityState === "visible",
    dispose() {
      clearTimeout(artTimer)
      resize.disconnect()
      visibility.disconnect()
      root.removeEventListener("pointerdown", onPointer)
      root.removeEventListener("keydown", onKey)
      root.removeEventListener("blur", onBlur)
      sprites.clear()
      art = undefined
      shown = false
    },
  }
}

function createEngine(t, options = {}) {
  const views = []
  let frame = 0
  let last = 0
  let carry = 0
  let alive = true
  let ticking = false
  let again = false
  let touched = 0

  const game = createGame(() => {
    wake()
    options.onStateChange?.(game.phase)
  }, { best: readBest(), lastScore: readScore(), saveBest: writeBest, saveScore: writeScore, ...options })
  const touch = () => {
    if (options.best === undefined) game.best = Math.max(game.best, readBest())
    touched = performance.now()
  }

  function advance(now) {
    let shown = 0
    for (let index = 0; index < views.length; index++) if (views[index].visible()) shown++
    if (shown === 0) {
      game.pause()
      return false
    }
    carry += last ? Math.min((now - last) / 1000, MAX_FRAME) : 0
    last = now
    let steps = 0
    while (carry >= STEP && steps < MAX_STEPS) {
      game.step(STEP)
      carry -= STEP
      steps++
    }
    if (steps === MAX_STEPS) carry = 0
    const alpha = carry / STEP
    for (let index = 0; index < views.length; index++) if (views[index].visible()) views[index].draw(alpha)
    return true
  }

  function tick(now) {
    frame = 0
    if (!alive) return
    ticking = true
    again = false
    let drawn = false
    try {
      drawn = advance(now)
    } finally {
      ticking = false
    }
    if (drawn && (again || game.animating())) {
      frame = requestAnimationFrame(tick)
      return
    }
    last = 0
    carry = 0
  }

  function wake() {
    if (!alive) return
    if (ticking) {
      again = true
      return
    }
    if (!frame) frame = requestAnimationFrame(tick)
  }

  const onVisibility = () => {
    if (document.visibilityState !== "visible") game.pause()
    wake()
  }
  document.addEventListener("visibilitychange", onVisibility)

  return {
    mount(status) {
      if (options.best === undefined) game.best = Math.max(game.best, readBest())
      const view = createView(game, t, status, wake, touch)
      views.push(view)
      wake()
      return {
        root: view.root,
        dispose() {
          const index = views.indexOf(view)
          if (index >= 0) views.splice(index, 1)
          view.dispose()
          wake()
        },
      }
    },
    focus() {
      const view = views.findLast((entry) => entry.visible()) ?? views[views.length - 1]
      view?.root.focus({ preventScroll: true })
    },
    phase: () => game.phase,
    setRunning(running) {
      if (options.best === undefined) game.best = Math.max(game.best, readBest())
      game.setRunning(running)
      wake()
    },
    engaged: () =>
      game.phase === "playing" || (game.phase !== "paused" && performance.now() - touched < ENGAGED_FOR),
    wake,
    dispose() {
      alive = false
      cancelAnimationFrame(frame)
      frame = 0
      document.removeEventListener("visibilitychange", onVisibility)
      for (const view of views.splice(0)) view.dispose()
    },
  }
}

module.exports = { createEngine }
