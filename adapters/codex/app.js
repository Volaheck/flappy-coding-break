(() => {
  "use strict"

  const pending = new Map()
  let nextId = 0
  let sessionId
  let panelId
  let status = { state: "unknown" }
  let closed = false
  let pollTimer
  let closing = false
  const ru = navigator.language.toLowerCase().startsWith("ru")
  const labels = ru
    ? { connecting: "Подключение…", unknown: "Игра готова · для статуса агента разрешите хуки Flappy", unlinked: "Игра готова · откройте Flappy в текущем чате для статуса агента", disconnected: "Нет связи со статусом агента", response: "Ответ готов", interrupted: "Агент остановлен", ended: "Сессия завершена", replaced: "Игра открыта в новой панели", closeFailed: "Игра открыта в новой панели · эту панель не удалось закрыть автоматически" }
    : { connecting: "Connecting…", unknown: "Ready to play · trust Flappy hooks for agent status", unlinked: "Ready to play · open Flappy in this chat to link agent status", disconnected: "Agent status disconnected", response: "Response ready", interrupted: "Agent interrupted", ended: "Session ended", replaced: "Game opened in a new panel", closeFailed: "Game opened in a new panel · this panel could not close automatically" }
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
    if (closed || closing) return
    if (result?.isError) throw new Error("Status unavailable")
    const data = result?.structuredContent
    if (panelId && data?.panel?.id === panelId && data.panel.active === false) {
      void closeReplacedPanel()
      return
    }
    if (!data?.status) return
    sessionId = data.sessionId || sessionId
    status = data.status
    if (status.state === "running") engine.setRunning(true)
    else if (["response-ended", "interrupted", "ended"].includes(status.state)) engine.setRunning(false)
    notice.textContent = labels[status.state] || ""
    engine.wake()
  }

  async function closeReplacedPanel() {
    closing = true
    engine.setRunning(false)
    notice.textContent = labels.replaced
    try {
      await window.openai.requestClose()
    } catch {
      notice.textContent = labels.closeFailed
    } finally {
      dispose()
    }
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
    if (closed || closing) return
    try {
      update(await request("tools/call", { name: "get_status", arguments: { ...(sessionId ? { session_id: sessionId } : {}), panel_id: panelId } }))
    } catch {
      if (!closed && !closing) {
        status = { state: "unknown" }
        notice.textContent = labels.disconnected
        engine.wake()
      }
    }
    if (!closed && !closing) pollTimer = setTimeout(poll, 1000)
  }

  function dispose() {
    if (closed) return
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
    appInfo: { name: "flappy-coding-break", version: "1.3.3" },
    appCapabilities: { availableDisplayModes: ["fullscreen"] },
    protocolVersion: "2026-01-26",
  }).then(async (result) => {
    notify("ui/notifications/initialized", {})
    resize(result?.hostContext)
    const registration = await request("tools/call", { name: "claim_panel", arguments: sessionId ? { session_id: sessionId } : {} })
    panelId = registration?.structuredContent?.panel?.id
    if (!panelId) throw new Error("Panel registration failed")
    update(registration)
    if (!closed && !closing) pollTimer = setTimeout(poll, 1000)
  }).catch(() => { if (!closed) notice.textContent = labels.disconnected })
})()
