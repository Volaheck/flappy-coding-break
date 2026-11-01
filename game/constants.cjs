"use strict"

const STEP = 1 / 120
const MAX_FRAME = 1 / 15
const MAX_STEPS = 10
const WORLD_H = 512
const GROUND_Y = 400
const GROUND_H = WORLD_H - GROUND_Y
const MIN_W = 260
const MAX_W = 400
const TOP_SHARE = 0.62
const BIRD_X = 84
const BIRD_R = 11
// The duck in its plane, drawn DUCK_SIZE across, collides through two boxes around its centre: the
// plane's body and the duck sitting in it, as in Flappy Duck, trimmed a little to forgive grazes.
const DUCK_SIZE = 62
const BIRD_BOXES = [[-25.5, -8, 28, 10.5], [-9.5, -23.5, 8.5, 10.5]]
const READY_Y = 214
const CEILING = -20
const GRAVITY = 1500
const FLAP = 400
const MAX_FALL = 520
const SPEED = 125
const PIPE_W = 52
const CAP_W = PIPE_W
const CAP_H = 24
const CAP_OVER = (CAP_W - PIPE_W) / 2
const GAP = 118
const SPACING = 176
const PIPE_MARGIN = 56
const GAP_SHIFT = 150
const RESTART_DELAY = 0.7

module.exports = { STEP, MAX_FRAME, MAX_STEPS, WORLD_H, GROUND_Y, GROUND_H, MIN_W, MAX_W, TOP_SHARE, BIRD_X, BIRD_R, DUCK_SIZE, BIRD_BOXES, READY_Y, CEILING, GRAVITY, FLAP, MAX_FALL, SPEED, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP, SPACING, PIPE_MARGIN, GAP_SHIFT, RESTART_DELAY }
