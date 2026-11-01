import { translate } from "./i18n.js"

const PANE = "flappy-coding-break"
const CLIENT = "flappy-game"
const BEST = "flappy.best"
const LAST_SCORE = "flappy.lastScore"
const OPEN_DELAY = 1000
const phases = new Set(["ready", "playing", "paused", "over", "finished"])

function report($, error) {
  $.ui.log(`Flappy Bird: ${String(error)}`, { to: "debug" })
}

async function supported($) {
  return (await $.session.surfaces()).some((surface) => surface === "terminal" || surface === "desktop")
}

export function register(on, options = {}) {
  const t = translate(options.locale)
  const state = {
    activeTurn: undefined,
    openTimer: undefined,
    generation: 0,
  }
  let best = 0
  let lastScore
  let finished = false

  const cancelOpen = () => {
    state.openTimer?.cancel()
    state.openTimer = undefined
  }
  on("session.start", async ($, e, next) => {
    const saved = await $.store.get(BEST)
    if (Number.isSafeInteger(saved) && saved >= 0) best = saved
    const score = await $.store.get(LAST_SCORE)
    if (Number.isSafeInteger(score) && score >= 0) lastScore = score
    await $.command.register({ name: "flappy", description: t("command.toggle"), immediate: true })
    return next(e)
  })

  on("turn.start", async ($, e, next) => {
    if (e.agentId) return next(e)
    state.generation++
    state.activeTurn = e.turnId
    finished = false
    cancelOpen()
    $.ui.invalidate("ui.render")
    if (options.autoOpen !== false) {
      const scheduled = state.generation
      state.openTimer = $.clock.after(OPEN_DELAY, () => {
        state.openTimer = undefined
        void (async () => {
          if (scheduled !== state.generation || state.activeTurn !== e.turnId || !(await supported($))) return
          const panes = await $.ui.panes()
          if (scheduled !== state.generation || state.activeTurn !== e.turnId || panes.some((pane) => pane.id === PANE)) return
          await $.ui.open({ id: PANE, title: t("title"), rows: 29, columns: 44 })
        })().catch((error) => report($, error))
      })
    }
    return next(e)
  })

  on("turn.complete", async ($, e, next) => {
    if (e.agentId || e.turnId !== state.activeTurn) return next(e)
    state.activeTurn = undefined
    finished = true
    state.generation++
    cancelOpen()
    $.ui.invalidate("ui.render")
    return next(e)
  })

  on("command.run", { command: "flappy" }, async ($) => {
    state.generation++
    cancelOpen()
    if (!(await supported($))) {
      return { text: options.locale === "ru" ? "Flappy Bird работает в терминале Claude Code и вкладке Code приложения Claude Desktop." : "Flappy Bird supports the Claude Code terminal and the Code tab of Claude Desktop." }
    }
    if ((await $.ui.panes()).some((pane) => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
    } else {
      await $.ui.open({ id: PANE, title: t("title"), focus: true, rows: 29, columns: 44 })
    }
    return {}
  })

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const elements = $.ui.resolve(e)
    if (e.surface !== "terminal" && e.surface !== "desktop") {
      return elements.Text({ children: ["Flappy Bird · Claude Code Terminal / Desktop"] })
    }
    const { Client } = elements
    const bodyRows = Math.max(0, Math.min(31, e.props.scroll?.bodyRows ?? 29))
    return Client({
      key: CLIENT,
      module: "./client.js",
      width: "100%",
      height: bodyRows,
      props: {
        best,
        lastScore: lastScore ?? null,
        locale: options.locale ?? "en",
        status: state.activeTurn ? "running" : finished ? "done" : "",
        focused: e.props.isFocused,
        bodyRows,
      },
    })
  })

  on("ui.message", async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== CLIENT || e.data?.type !== "state") return next(e)
    const data = e.data
    if (!phases.has(data.phase) || typeof data.animating !== "boolean" || !Number.isSafeInteger(data.best) || data.best < 0) return next(e)
    if (data.best > best) {
      best = data.best
      await $.store.set(BEST, best)
    }
    if ((data.phase === "over" || data.phase === "finished") && Number.isSafeInteger(data.lastScore) && data.lastScore >= 0 && data.lastScore !== lastScore) {
      lastScore = data.lastScore
      await $.store.set(LAST_SCORE, lastScore)
    }
    return next(e)
  })

  on("ui.close", async ($, e, next) => {
    if (e.id !== PANE) return next(e)
    state.generation++
    cancelOpen()
    return next(e)
  })

  on("session.end", async ($, e, next) => {
    state.generation++
    state.activeTurn = undefined
    finished = false
    cancelOpen()
    await $.ui.close({ id: PANE })
    return next(e)
  })
}
