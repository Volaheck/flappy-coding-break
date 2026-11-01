"use strict"

const { Plugin, Panel, Command, MenuItem, createKeyed } = require("@opencode/plugin/gui")
const { onCleanup, untrack } = require("solid-js")
const { createEngine } = require("../../game/canvas.cjs")
const { messages } = require("../../game/i18n.cjs")

const TAB = "main"
const OPEN_DELAY = 1000

module.exports = Plugin.define({
  i18n: messages,
  setup(ctx) {
    const key = `${ctx.id}:${TAB}`
    const watched = new Set()
    const finished = new Set()
    const timers = new Map()
    const engines = new Map()

    const status = (session) => session.server.data.session.status(session.id)
    const running = (session) => status(session) === "running"

    const engineFor = (session) => {
      if (!engines.has(session.key)) engines.set(session.key, createEngine((name) => ctx.t(name)))
      return engines.get(session.key)
    }

    const updateStatus = (session, state) => {
      const engine = engineFor(session)
      if (state === "running") {
        watched.add(session.key)
        finished.delete(session.key)
        engine.setRunning(true)
      } else if (state === "idle" && watched.delete(session.key)) {
        finished.add(session.key)
        engine.setRunning(false)
      }
      engine.wake()
      return engine
    }

    const cancel = (session) => {
      clearTimeout(timers.get(session.key))
      timers.delete(session.key)
    }

    const schedule = (session, delay, action) => {
      clearTimeout(timers.get(session.key))
      timers.set(
        session.key,
        setTimeout(() => {
          timers.delete(session.key)
          action(session)
        }, delay),
      )
    }

    const open = (session) => {
      if (ctx.sessions.current()?.key !== session.key || !running(session)) return
      const state = ctx.layout.state(key, session)
      if (state === "visible") return
      ctx.layout.open(key, session, { tab: "select", background: true })
    }

    const statusOf = (session) => {
      if (running(session)) return "running"
      return finished.has(session.key) ? "done" : undefined
    }

    onCleanup(() => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      engines.forEach((engine) => engine.dispose())
      engines.clear()
    })

    createKeyed(
      () => {
        const session = ctx.sessions.current()
        return session ? { session, status: status(session) } : undefined
      },
      (entry) =>
        untrack(() => {
          const session = entry.session
          updateStatus(session, entry.status)
          cancel(session)
          if (entry.status === "running" && ctx.options?.autoOpen !== false) schedule(session, OPEN_DELAY, open)
        }),
      { equals: (previous, next) => previous.session.key === next.session.key && previous.status === next.status },
    )

    const tab = {
      id: TAB,
      get title() {
        return ctx.t("title")
      },
      closable: "hover",
    }

    ctx.add(Panel, {
      id: TAB,
      region: "side",
      transient: true,
      mobile: {
        get title() {
          return ctx.t("title")
        },
        order: 90,
        kind: "menu",
        icon: "cube",
      },
      list: (input) => (input.open.includes(TAB) ? [tab] : []),
      render: (props) => {
        const engine = updateStatus(props.session, status(props.session))
        const view = engine.mount(() => statusOf(props.session))
        onCleanup(view.dispose)
        return view.root
      },
      enter: () => {
        const session = ctx.sessions.current()
        if (session) engines.get(session.key)?.focus()
      },
      close: (input) => {
        cancel(input.session)
      },
    })

    ctx.add(Command, () => ({
      id: "toggle",
      title: ctx.t("command.toggle"),
      keywords: "flappy bird game игра птица",
      slash: { name: "flappy" },
      enabled: !!ctx.sessions.current(),
      run: () => {
        const session = ctx.sessions.current()
        if (!session) return
        cancel(session)
        ctx.layout.toggle(key, session)
      },
    }))

    ctx.add(MenuItem, () => {
      const session = ctx.sessions.current()
      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("title"),
        icon: "cube",
        keybind: `${ctx.id}.toggle`,
        opened: !!session && ctx.layout.state(key, session) !== "closed",
        run: () => {
          if (!session) return
          cancel(session)
          ctx.layout.open(key, session, { tab: "select" })
        },
      }
    })
  },
})
