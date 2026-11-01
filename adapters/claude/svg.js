import { CITY, CLOUDS } from "./art.js"
import { CITY_OFFSETS, fieldLayout } from "./field.js"
import { THEME } from "./theme.js"

const ART = THEME.artScale
const n = (value) => Math.round(value * 100) / 100

function outlinePath(layer) {
  let path = `M0 ${layer.height}`
  for (let index = 0; index < layer.points.length; index += 2) path += `L${layer.points[index]} ${layer.points[index + 1]}`
  return `${path}L${layer.width} ${layer.height}Z`
}

const DEFS = "<defs>"
  + `<radialGradient id="sky"><stop offset=".5" stop-color="${THEME.sky.inner}"/><stop offset="1" stop-color="${THEME.sky.outer}"/></radialGradient>`
  + CITY.map((layer, index) => `<path id="city${index}" fill="${layer.color}" d="${outlinePath(layer)}"/>`).join("")
  + CLOUDS.shapes.map((shape, index) => `<path id="cloud${index}" d="${shape.d}"/>`).join("")
  + `<g id="clouds" fill="${THEME.band.color}">`
  + CLOUDS.shapes.flatMap((shape, index) => [-CLOUDS.width, 0, CLOUDS.width].map((offset) => `<use href="#cloud${index}" x="${shape.x + offset}" y="${n(shape.y)}"/>`)).join("")
  + `<rect y="${CLOUDS.top}" width="${CLOUDS.width}" height="${CLOUDS.height - CLOUDS.top}"/></g>`
  + "</defs>"

const drawn = new Map()

// The still scenery behind the board (sky, city and cloud band), under a veil of black at `dim` while a
// result or the pause screen shows; the Client draws everything that moves over it.
export function drawBackdrop(aspect, dim = 0) {
  const key = `${aspect.toFixed(3)}:${dim}`
  const cached = drawn.get(key)
  if (cached) return cached
  const { width, height, field, left, top } = fieldLayout(aspect)
  let body = `<clipPath id="field"><rect y="${n(-top)}" width="${n(field)}" height="${n(height)}"/></clipPath><g clip-path="url(#field)">`
  body += `<rect y="${n(-top)}" width="${n(field)}" height="${n(height)}" fill="url(#sky)"/>`
  CITY.forEach((layer, index) => {
    const y = THEME.city.base - layer.height * ART
    for (let x = CITY_OFFSETS[index]; x < field; x += layer.width * ART) body += `<use href="#city${index}" transform="translate(${n(x)} ${n(y)}) scale(${ART})"/>`
  })
  for (let x = 0; x < field; x += CLOUDS.width * ART) body += `<use href="#clouds" transform="translate(${n(x)} ${THEME.band.y}) scale(${ART})"/>`
  const below = THEME.band.y + CLOUDS.height * ART
  body += `<rect y="${n(below - 0.5)}" width="${n(field)}" height="${n(height - top - below + 1)}" fill="${THEME.band.color}"/>`
  if (dim > 0) body += `<rect y="${n(-top)}" width="${n(field)}" height="${n(height)}" fill="#000" fill-opacity="${dim}"/>`
  body += "</g>"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round(1000 * aspect)}" viewBox="${n(-left)} ${n(-top)} ${n(width)} ${n(height)}">${DEFS}${body}</svg>`
  if (drawn.size > 8) drawn.clear()
  drawn.set(key, svg)
  return svg
}
