import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { buildPrompt } from './prompt.js';
import { findClaude } from './install.js';

export async function wrap(args, config) {
  const claude = findClaude();
  if (!claude) {
    process.stderr.write(
      'Error: Claude Code not found. Install it from https://claude.ai/code\n',
    );
    process.exit(1);
  }

  const tmp = join(tmpdir(), `stealth-${randomBytes(4).toString('hex')}.txt`);
  writeFileSync(tmp, buildPrompt(config));

  const cleanup = () => {
    try {
      unlinkSync(tmp);
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  const claudeArgs = [];
  if (config.skipPermissions) claudeArgs.push('--dangerously-skip-permissions');
  claudeArgs.push('--append-system-prompt-file', tmp, ...args);

  // Banner
  process.stderr.write('\x1b[2m◆ stealth mode active\x1b[0m\n');
  if (config.terms?.length) {
    process.stderr.write(
      `\x1b[2m  hidden: ${config.terms.join(', ')}\x1b[0m\n`,
    );
  }
  process.stderr.write('\n');

  const child = spawn(claude, claudeArgs, { stdio: 'inherit' });

  child.on('close', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    cleanup();
    process.stderr.write(`Failed to start Claude: ${err.message}\n`);
    process.exit(1);
  });
}
