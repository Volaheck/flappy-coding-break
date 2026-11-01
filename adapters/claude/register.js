import { translate } from "./i18n.js"

const PANE = "flappy-coding-break"
const CLIENT = "flappy-game"
const BEST = "flappy.best"
const OPEN_DELAY = 1000
const CLOSE_DELAY = 1500
const phases = new Set(["ready", "playing", "paused", "over"])

function report($, error) {
  $.ui.log(`Flappy Bird: ${String(error)}`, { to: "debug" })
}

async function supported($) {
  return (await $.session.surfaces()).some((surface) => surface === "terminal" || surface === "desktop")
}

function engaged(state) {
  return state.phase === "playing" || state.phase === "paused" || (state.phase === "over" && state.animating)
}

function scheduleClose($, state, options) {
  if (state.activeTurn || !state.autoOpened || options.autoClose === false) return
  state.pendingClose = true
  if (engaged(state) || state.closeTimer) return
  const scheduled = state.generation
  state.closeTimer = $.clock.after(CLOSE_DELAY, () => {
    state.closeTimer = undefined
    if (scheduled !== state.generation || state.activeTurn || !state.autoOpened || engaged(state)) return
    state.pendingClose = false
    void $.ui.close({ id: PANE }).catch((error) => report($, error))
  })
}

export function register(on, options = {}) {
  const t = translate(options.locale)
  const state = {
    activeTurn: undefined,
    autoOpened: false,
    pendingClose: false,
    phase: "ready",
    animating: false,
    openTimer: undefined,
    closeTimer: undefined,
    generation: 0,
  }
  let best = 0
  let finished = false

  const cancelOpen = () => {
    state.openTimer?.cancel()
    state.openTimer = undefined
  }
  const cancelClose = () => {
    state.closeTimer?.cancel()
    state.closeTimer = undefined
    state.pendingClose = false
  }

  on("session.start", async ($, e, next) => {
    const saved = await $.store.get(BEST)
    if (Number.isSafeInteger(saved) && saved >= 0) best = saved
    await $.command.register({ name: "flappy", description: t("command.toggle"), immediate: true })
    return next(e)
  })

  on("turn.start", async ($, e, next) => {
    if (e.agentId) return next(e)
    state.generation++
    state.activeTurn = e.turnId
    finished = false
    cancelOpen()
    cancelClose()
    $.ui.invalidate("ui.render")
    if (options.autoOpen !== false) {
      const scheduled = state.generation
      state.openTimer = $.clock.after(OPEN_DELAY, () => {
        state.openTimer = undefined
        void (async () => {
          if (scheduled !== state.generation || state.activeTurn !== e.turnId || !(await supported($))) return
          const panes = await $.ui.panes()
          if (scheduled !== state.generation || state.activeTurn !== e.turnId || panes.some((pane) => pane.id === PANE)) return
          state.autoOpened = true
          try {
            await $.ui.open({ id: PANE, title: t("title"), rows: 29, columns: 44 })
          } catch (error) {
            state.autoOpened = false
            throw error
          }
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
    scheduleClose($, state, options)
    return next(e)
  })

  on("command.run", { command: "flappy" }, async ($) => {
    state.generation++
    cancelOpen()
    cancelClose()
    state.autoOpened = false
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
    state.phase = data.phase
    state.animating = data.animating
    if (data.best > best) {
      best = data.best
      await $.store.set(BEST, best)
    }
    if (state.pendingClose && !engaged(state)) scheduleClose($, state, options)
    return next(e)
  })

  on("ui.close", async ($, e, next) => {
    if (e.id !== PANE) return next(e)
    state.generation++
    cancelOpen()
    cancelClose()
    state.autoOpened = false
    state.phase = "ready"
    state.animating = false
    return next(e)
  })

  on("session.end", async ($, e, next) => {
    state.generation++
    state.activeTurn = undefined
    finished = false
    cancelOpen()
    cancelClose()
    state.autoOpened = false
    await $.ui.close({ id: PANE })
    return next(e)
  })
}
