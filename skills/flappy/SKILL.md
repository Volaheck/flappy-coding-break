---
name: flappy
description: Open the installed Flappy Coding Break game inside Codex when the user asks to play Flappy Bird or invokes $flappy.
---

Use the `open_flappy` tool from the `flappy-coding-break` MCP server. It returns an embedded game and provides a Flappy Bird entrypoint in the current chat's side panel. Call it once, then continue any other requested work. Leave `auto_opened` false for a user-requested game so it stays open.

The game requires Codex desktop with MCP Apps UI. The CLI has no game surface. If the host cannot render it, explain that limitation; never open an external browser or window.

The host usually provides the current chat ID to the tool. If a Flappy hook supplies `session_id`, pass it to `open_flappy`. Do not choose another chat or a most-recent session. The game polls its own read-only status tool through the UI bridge; never use model calls, chat messages, or sleeps to keep it updated.

The user can also open Flappy Bird from the chat's side-panel app picker. Live agent status requires trusting the plugin's hooks in Codex. A stopped response can be continued by another hook, so do not treat the game's status as proof that the user's task succeeded.

The startup hook requests one automatic opening per chat. When the host supports closing widgets, that automatic view closes after the response ends and the current round finishes; manually opened games remain open. Open it again on request, rather than adding recurring model calls to every turn.
