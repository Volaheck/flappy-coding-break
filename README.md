# Flappy Bird for OpenCode Desktop

A small Flappy Bird that lives in the OpenCode Desktop side panel and opens by itself while the agent is working.

[Русская версия](README.ru.md)

## Features

- Opens about 1 second after the agent starts working and closes after it finishes, never in the middle of your game
- Fixed-step physics at 120 Hz with interpolation and pre-rendered sprites, about 0.1 ms per frame
- No CPU usage when idle: rendering stops on pause, after game over and when the panel or window is hidden
- Pause with `P`, by clicking outside the game or by hiding the panel; the game continues where you left off
- Score board with best score and medals for 10, 20, 30 and 40 points
- Agent status badge: "Agent is working…" and "Agent is done"
- English and Russian interface

## Requirements

- OpenCode Desktop 2.2 or newer, the plugin uses the experimental GUI plugin API
- The terminal interface is not supported

## Install

### npm

```sh
opencode plugin add opencode-flappybird
```

Or add the package to the global config `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-flappybird"]
}
```

OpenCode Desktop loads GUI plugins from the global config only. After installation the plugin is listed in **Settings → Extensions → Plugins**.

If you installed only OpenCode Desktop, the `opencode` command may be missing from your `PATH`. Edit the config file instead, or ask the agent in OpenCode to install `opencode-flappybird`.

### GitHub

```sh
opencode plugin add github:OWNER/REPO
```

## Usage

- Type `/flappy` in the prompt, run **Play Flappy Bird** from the command palette, or pick **Flappy Bird** in the side panel `+` menu
- Click, `Space`, `↑`, `W` or `Enter` to flap, `P` to pause
- Assign a shortcut in **Settings → Shortcuts**

## Options

```jsonc
{
  "plugins": [
    {
      "package": "opencode-flappybird",
      "options": { "autoOpen": false, "autoClose": false }
    }
  ]
}
```

| Option      | Default | Description                                          |
| ----------- | ------- | ---------------------------------------------------- |
| `autoOpen`  | `true`  | Open the game while the agent is working             |
| `autoClose` | `true`  | Close the automatically opened game after the agent finishes |

## Development

The plugin is a single CommonJS file, `gui-experimental.cjs`, with no build step. To try local changes, put the folder path into the `plugins` array of the global config. OpenCode reloads the plugin in every window after each save.

## License

[MIT](LICENSE)
