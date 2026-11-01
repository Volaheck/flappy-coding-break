import { constants } from "./core.js"

const { WORLD_H, GROUND_Y, GROUND_H, MIN_W, MAX_W, TOP_SHARE, BIRD_X, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP } = constants
const BACKDROP_W = 288
const GROUND_W = 168
const PARALLAX = 0.25
const WING = [0, 1, 2, 1]

const COLORS = {
  skyTop: "#3fb3c3", skyMid: "#71cdd6", skyLow: "#a8e3e6",
  cloud: "#e8f8f4", cloudShade: "#d3efec", city: "#a7ddd6", cityEdge: "#8ccac2", window: "#c9eee8",
  bush: "#5fcf6e", bushDark: "#43b157",
  grass: "#73bf2e", grassLight: "#9ce35c", grassEdge: "#3b6a17", grassShade: "#558f22",
  dirt: "#ded895", dirtLow: "#d2c97f", dirtLine: "#c8bd70",
  pipeEdge: "#2f5314", pipeDark: "#4b861d", pipe: "#74bf2e", pipeLight: "#a5e866", pipeShine: "#d4f7ad",
  outline: "#3b2a20", body: "#f8c63f", belly: "#fbe28f", shade: "#e6a12a", wing: "#fff6dc", beak: "#f6662b", beakLow: "#df4a16",
}

const n = (value) => Math.round(value * 10) / 10

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function wrapped(x, draw) {
  return draw(x - BACKDROP_W) + draw(x) + draw(x + BACKDROP_W)
}

const circle = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`
const rect = (x, y, w, h, fill = "") => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${fill && ` fill="${fill}"`}/>`

function backdrop() {
  const random = seeded(11)
  let clouds = ""
  for (const [x, y, size] of [[46, 74, 1], [178, 146, 0.75], [244, 38, 0.55]]) {
    clouds += wrapped(x, (left) => circle(left, y, 13 * size) + circle(left + 15 * size, y - 7 * size, 17 * size)
      + circle(left + 32 * size, y - 2 * size, 13 * size) + circle(left + 44 * size, y + 3 * size, 9 * size) + rect(left, y, 44 * size, 12 * size))
  }
  const bump = BACKDROP_W / 13
  let shade = ""
  for (let index = 0; index < 13; index++) {
    const radius = 18 + random() * 12
    const y = 322 - random() * 8
    shade += wrapped(index * bump, (x) => circle(x, y, radius))
  }
  let bank = ""
  for (let index = 0; index < 13; index++) {
    const radius = 14 + random() * 10
    const y = 332 - random() * 6
    bank += wrapped((index + 0.5) * bump, (x) => circle(x, y, radius))
  }
  let city = ""
  for (let left = 0; left < BACKDROP_W;) {
    const width = 16 + Math.floor(random() * 4) * 6
    const top = 362 - (34 + random() * 46)
    city += wrapped(left, (x) => rect(x, top, width, GROUND_Y - top, COLORS.city)
      + rect(x + 4, top + 6, width - 9, 356 - top - 6, "url(#windows)")
      + rect(x, top, width, 2, COLORS.cityEdge) + rect(x + width - 2, top, 2, GROUND_Y - top, COLORS.cityEdge))
    left += width - 2
  }
  const shrub = BACKDROP_W / 12
  let bushesDark = ""
  for (let index = 0; index < 12; index++) {
    const radius = 15 + random() * 9
    bushesDark += wrapped(index * shrub + shrub / 2, (x) => circle(x, 372, radius))
  }
  let bushes = ""
  for (let index = 0; index < 12; index++) {
    const radius = 13 + random() * 9
    bushes += wrapped(index * shrub, (x) => circle(x, 380, radius))
  }
  return `<g id="backdrop"><rect width="${BACKDROP_W + 1}" height="${GROUND_Y}" fill="url(#sky)"/>`
    + `<g fill="#fff" fill-opacity=".85">${clouds}</g>`
    + `<g fill="${COLORS.cloudShade}">${shade}${rect(0, 322, BACKDROP_W, GROUND_Y - 322)}</g>`
    + `<g fill="${COLORS.cloud}">${bank}${rect(0, 332, BACKDROP_W, GROUND_Y - 332)}</g>`
    + city
    + `<g fill="${COLORS.bushDark}">${bushesDark}</g>`
    + `<g fill="${COLORS.bush}">${bushes}${rect(0, 380, BACKDROP_W, GROUND_Y - 380)}</g></g>`
}

function ground() {
  let blades = ""
  for (let x = -24; x < GROUND_W + 24; x += 24) blades += `<path d="M${x} 15h12l8-12h-12z"/>`
  return `<g id="ground"><rect width="${GROUND_W + 1}" height="${GROUND_H}" fill="url(#dirt)"/>`
    + rect(0, 0, GROUND_W + 1, 15, COLORS.grass)
    + `<g fill="${COLORS.grassLight}">${blades}</g>`
    + rect(0, 0, GROUND_W + 1, 3, COLORS.grassEdge) + rect(0, 15, GROUND_W + 1, 3, COLORS.grassShade) + rect(0, 18, GROUND_W + 1, 2, COLORS.dirtLine) + "</g>"
}

function birdArt(frame) {
  const wingY = 1.5 + [-3.6, 0, 3.4][frame]
  const wingAngle = [-0.35, 0, 0.3][frame] * 180 / Math.PI
  return `<g stroke="${COLORS.outline}" stroke-width="1.7" stroke-linejoin="round">`
    + `<ellipse rx="15" ry="11.5" fill="${COLORS.body}"/>`
    + `<g clip-path="url(#body)" stroke="none"><ellipse cx="4" cy="7" rx="13" ry="7" fill="${COLORS.belly}"/><ellipse cx="-8" cy="9" rx="10" ry="5" fill="${COLORS.shade}"/></g>`
    + `<ellipse rx="15" ry="11.5" fill="none"/>`
    + `<circle cx="6.5" cy="-4.5" r="5.4" fill="#fff"/><circle cx="8.4" cy="-4.2" r="2.2" fill="#1b1b1b" stroke="none"/>`
    + `<rect x="6" y="-0.6" width="13.5" height="4.4" rx="2" fill="${COLORS.beak}"/>`
    + `<rect x="6" y="3.4" width="11.5" height="4" rx="2" fill="${COLORS.beakLow}"/>`
    + `<ellipse rx="7.6" ry="4.8" fill="${COLORS.wing}" transform="translate(-6.5 ${n(wingY)}) rotate(${n(wingAngle)})"/></g>`
}

const pipeStops = [[0, "pipeDark"], [0.07, "pipeLight"], [0.16, "pipeShine"], [0.28, "pipeLight"], [0.55, "pipe"], [0.85, "pipeDark"], [1, "pipeEdge"]]
  .map(([offset, color]) => `<stop offset="${offset}" stop-color="${COLORS[color]}"/>`).join("")

const DEFS = "<defs>"
  + `<linearGradient id="sky" x2="0" y2="1"><stop stop-color="${COLORS.skyTop}"/><stop offset=".6" stop-color="${COLORS.skyMid}"/><stop offset="1" stop-color="${COLORS.skyLow}"/></linearGradient>`
  + `<linearGradient id="dirt" x2="0" y2="1"><stop offset=".16" stop-color="${COLORS.dirt}"/><stop offset="1" stop-color="${COLORS.dirtLow}"/></linearGradient>`
  + `<linearGradient id="pipe">${pipeStops}</linearGradient>`
  + `<pattern id="windows" width="7" height="9" patternUnits="userSpaceOnUse"><rect width="3" height="4" fill="${COLORS.window}"/></pattern>`
  + `<clipPath id="body"><ellipse rx="15" ry="11.5"/></clipPath>`
  + backdrop() + ground()
  + [0, 1, 2].map((frame) => `<g id="bird${frame}">${birdArt(frame)}</g>`).join("")
  + `<g id="cap"><rect width="${CAP_W}" height="${CAP_H}" fill="url(#pipe)"/><rect x="2" y="2" width="${CAP_W - 4}" height="3" fill="#fff" fill-opacity=".28"/>`
  + `<rect x="2" y="${CAP_H - 5}" width="${CAP_W - 4}" height="3" fill-opacity=".18"/><rect x="1" y="1" width="${CAP_W - 2}" height="${CAP_H - 2}" fill="none" stroke="${COLORS.pipeEdge}" stroke-width="2"/></g>`
  + "</defs>"

export const idleFrame = { phase: "ready", score: 0, scroll: 0, y: constants.READY_Y, angle: 0, wing: 0, pipes: [] }

export function frameOf(game) {
  return {
    phase: game.phase,
    score: game.score,
    scroll: n(game.scroll),
    y: n(game.bird.y),
    angle: Math.round(game.bird.angle * 100) / 100,
    wing: game.phase === "over" ? 1 : WING[Math.floor(game.bird.wing) % WING.length],
    pipes: game.pipes.map((pipe) => [n(pipe.x), n(pipe.gap)]),
  }
}

// `aspect` is the board's height over its width; the field fits it the way the Canvas version fits its element.
export function drawScene(frame, aspect) {
  const scale = Math.min(aspect / WORLD_H, 1 / MIN_W)
  const width = 1 / scale
  const height = aspect / scale
  const field = Math.min(width, MAX_W)
  const top = (height - WORLD_H) * TOP_SHARE
  const left = (width - field) / 2
  const scroll = frame.scroll
  let body = `<clipPath id="field"><rect y="${n(-top)}" width="${n(field)}" height="${n(height)}"/></clipPath><g clip-path="url(#field)">`
  if (top > 0) body += rect(0, -top - 1, field, top + 1.5, COLORS.skyTop)
  for (let x = -((scroll * PARALLAX) % BACKDROP_W); x < field; x += BACKDROP_W) body += `<use href="#backdrop" x="${n(x)}"/>`
  for (const [pipeX, gap] of frame.pipes) {
    const x = pipeX - scroll
    if (x > field + CAP_OVER || x + PIPE_W + CAP_OVER < 0) continue
    const gapTop = gap - GAP / 2
    const gapBottom = gap + GAP / 2
    body += rect(x, -top - 2, PIPE_W, gapTop - CAP_H + top + 2.5, "url(#pipe)") + rect(x, gapBottom + CAP_H - 0.5, PIPE_W, GROUND_Y - gapBottom - CAP_H + 0.5, "url(#pipe)")
      + `<use href="#cap" x="${n(x - CAP_OVER)}" y="${n(gapTop - CAP_H)}"/><use href="#cap" x="${n(x - CAP_OVER)}" y="${n(gapBottom)}"/>`
  }
  for (let x = -(scroll % GROUND_W); x < field; x += GROUND_W) body += `<use href="#ground" x="${n(x)}" y="${GROUND_Y}"/>`
  if (height - top > WORLD_H) body += rect(0, WORLD_H - 0.5, field, height - top - WORLD_H + 1.5, COLORS.dirtLow)
  body += `<use href="#bird${frame.wing}" transform="translate(${BIRD_X} ${n(frame.y)}) rotate(${n(frame.angle * 180 / Math.PI)})"/>`
  if (frame.phase === "playing" || frame.phase === "paused") {
    body += `<text x="${n(field / 2)}" y="64" text-anchor="middle" font-family="ui-rounded, system-ui, -apple-system, sans-serif" font-weight="800" font-size="40" fill="#fff" stroke="${COLORS.outline}" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${frame.score}</text>`
  }
  body += "</g>"
  const pixelWidth = 1000
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${Math.round(pixelWidth * aspect)}" viewBox="${n(-left)} ${n(-top)} ${n(width)} ${n(height)}" preserveAspectRatio="xMidYMid slice">${DEFS}${body}</svg>`
}
