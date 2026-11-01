"use strict"

const { Plugin, Panel, Command, MenuItem, createKeyed, usePanel } = require("@opencode/plugin/gui")
const { createSignal, onCleanup, untrack } = require("solid-js")
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
    const opened = new Map()
    const replaced = new Set()

    const status = (session) => session.server.data.session.status(session.id)
    const running = (session) => status(session) === "running"

    const engineFor = (session) => {
      if (!engines.has(session.key)) engines.set(session.key, createEngine((name) => ctx.t(name)))
      return engines.get(session.key)
    }

    const updateStatus = (session, state) => {
      const engine = engines.get(session.key) ?? (replaced.has(session.key) ? undefined : engineFor(session))
      if (state === "running") {
        watched.add(session.key)
        finished.delete(session.key)
        engine?.setRunning(true)
      } else if (state === "idle" && watched.delete(session.key)) {
        finished.add(session.key)
        engine?.setRunning(false)
      }
      if (state === "idle") replaced.delete(session.key)
      engine?.wake()
      return engine
    }

    const cancel = (session) => {
      clearTimeout(timers.get(session.key))
      timers.delete(session.key)
    }

    const schedule = (session, delay, action) => {
      clearTimeout(timers.get(session.key))
      const timer = setTimeout(() => {
        if (timers.get(session.key) !== timer) return
        timers.delete(session.key)
        action(session)
      }, delay)
      timers.set(session.key, timer)
    }

    const select = (session) => {
      for (const [sessionKey, timer] of timers) {
        clearTimeout(timer)
        timers.delete(sessionKey)
      }
      const candidates = new Map(opened)
      for (const other of ctx.sessions.list()) candidates.set(other.key, other)
      for (const other of candidates.values()) {
        if (other.key === session.key || (ctx.layout.state(key, other) === "closed" && !opened.has(other.key))) continue
        replaced.add(other.key)
        finished.add(other.key)
        const engine = engines.get(other.key)
        engine?.setRunning(false)
        engines.delete(other.key)
        opened.delete(other.key)
        ctx.layout.close(key, other)
        engine?.dispose()
      }
      replaced.delete(session.key)
      opened.set(session.key, session)
    }

    const open = (session) => {
      if (ctx.sessions.current()?.key !== session.key || !running(session) || replaced.has(session.key)) return
      select(session)
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
      opened.clear()
      replaced.clear()
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
          if (entry.status === "running" && !replaced.has(session.key) && ctx.options?.autoOpen !== false) schedule(session, OPEN_DELAY, open)
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
        const [root, setRoot] = createSignal()
        const frame = usePanel()
        createKeyed(
          () => frame.placement() === "mobile" || ctx.layout.state(key, props.session) !== "closed" ? props.session : undefined,
          (session) => untrack(() => {
            select(session)
            const engine = updateStatus(session, status(session))
            const view = engine.mount(() => statusOf(session))
            setRoot(view.root)
            onCleanup(view.dispose)
          }),
          { equals: (previous, next) => previous.key === next.key, otherwise: () => setRoot(undefined) },
        )
        return root
      },
      enter: () => {
        const session = ctx.sessions.current()
        if (session) engines.get(session.key)?.focus()
      },
      close: (input) => {
        cancel(input.session)
        opened.delete(input.session.key)
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
        if (ctx.layout.state(key, session) !== "visible") select(session)
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
          select(session)
          ctx.layout.open(key, session, { tab: "select" })
        },
      }
    })
  },
})
