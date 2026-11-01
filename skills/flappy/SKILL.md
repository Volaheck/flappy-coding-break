---
name: flappy
description: Open the installed Flappy Coding Break game inside Codex when the user asks to play Flappy Bird or invokes $flappy.
---

Use the `open_flappy` tool from the `flappy-coding-break` MCP server. It returns an embedded game and provides a Flappy Bird entrypoint in the current chat's side panel. Call it once, then continue any other requested work. Leave `auto_opened` false for a user-requested game; this flag records how the game was opened.

The game requires Codex desktop with MCP Apps UI. The CLI has no game surface. If the host cannot render it, explain that limitation; never open an external browser or window.

The host usually provides the current chat ID to the tool. If a Flappy hook supplies `session_id`, pass it to `open_flappy`. Do not choose another chat or a most-recent session. The game polls its own read-only status tool through the UI bridge; never use model calls, chat messages, or sleeps to keep it updated.

The user can also open Flappy Bird from the chat's side-panel app picker. Live agent status requires trusting the plugin's hooks in Codex. A stopped response can be continued by another hook, so do not treat the game's status as proof that the user's task succeeded.

The startup hook requests one automatic opening per chat. When the response ends, is interrupted, or the session closes, the game immediately ends the current round, including a paused round, and saves its score and best score. The panel stays open with those results. Another round is blocked until the agent starts running again. Automatic and manual openings follow the same game lifecycle. Open the panel again on request if the user closed it; do not add recurring model calls to every turn.
