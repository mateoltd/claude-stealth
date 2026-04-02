#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { getConfigPath } from './config.js';

const args = process.argv.slice(2);
const VERSION = '3.0.0';

const flag = args[0];

if (flag === '--version' || flag === '-v') {
  console.log(`claude-stealth v${VERSION}`);
  process.exit(0);
}

if (flag === '--help' || flag === '-h') {
  console.log(`
  claude-stealth v${VERSION}
  undercover-mode wrapper for Claude Code

  Usage:
    claude [options...]        Run Claude Code in stealth mode
    claude-stealth --setup     Configure stealth mode
    claude-stealth --uninstall Remove claude-stealth completely
    claude-stealth --version   Show version
    claude-stealth --help      Show this help

  All other flags are passed directly to Claude Code.
  After setup, just use 'claude' as normal.
`);
  process.exit(0);
}

if (flag === '--uninstall') {
  const { uninstall } = await import('./install.js');
  await uninstall();
  process.exit(0);
}

const firstRun = !existsSync(getConfigPath());

if (flag === '--setup' || flag === '-s' || firstRun) {
  const { runSetup } = await import('./setup.js');
  await runSetup({ firstRun });
  process.exit(0);
}

// Wrapper mode
const { loadConfig } = await import('./config.js');
const { wrap } = await import('./wrapper.js');
await wrap(args, loadConfig());
