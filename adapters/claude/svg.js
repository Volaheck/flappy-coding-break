import { constants } from "./core.js"
import { COLORS, fieldLayout } from "./field.js"

const { GROUND_Y } = constants
const BACKDROP_W = 288

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

const DEFS = "<defs>"
  + `<linearGradient id="sky" x2="0" y2="1"><stop stop-color="${COLORS.skyTop}"/><stop offset=".6" stop-color="${COLORS.skyMid}"/><stop offset="1" stop-color="${COLORS.skyLow}"/></linearGradient>`
  + `<pattern id="windows" width="7" height="9" patternUnits="userSpaceOnUse"><rect width="3" height="4" fill="${COLORS.window}"/></pattern>`
  + backdrop()
  + "</defs>"

const drawn = new Map()

// The still scenery behind the board; the Client draws everything that moves over it.
export function drawBackdrop(aspect) {
  const key = aspect.toFixed(3)
  const cached = drawn.get(key)
  if (cached) return cached
  const { width, height, field, left, top } = fieldLayout(aspect)
  let body = `<clipPath id="field"><rect y="${n(-top)}" width="${n(field)}" height="${n(height)}"/></clipPath><g clip-path="url(#field)">`
  body += rect(0, -top - 1, field, top + 1.5, COLORS.skyTop)
  for (let x = 0; x < field; x += BACKDROP_W) body += `<use href="#backdrop" x="${x}"/>`
  body += rect(0, GROUND_Y - 1, field, height - top - GROUND_Y + 2, COLORS.dirtLow) + "</g>"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round(1000 * aspect)}" viewBox="${n(-left)} ${n(-top)} ${n(width)} ${n(height)}">${DEFS}${body}</svg>`
  if (drawn.size > 8) drawn.clear()
  drawn.set(key, svg)
  return svg
}
