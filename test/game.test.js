import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createGame, constants: { STEP, GROUND_Y, BIRD_R } } = require("../game/core.cjs")

test("a round starts, pauses without advancing the bird, and resumes", () => {
  const game = createGame()
  assert.equal(game.phase, "ready")
  game.press()
  assert.equal(game.phase, "playing")
  for (let i = 0; i < 20; i++) game.step(STEP)
  game.pause()
  const { y } = game.bird
  const { scroll } = game
  for (let i = 0; i < 120; i++) game.step(STEP)
  assert.equal(game.bird.y, y)
  assert.equal(game.scroll, scroll)
  assert.equal(game.animating(), false)
  game.press()
  assert.equal(game.phase, "playing")
  assert.ok(game.bird.vy < 0)
})

test("ground collision ends a round once and persists only a new record", () => {
  const records = []
  let ended = 0
  const game = createGame(() => ended++, { best: 2, saveBest: value => records.push(value) })
  game.press()
  game.score = 3
  game.bird.y = GROUND_Y - BIRD_R
  game.bird.vy = 100
  game.step(STEP)
  assert.equal(game.phase, "over")
  assert.equal(ended, 1)
  assert.equal(game.best, 3)
  assert.deepEqual(records, [3])
  game.press()
  assert.equal(game.phase, "over", "accidental click cannot immediately restart")
  for (let i = 0; i < 180; i++) game.step(STEP)
  assert.equal(ended, 1)
  game.press()
  assert.equal(game.phase, "ready")
  assert.equal(game.score, 0)
  assert.equal(game.best, 3)
})

test("pipes score once and colliding with their body ends play", () => {
  const game = createGame(() => {}, { random: () => 0.5 })
  game.press()
  game.nextPipe = Infinity
  game.pipes.push({ x: 50, gap: 210, scored: false })
  game.bird.y = 210
  game.bird.vy = 0
  game.step(STEP)
  assert.equal(game.score, 1)
  game.step(STEP)
  assert.equal(game.score, 1)
  assert.equal(game.phase, "playing")
  game.bird.y = 80
  game.step(STEP)
  assert.equal(game.phase, "over")
})
