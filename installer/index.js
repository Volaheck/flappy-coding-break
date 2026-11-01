import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export const REPOSITORY = "Volaheck/flappy-coding-break";
export const PLUGIN = "flappy-coding-break";
export const HARNESSES = ["opencode", "claude", "codex"];

export const HELP = `Flappy Coding Break installer

Usage:
  npx github:${REPOSITORY} install --all
  flappy-coding-break install --opencode --claude --codex
  flappy-coding-break doctor --all

Options:
  --opencode              Install for OpenCode Desktop 2.2+
  --claude                Install for Claude Code with Mods support
  --codex                 Install the in-app Codex plugin
  --all                   Select all three harnesses; each CLI must be available
  --dry-run               Print the plan without executing commands
  --source SOURCE         Claude/Codex marketplace (default: ${REPOSITORY})
  --opencode-source SPEC  OpenCode npm/Git package (default: github:${REPOSITORY})
  -h, --help              Show this help

Native plugin managers keep their own persistent caches and preserve settings.
A local --source directory must remain available; do not use a temporary npx path.
--source does not change the OpenCode package; use --opencode-source separately.
Installation enables the plugin; opening its game requires a supported app UI.
`;

export function parseArguments(argv) {
  const options = { command: "install", harnesses: [], dryRun: false, source: REPOSITORY, opencodeSource: `github:${REPOSITORY}` };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) options.command = args.shift();
  if (!["install", "doctor"].includes(options.command)) throw new Error(`Unknown command: ${options.command}. Use install or doctor.`);

  while (args.length) {
    const arg = args.shift();
    if (arg === "--help" || arg === "-h") return { ...options, help: true };
    if (arg === "--all") options.harnesses.push(...HARNESSES);
    else if (HARNESSES.includes(arg.slice(2)) && arg.startsWith("--")) options.harnesses.push(arg.slice(2));
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--source" || arg === "--opencode-source") {
      const value = args.shift();
      if (!value?.trim() || value.startsWith("-") || /[\r\n\0]/.test(value)) throw new Error(`${arg} requires a source value.`);
      options[arg === "--source" ? "source" : "opencodeSource"] = value;
    } else throw new Error(`Unknown option: ${arg}. Use --help for usage.`);
  }

  options.harnesses = HARNESSES.filter(harness => options.harnesses.includes(harness));
  if (!options.harnesses.length) throw new Error("Choose --opencode, --claude, --codex, or --all.");
  return options;
}

function marketplaceSource(source, cwd, home) {
  if (source === "~" || source.startsWith("~/")) return path.resolve(home, source.slice(2));
  if (path.isAbsolute(source) || /^\.{1,2}(?:[\\/]|$)/.test(source)) return path.resolve(cwd, source);
  return source;
}

export function createInstallPlan(options, { cwd = process.cwd(), home = homedir() } = {}) {
  const source = marketplaceSource(options.source, cwd, home);
  const plans = {
    opencode: {
      harness: "opencode",
      checks: [{ args: ["plugin", "add", "--help"] }],
      commands: [["plugin", "add", options.opencodeSource]],
      after: "OpenCode: restart Desktop, then use /flappy or Play Flappy Bird.",
    },
    claude: {
      harness: "claude",
      checks: [{ args: ["plugin", "install", "--help"], includes: "--marketplace", requirement: "Claude Code 2.1.292+ with --marketplace installation support is required. Update Claude Code and retry." }],
      commands: [["plugin", "install", PLUGIN, "--marketplace", source, "--scope", "user"]],
      after: "Claude Code: start a new session and use /flappy to open the mod.",
    },
    codex: {
      harness: "codex",
      checks: [{ args: ["plugin", "marketplace", "add", "--help"] }, { args: ["plugin", "add", "--help"] }],
      commands: [["plugin", "marketplace", "add", source], ["plugin", "add", `${PLUGIN}@${PLUGIN}`]],
      after: "Codex: restart the app, start a new chat, and ask the Flappy Coding Break plugin to open its in-app game.",
    },
  };
  return options.harnesses.map(harness => plans[harness]);
}

export function formatCommand(command, args) {
  return [command, ...args].map(value => /^[a-zA-Z0-9_./:@=+,-]+$/.test(value) ? value : JSON.stringify(value)).join(" ");
}

export function parseNpmCmdShim(source) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim().split("\n").map(line => line.trim()).filter(Boolean);
  const header = [
    "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0",
    String.raw`IF EXIST "%dp0%\node.exe" (`, String.raw`SET "_prog=%dp0%\node.exe"`, ") ELSE (",
    'SET "_prog=node"', "SET PATHEXT=%PATHEXT:;.JS;=;%", ")",
  ];
  if (lines.length !== header.length + 1 || header.some((line, index) => lines[index] !== line)) return null;
  const target = lines.at(-1).match(/^endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & "%_prog%" +"%dp0%\\([^"%\r\n]+)" %\*$/)?.[1];
  if (!target || path.win32.isAbsolute(target) || target.includes("\0")) return null;
  return target;
}

export async function findExecutable(command, { env = process.env, platform = process.platform } = {}) {
  const pathValue = env.PATH ?? env.Path ?? "";
  const extensions = platform === "win32" ? [".exe", ".com", ".cmd"] : [""];
  for (const directory of pathValue.split(platform === "win32" ? ";" : path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, `${command}${extension}`);
      try {
        await access(candidate, platform === "win32" ? constants.R_OK : constants.X_OK);
        if (!(await stat(candidate)).isFile()) continue;
      } catch {
        continue;
      }
      if (extension !== ".cmd") return candidate;
      const target = parseNpmCmdShim(await readFile(candidate, "utf8"));
      if (!target) throw new Error(`Unsupported Windows command shim: ${candidate}. Expected a standard npm Node.js .cmd wrapper; install the native CLI or regenerate its npm shim.`);
      const script = path.resolve(path.dirname(candidate), ...target.split(/[\\/]/));
      try {
        await access(script, constants.R_OK);
        if (!(await stat(script)).isFile()) throw new Error("not a file");
      } catch {
        throw new Error(`Windows npm shim ${candidate} points to a missing or unreadable Node.js entrypoint: ${script}. Reinstall that CLI.`);
      }
      return { command: process.execPath, args: [script] };
    }
  }
  return null;
}

export function runCommand(command, args, { capture = false, env = process.env } = {}) {
  return spawnSync(command, args, { shell: false, env, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
}

function commandFailure(command, args, result) {
  const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || (result.signal ? `terminated by ${result.signal}` : `exit status ${result.status}`);
  return `${formatCommand(command, args)} failed: ${detail}`;
}

export async function runCli(argv, dependencies = {}) {
  const { log = console.log, resolveExecutable = findExecutable, run = runCommand } = dependencies;
  const options = parseArguments(argv);
  if (options.help) {
    log(HELP);
    return { installed: [], dryRun: false };
  }
  const plans = createInstallPlan(options, dependencies);

  if (options.dryRun) {
    log(`Dry run: ${options.command} for ${options.harnesses.join(", ")}. No changes will be made.`);
    for (const plan of plans) {
      for (const check of plan.checks) log(`Check: ${formatCommand(plan.harness, check.args)}`);
      if (options.command === "install") {
        for (const args of plan.commands) log(`Run: ${formatCommand(plan.harness, args)}`);
      }
    }
    return { installed: [], dryRun: true, plans };
  }

  const errors = [];
  for (const plan of plans) {
    try {
      plan.executable = await resolveExecutable(plan.harness);
    } catch (error) {
      errors.push(`${plan.harness}: ${error.message}`);
      continue;
    }
    if (!plan.executable) {
      errors.push(`${plan.harness}: CLI not found on PATH. Install its CLI or add the existing CLI to PATH, then retry.`);
      continue;
    }
    plan.invocation = typeof plan.executable === "string" ? { command: plan.executable, args: [] } : plan.executable;
    for (const check of plan.checks) {
      const result = await run(plan.invocation.command, [...plan.invocation.args, ...check.args], { capture: true });
      if (result.error || result.status !== 0) {
        errors.push(commandFailure(plan.harness, check.args, result));
        break;
      }
      if (check.includes && !(result.stdout ?? "").includes(check.includes)) {
        errors.push(`${plan.harness}: ${check.requirement}`);
        break;
      }
    }
  }
  if (errors.length) throw new Error(`Preflight failed; nothing was installed.\n${errors.join("\n")}`);
  if (options.command === "doctor") {
    for (const plan of plans) log(`${plan.harness}: native plugin installation commands are available (${formatCommand(plan.invocation.command, plan.invocation.args)}).`);
    log("Doctor checks CLI support only; verify the game inside each app after installation.");
    return { installed: [], dryRun: false };
  }

  const installed = [];
  for (const plan of plans) {
    for (const args of plan.commands) {
      log(`Run: ${formatCommand(plan.harness, args)}`);
      const result = await run(plan.invocation.command, [...plan.invocation.args, ...args], { capture: false });
      if (result.error || result.status !== 0) {
        const progress = installed.length ? ` Completed: ${installed.join(", ")}.` : "";
        throw new Error(`${commandFailure(plan.harness, args, result)}.${progress} Installation stopped; previous successful native commands have not been undone.`);
      }
    }
    installed.push(plan.harness);
    log(plan.after);
  }
  return { installed, dryRun: false };
}
