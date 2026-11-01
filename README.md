# Flappy Coding Break

Play Flappy Bird while your coding agent works. One repository, one shared game, three integrations.

[Русская версия](README.ru.md)

| Harness | Game surface | Controls |
| --- | --- | --- |
| OpenCode Desktop 2.2+ | Native side panel, original Canvas graphics | Click, Space, ↑, W, Enter; P to pause |
| Claude Code Terminal / Desktop | Native Mods pane, pixel renderer | Click, W or Space when focused; P to pause |
| Codex Desktop with MCP Apps UI | Embedded app in the chat side panel, Canvas graphics | Click, Space, ↑, W, Enter; P to pause |

The game never opens an external browser or window. The Codex CLI and Claude Code VS Code extension do not provide the game surface used here.

## Install

Install Node.js 20+ and the CLI for each selected harness. Then run:

```sh
npx github:Volaheck/flappy-coding-break install --all
```

Or select only the apps you use:

```sh
npx github:Volaheck/flappy-coding-break install --codex
npx github:Volaheck/flappy-coding-break install --claude --opencode
```

The installer uses the native plugin managers. It checks every selected CLI before changing anything, preserves existing configuration, and installs from the GitHub repository into the managers' persistent caches. It does not rely on the temporary `npx` directory.

`--all` requires all three CLIs on `PATH`. If you only have a desktop app, install or expose its CLI first. Claude's one-command marketplace installation requires Claude Code 2.1.292+.

Review the commands or check your installation without making changes:

```sh
npx github:Volaheck/flappy-coding-break install --all --dry-run
npx github:Volaheck/flappy-coding-break doctor --codex
```

Restart the selected app or reload its plugins after installation. In Codex, review and trust this plugin's hooks using `/hooks` in the CLI or the app's hook controls. Installing a plugin does not grant hook trust. New or changed hook definitions can require another review.

### Native installation

OpenCode:

```sh
opencode plugin add github:Volaheck/flappy-coding-break
```

Claude Code:

```sh
claude plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break
```

Codex:

```sh
codex plugin marketplace add Volaheck/flappy-coding-break
codex plugin add flappy-coding-break@flappy-coding-break
```

The npm package retains its original name, `opencode-flappybird`, for compatibility. After the corresponding version is published, `opencode plugin add opencode-flappybird` remains supported. The exported `./gui-experimental` entrypoint remains a single self-contained CommonJS bundle.

## Play

### OpenCode

Type `/flappy`, choose **Play Flappy Bird** in the command palette, or select **Flappy Bird** from the side-panel `+` menu. The panel opens after the agent has worked for about a second. Automatically opened panels close after the agent finishes and you are no longer playing; manually opened panels stay open.

Existing options still work in the global OpenCode config:

```jsonc
{
  "plugins": [
    {
      "package": "github:Volaheck/flappy-coding-break",
      "options": { "autoOpen": true, "autoClose": true }
    }
  ]
}
```

### Claude Code

Run `/flappy` to toggle the native pane, including while Claude is working. The mod opens automatically on a main-agent turn and closes after the round finishes. Paused games are preserved. Subagent completions do not close the game.

The renderer uses the Mods Client API and does not require a browser. It draws pixel graphics with the same physics as the Canvas version. Configure `autoOpen`, `autoClose`, and `locale` (`en` / `ru`) through the plugin's configuration.

Terminal pane auto-opening depends on the terminal width: normally at least 144 columns, or 110 after manually opening a pane. Use `/flappy` to open it in a smaller terminal. Arrow keys belong to the host; use W, Space, or the pointer. The VS Code extension does not support the Client element used by this game.

### Codex

Ask **“Open Flappy Bird”**, invoke the `flappy` skill, or use the **Flappy Bird** app entry in the chat side panel. The plugin's `open_flappy` tool returns the embedded game. Continue your task with the game visible alongside the chat.

Trusted lifecycle hooks request the initial opening once per chat. This initial opening is a model tool call; subsequent gameplay and status polling do not call the model. The game reads only the current chat's status through an app-only MCP tool. It makes no external network requests.

An automatically opened game asks the host to close it after the response ends and the current round has finished; paused rounds are kept. Manual openings stay open. Hosts without the close capability keep the panel open. Automatic opening is requested once per chat; after closing, reopen it with the skill or side-panel picker. Status labels distinguish an active response, a ready response, interruption, and a closed session. “Response ready” does not guarantee that the entire task is complete: another hook can continue the turn.

Hooks require supported local Codex execution. Without trusted hooks, the game is still playable but cannot show live agent status. This integration requires a desktop version with MCP Apps UI; installing it in the CLI alone does not add a graphical pane.

## Development

```sh
npm run build
npm test
npm run check:generated
npm run test:claude
npm pack --dry-run
```

There are no runtime npm dependencies. The shared physics lives in `game/core.cjs`, the Canvas renderer in `game/canvas.cjs`, and translations in `game/i18n.cjs`. Host-specific code lives in `adapters/`.

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
