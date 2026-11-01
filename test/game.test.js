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

for (const paused of [false, true]) {
  test(`agent completion saves an unfinished ${paused ? "paused" : "playing"} round and locks input`, () => {
    const scores = []
    const records = []
    let ended = 0
    const game = createGame(() => ended++, {
      best: 4,
      saveBest: value => records.push(value),
      saveScore: value => scores.push(value),
    })
    game.press()
    game.score = 7
    game.step(STEP)
    if (paused) game.pause()
    const before = ended
    const { y, angle } = game.bird
    const { scroll, time } = game

    game.setRunning(false)
    assert.equal(game.phase, "finished")
    assert.equal(game.locked, true)
    assert.equal(game.score, 7)
    assert.equal(game.lastScore, 7)
    assert.equal(game.best, 7)
    assert.equal(game.record, true)
    assert.deepEqual(scores, [7])
    assert.deepEqual(records, [7])
    assert.equal(ended, before + 1)
    assert.equal(game.animating(), false)

    for (let i = 0; i < 240; i++) {
      game.press()
      game.toggle()
      game.step(STEP)
      game.setRunning(false)
    }
    assert.equal(game.phase, "finished")
    assert.equal(game.score, 7)
    assert.equal(game.bird.y, y)
    assert.equal(game.bird.angle, angle)
    assert.equal(game.scroll, scroll)
    assert.equal(game.time, time)
    assert.equal(ended, before + 1)
    assert.deepEqual(scores, [7])

    game.setRunning(true)
    assert.equal(game.phase, "finished", "a new agent response must not start a round on its own")
    assert.equal(game.score, 7)
    assert.equal(game.locked, false)
    game.press()
    assert.equal(game.phase, "playing")
    assert.equal(game.score, 0)
    assert.equal(game.lastScore, 7)
    assert.equal(game.best, 7)
    game.setRunning(true)
    assert.equal(game.phase, "playing", "repeated running status must preserve live play")
  })
}

test("completion keeps a higher record and persists a later zero-score round", () => {
  const scores = []
  const records = []
  const game = createGame(() => {}, { best: 12, lastScore: 6, saveScore: value => scores.push(value), saveBest: value => records.push(value) })
  game.press()
  game.score = 3
  game.setRunning(false)
  assert.equal(game.score, 3)
  assert.equal(game.best, 12)
  assert.equal(game.record, false)
  game.setRunning(true)
  game.press()
  game.setRunning(false)
  assert.equal(game.score, 0)
  assert.equal(game.lastScore, 0)
  assert.equal(game.best, 12)
  assert.deepEqual(scores, [3, 0])
  assert.deepEqual(records, [])
})

test("completed results survive recreation and agent completion on the ready screen", () => {
  let lastScore = 0
  let best = 0
  const game = createGame(() => {}, { saveScore: value => { lastScore = value }, saveBest: value => { best = value } })
  game.press()
  game.score = 5
  game.bird.y = GROUND_Y - BIRD_R
  game.bird.vy = 100
  game.step(STEP)
  assert.equal(game.lastScore, 5, "a collision also saves the completed result")
  for (let i = 0; i < 180; i++) game.step(STEP)
  game.press()
  assert.equal(game.phase, "ready")
  game.setRunning(false)
  assert.equal(game.score, 5, "the ready screen must not erase the preceding result")
  const reopened = createGame(() => {}, { best, lastScore })
  reopened.setRunning(false)
  assert.equal(reopened.phase, "finished")
  assert.equal(reopened.score, 5)
  assert.equal(reopened.best, 5)
  assert.equal(reopened.locked, true)
})
