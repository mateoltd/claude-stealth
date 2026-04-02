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

const INSTALL_DIR = join(homedir(), '.local', 'share', 'claude-stealth');
const BIN_PATH = join(homedir(), '.local', 'bin', 'claude-stealth');

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
  const patterns = [
    // From install.js
    /\n?# claude-stealth\nalias claude='claude-stealth'\n?/g,
    // From install.sh (includes PATH export)
    /\n?# claude-stealth\nexport PATH="\$HOME\/\.local\/bin:\$PATH"\nalias claude='claude-stealth'\n?/g,
  ];
  for (const f of ['.bashrc', '.zshrc', '.bash_profile', '.profile']) {
    const rc = join(home, f);
    if (!existsSync(rc)) continue;
    let content = readFileSync(rc, 'utf8');
    for (const pat of patterns) {
      content = content.replace(pat, '');
    }
    writeFileSync(rc, content);
  }
}

export async function uninstall() {
  const p = await import('@clack/prompts');
  const pc = (await import('picocolors')).default;

  p.intro(pc.bgRed(pc.white(pc.bold(' claude-stealth uninstall '))));

  const configDir = getConfigDir();
  const items = [];
  if (existsSync(configDir)) items.push(`Configuration at ${pc.dim(configDir)}`);
  if (existsSync(INSTALL_DIR)) items.push(`Program files at ${pc.dim(INSTALL_DIR)}`);
  if (existsSync(BIN_PATH)) items.push(`Binary at ${pc.dim(BIN_PATH)}`);
  items.push('Shell aliases from rc files');

  p.note(items.join('\n'), 'The following will be removed');

  const ok = await p.confirm({
    message: 'Proceed with uninstall?',
  });
  if (!ok || p.isCancel(ok)) {
    p.cancel('Cancelled.');
    return;
  }

  // Remove shell aliases
  removeAlias();
  p.log.success('Shell aliases removed.');

  // Remove configuration
  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true, force: true });
    p.log.success('Configuration removed.');
  }

  // Remove binary
  if (existsSync(BIN_PATH)) {
    try {
      rmSync(BIN_PATH);
      p.log.success('Binary removed.');
    } catch {
      p.log.warn(`Could not remove ${BIN_PATH} \u2014 remove it manually.`);
    }
  }

  // Remove install directory
  if (existsSync(INSTALL_DIR)) {
    try {
      rmSync(INSTALL_DIR, { recursive: true, force: true });
      p.log.success('Program files removed.');
    } catch {
      p.log.warn(`Could not remove ${INSTALL_DIR} \u2014 remove it manually.`);
    }
  }

  p.outro('Uninstall complete. Reload your shell to remove the alias.');
}
