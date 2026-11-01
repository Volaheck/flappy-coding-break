# Changelog

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
