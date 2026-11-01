import { translate } from "./i18n.js"
import { boardAspect, desktopBoardRows } from "./field.js"
import { drawBackdrop } from "./svg.js"
import { THEME } from "./theme.js"

const PANE = "flappy-coding-break"
const SKILL = "flappy-coding-break:flappy"
const CLIENT = "flappy-game"
const BEST = "flappy.best"
const LAST_SCORE = "flappy.lastScore"
const OWNER = "flappy.pane.owner"
const OPEN_DELAY = 1000
const OWNER_CHECK_MS = 1000
const phases = new Set(["ready", "playing", "paused", "over", "finished"])

function report($, error) {
  $.ui.log(`Flappy Bird: ${String(error)}`, { to: "debug" })
}

async function supported($) {
  return (await $.session.surfaces()).some((surface) => surface === "terminal" || surface === "desktop")
}

function stopWatching(state) {
  state.ownerTimer?.cancel()
  state.ownerTimer = undefined
  state.ownerToken = undefined
}

async function saveResult($, state, score, best) {
  if (best > state.best) state.best = best
  const saved = await $.store.get(BEST)
  if (Number.isSafeInteger(saved) && saved >= 0) state.best = Math.max(state.best, saved)
  if (state.best > (Number.isSafeInteger(saved) ? saved : 0)) await $.store.set(BEST, state.best)
  if (Number.isSafeInteger(score) && score >= 0 && score !== state.lastScore) {
    state.lastScore = score
    await $.store.set(LAST_SCORE, score)
  }
}

async function checkOwner($, state, token) {
  if (state.ownerToken !== token || state.checkingToken === token) return
  state.checkingToken = token
  try {
    const owner = await $.store.get(OWNER)
    if (state.ownerToken !== token || typeof owner !== "string") return
    if (owner === token) {
      const best = await $.store.get(BEST)
      if (state.ownerToken !== token) return
      if (Number.isSafeInteger(best) && best > state.best) {
        state.best = best
        $.ui.invalidate("ui.render")
      }
      return
    }
    // The Client reports each score change, so a suspended surface need not redraw to close.
    const score = state.latestPhase === "ready" ? state.lastScore : state.latestScore
    await saveResult($, state, score, Math.max(state.best, score ?? 0))
    if (state.ownerToken !== token) return
    await $.ui.close({ id: PANE })
    if (state.ownerToken === token) stopWatching(state)
  } finally {
    if (state.checkingToken === token) state.checkingToken = undefined
  }
}

function watchOwner($, state, token) {
  stopWatching(state)
  state.ownerToken = token
  state.ownerTimer = $.clock.every(OWNER_CHECK_MS, () => {
    void checkOwner($, state, token).catch((error) => report($, error))
  })
}

async function openPane($, state, pane) {
  const generation = state.generation
  state.latestScore = undefined
  state.latestPhase = undefined
  await $.ui.open(pane)
  const panes = await $.ui.panes()
  if (state.generation !== generation || !panes.some((entry) => entry.id === PANE)) return
  stopWatching(state)
  const token = `${await $.session.id()}:${await $.clock.now()}:${Math.random().toString(36).slice(2)}`
  if (state.generation !== generation) return
  state.ownerToken = token
  await $.store.set(OWNER, token)
  if (state.ownerToken !== token) return
  watchOwner($, state, token)
}

export function register(on, options = {}) {
  const t = translate(options.locale)
  const state = {
    activeTurn: undefined,
    openTimer: undefined,
    generation: 0,
    best: 0,
    lastScore: undefined,
    latestScore: undefined,
    latestPhase: undefined,
    ownerTimer: undefined,
    ownerToken: undefined,
    checkingToken: undefined,
    columns: undefined,
    dim: 0,
  }
  let finished = false

  const cancelOpen = () => {
    state.openTimer?.cancel()
    state.openTimer = undefined
  }
  on("session.start", async ($, e, next) => {
    const saved = await $.store.get(BEST)
    if (Number.isSafeInteger(saved) && saved >= 0) state.best = saved
    const score = await $.store.get(LAST_SCORE)
    if (Number.isSafeInteger(score) && score >= 0) state.lastScore = score
    if ((await $.ui.panes()).some((pane) => pane.id === PANE)) {
      const owner = await $.store.get(OWNER)
      const session = await $.session.id()
      // A reload resumes the existing claim; it must not take ownership from a newer pane.
      const token = typeof owner === "string" && owner.startsWith(`${session}:`) ? owner : `${session}:restored`
      watchOwner($, state, token)
    }
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
          await openPane($, state, { id: PANE, title: t("title"), rows: 29, columns: 44 })
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
      await openPane($, state, { id: PANE, title: t("title"), focus: true, rows: 29, columns: 44 })
    }
    return {}
  })

  on("skill.prompt", async ($, e, next) => {
    if (e.skill !== SKILL && !(e.pluginName === PANE && e.skill === "flappy")) return next(e)
    if (!(await supported($))) return next(e)
    state.generation++
    cancelOpen()
    if (!(await $.ui.panes()).some((pane) => pane.id === PANE)) {
      await openPane($, state, { id: PANE, title: t("title"), focus: true, rows: 29, columns: 44 })
    }
    return { text: "The flappy-coding-break plugin has already opened the Flappy Bird pane beside this chat. Do not look for or call any tool for it. Reply with one short sentence in the user's language: the game is open in the side panel; click it or press W / Space to flap, P to pause." }
  })

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const elements = $.ui.resolve(e)
    if (e.surface !== "terminal" && e.surface !== "desktop") {
      return elements.Text({ children: ["Flappy Bird · Claude Code Terminal / Desktop"] })
    }
    const { Client, Box, Svg } = elements
    const bodyRows = Math.max(0, Math.min(31, e.props.scroll?.bodyRows ?? 29))
    const client = Client({
      key: CLIENT,
      module: "./client.js",
      width: "100%",
      height: bodyRows,
      props: {
        best: state.best,
        lastScore: state.lastScore ?? null,
        locale: options.locale ?? "en",
        status: state.activeTurn ? "running" : finished ? "done" : "idle",
        focused: e.props.isFocused,
        bodyRows,
        surface: e.surface,
      },
    })
    const rows = desktopBoardRows(bodyRows)
    if (e.surface !== "desktop" || rows === 0) return client
    // The width the Client last laid out, so the scenery and the moving board share one aspect.
    const columns = Math.max(1, state.columns ?? e.props.bodyColumns ?? e.viewport?.columns ?? 44)
    // The still scenery lies under the Client, which draws the text, the moving board and takes its clicks.
    return Box({ width: "100%", height: bodyRows, children: [
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: rows, overflow: "hidden", children: [
        Svg({ source: drawBackdrop(boardAspect(columns, rows), state.dim), alt: "Flappy Bird" }),
      ] }),
      Box({ position: "relative", width: "100%", height: bodyRows, children: [client] }),
    ] })
  })

  on("ui.message", async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== CLIENT || e.data?.type !== "state") return next(e)
    const data = e.data
    if (!phases.has(data.phase) || typeof data.animating !== "boolean" || !Number.isSafeInteger(data.best) || data.best < 0) return next(e)
    const dim = data.phase === "over" || data.phase === "finished" ? THEME.ui.veil.result : data.phase === "paused" ? THEME.ui.veil.paused : 0
    const columns = Number.isSafeInteger(data.columns) && data.columns > 0 && data.columns <= 1000 ? data.columns : state.columns
    if (columns !== state.columns || dim !== state.dim) {
      state.columns = columns
      state.dim = dim
      $.ui.invalidate("ui.render")
    }
    if (Number.isSafeInteger(data.score) && data.score >= 0) {
      state.latestScore = data.score
      state.latestPhase = data.phase
    }
    const final = data.phase === "over" || data.phase === "finished"
    if (data.best > state.best || (final && data.lastScore !== state.lastScore)) await saveResult($, state, final ? data.lastScore : undefined, data.best)
    return next(e)
  })

  on("ui.close", async ($, e, next) => {
    if (e.id !== PANE) return next(e)
    state.generation++
    cancelOpen()
    stopWatching(state)
    return next(e)
  })

  on("session.end", async ($, e, next) => {
    state.generation++
    state.activeTurn = undefined
    finished = false
    cancelOpen()
    stopWatching(state)
    await $.ui.close({ id: PANE })
    return next(e)
  })
}
