import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInstallPlan, findExecutable, parseArguments, parseNpmCmdShim, runCli, runCommand } from "../installer/index.js";

function fakeRuntime(overrides = {}) {
  const calls = [];
  const output = [];
  return {
    calls,
    output,
    log: line => output.push(line),
    resolveExecutable: async name => `/fake tools/${name}`,
    run: async (command, args, options) => {
      calls.push({ command, args, ...options });
      return { status: 0, stdout: "Usage: plugin install --marketplace SOURCE", stderr: "" };
    },
    ...overrides,
  };
}

test("requires an explicit harness and rejects ambiguous input", () => {
  for (const args of [[], ["install"], ["remove", "--all"], ["install", "--unknown"], ["install", "--all", "--source"], ["--all", "--source", "--codex"], ["--all", "--source", "repo\nnext"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.deepEqual(parseArguments(["install", "--codex", "--all", "--claude"]).harnesses, ["opencode", "claude", "codex"]);
});

test("default plan uses native managers and persistent remote sources", () => {
  const plan = createInstallPlan(parseArguments(["install", "--all"]));
  assert.deepEqual(plan.map(entry => entry.commands), [
    [["plugin", "add", "github:Volaheck/flappy-coding-break"]],
    [["plugin", "install", "flappy-coding-break", "--marketplace", "Volaheck/flappy-coding-break", "--scope", "user"]],
    [["plugin", "marketplace", "add", "Volaheck/flappy-coding-break"], ["plugin", "add", "flappy-coding-break@flappy-coding-break"]],
  ]);
});

test("local marketplace source is absolute and separate from the OpenCode package", () => {
  const cwd = path.resolve(os.tmpdir(), "long lived repo");
  const home = path.resolve(os.tmpdir(), "someone's home");
  const plan = createInstallPlan(parseArguments(["--all", "--source", "./plugin with spaces", "--opencode-source", "opencode-flappybird@1.0.0"]), { cwd });
  assert.equal(plan[0].commands[0][2], "opencode-flappybird@1.0.0");
  assert.equal(plan[1].commands[0][4], path.join(cwd, "plugin with spaces"));
  assert.equal(plan[2].commands[0][3], path.join(cwd, "plugin with spaces"));
  const homePlan = createInstallPlan(parseArguments(["--codex", "--source", "~/plugins/flappy"]), { home });
  assert.equal(homePlan[0].commands[0][3], path.join(home, "plugins", "flappy"));
});

test("dry run and help never probe, run native commands, or mutate settings", async () => {
  const runtime = fakeRuntime({
    resolveExecutable: () => assert.fail("must not inspect binaries"),
    run: () => assert.fail("must not execute a process"),
  });
  const result = await runCli(["install", "--all", "--dry-run"], runtime);
  assert.equal(result.dryRun, true);
  assert.equal(runtime.output.filter(line => line.startsWith("Run:")).length, 4);
  await runCli(["--help"], runtime);
  assert.match(runtime.output.at(-1), /npx github:Volaheck\/flappy-coding-break install --all/);
});

test("all selected harnesses are checked before the first installation", async () => {
  const runtime = fakeRuntime();
  const result = await runCli(["install", "--all"], runtime);
  assert.deepEqual(result.installed, ["opencode", "claude", "codex"]);
  assert.deepEqual(runtime.calls.map(call => call.capture), [true, true, true, true, false, false, false, false]);
  assert.deepEqual(runtime.calls.at(-1).args, ["plugin", "add", "flappy-coding-break@flappy-coding-break"]);
});

test("a missing selected CLI prevents every installation and reports all missing CLIs", async () => {
  const runtime = fakeRuntime({ resolveExecutable: async name => name === "codex" ? "/fake/codex" : null });
  await assert.rejects(runCli(["--all"], runtime), error => {
    assert.match(error.message, /nothing was installed/);
    assert.match(error.message, /opencode: CLI not found/);
    assert.match(error.message, /claude: CLI not found/);
    return true;
  });
  assert.ok(runtime.calls.every(call => call.capture));
});

test("an old Claude CLI fails before making any changes", async () => {
  const runtime = fakeRuntime({ run: async () => ({ status: 0, stdout: "plugin install NAME" }) });
  await assert.rejects(runCli(["--claude"], runtime), /Claude Code 2\.1\.292\+/);
});

test("a failed native check blocks installation and retains its diagnostic", async () => {
  const runtime = fakeRuntime({ run: async () => ({ status: 2, stderr: "unknown subcommand 'plugin'" }) });
  await assert.rejects(runCli(["--codex"], runtime), /unknown subcommand 'plugin'/);
});

test("doctor checks CLI support without running install commands", async () => {
  const runtime = fakeRuntime();
  const result = await runCli(["doctor", "--all"], runtime);
  assert.deepEqual(result.installed, []);
  assert.equal(runtime.calls.length, 4);
  assert.ok(runtime.calls.every(call => call.capture));
});

test("native installation failure stops subsequent commands and reports completed harnesses", async () => {
  const calls = [];
  const runtime = fakeRuntime({ run: async (command, args, options) => {
    calls.push({ command, args, ...options });
    return { status: command.endsWith("claude") && !options.capture ? 1 : 0, stdout: "--marketplace", stderr: "" };
  } });
  await assert.rejects(runCli(["--all"], runtime), /Completed: opencode.*previous successful native commands have not been undone/);
  assert.equal(calls.filter(call => !call.capture).length, 2);
});

test("source arguments containing shell metacharacters stay a single argument", async () => {
  const runtime = fakeRuntime();
  const source = path.resolve(os.tmpdir(), "persistent path", "$(touch SHOULD_NOT_EXIST); `literal`");
  await runCli(["--claude", "--source", source], runtime);
  assert.equal(runtime.calls.at(-1).args[4], source);
});

test("process runner never interprets shell metacharacters", async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flappy installer "));
  t.after(() => rm(temporary, { recursive: true }));
  const marker = path.join(temporary, "must not exist");
  const argument = `$(touch '${marker}'); \`touch '${marker}'\``;
  const result = runCommand(process.execPath, ["-e", "process.stdout.write(process.argv[1])", argument], { capture: true });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, argument);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});

test("binary lookup accepts spaces and ignores nonexecutables and directories", { skip: process.platform === "win32" }, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flappy installer "));
  t.after(() => rm(temporary, { recursive: true }));
  const first = path.join(temporary, "first bin");
  const second = path.join(temporary, "second bin");
  await mkdir(first);
  await mkdir(second);
  await mkdir(path.join(first, "codex"));
  await writeFile(path.join(second, "codex"), "#!/bin/sh\nexit 0\n");
  const env = { PATH: [first, second].join(path.delimiter) };
  assert.equal(await findExecutable("codex", { env }), null);
  await chmod(path.join(second, "codex"), 0o755);
  assert.equal(await findExecutable("codex", { env }), path.join(second, "codex"));
});

function npmCmdShim(target) {
  return String.raw`@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%${"\\"}${target}" %*
`.replace(/\n/g, "\r\n");
}

test("recognizes npm Node shims and rejects arbitrary batch code or environment expansion", () => {
  const target = String.raw`node_modules\@openai\codex\bin\codex.js`;
  assert.equal(parseNpmCmdShim(npmCmdShim(target)), target);
  assert.equal(parseNpmCmdShim(npmCmdShim(String.raw`..\package with spaces\bin\run`)), String.raw`..\package with spaces\bin\run`);
  for (const source of [
    `${npmCmdShim(target)}\r\nstart calc.exe`,
    npmCmdShim(target).replace('SET "_prog=node"', 'SET "_prog=powershell"'),
    npmCmdShim(target).replace('"%_prog%"  ', '"%_prog%" --eval "bad()" '),
    npmCmdShim(String.raw`%INJECTED%\bin.js`),
    npmCmdShim(String.raw`C:\absolute\bin.js`),
    '@echo off\r\nnode "custom.js" %*',
  ]) assert.equal(parseNpmCmdShim(source), null);
});

test("Windows npm shim lookup and execution preserve paths and arguments without evaluating batch", async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flappy npm shim & "));
  t.after(() => rm(temporary, { recursive: true }));
  const script = path.join(temporary, "node_modules", "cli package & literal", "run.cjs");
  await mkdir(path.dirname(script), { recursive: true });
  await writeFile(script, "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n");
  await writeFile(path.join(temporary, "codex.cmd"), npmCmdShim(String.raw`node_modules\cli package & literal\run.cjs`));
  await writeFile(path.join(temporary, "codex"), "#!/bin/sh\nexit 42\n");
  const invocation = await findExecutable("codex", { platform: "win32", env: { PATH: temporary } });
  assert.deepEqual(invocation, { command: process.execPath, args: [script] });
  const args = ["spaces in source", "$(echo SHOULD_NOT_RUN); `echo SHOULD_NOT_RUN`", "a&b|c", "%COMSPEC%"];
  const result = runCommand(invocation.command, [...invocation.args, ...args], { capture: true });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), args);
  const runtime = fakeRuntime({ resolveExecutable: async () => invocation });
  await runCli(["--codex"], runtime);
  assert.ok(runtime.calls.every(call => call.command === process.execPath && call.args[0] === script));
  assert.deepEqual(runtime.calls.at(-1).args.slice(1), ["plugin", "add", "flappy-coding-break@flappy-coding-break"]);
});

test("unknown Windows shim and broken targets fail preflight before any install", async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flappy unknown shim "));
  t.after(() => rm(temporary, { recursive: true }));
  const shim = path.join(temporary, "codex.cmd");
  const resolveExecutable = command => findExecutable(command, { platform: "win32", env: { PATH: temporary } });
  await writeFile(shim, '@echo off\r\necho arbitrary batch\r\n');
  const runtime = fakeRuntime({ resolveExecutable, run: () => assert.fail("must not execute unsupported shims") });
  await assert.rejects(runCli(["--codex"], runtime), /nothing was installed[\s\S]*Unsupported Windows command shim/);
  await writeFile(shim, npmCmdShim(String.raw`node_modules\missing\bin.js`));
  await assert.rejects(runCli(["--codex"], runtime), /nothing was installed[\s\S]*missing or unreadable Node\.js entrypoint/);
});
