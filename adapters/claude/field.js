import { constants } from "./core.js"

export const COLORS = {
  skyTop: "#3fb3c3", skyMid: "#71cdd6", skyLow: "#a8e3e6",
  cloud: "#e8f8f4", cloudShade: "#d3efec", city: "#a7ddd6", cityEdge: "#8ccac2", window: "#c9eee8",
  bush: "#5fcf6e", bushDark: "#43b157",
  grass: "#73bf2e", grassLight: "#9ce35c", grassEdge: "#3b6a17", grassShade: "#558f22",
  dirt: "#ded895", dirtLow: "#d2c97f", dirtLine: "#c8bd70",
  pipeEdge: "#2f5314", pipeDark: "#4b861d", pipe: "#74bf2e", pipeLight: "#a5e866", pipeShine: "#d4f7ad",
  outline: "#3b2a20", body: "#f8c63f", belly: "#fbe28f", shade: "#e6a12a", wing: "#fff6dc", beak: "#f6662b", beakLow: "#df4a16",
}

// Desktop draws a cell about 2.2 times as tall as it is wide.
export const DESKTOP_CELL_ASPECT = 2.2

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
