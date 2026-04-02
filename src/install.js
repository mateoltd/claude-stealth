import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { getConfigDir } from './config.js';

export function findClaude() {
  const cmd =
    process.platform === 'win32'
      ? 'where claude 2>nul'
      : 'which claude 2>/dev/null';
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    for (const line of out.split('\n')) {
      const p = line.trim();
      if (p && !p.includes('claude-stealth')) return p;
    }
  } catch {}

  const paths =
    process.platform === 'win32'
      ? [join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
      : [
          join(homedir(), '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
          '/usr/bin/claude',
        ];
  return paths.find(existsSync) || null;
}

export function installAlias() {
  if (process.platform === 'win32') return installAliasWindows();

  const home = homedir();
  const marker = '# claude-stealth';
  const alias = "alias claude='claude-stealth'";
  const block = `\n${marker}\n${alias}\n`;

  const rcFiles = ['.bashrc', '.zshrc', '.bash_profile', '.profile']
    .map((f) => join(home, f))
    .filter(existsSync);

  let installed = false;
  for (const rc of rcFiles) {
    const content = readFileSync(rc, 'utf8');
    if (content.includes('claude-stealth')) continue;
    appendFileSync(rc, block);
    installed = true;
  }
  return installed;
}

function installAliasWindows() {
  const psProfile = join(
    homedir(),
    'Documents',
    'PowerShell',
    'Microsoft.PowerShell_profile.ps1',
  );
  try {
    const content = existsSync(psProfile)
      ? readFileSync(psProfile, 'utf8')
      : '';
    if (!content.includes('claude-stealth')) {
      appendFileSync(
        psProfile,
        '\n# claude-stealth\nSet-Alias claude claude-stealth\n',
      );
    }
  } catch {}
  return true;
}

export function removeAlias() {
  if (process.platform === 'win32') return;
  const home = homedir();
  for (const f of ['.bashrc', '.zshrc', '.bash_profile', '.profile']) {
    const rc = join(home, f);
    if (!existsSync(rc)) continue;
    const content = readFileSync(rc, 'utf8');
    const cleaned = content.replace(
      /\n?# claude-stealth\nalias claude='claude-stealth'\n?/g,
      '',
    );
    if (cleaned !== content) writeFileSync(rc, cleaned);
  }
}

export async function uninstall() {
  const p = await import('@clack/prompts');
  const pc = (await import('picocolors')).default;

  p.intro(pc.bgRed(pc.white(pc.bold(' claude-stealth uninstall '))));

  const ok = await p.confirm({
    message: 'Remove claude-stealth and all configuration?',
  });
  if (!ok || p.isCancel(ok)) {
    p.cancel('Cancelled.');
    return;
  }

  removeAlias();
  p.log.success('Shell aliases removed.');

  const configDir = getConfigDir();
  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true, force: true });
    p.log.success('Configuration removed.');
  }

  p.note('rm -rf ~/.local/share/claude-stealth ~/.local/bin/claude-stealth', 'To complete removal');
  p.outro('Done.');
}
