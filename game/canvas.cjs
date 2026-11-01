"use strict"

const { createGame } = require("./core.cjs")
const { STEP, MAX_FRAME, MAX_STEPS, WORLD_H, GROUND_Y, MIN_W, MAX_W, TOP_SHARE, BIRD_X, DUCK_SIZE, PIPE_W, GAP, RESTART_DELAY } = require("./constants.cjs")
const { DUCK, CITY, CLOUDS } = require("./art.cjs")
const { THEME, STREAKS, phraseKind, duckTilt, duckScale, streakAt } = require("./theme.cjs")

const BEST_KEY = "opencode.flappybird.best"
const SCORE_KEY = "flappy-coding-break.lastScore"
const ENGAGED_FOR = 3000

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", Inter, "Segoe UI", system-ui, sans-serif'
const FLAP_KEYS = new Set(["Space", "ArrowUp", "KeyW", "Enter", "NumpadEnter"])
const { artScale: ART, crate: CRATE, ui: UI } = THEME

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

// The duck decodes once per page; views that drew before it landed redraw when it does.
let duckImage
const duckWaiters = new Set()

function loadDuck(wake) {
  if (!duckImage) {
    duckImage = new Image()
    duckImage.decoding = "async"
    duckImage.onload = () => {
      for (const waiter of duckWaiters) waiter()
      duckWaiters.clear()
    }
    duckImage.src = DUCK.src
  }
  if (!duckImage.complete) duckWaiters.add(wake)
  return duckImage
}

function paintCity(layer, k) {
  const width = layer.width * ART
  const height = layer.height * ART
  return paintTile(width, height, k, (g) => {
    g.fillStyle = layer.color
    g.beginPath()
    g.moveTo(0, height)
    for (let index = 0; index < layer.points.length; index += 2) g.lineTo(layer.points[index] * ART, layer.points[index + 1] * ART)
    g.lineTo(width, height)
    g.closePath()
    g.fill()
  })
}

function paintClouds(k) {
  return paintTile(CLOUDS.width * ART, CLOUDS.height * ART, k, (g) => {
    g.scale(ART, ART)
    g.fillStyle = THEME.band.color
    for (const shape of CLOUDS.shapes) {
      const path = new Path2D(shape.d)
      for (const offset of [-CLOUDS.width, 0, CLOUDS.width]) {
        g.save()
        g.translate(shape.x + offset, shape.y)
        g.fill(path)
        g.restore()
      }
    }
    g.fillRect(0, CLOUDS.top, CLOUDS.width, CLOUDS.height - CLOUDS.top)
  })
}

// A Flappy Duck crate: a bevelled golden box around a planked panel crossed by braces.
function paintCrate(k) {
  const size = PIPE_W
  const inset = 8
  const inner = size - inset * 2
  return paintTile(size, size, k, (g) => {
    g.fillStyle = CRATE.seam
    g.beginPath()
    g.roundRect(0, 0, size, size, 5)
    g.fill()
    g.fillStyle = CRATE.face
    g.beginPath()
    g.roundRect(1, 1, size - 2, size - 2, 4)
    g.fill()
    g.fillStyle = CRATE.light
    g.fillRect(4, 2, size - 8, 2)
    g.fillRect(2, 4, 2, size - 8)
    g.fillStyle = CRATE.shade
    g.fillRect(4, size - 4, size - 8, 2)
    g.fillRect(size - 4, 4, 2, size - 8)
    g.fillStyle = CRATE.panel
    g.fillRect(inset, inset, inner, inner)
    g.fillStyle = CRATE.plank
    for (let plank = 1; plank < 5; plank++) g.fillRect(inset + (inner * plank) / 5 - 0.6, inset, 1.2, inner)
    g.save()
    g.beginPath()
    g.rect(inset, inset, inner, inner)
    g.clip()
    g.lineWidth = 1.2
    g.lineJoin = "round"
    for (const mirrored of [false, true]) {
      g.save()
      if (mirrored) {
        g.translate(size, 0)
        g.scale(-1, 1)
      }
      g.beginPath()
      g.moveTo(inset - 6, inset)
      g.lineTo(inset + 5, inset)
      g.lineTo(size - inset + 6, size - inset)
      g.lineTo(size - inset - 5, size - inset)
      g.closePath()
      g.fillStyle = CRATE.brace
      g.fill()
      g.strokeStyle = CRATE.braceEdge
      g.stroke()
      g.restore()
    }
    g.restore()
    g.strokeStyle = CRATE.shade
    g.lineWidth = 1
    g.strokeRect(inset + 0.5, inset + 0.5, inner - 1, inner - 1)
  }).surface
}

let measurer

function measureText(font, value) {
  measurer ??= createSurface(1, 1).getContext("2d")
  measurer.font = font
  return measurer.measureText(value).width
}

const fontOf = (size, weight) => `${weight} ${size}px ${FONT}`

// The largest size up to `size` at which `value` spans no more than `width`.
const fitted = (value, size, weight, width) => Math.min(size, (size * width) / Math.max(1, measureText(fontOf(size, weight), value)))

// One line of text, centred in its own sprite; a soft shadow keeps it legible on the bright sky.
function paintLabel(value, size, { weight = 700, color = UI.text, shadow = false } = {}, k) {
  const px = size * k
  const font = fontOf(px, weight)
  const pad = Math.ceil(px * (shadow ? 0.35 : 0.1))
  const surface = createSurface(measureText(font, value) + pad * 2, px * 1.3 + pad * 2)
  const g = surface.getContext("2d")
  g.font = font
  g.textAlign = "center"
  g.textBaseline = "middle"
  if (shadow) {
    g.shadowColor = "rgba(0, 0, 0, 0.22)"
    g.shadowBlur = px * 0.2
    g.shadowOffsetY = px * 0.05
  }
  g.fillStyle = color
  g.fillText(value, surface.width / 2, surface.height / 2 + px * 0.04)
  return { surface, width: surface.width / k, height: surface.height / k }
}

// A rounded chip of text in the style of Flappy Duck's translucent pills, with an optional status dot.
function paintPill(value, size, { weight = 700, color = UI.text, background = UI.pill, padX = 9, padY = 4.5, radius, dot } = {}, k) {
  const dotSize = dot ? size * 0.55 : 0
  const gap = dot ? size * 0.45 : 0
  const width = measureText(fontOf(size, weight), value) * 1.03 + padX * 2 + dotSize + gap
  const height = size * 1.25 + padY * 2
  const surface = createSurface(width * k, height * k)
  const g = surface.getContext("2d")
  g.scale(k, k)
  g.fillStyle = background
  g.beginPath()
  g.roundRect(0, 0, width, height, radius ?? height / 2)
  g.fill()
  if (dot) {
    g.fillStyle = dot
    g.beginPath()
    g.arc(padX + dotSize / 2, height / 2, dotSize / 2, 0, Math.PI * 2)
    g.fill()
  }
  g.font = fontOf(size, weight)
  g.textBaseline = "middle"
  g.fillStyle = color
  g.fillText(value, padX + dotSize + gap, height / 2 + size * 0.04)
  return { surface, width, height }
}

// Centred lines of a phrase, wrapped with a little room to spare inside `width`.
function paintParagraph(value, size, width, k) {
  const font = fontOf(size, 600)
  const lines = []
  for (const word of value.split(" ")) {
    const line = lines.length ? `${lines[lines.length - 1]} ${word}` : word
    if (lines.length && measureText(font, line) <= width * 0.92) lines[lines.length - 1] = line
    else lines.push(word)
  }
  const lineHeight = size * 1.35
  const surface = createSurface(width * k, lines.length * lineHeight * k)
  const g = surface.getContext("2d")
  g.scale(k, k)
  g.font = fontOf(size, 600)
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillStyle = UI.text
  lines.forEach((line, index) => g.fillText(line, width / 2, lineHeight * (index + 0.5)))
  return { surface, width, height: lines.length * lineHeight }
}

// Flappy Duck's footer panel: a label on the left, a value on the right.
function paintPanel(label, value, width, k) {
  const height = 34
  const surface = createSurface(width * k, height * k)
  const g = surface.getContext("2d")
  g.scale(k, k)
  g.fillStyle = UI.pill
  g.beginPath()
  g.roundRect(0, 0, width, height, 10)
  g.fill()
  g.textBaseline = "middle"
  g.fillStyle = UI.text
  g.font = fontOf(12.5, 600)
  g.fillText(label, 12, height / 2 + 0.5)
  g.font = fontOf(13, 700)
  g.textAlign = "right"
  g.fillText(value, width - 12, height / 2 + 0.5)
  return { surface, width, height }
}

function hashed(...values) {
  let hash = 2166136261
  for (const value of values) hash = Math.imul(hash ^ Math.round(value * 1000), 16777619)
  return hash >>> 0
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
    const repeat = (tile) => ({ pattern: g.createPattern(tile.surface, "repeat-x"), sx: tile.sx, sy: tile.sy })
    art = {
      k,
      cities: CITY.map((layer) => ({ ...repeat(paintCity(layer, k)), width: layer.width * ART, height: layer.height * ART })),
      clouds: repeat(paintClouds(k)),
      crate: paintCrate(k),
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

  function drawSky() {
    const field = layout.field
    const top = -layout.top - 1
    const height = layout.top + WORLD_H + layout.bottom + 2
    g.save()
    g.translate(field / 2, top + height / 2)
    g.scale(field / 2, height / 2)
    const sky = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    sky.addColorStop(0.5, THEME.sky.inner)
    sky.addColorStop(1, THEME.sky.outer)
    g.fillStyle = sky
    g.fillRect(-1, -1, 2, 2)
    g.restore()
  }

  function drawWorld(scroll) {
    const field = layout.field
    drawSky()
    art.cities.forEach((city, index) => {
      const top = THEME.city.base - city.height
      fill(city, -((scroll * THEME.city.parallax[index]) % city.width), top)
      g.fillRect(0, top, field, city.height)
    })

    for (const pipe of game.pipes) {
      const x = pipe.x - scroll
      if (x > field || x + PIPE_W < 0) continue
      const top = pipe.gap - GAP / 2
      const bottom = pipe.gap + GAP / 2
      for (let y = top - PIPE_W; y > -layout.top - PIPE_W; y -= PIPE_W) g.drawImage(art.crate, x, y, PIPE_W, PIPE_W)
      for (let y = bottom; y < GROUND_Y + 20; y += PIPE_W) g.drawImage(art.crate, x, y, PIPE_W, PIPE_W)
    }

    const band = THEME.band.y
    const tile = CLOUDS.width * ART
    fill(art.clouds, -(scroll % tile), band)
    g.fillRect(0, band, field, CLOUDS.height * ART)
    g.fillStyle = THEME.band.color
    g.fillRect(0, band + CLOUDS.height * ART - 0.5, field, WORLD_H + layout.bottom - band - CLOUDS.height * ART + 1.5)
  }

  // Speed lines stream back from the plane as the air does, level whatever its lean.
  function drawStreaks(y) {
    g.fillStyle = "#ffffff"
    for (const streak of STREAKS) {
      const line = streakAt(streak, game.time)
      g.globalAlpha = line.alpha
      g.beginPath()
      g.roundRect(BIRD_X + line.from, y + line.y - 0.9, line.to - line.from, 1.8, 0.9)
      g.fill()
    }
    g.globalAlpha = 1
  }

  // Two blades whirl over the drawn propeller's blur while the plane flies.
  function drawPropeller() {
    const [hubX, hubY] = DUCK.hub
    g.save()
    g.translate(hubX - DUCK.center[0], hubY - DUCK.center[1])
    g.rotate(0.25)
    g.fillStyle = "rgba(255, 255, 255, 0.55)"
    for (const offset of [0, Math.PI / 2]) {
      const reach = (DUCK.blade / 2) * Math.abs(Math.cos(game.time * 46 + offset))
      g.beginPath()
      g.ellipse(0, 0, 1.8, Math.max(2, reach), 0, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }

  function drawBird(alpha) {
    const sprite = loadDuck(wake)
    if (!sprite.complete || sprite.naturalWidth === 0) return
    const bird = game.bird
    const phase = game.phase
    const y = lerp(bird.prevY, bird.y, alpha)
    const flying = phase === "ready" || phase === "playing"
    if (flying) drawStreaks(y)
    const scale = (DUCK_SIZE / DUCK.size) * duckScale(phase, bird.wing)
    g.save()
    g.translate(BIRD_X, y)
    g.rotate(duckTilt(phase, lerp(bird.prevAngle, bird.angle, alpha)))
    g.scale(scale, scale)
    g.drawImage(sprite, -DUCK.center[0], -DUCK.center[1], DUCK.size, DUCK.size)
    if (flying || phase === "paused") drawPropeller()
    g.restore()
  }

  function label(name, value, size, style) {
    return sprite(name, `${value}|${size}|${JSON.stringify(style)}`, () => paintLabel(value, size, style, layout.k))
  }

  function pill(name, value, size, style = {}) {
    return sprite(name, `${value}|${size}|${JSON.stringify(style)}`, () => paintPill(value, size, style, layout.k))
  }

  // Flappy Duck's dashed rule, fading out towards its ends.
  function separator(center, y, width, alpha) {
    for (let x = -width / 2; x < width / 2; x += 8) {
      g.globalAlpha = alpha * (1 - Math.abs(x + 2) / (width / 2)) * 0.9
      g.fillStyle = UI.text
      g.fillRect(center + x, y, 4, 1)
    }
    g.globalAlpha = 1
  }

  function drawResult(center, alpha) {
    const finished = game.phase === "finished"
    const elapsed = game.time - game.deadAt
    const y = 190
    stamp(label("result-title", t(finished ? "finished" : "over"), 13, { weight: 600, color: UI.hint }), center, y - 82, alpha)
    stamp(label("result-score", String(game.score), 34, { weight: 800 }), center, y - 52, alpha)
    let next = y - 22
    if (game.record) {
      stamp(pill("result-record", t("record").toUpperCase(), 10.5, { weight: 650, color: UI.record, background: UI.recordBg, padX: 7, padY: 3 }), center, next, alpha)
      next += 20
    }
    separator(center, next, 180, alpha)
    const phrases = t(`phrases.${phraseKind(game.score, game.record)}`)
    const phrase = Array.isArray(phrases) ? phrases[hashed(game.deadAt, game.score, game.best) % phrases.length] : ""
    const paragraph = sprite("result-phrase", phrase, () => paintParagraph(phrase, 12.5, Math.min(200, layout.field - 40), layout.k))
    stamp(paragraph, center, next + 12 + paragraph.height / 2, alpha)
    next += 12 + paragraph.height + 22
    const hint = finished ? 1 : ease((elapsed - RESTART_DELAY) / 0.25)
    const room = layout.field - 32
    if (game.locked) stamp(label("result-hint", t("waiting"), fitted(t("waiting"), 11.5, 600, room), { weight: 600, color: UI.hint }), center, next, alpha * hint)
    else {
      const again = `↻  ${t("restart")}`
      stamp(pill("result-hint", again, fitted(again, 12, 600, room - 24), { weight: 600, padX: 12, padY: 6 }), center, next, alpha * hint)
    }
    const width = Math.min(210, layout.field - 36)
    const panel = sprite("result-best", `${t("bestScore")}|${game.best}|${width}`, () => paintPanel(t("bestScore"), String(game.best), width, layout.k))
    stamp(panel, center, next + 38, alpha)
  }

  function drawHud() {
    const center = layout.field / 2
    const phase = game.phase
    const tone = status()
    const result = phase === "over" || phase === "finished"
    const shade = result ? (phase === "finished" ? 1 : ease((game.time - game.deadAt - 0.2) / 0.35)) : phase === "paused" ? 1 : 0

    if (phase === "paused") {
      g.fillStyle = UI.dim
      cover()
    }
    if (result && shade > 0) {
      g.globalAlpha = shade
      g.fillStyle = UI.overlay
      cover()
      g.globalAlpha = 1
    }
    if (phase === "playing" || phase === "paused") {
      stamp(pill("score", `${t("score")}: ${game.score}`, 14, { radius: 8, padX: 11, padY: 4 }), center, -layout.top + 24)
    }
    if (phase === "ready") {
      const start = t("start")
      stamp(label("start", start, fitted(start, 28, 800, layout.field * 0.84), { weight: 800, shadow: true }), center, 112)
      if (game.best > 0) stamp(pill("best", `${t("best")}: ${game.best}`, 12, { padX: 10, padY: 4 }), center, 146)
      stamp(label("keys", t("keys"), fitted(t("keys"), 11, 600, layout.field - 28), { weight: 600, color: UI.hint, shadow: true }), center, 330)
    }
    if (phase === "paused") {
      stamp(label("paused", t("paused"), 28, { weight: 800, shadow: true }), center, 166)
      stamp(pill("resume", t("resume"), fitted(t("resume"), 12, 600, layout.field - 56), { weight: 600, padX: 12, padY: 6 }), center, 200)
    }
    if (result && shade > 0) drawResult(center, shade)
    if (tone) {
      const dark = result || phase === "paused"
      const value = t(tone === "running" ? "status.running" : "status.done")
      stamp(pill("status", value, fitted(value, 11.5, 600, layout.field - 60), {
        weight: 600, dot: UI.status[tone], padX: 10, padY: 4,
        color: dark ? UI.text : UI.statusText, background: dark ? UI.pill : UI.statusBg,
      }), center, GROUND_Y + 64)
    }
  }

  function draw(alpha) {
    if (window.devicePixelRatio !== layout.ratio) measure()
    if (!layout.ready || !art) return
    g.setTransform(layout.k, 0, 0, layout.k, 0, layout.top * layout.k)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = "high"
    drawWorld(lerp(game.prevScroll, game.scroll, alpha))
    drawBird(alpha)
    if (game.flash > 0) {
      g.globalAlpha = game.flash * 0.7
      g.fillStyle = "#ffffff"
      cover()
      g.globalAlpha = 1
    }
    drawHud()
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
