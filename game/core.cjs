"use strict"

const constants = require("./constants.cjs")
const { STEP, MAX_FRAME, MAX_STEPS, WORLD_H, GROUND_Y, GROUND_H, MIN_W, MAX_W, TOP_SHARE, BIRD_X, BIRD_R, BIRD_W, BIRD_H, READY_Y, CEILING, GRAVITY, FLAP, MAX_FALL, SPEED, PIPE_W, CAP_W, CAP_H, CAP_OVER, GAP, SPACING, PIPE_MARGIN, GAP_SHIFT, RESTART_DELAY } = constants

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)

function hitRect(cx, cy, radius, x, y, width, height) {
  const dx = cx - clamp(cx, x, x + width)
  const dy = cy - clamp(cy, y, y + height)
  return dx * dx + dy * dy < radius * radius
}

function createGame(onEnd = () => {}, { best = 0, saveBest = () => {}, random = Math.random } = {}) {
  const bird = { y: READY_Y, prevY: READY_Y, vy: 0, angle: 0, prevAngle: 0, wing: 0 }
  const pipes = []
  const game = {
    phase: "ready",
    time: 0,
    scroll: 0,
    prevScroll: 0,
    nextPipe: 0,
    lastGap: GROUND_Y / 2,
    score: 0,
    best: Number.isFinite(best) && best > 0 ? Math.floor(best) : 0,
    record: false,
    deadAt: 0,
    grounded: false,
    flash: 0,
    bird,
    pipes,
    step,
    press,
    pause,
    toggle,
    animating,
  }

  function flap() {
    bird.vy = -FLAP
    bird.wing = 0
  }

  function reset() {
    pipes.length = 0
    game.phase = "ready"
    game.score = 0
    game.record = false
    game.grounded = false
    game.flash = 0
    game.lastGap = GROUND_Y / 2
    bird.vy = 0
    bird.angle = bird.prevAngle = 0
    bird.y = bird.prevY = READY_Y + Math.sin(game.time * 7) * 5
  }

  function die() {
    game.phase = "over"
    game.deadAt = game.time
    game.flash = 1
    if (bird.vy < 0) bird.vy = 0
    if (game.score > game.best) {
      game.best = game.score
      game.record = true
      saveBest(game.best)
    }
    onEnd()
  }

  function press() {
    if (game.phase === "ready") {
      game.phase = "playing"
      game.nextPipe = game.scroll + MAX_W + 24
      return flap()
    }
    if (game.phase === "playing") return flap()
    if (game.phase === "paused") {
      game.phase = "playing"
      return flap()
    }
    if (game.time - game.deadAt >= RESTART_DELAY) reset()
  }

  function pause() {
    if (game.phase !== "playing") return
    game.phase = "paused"
    onEnd()
  }

  function toggle() {
    if (game.phase === "paused") return press()
    pause()
  }

  function animating() {
    if (game.phase === "ready" || game.phase === "playing") return true
    if (game.phase === "over") return !game.grounded || game.flash > 0 || game.time - game.deadAt < RESTART_DELAY + 0.4
    return false
  }

  function spawn(x) {
    const lo = Math.max(PIPE_MARGIN + GAP / 2, game.lastGap - GAP_SHIFT)
    const hi = Math.min(GROUND_Y - PIPE_MARGIN - GAP / 2, game.lastGap + GAP_SHIFT)
    game.lastGap = lo + random() * (hi - lo)
    pipes.push({ x, gap: game.lastGap, scored: false })
  }

  function advancePipes() {
    let kept = 0
    for (let index = 0; index < pipes.length; index++) {
      if (pipes[index].x + CAP_W > game.scroll - 8) pipes[kept++] = pipes[index]
    }
    pipes.length = kept
    while (game.nextPipe < game.scroll + MAX_W + PIPE_W * 2) {
      spawn(game.nextPipe)
      game.nextPipe += SPACING
    }
    const birdX = game.scroll + BIRD_X
    for (let index = 0; index < pipes.length; index++) {
      const pipe = pipes[index]
      if (pipe.scored || pipe.x + PIPE_W / 2 > birdX) continue
      pipe.scored = true
      game.score++
    }
  }

  function collides() {
    const cx = game.scroll + BIRD_X
    const cy = bird.y
    const radius = BIRD_R - 1
    for (let index = 0; index < pipes.length; index++) {
      const pipe = pipes[index]
      if (cx + radius < pipe.x - CAP_OVER || cx - radius > pipe.x + PIPE_W + CAP_OVER) continue
      const top = pipe.gap - GAP / 2
      const bottom = pipe.gap + GAP / 2
      if (
        hitRect(cx, cy, radius, pipe.x, -WORLD_H, PIPE_W, top - CAP_H + WORLD_H) ||
        hitRect(cx, cy, radius, pipe.x - CAP_OVER, top - CAP_H, CAP_W, CAP_H) ||
        hitRect(cx, cy, radius, pipe.x - CAP_OVER, bottom, CAP_W, CAP_H) ||
        hitRect(cx, cy, radius, pipe.x, bottom + CAP_H, PIPE_W, WORLD_H)
      )
        return true
    }
    return false
  }

  function step(dt) {
    game.time += dt
    game.prevScroll = game.scroll
    bird.prevY = bird.y
    bird.prevAngle = bird.angle
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 4)

    if (game.phase === "ready") {
      game.scroll += SPEED * dt
      bird.wing += dt * 8
      bird.y = READY_Y + Math.sin(game.time * 7) * 5
      return
    }

    if (game.phase === "playing") {
      game.scroll += SPEED * dt
      bird.wing += dt * (bird.vy < 0 ? 16 : 9)
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL)
      bird.y += bird.vy * dt
      if (bird.y < CEILING) {
        bird.y = CEILING
        bird.vy = 0
      }
      const target = bird.vy < 80 ? -0.42 : Math.min(1.5, -0.42 + (bird.vy - 80) * 0.0068)
      bird.angle += (target - bird.angle) * Math.min(1, dt * (target < bird.angle ? 20 : 6))
      advancePipes()
      if (bird.y + BIRD_R >= GROUND_Y) {
        bird.y = GROUND_Y - BIRD_R
        bird.vy = 0
        game.grounded = true
        return die()
      }
      if (collides()) die()
      return
    }

    if (game.phase !== "over") return
    if (!game.grounded) {
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL * 1.25)
      bird.y += bird.vy * dt
      if (bird.y + BIRD_R >= GROUND_Y) {
        bird.y = GROUND_Y - BIRD_R
        bird.vy = 0
        game.grounded = true
      }
    }
    bird.angle = Math.min(Math.PI / 2, bird.angle + dt * 7)
  }

  return game
}

module.exports = { createGame, constants, clamp, hitRect }
