import { constants } from "./core.js"
import { CITY, CLOUDS } from "./art.js"
import { THEME } from "./theme.js"

const { GAP, PIPE_W } = constants
const ART = THEME.artScale

// Desktop draws a cell about 2.2 times as tall as it is wide.
export const DESKTOP_CELL_ASPECT = 2.2
// Where each city layer starts along x on Desktop, where the scenery stands still.
export const CITY_OFFSETS = [0, -90]

// Desktop gives the board every row of the pane but the controls line under it; a pane too short for a
// board shows the text lines alone, and 0 says so.
export function desktopBoardRows(bodyRows) {
  return bodyRows - 1 >= 8 ? bodyRows - 1 : 0
}

export function boardAspect(columns, rows) {
  return (rows * DESKTOP_CELL_ASPECT) / Math.max(1, columns)
}

// The view box of a board whose height is `aspect` times its width, fitted the way the Canvas version fits its element.
export function fieldLayout(aspect) {
  const scale = Math.min(aspect / constants.WORLD_H, 1 / constants.MIN_W)
  const width = 1 / scale
  const height = aspect / scale
  const field = Math.min(width, constants.MAX_W)
  return { width, height, field, left: (width - field) / 2, top: (height - constants.WORLD_H) * constants.TOP_SHARE }
}

export const hexToRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
export const rgbToHex = (rgb) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`
export const mixRgb = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount)

const SKY = [hexToRgb(THEME.sky.inner), hexToRgb(THEME.sky.outer)]
const BAND = hexToRgb(THEME.band.color)
const CRATE = hexToRgb(THEME.crate.face)
const CITY_RGB = CITY.map((layer) => hexToRgb(layer.color))

// The y of an outline (flat [x, y, ...] points along its top edge) at x, in the outline's own pixels.
export function outlineAt(points, x) {
  for (let index = 2; index < points.length; index += 2) {
    if (x <= points[index]) {
      const x0 = points[index - 2]
      const x1 = points[index]
      const y0 = points[index - 1]
      return x1 === x0 ? Math.min(y0, points[index + 1]) : y0 + ((points[index + 1] - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return points[points.length - 1]
}

export const wrap = (value, period) => ((value % period) + period) % period

// The colour of the still scenery and the crates at a world point, as Desktop paints them; the duck's
// smoothed edges are finished against it.
export function sceneAt(game, view, x, y) {
  for (const pipe of game.pipes) {
    const left = pipe.x - game.scroll
    if (x >= left && x < left + PIPE_W && (y < pipe.gap - GAP / 2 || (y > pipe.gap + GAP / 2 && y < constants.GROUND_Y))) return CRATE
  }
  if (y >= THEME.band.y + outlineAt(CLOUDS.points, wrap(x / ART, CLOUDS.width)) * ART) return BAND
  for (let index = CITY.length - 1; index >= 0; index--) {
    const layer = CITY[index]
    const local = wrap((x - CITY_OFFSETS[index]) / ART, layer.width)
    if (y >= THEME.city.base - (layer.height - outlineAt(layer.points, local)) * ART) return CITY_RGB[index]
  }
  const dx = (x - view.field / 2) / (view.field / 2)
  const dy = (y + view.top - view.height / 2) / (view.height / 2)
  const distance = Math.hypot(dx, dy)
  return distance <= 0.5 ? SKY[0] : mixRgb(SKY[0], SKY[1], Math.min(1, (distance - 0.5) / 0.5))
}
