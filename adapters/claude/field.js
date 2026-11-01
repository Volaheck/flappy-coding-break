import { constants } from "./core.js"

export const COLORS = {
  skyTop: "#3fb3c3", skyMid: "#71cdd6", skyLow: "#a8e3e6",
  cloud: "#e8f8f4", cloudShade: "#d3efec", city: "#a7ddd6", cityEdge: "#8ccac2", window: "#c9eee8",
  bush: "#5fcf6e", bushDark: "#43b157",
  grass: "#73bf2e", grassLight: "#9ce35c", grassEdge: "#3b6a17", grassShade: "#558f22",
  dirt: "#ded895", dirtLow: "#d2c97f", dirtLine: "#c8bd70",
  pipeEdge: "#2f5314", pipeDark: "#4b861d", pipe: "#74bf2e", pipeLight: "#a5e866", pipeShine: "#d4f7ad",
  outline: "#3b2a20", body: "#f8c63f", belly: "#fbe28f", shade: "#e6a12a", wing: "#fff6dc", beak: "#f6662b", beakLow: "#df4a16",
  board: "#ded895", boardEdge: "#543847", boardLabel: "#e07535", boardEmpty: "#cdc283", record: "#e5432f",
  plate: "#24464e", plateEdge: "#1a343a", running: "#ffd166", done: "#7ee787", over: "#fca148",
}

// Desktop draws a cell about 2.2 times as tall as it is wide.
export const DESKTOP_CELL_ASPECT = 2.2
export const BACKDROP_W = 288

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

export function gradientAt(stops, offset) {
  const at = Math.max(0, Math.min(1, offset))
  for (let index = 1; index < stops.length; index++) {
    const [to, color] = stops[index]
    if (at <= to) {
      const [from, previous] = stops[index - 1]
      return mixRgb(hexToRgb(previous), hexToRgb(color), to === from ? 1 : (at - from) / (to - from))
    }
  }
  return hexToRgb(stops[stops.length - 1][1])
}

export const SKY_STOPS = [[0, COLORS.skyTop], [0.6, COLORS.skyMid], [1, COLORS.skyLow]]

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// One tile of the Canvas version's still scenery, in paint order: the pane draws it as SVG, and the bird's
// smoothed edges are mixed with the same shapes.
export const BACKDROP = (() => {
  const { GROUND_Y } = constants
  const random = seeded(11)
  const shapes = []
  const wrapped = (shape) => {
    for (const offset of [-BACKDROP_W, 0, BACKDROP_W]) shapes.push({ ...shape, x: shape.x + offset })
  }
  const circle = (x, y, r, fill, opacity = 1) => wrapped({ kind: "circle", x, y, r, fill, opacity })
  const rect = (x, y, w, h, fill, opacity = 1) => wrapped({ kind: "rect", x, y, w, h, fill, opacity })
  for (const [x, y, size] of [[46, 74, 1], [178, 146, 0.75], [244, 38, 0.55]]) {
    circle(x, y, 13 * size, "#ffffff", 0.85)
    circle(x + 15 * size, y - 7 * size, 17 * size, "#ffffff", 0.85)
    circle(x + 32 * size, y - 2 * size, 13 * size, "#ffffff", 0.85)
    circle(x + 44 * size, y + 3 * size, 9 * size, "#ffffff", 0.85)
    rect(x, y, 44 * size, 12 * size, "#ffffff", 0.85)
  }
  const bump = BACKDROP_W / 13
  for (let index = 0; index < 13; index++) {
    const radius = 18 + random() * 12
    circle(index * bump, 322 - random() * 8, radius, COLORS.cloudShade)
  }
  shapes.push({ kind: "rect", x: 0, y: 322, w: BACKDROP_W, h: GROUND_Y - 322, fill: COLORS.cloudShade, opacity: 1 })
  for (let index = 0; index < 13; index++) {
    const radius = 14 + random() * 10
    circle((index + 0.5) * bump, 332 - random() * 6, radius, COLORS.cloud)
  }
  shapes.push({ kind: "rect", x: 0, y: 332, w: BACKDROP_W, h: GROUND_Y - 332, fill: COLORS.cloud, opacity: 1 })
  for (let left = 0; left < BACKDROP_W;) {
    const width = 16 + Math.floor(random() * 4) * 6
    const top = 362 - (34 + random() * 46)
    for (const offset of [-BACKDROP_W, 0, BACKDROP_W]) {
      const x = left + offset
      shapes.push({ kind: "rect", x, y: top, w: width, h: GROUND_Y - top, fill: COLORS.city, opacity: 1 })
      shapes.push({ kind: "windows", x: x + 4, y: top + 6, w: width - 9, h: 356 - top - 6, fill: COLORS.window, opacity: 1 })
      shapes.push({ kind: "rect", x, y: top, w: width, h: 2, fill: COLORS.cityEdge, opacity: 1 })
      shapes.push({ kind: "rect", x: x + width - 2, y: top, w: 2, h: GROUND_Y - top, fill: COLORS.cityEdge, opacity: 1 })
    }
    left += width - 2
  }
  const shrub = BACKDROP_W / 12
  for (let index = 0; index < 12; index++) circle(index * shrub + shrub / 2, 372, 15 + random() * 9, COLORS.bushDark)
  for (let index = 0; index < 12; index++) circle(index * shrub, 380, 13 + random() * 9, COLORS.bush)
  shapes.push({ kind: "rect", x: 0, y: 380, w: BACKDROP_W, h: GROUND_Y - 380, fill: COLORS.bush, opacity: 1 })
  return shapes.map((shape) => ({ ...shape, rgb: hexToRgb(shape.fill) }))
})()

const SKY_TOP = hexToRgb(COLORS.skyTop)
const DIRT_LOW = hexToRgb(COLORS.dirtLow)

function covers(shape, x, y) {
  if (shape.kind === "circle") return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.r ** 2
  if (x < shape.x || x > shape.x + shape.w || y < shape.y || y > shape.y + shape.h) return false
  return shape.kind === "rect" || (((x % 7) + 7) % 7 < 3 && ((y % 9) + 9) % 9 < 4)
}

// The scenery's color at a world point, as the pane's SVG paints it.
export function backdropAt(x, y) {
  if (y < 0) return SKY_TOP
  if (y >= constants.GROUND_Y - 1) return DIRT_LOW
  const local = ((x % BACKDROP_W) + BACKDROP_W) % BACKDROP_W
  let color = gradientAt(SKY_STOPS, y / constants.GROUND_Y)
  for (const shape of BACKDROP) {
    if (covers(shape, local, y)) color = shape.opacity === 1 ? shape.rgb : mixRgb(color, shape.rgb, shape.opacity)
  }
  return color
}
