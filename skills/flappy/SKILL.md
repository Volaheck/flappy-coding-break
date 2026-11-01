---
name: flappy
description: Open the installed Flappy Coding Break game inside Codex when the user asks to play Flappy Bird or invokes $flappy.
---

Use the `open_flappy` tool from the `flappy-coding-break` MCP server. It returns an embedded game and provides a Flappy Bird entrypoint in the current chat's side panel. Call it once, then continue any other requested work. Leave `auto_opened` false for a user-requested game; this flag records how the game was opened.

The game requires Codex desktop with MCP Apps UI. The CLI has no game surface. If the host cannot render it, explain that limitation; never open an external browser or window.

The host usually provides the current chat ID to the tool. If a Flappy hook supplies `session_id`, pass it to `open_flappy`. Do not choose another chat or a most-recent session. The game polls its own read-only status tool through the UI bridge; never use model calls, chat messages, or sleeps to keep it updated.

The user can also open Flappy Bird from the chat's side-panel app picker. Live agent status requires trusting the plugin's hooks in Codex. A stopped response can be continued by another hook, so do not treat the game's status as proof that the user's task succeeded.

Only the newest Flappy panel stays open in this Codex profile. When a new panel mounts, previous panels save their results and close themselves through the native UI API, including panels in other chats. The UI coordinates this itself; do not call extra tools to find or close old panels.

The turn-start hook requests one automatic opening for each new turn. Follow that request early in the turn, even if the game was opened earlier in this chat, and pass `auto_opened: true`. Repeated copies of the same request do not need another call. If the user explicitly asks to keep the game closed, honor that preference.

When the response ends, is interrupted, or the session closes, the game immediately ends the current round, including a paused round, and saves its score and best score. The panel stays open with those results. Another round is blocked until the agent starts running again. Automatic and manual openings follow the same game lifecycle. Opening is the only model call needed each turn; do not poll status or repeatedly reopen the panel during the same turn.
