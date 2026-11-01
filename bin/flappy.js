#!/usr/bin/env node
import { runCli } from "../installer/index.js";

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  console.error(`Flappy Coding Break: ${error.message}`);
  process.exitCode = 1;
}
