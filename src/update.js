import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getConfigDir } from './config.js';

const RAW_BASE =
  'https://raw.githubusercontent.com/mateoltd/claude-stealth/main';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function lastCheckFile() {
  return join(getConfigDir(), '.last-update-check');
}

export async function checkForUpdate(currentVersion) {
  try {
    const res = await fetch(`${RAW_BASE}/package.json`);
    if (!res.ok) return null;
    const pkg = await res.json();
    return isNewer(pkg.version, currentVersion) ? pkg.version : null;
  } catch {
    return null;
  }
}

export function shouldAutoCheck() {
  try {
    const f = lastCheckFile();
    if (!existsSync(f)) return true;
    const last = parseInt(readFileSync(f, 'utf8'), 10);
    return Date.now() - last > CHECK_INTERVAL;
  } catch {
    return true;
  }
}

export function markChecked() {
  try {
    mkdirSync(getConfigDir(), { recursive: true });
    writeFileSync(lastCheckFile(), String(Date.now()));
  } catch {}
}

export async function runUpdate() {
  const res = await fetch(`${RAW_BASE}/install.sh`);
  if (!res.ok) throw new Error(`Failed to download installer (HTTP ${res.status})`);
  const script = await res.text();

  const tmp = join(tmpdir(), `claude-stealth-update-${Date.now()}.sh`);
  writeFileSync(tmp, script, { mode: 0o755 });

  try {
    execSync(`sh "${tmp}"`, { stdio: 'inherit' });
  } finally {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmp);
    } catch {}
  }
}

function isNewer(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}
