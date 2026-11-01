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

Use your app's native plugin manager. Terminal commands require that app's CLI on `PATH`; Codex Desktop also supports installation through its interface.

### OpenCode Desktop

```sh
opencode plugin add github:Volaheck/flappy-coding-break
```

Requires OpenCode Desktop 2.2+. Restart Desktop or reload the plugin after installation. See the [OpenCode plugin documentation](https://dev.opencode.ai/v2/docs/plugins#manage).

The npm package retains its original name, `opencode-flappybird`, for compatibility. After the corresponding version is published, `opencode plugin add opencode-flappybird` remains supported. The exported `./gui-experimental` entrypoint remains a single self-contained CommonJS bundle.

### Claude Code

```sh
claude plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break
```

This command adds the marketplace and installs the plugin in one step. Requires Claude Code 2.1.292+. Start a new session after installation.

You can also install from inside Claude Code:

```text
/plugin install flappy-coding-break --marketplace Volaheck/flappy-coding-break
```

The in-session command is supported from 2.1.275 and asks you to confirm the marketplace and installation scope. See the [Claude plugin documentation](https://code.claude.com/docs/en/discover-plugins#add-a-marketplace-and-install-in-one-command).

### Codex Desktop

Open **Plugins → Add → Add a marketplace**. Set **Source** to `Volaheck/flappy-coding-break`, choose **Add marketplace**, then **Install** on **Flappy Coding Break**.

Alternatively, if the `codex` CLI is available on `PATH`, run:

```sh
codex plugin marketplace add Volaheck/flappy-coding-break
codex plugin add flappy-coding-break@flappy-coding-break
```

If your shell reports `command not found: codex`, the CLI is not available on `PATH`. Use the Desktop steps above or install/configure the CLI before running these commands.

Codex requires two native steps: register the marketplace once, then install the plugin by name. Its `plugin add --marketplace` flag takes a registered marketplace name, not a GitHub repository. See the [Codex command reference](https://learn.chatgpt.com/docs/developer-commands#codex-plugin).

Requires Node.js 20+ on `PATH` for the local MCP server and a Codex desktop version with MCP Apps UI. Restart the app after installation. Review and trust this plugin's hooks using `/hooks` in the CLI or the app's hook controls. Installing a plugin does not grant hook trust; changed hook definitions can require another review.

### Optional: install in several apps together

The Node.js 20+ helper runs these same native commands and checks all selected CLIs before installing anything. `--all` requires all three CLIs on `PATH`; you can select individual apps with `--opencode`, `--claude`, or `--codex`.

```sh
npx github:Volaheck/flappy-coding-break install --all
```

It installs into the native managers' persistent caches, preserves existing configuration, and does not depend on the temporary `npx` directory. To preview the commands or check CLI support without installing:

```sh
npx github:Volaheck/flappy-coding-break install --all --dry-run
npx github:Volaheck/flappy-coding-break doctor --codex
```

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
