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
// The ground stops the duck when its centre is this close, as the plane's belly meets the clouds.
const BIRD_R = 16
// The duck in its plane, drawn DUCK_SIZE across, collides through boxes around its centre (the middle of
// the fuselage): the fuselage, the duck sitting in it, the lower wing and the tail fin, each trimmed a
// little inside the drawing to forgive grazes.
const DUCK_SIZE = 62
const BIRD_BOXES = [[-21, -6, 21, 6], [-13.5, -25.5, 8.5, -4], [-9.5, 6, 6.5, 21.5], [-28, -13, -15.5, 1.5]]
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
