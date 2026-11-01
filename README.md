# Flappy Coding Break

Play Flappy Bird while your coding agent works, in the style of Flappy Duck: a duck pilot weaving its plane between columns of crates over a city skyline. One repository, one shared game, three integrations.

[Русская версия](README.ru.md) · **Install:** [for people](#for-people) · [for AI agents](#for-ai-agents)

| Harness | Game surface | Controls |
| --- | --- | --- |
| OpenCode Desktop 2.2+ | Native side panel, original Canvas graphics | Click, Space, ↑, W, Enter; P to pause |
| Claude Code Terminal / Desktop | Native Mods pane: Canvas-style scene and heads-up display on Desktop, pixel renderer in the terminal | Click, W or Space when focused; P to pause |
| Codex Desktop with MCP Apps UI | Embedded app in the chat side panel, Canvas graphics | Click, Space, ↑, W, Enter; P to pause |

The game never opens an external browser or window. The Codex CLI and Claude Code VS Code extension do not provide the game surface used here.

## Install

### For people

- **Claude Desktop:** **+** next to the message box → **Plugins** → **Add marketplace** `Volaheck/flappy-coding-break` → **Add plugin** → run `/reload-plugins`.
- **Claude Code (terminal):** `claude plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break`, then start a new session.
- **Codex Desktop:** **Plugins → Add → Add a marketplace** `Volaheck/flappy-coding-break` → **Install** on **Flappy Coding Break** → restart → trust the plugin's hooks.
- **OpenCode Desktop:** `opencode plugin add github:Volaheck/flappy-coding-break`, then restart.

The game opens by itself while the agent works. Open it any time with `/flappy` (Claude, OpenCode) or by asking Codex to “Open Flappy Bird”.

### For AI agents

1. Run the command for the app you are running in:

   ```sh
   # Claude Code or Claude Desktop
   claude plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break
   # Codex
   codex plugin marketplace add Volaheck/flappy-coding-break && codex plugin add flappy-coding-break@flappy-coding-break
   # OpenCode
   opencode plugin add github:Volaheck/flappy-coding-break
   ```

2. No such command on `PATH`? In Claude Desktop on macOS, run the app's own CLI, found with `ls -d ~/Library/Application\ Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude | sort -V | tail -1`. For another app, give the user the steps [for people](#for-people).
3. Tell the user how to load it: `/reload-plugins` in Claude; restart Codex and trust the plugin's hooks; restart OpenCode.
4. To update later in Claude: `claude plugin update flappy-coding-break@flappy-coding-break`, then `/reload-plugins`.

### Requirements and options

- **Claude Code** 2.1.292+; the in-session `/plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break` works from 2.1.275. [Plugin docs](https://code.claude.com/docs/en/discover-plugins#add-a-marketplace-and-install-in-one-command)
- **Codex** desktop with MCP Apps UI and Node.js 20+ on `PATH`. Live agent status needs the plugin's hooks trusted (`/hooks` or the app's hook controls). [Command reference](https://learn.chatgpt.com/docs/developer-commands#codex-plugin)
- **OpenCode Desktop** 2.2+. The npm package keeps its original name, `opencode-flappybird`. [Plugin docs](https://dev.opencode.ai/v2/docs/plugins#manage)
- **Several apps at once:** `npx github:Volaheck/flappy-coding-break install --all` needs all three CLIs; pick apps with `--claude`, `--codex` or `--opencode`, preview with `--dry-run`, check a CLI with `doctor --codex`.

## Play

Opening a new Flappy panel closes the previous Flappy panels in that host, including those from earlier chats. Other apps and unrelated panels are unaffected. Codex and Claude check ownership once per second without model calls; a host-suspended view can close when it resumes. Older installed versions must reload before their panels can participate.

When the agent finishes its response, the current round ends immediately, including if it is paused. The final score is saved and counted toward your best score even if the bird has not crashed. The panel stays open with both results. Starting or resuming play is blocked until the agent starts working again; the next click or flap key starts a new round.

The previous `autoClose` setting is no longer used. Close the results panel manually whenever you want.

### OpenCode

Type `/flappy`, choose **Play Flappy Bird** in the command palette, or select **Flappy Bird** from the side-panel `+` menu. The panel opens after the agent has worked for about a second. Each chat keeps its own game and results.

Configure automatic opening in the global OpenCode config:

```jsonc
{
  "plugins": [
    {
      "package": "github:Volaheck/flappy-coding-break",
      "options": { "autoOpen": true }
    }
  ]
}
```

### Claude Code

Run `/flappy` to toggle the native pane, including while Claude is working. The mod opens automatically on a main-agent turn. Main-agent completion ends the round and shows the saved score and best; subagent completions do not end it.

The renderer uses the Mods Client API and does not require a browser. It shares the Canvas version's physics, draws the Canvas art and heads-up display on Desktop (SVG scenery under a smoothly moving board) and pixel graphics in the terminal. Configure `autoOpen` and `locale` (`en` / `ru`) through the plugin's configuration.

Terminal pane auto-opening depends on the terminal width: normally at least 144 columns, or 110 after manually opening a pane. Use `/flappy` to open it in a smaller terminal. Arrow keys belong to the host; use W, Space, or the pointer. The VS Code extension does not support the Client element used by this game.

### Codex

Ask **“Open Flappy Bird”**, invoke the `flappy` skill, or use the **Flappy Bird** app entry in the chat side panel. The plugin's `open_flappy` tool returns the embedded game. Continue your task with the game visible alongside the chat.

Trusted lifecycle hooks request opening at the start of each new agent turn, including when the game was opened earlier in the same chat. Opening uses one model tool call per turn; subsequent gameplay and status polling do not call the model. The game reads only the current chat's status through an app-only MCP tool. It makes no external network requests.

Response completion, interruption, and session end all finish the round and lock play while keeping the results visible. A new active response unlocks the next round. Losing the status connection does not unlock a finished game. After manually closing the panel, reopen it with the skill or side-panel picker, or let the next turn request opening again. “Response ready” does not guarantee that the entire task is complete: another hook can continue the turn.

Status follows the current turn in this chat. Starting a new turn supersedes stale records left by a missed stop signal; a delayed stop from an older turn cannot stop the new one. Hooks must remain enabled and trusted for completion to reach the game.

Hooks require supported local Codex execution. Without trusted hooks, the game is still playable but cannot show live agent status. This integration requires a desktop version with MCP Apps UI; installing it in the CLI alone does not add a graphical pane.

## Development

```sh
npm run build
npm test
npm run check:generated
npm run test:claude
npm pack --dry-run
```

The art (duck, crates, city and clouds) comes from Flappy Duck; `node scripts/import-duck-art.mjs <flappy-duck-frontend checkout>` re-imports it into `game/art.cjs` and `game/duck-frames.cjs` and needs ImageMagick and `cwebp`. The palette and layout shared by every renderer live in `game/theme.cjs`.

There are no runtime npm dependencies, and the exported `./gui-experimental` entrypoint is a single self-contained CommonJS bundle. The shared physics lives in `game/core.cjs`, the Canvas renderer in `game/canvas.cjs`, and translations in `game/i18n.cjs`. Host-specific code lives in `adapters/`.

`test:claude` downloads a pinned official Claude Code CLI and runs its plugin validator and native test kit in an isolated temporary profile. It requires network access but no account or model calls. CI also runs the Node tests and build checks on Linux and Windows with Node.js 20 and 24.

Builds generate `gui-experimental.cjs` for OpenCode, `web/game.js` for the Codex embedded app, and the ESM core/translations for Claude's sandbox. Edit the shared source, then build; do not edit generated files.

For a local Claude/Codex install:

```sh
node bin/flappy.js install --claude --codex --source .
```

Keep that source directory available. `--source` changes the Claude/Codex marketplace; `--opencode-source` independently changes OpenCode's npm/Git package spec. For live OpenCode development, put this repository's absolute path into the global config's `plugins` array and rebuild after edits.

Tests cover physics, host lifecycles, the MCP protocol, isolated chat status, generated bundles, and installer behavior. Real host rendering should also be checked before a release, particularly after a host updates its experimental UI API. See [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](LICENSE)
