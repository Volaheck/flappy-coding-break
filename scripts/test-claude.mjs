import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const npm = process.env.npm_execpath
if (!npm) throw new Error("Run this check with npm run test:claude.")
const config = mkdtempSync(path.join(tmpdir(), "flappy-claude-validation-"))
try {
  for (const action of ["validate", "test"]) {
    const result = spawnSync(process.execPath, [npm, "exec", "--yes", "--package=@anthropic-ai/claude-code@2.1.316", "--", "claude", "plugin", action, root], {
      cwd: root,
      env: { ...process.env, CLAUDE_CONFIG_DIR: config },
      stdio: "inherit",
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  rmSync(config, { recursive: true, force: true })
}
