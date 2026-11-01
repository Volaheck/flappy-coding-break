import { COLORS, hexToRgb, rgbToHex } from "./field.js"

// The bird as the Canvas version paints it, rasterised with smoothed edges at about one screen pixel per
// sprite pixel; edge pixels are finished against whatever lies behind the bird in each frame.
export const PIXEL = 1
const HALF = 23
const SIZE = (2 * HALF) / PIXEL
const REACH = 21.5
const SAMPLES = 4
const STROKE = 0.85
const ANGLE_STEP = 0.06
const WING_FRAMES = [0, 1, 2, 1]
const WINGS = [[-3.6, -0.35], [0, 0], [3.4, 0.3]]

const PALETTE = [COLORS.body, COLORS.belly, COLORS.shade, COLORS.outline, "#ffffff", "#1b1b1b", COLORS.beak, COLORS.beakLow, COLORS.wing].map(hexToRgb)
const [BODY, BELLY, SHADE, OUTLINE, EYE, PUPIL, BEAK, BEAK_LOW, WING] = PALETTE.map((_, index) => index)
const EMPTY = -1

function ellipseDistance(x, y, cx, cy, rx, ry) {
  const u = (x - cx) / rx
  const v = (y - cy) / ry
  const k = Math.hypot(u, v)
  if (k < 1e-9) return -Math.min(rx, ry)
  return ((k - 1) * k) / Math.hypot(u / rx, v / ry)
}

function roundRectDistance(x, y, left, top, width, height, radius) {
  const qx = Math.abs(x - left - width / 2) - (width / 2 - radius)
  const qy = Math.abs(y - top - height / 2) - (height / 2 - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

// The paint of the Canvas paintBird at one point of the unrotated bird, in its order of operations.
function paintAt(x, y, wing) {
  const [wingY, wingAngle] = WINGS[wing]
  const body = ellipseDistance(x, y, 0, 0, 15, 11.5)
  let color = EMPTY
  if (body <= 0) {
    color = BODY
    if (ellipseDistance(x, y, 4, 7, 13, 7) <= 0) color = BELLY
    if (ellipseDistance(x, y, -8, 9, 10, 5) <= 0) color = SHADE
  }
  if (Math.abs(body) <= STROKE) color = OUTLINE
  const eye = Math.hypot(x - 6.5, y + 4.5) - 5.4
  if (eye <= 0) color = EYE
  if (Math.abs(eye) <= STROKE) color = OUTLINE
  if (Math.hypot(x - 8.4, y + 4.2) <= 2.2) color = PUPIL
  const beak = roundRectDistance(x, y, 6, -0.6, 13.5, 4.4, 2)
  if (beak <= 0) color = BEAK
  if (Math.abs(beak) <= STROKE) color = OUTLINE
  const beakLow = roundRectDistance(x, y, 6, 3.4, 11.5, 4, 2)
  if (beakLow <= 0) color = BEAK_LOW
  if (Math.abs(beakLow) <= STROKE) color = OUTLINE
  const dx = x + 6.5
  const dy = y - 1.5 - wingY
  const cos = Math.cos(wingAngle)
  const sin = Math.sin(wingAngle)
  const feather = ellipseDistance(dx * cos + dy * sin, -dx * sin + dy * cos, 0, 0, 7.6, 4.8)
  if (feather <= 0) color = WING
  if (Math.abs(feather) <= STROKE) color = OUTLINE
  return color
}

function rasterise(angle, wing) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const at = (x, y) => paintAt(x * cos + y * sin, -x * sin + y * cos, wing)
  const rows = []
  for (let row = 0; row < SIZE; row++) {
    const cells = []
    const y0 = -HALF + row * PIXEL
    for (let column = 0; column < SIZE; column++) {
      const x0 = -HALF + column * PIXEL
      if (Math.hypot(x0 + PIXEL / 2, y0 + PIXEL / 2) > REACH + PIXEL) {
        cells.push(null)
        continue
      }
      const probe = at(x0 + PIXEL / 2, y0 + PIXEL / 2)
      if ([[0, 0], [PIXEL, 0], [0, PIXEL], [PIXEL, PIXEL]].every(([dx, dy]) => at(x0 + dx, y0 + dy) === probe)) {
        cells.push(probe === EMPTY ? null : { rgb: PALETTE[probe], coverage: 1 })
        continue
      }
      const sum = [0, 0, 0]
      let covered = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const paint = at(x0 + ((sx + 0.5) / SAMPLES) * PIXEL, y0 + ((sy + 0.5) / SAMPLES) * PIXEL)
          if (paint === EMPTY) continue
          covered++
          for (let channel = 0; channel < 3; channel++) sum[channel] += PALETTE[paint][channel]
        }
      }
      cells.push(covered === 0 ? null : { rgb: sum.map((value) => value / covered), coverage: covered / (SAMPLES * SAMPLES) })
    }
    rows.push(cells)
  }
  let top = rows.findIndex((cells) => cells.some(Boolean))
  let bottom = rows.findLastIndex((cells) => cells.some(Boolean))
  let left = SIZE
  let right = -1
  for (const cells of rows) {
    const first = cells.findIndex(Boolean)
    if (first < 0) continue
    left = Math.min(left, first)
    right = Math.max(right, cells.findLastIndex(Boolean))
  }
  if (top < 0) top = bottom = left = right = 0
  return {
    x: -HALF + left * PIXEL,
    y: -HALF + top * PIXEL,
    columns: right - left + 1,
    rows: rows.slice(top, bottom + 1).map((cells) => cells.slice(left, right + 1).map((cell) => cell && (cell.coverage === 1 ? { hex: rgbToHex(cell.rgb) } : cell))),
  }
}

const sprites = new Map()
const angleIndex = (angle) => Math.round(Math.max(-0.6, Math.min(Math.PI / 2, angle)) / ANGLE_STEP)

function sprite(index, wing) {
  const key = `${index}:${wing}`
  let found = sprites.get(key)
  if (!found) {
    found = rasterise(index * ANGLE_STEP, wing)
    sprites.set(key, found)
  }
  return found
}

const pending = []
for (let index = angleIndex(-0.42); index <= angleIndex(Math.PI / 2); index++) for (const wing of [0, 1, 2]) pending.push([index, wing])

// Rasterises a few of the poses a flight will need, so the first seconds of play do not pay for them.
export function warmBird(budget = 3) {
  for (let done = 0; done < budget && pending.length > 0;) {
    const [index, wing] = pending.shift()
    if (!sprites.has(`${index}:${wing}`)) {
      sprite(index, wing)
      done++
    }
  }
}

export function birdPose(game) {
  const wing = game.phase === "over" ? 1 : WING_FRAMES[Math.floor(game.bird.wing) % WING_FRAMES.length]
  return sprite(angleIndex(game.bird.angle), wing)
}
