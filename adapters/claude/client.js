import { createGame, constants } from "./core.js"
import { translate } from "./i18n.js"
import { drawBoard } from "./pixels.js"

const FRAME_MS = 1000 / 30
const flapKeys = new Set([" ", "w", "W", "up", "return", "enter"])

function createRuntime(props, surface) {
  const runtime = { game: undefined, props, stop: undefined, lastState: "", focused: props.focused, board: undefined }
  const publish = () => {
    const game = runtime.game
    const data = { type: "state", phase: game.phase, animating: game.animating(), best: game.best }
    const signature = JSON.stringify(data)
    if (signature !== runtime.lastState) {
      runtime.lastState = signature
      surface.post(data)
    }
  }
  const redraw = () => surface.setState(runtime)
  const wake = () => {
    publish()
    redraw()
    if (!runtime.game.animating() || runtime.stop) return
    runtime.stop = surface.every(FRAME_MS, () => {
      for (let index = 0; index < 4; index++) runtime.game.step(constants.STEP)
      publish()
      redraw()
      if (!runtime.game.animating()) {
        runtime.stop?.()
        runtime.stop = undefined
      }
    })
  }
  runtime.game = createGame(() => {}, { best: props.best ?? 0 })
  runtime.press = () => {
    runtime.game.press()
    wake()
  }
  runtime.pause = () => {
    runtime.game.toggle()
    if (!runtime.game.animating()) {
      runtime.stop?.()
      runtime.stop = undefined
    }
    wake()
  }
  surface.onKey((event) => {
    if (event.ctrl || event.meta) return
    if (flapKeys.has(event.key)) runtime.press()
    else if (event.key.toLowerCase() === "p") runtime.pause()
  })
  surface.onPointer((event) => {
    if (event.type !== "down" || (event.button && event.button !== "left")) return
    const x = event.fine?.x ?? event.x
    const y = event.fine?.y ?? event.y
    const board = runtime.board
    if (board && x >= 0 && x < board.columns && y >= board.top && y < board.bottom) runtime.press()
  })
  runtime.wake = wake
  wake()
  return runtime
}

export default function FlappyClient(props, surface) {
  const runtime = surface.state ?? createRuntime(props, surface)
  runtime.props = props
  if (runtime.focused && !props.focused && runtime.game.phase === "playing") {
    runtime.game.pause()
    runtime.stop?.()
    runtime.stop = undefined
    runtime.wake()
  }
  runtime.focused = props.focused
  runtime.game.best = Math.max(runtime.game.best, props.best ?? 0)
  const t = translate(props.locale)
  const { Box, Text, Button } = surface.elements
  const game = runtime.game
  const columns = Math.max(1, Math.min(48, surface.columns || 40))
  const bodyRows = Math.max(0, Math.min(31, Math.floor(props.bodyRows ?? 29)))
  const rows = Math.max(0, bodyRows - 4)
  runtime.board = { columns, top: 1, bottom: 1 + rows }
  const status = props.status ? t(`status.${props.status}`) : t("title")
  const help = props.locale === "ru" ? "Клик / W — взмах · P — пауза" : "Click / W — flap · P — pause"
  const message = game.phase === "paused" ? t("paused") : game.phase === "over" ? t("over") : game.phase === "ready" ? t("start") : `${t("score")}: ${game.score}`
  const chrome = [
    Text({ wrap: "truncate", color: props.status === "running" ? "#ffd166" : "#7ee787", children: [status] }),
    Text({ wrap: "truncate", children: [`${message}  ·  ${t("best")}: ${game.best}`] }),
    Text({ wrap: "truncate", dimColor: true, children: [help] }),
    Box({ flexDirection: "row", columnGap: 1, children: [
      Button({ key: "flap", label: "W", plain: true, onPress: runtime.press }),
      Button({ key: "pause", label: "P", plain: true, onPress: runtime.pause }),
    ] }),
  ]
  return Box({ flexDirection: "column", children: bodyRows < 4
    ? chrome.slice(0, bodyRows)
    : [chrome[0], ...drawBoard(game, columns, rows, surface.elements), ...chrome.slice(1)] })
}
