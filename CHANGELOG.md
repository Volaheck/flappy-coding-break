# Changelog

## 1.4.0

- Draw the Claude Desktop game like the Canvas version: a smooth, tilting bird rasterised with anti-aliased edges, gradient pipes and slanted grass over the still SVG scenery.
- Bring the Canvas heads-up display into the Claude Desktop field: the score while playing, the agent's status, the start and pause screens, and Game Over or Round complete with score, best, medal, the NEW badge and the restart or waiting hint.
- Place every Claude Desktop layer by explicit cells, so the board can no longer cover the controls row, and size the scenery from the width the game last laid out.

## 1.3.3

- Keep Claude Desktop play smooth: the pane draws only the still scenery as SVG, once, and the game module draws the pipes, ground and bird locally at sub-cell precision, so no frame waits on a round trip through the plugin.

## 1.3.2

- Draw the Claude Desktop game as a vector scene matching the Canvas version: the pane renders each frame the game posts as SVG, with the game's text and click area laid over it. The terminal keeps its half-block renderer.

## 1.3.1

- Draw the Claude board with square pixels and a field width fitted to the pane, like the Canvas version; Claude Desktop uses a finer grid.
- Redraw the Claude bird so its eye and beak read at small sizes.
- Open the native pane when the `flappy` skill runs in Claude Code or Claude Desktop, instead of looking for the Codex-only `open_flappy` tool.

## 1.3.0

- Keep only the newest Flappy panel open within each host, including panels from earlier chats.
- Save the previous game's result before closing it when a new panel takes over.
- Keep results visible after the agent responds; only opening another Flappy replaces them.
- Draw the Claude Desktop board with filled cells instead of half-block glyphs, removing the striped gaps between rows.
- Use the native Codex close action and fullscreen-only panels so replaced games close instead of becoming inline widgets.

## 1.2.2

- Track Codex's current turn instead of accumulating unfinished turns from earlier responses.
- Recover from a missed stop signal when a new turn starts, while ignoring late stop signals from older turns.
- Keep chats and subagents isolated without letting stale status prevent the round from ending.

## 1.2.1

- Request the Codex game panel at the start of every new agent turn instead of only once per chat.
- Deduplicate concurrent hook retries per turn and ignore legacy chat-level opening markers.

## 1.2.0

- End the current round as soon as the agent finishes its response, including live and paused rounds.
- Save the final score and update the best score without requiring a collision.
- Keep the score and best-score screen visible; block play until the agent starts working again.
- Remove automatic panel closing; existing `autoClose` settings no longer close the results.
- Isolate OpenCode game instances by chat and persist the last completed result.

## 1.1.0

- Shared game physics, Canvas rendering, and English/Russian translations.
- Native Claude Code Mods pane with pixel graphics, shared physics, and persistent best score.
- Embedded Codex MCP Apps game with per-chat lifecycle status and no external window.
- One-command installer for OpenCode, Claude Code, and Codex using their native plugin managers.
- Retained OpenCode GUI entrypoint, Canvas visuals, commands, and auto-open/auto-close options.
- Deterministic bundles and tests for gameplay, host lifecycles, installation, and MCP transport.

## 1.0.0

- Initial OpenCode Desktop plugin.
