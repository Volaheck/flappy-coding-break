import { constants } from "./core.js"
import { BACKDROP, BACKDROP_W, COLORS, fieldLayout } from "./field.js"

const { GROUND_Y } = constants

const n = (value) => Math.round(value * 10) / 10

function shapeMarkup(shape) {
  if (shape.kind === "circle") return `<circle cx="${n(shape.x)}" cy="${n(shape.y)}" r="${n(shape.r)}"/>`
  return `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}"/>`
}

function backdrop() {
  let markup = `<g id="backdrop"><rect width="${BACKDROP_W + 1}" height="${GROUND_Y}" fill="url(#sky)"/>`
  let group
  for (const shape of BACKDROP) {
    const fill = shape.kind === "windows" ? "url(#windows)" : shape.fill
    const key = `${fill}|${shape.opacity}`
    if (group?.key !== key) {
      if (group) markup += "</g>"
      group = { key }
      markup += `<g fill="${fill}"${shape.opacity === 1 ? "" : ` fill-opacity="${shape.opacity}"`}>`
    }
    markup += shapeMarkup(shape)
  }
  return `${markup}</g></g>`
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
  body += `<rect y="${n(-top - 1)}" width="${n(field)}" height="${n(top + 1.5)}" fill="${COLORS.skyTop}"/>`
  for (let x = 0; x < field; x += BACKDROP_W) body += `<use href="#backdrop" x="${x}"/>`
  body += `<rect y="${GROUND_Y - 1}" width="${n(field)}" height="${n(height - top - GROUND_Y + 2)}" fill="${COLORS.dirtLow}"/></g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round(1000 * aspect)}" viewBox="${n(-left)} ${n(-top)} ${n(width)} ${n(height)}">${DEFS}${body}</svg>`
  if (drawn.size > 8) drawn.clear()
  drawn.set(key, svg)
  return svg
}
