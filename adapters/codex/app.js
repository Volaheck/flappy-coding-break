(() => {
  "use strict"

  const pending = new Map()
  let nextId = 0
  let sessionId
  let status = { state: "unknown" }
  let closed = false
  let pollTimer
  const ru = navigator.language.toLowerCase().startsWith("ru")
  const labels = ru
    ? { connecting: "Подключение…", unknown: "Игра готова · для статуса агента разрешите хуки Flappy", unlinked: "Игра готова · откройте Flappy в текущем чате для статуса агента", disconnected: "Нет связи со статусом агента", response: "Ответ готов", interrupted: "Агент остановлен", ended: "Сессия завершена" }
    : { connecting: "Connecting…", unknown: "Ready to play · trust Flappy hooks for agent status", unlinked: "Ready to play · open Flappy in this chat to link agent status", disconnected: "Agent status disconnected", response: "Response ready", interrupted: "Agent interrupted", ended: "Session ended" }
  const baseTranslate = Flappy.translate(navigator.language)
  const translate = (key) => key === "status.done"
    ? labels[status.state === "response-ended" ? "response" : status.state] ?? baseTranslate(key)
    : baseTranslate(key)
  const engine = Flappy.createEngine(translate)
  const view = engine.mount(() => status.state === "running" ? "running" : ["response-ended", "interrupted", "ended"].includes(status.state) ? "done" : null)
  document.getElementById("game").appendChild(view.root)
  const notice = document.getElementById("notice")
  notice.textContent = labels.connecting

  function notify(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*")
  }

  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error("Host did not respond"))
      }, 8000)
      pending.set(id, { resolve, reject, timer })
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*")
    })
  }

  function update(result) {
    if (result?.isError) throw new Error("Status unavailable")
    const data = result?.structuredContent
    if (!data?.status) return
    sessionId = data.sessionId || sessionId
    status = data.status
    if (status.state === "running") engine.setRunning(true)
    else if (["response-ended", "interrupted", "ended"].includes(status.state)) engine.setRunning(false)
    notice.textContent = labels[status.state] || ""
    engine.wake()
  }

  function resize(context) {
    const fullscreen = context?.displayMode === "fullscreen" || context?.displayMode === "pip"
    document.documentElement.style.setProperty("--game-height", fullscreen ? "100vh" : "min(680px, 100vh)")
    notify("ui/notifications/size-changed", { height: fullscreen ? window.innerHeight : 560 })
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return
    const message = event.data
    if (message.id !== undefined && ("result" in message || "error" in message)) {
      const item = pending.get(message.id)
      if (!item) return
      pending.delete(message.id)
      clearTimeout(item.timer)
      if (message.error) item.reject(new Error(message.error.message))
      else item.resolve(message.result)
    } else if (message.method === "ui/notifications/tool-result") {
      try { update(message.params) } catch { notice.textContent = labels.disconnected }
    } else if (message.method === "ui/notifications/host-context-changed") {
      resize(message.params)
    } else if (message.method === "ui/resource-teardown") {
      dispose()
      window.parent.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*")
    }
  })

  async function poll() {
    if (closed) return
    if (!document.hidden) {
      try {
        update(await request("tools/call", { name: "get_status", arguments: sessionId ? { session_id: sessionId } : {} }))
      } catch {
        status = { state: "unknown" }
        notice.textContent = labels.disconnected
        engine.wake()
      }
    }
    if (!closed) pollTimer = setTimeout(poll, 1000)
  }

  function dispose() {
    closed = true
    clearTimeout(pollTimer)
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error("App closed"))
    }
    pending.clear()
    engine.dispose()
  }

  window.addEventListener("pagehide", dispose, { once: true })
  request("ui/initialize", {
    appInfo: { name: "flappy-coding-break", version: "1.2.2" },
    appCapabilities: {},
    protocolVersion: "2026-01-26",
  }).then((result) => {
    notify("ui/notifications/initialized", {})
    resize(result?.hostContext)
    poll()
  }).catch(() => { notice.textContent = labels.disconnected })
})()
