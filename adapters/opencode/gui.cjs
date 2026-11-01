"use strict"

const { Plugin, Panel, Command, MenuItem, createKeyed } = require("@opencode/plugin/gui")
const { onCleanup, untrack } = require("solid-js")
const { createEngine } = require("../../game/canvas.cjs")
const { messages } = require("../../game/i18n.cjs")

const TAB = "main"
const OPEN_DELAY = 1000
const CLOSE_DELAY = 1500
const CLOSE_RETRY = 2000

module.exports = Plugin.define({
  i18n: messages,
  setup(ctx) {
    const key = `${ctx.id}:${TAB}`
    const autoOpened = new Set()
    const watched = new Set()
    const finished = new Set()
    const timers = new Map()
    const engine = createEngine((name) => ctx.t(name))

    const running = (session) => session.server.data.session.status(session.id) === "running"

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
      if (state === "closed") autoOpened.add(session.key)
      ctx.layout.open(key, session, { tab: "select", background: true })
    }

    const close = (session) => {
      if (!autoOpened.has(session.key)) return
      if (engine.engaged()) return schedule(session, CLOSE_RETRY, close)
      autoOpened.delete(session.key)
      if (ctx.layout.state(key, session) !== "closed") ctx.layout.close(key, session)
    }

    const statusOf = (session) => {
      if (running(session)) return "running"
      return finished.has(session.key) ? "done" : undefined
    }

    onCleanup(() => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      engine.dispose()
    })

    createKeyed(
      () => {
        const session = ctx.sessions.current()
        return session ? { session, running: running(session) } : undefined
      },
      (entry) =>
        untrack(() => {
          const session = entry.session
          engine.wake()
          if (entry.running) {
            watched.add(session.key)
            finished.delete(session.key)
            cancel(session)
            if (ctx.options?.autoOpen !== false) schedule(session, OPEN_DELAY, open)
            return
          }
          if (watched.delete(session.key)) finished.add(session.key)
          if (autoOpened.has(session.key) && ctx.options?.autoClose !== false) schedule(session, CLOSE_DELAY, close)
          else cancel(session)
        }),
      { equals: (previous, next) => previous.session.key === next.session.key && previous.running === next.running },
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
        const view = engine.mount(() => statusOf(props.session))
        onCleanup(view.dispose)
        return view.root
      },
      enter: () => engine.focus(),
      close: (input) => {
        autoOpened.delete(input.session.key)
        finished.delete(input.session.key)
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
        autoOpened.delete(session.key)
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
          autoOpened.delete(session.key)
          ctx.layout.open(key, session, { tab: "select" })
        },
      }
    })
  },
})
