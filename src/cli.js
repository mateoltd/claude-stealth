#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { getConfigPath } from './config.js';

const args = process.argv.slice(2);
const VERSION = '3.1.0';

async function main() {
  const flag = args[0];

  if (flag === '--version' || flag === '-v') {
    console.log(`claude-stealth v${VERSION}`);
    return;
  }

  if (flag === '--help' || flag === '-h') {
    console.log(`
  claude-stealth v${VERSION}
  undercover-mode wrapper for Claude Code

  Usage:
    claude [options...]        Run Claude Code in stealth mode
    claude-stealth --setup     Configure stealth mode
    claude-stealth --config    Edit current configuration
    claude-stealth --update    Check for updates
    claude-stealth --uninstall Remove claude-stealth completely
    claude-stealth --version   Show version
    claude-stealth --help      Show this help

  All other flags are passed directly to Claude Code.
  After setup, just use 'claude' as normal.
`);
    return;
  }

  if (flag === '--update') {
    const { checkForUpdate, runUpdate, markChecked } = await import('./update.js');
    markChecked();
    process.stderr.write('Checking for updates...\n');
    const newer = await checkForUpdate(VERSION);
    if (newer) {
      process.stderr.write(`Updating to v${newer}...\n`);
      await runUpdate();
    } else {
      process.stderr.write(`Already up to date (v${VERSION}).\n`);
    }
    return;
  }

  if (flag === '--uninstall') {
    const { uninstall } = await import('./install.js');
    await uninstall();
    return;
  }

  if (flag === '--config' || flag === '-c') {
    const { runConfigWizard } = await import('./setup.js');
    await runConfigWizard();
    return;
  }

  const firstRun = !existsSync(getConfigPath());

  if (flag === '--setup' || flag === '-s' || firstRun) {
    const { runSetup } = await import('./setup.js');
    await runSetup({ firstRun });
    return;
  }

  // Non-blocking auto-update check
  autoUpdateCheck();

  // Wrapper mode
  const { loadConfig } = await import('./config.js');
  const { wrap } = await import('./wrapper.js');
  await wrap(args, loadConfig());
}

async function autoUpdateCheck() {
  try {
    const { shouldAutoCheck, checkForUpdate, markChecked } = await import('./update.js');
    if (!shouldAutoCheck()) return;
    markChecked();
    const newer = await checkForUpdate(VERSION);
    if (newer) {
      process.stderr.write(
        `\x1b[2m  update available: v${VERSION} \u2192 v${newer} (run claude-stealth --update)\x1b[0m\n`,
      );
    }
  } catch {}
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
