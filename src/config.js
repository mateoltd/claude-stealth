import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'claude-stealth',
);
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const LEGACY_CONFIG = join(CONFIG_DIR, 'config');

export function getConfigDir() {
  return CONFIG_DIR;
}

export function getConfigPath() {
  return CONFIG_FILE;
}

export function defaultConfig() {
  return { terms: [], versionPatterns: [], skipPermissions: true };
}

export function loadConfig() {
  if (!existsSync(CONFIG_FILE) && existsSync(LEGACY_CONFIG)) {
    return migrateLegacy();
  }
  if (!existsSync(CONFIG_FILE)) return defaultConfig();
  try {
    return { ...defaultConfig(), ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

function migrateLegacy() {
  const content = readFileSync(LEGACY_CONFIG, 'utf8');
  const config = defaultConfig();

  const m = content.match(/STEALTH_NEVER_MENTION="([^"]*)"/);
  if (m?.[1]) config.terms = m[1].split(',').map((t) => t.trim()).filter(Boolean);

  const p = content.match(/STEALTH_VERSION_PATTERNS="([^"]*)"/);
  if (p?.[1]) config.versionPatterns = p[1].split(',').map((t) => t.trim()).filter(Boolean);

  const s = content.match(/STEALTH_SKIP_PERMISSIONS="([^"]*)"/);
  if (s?.[1]) config.skipPermissions = s[1] !== 'false';

  saveConfig(config);
  try { unlinkSync(LEGACY_CONFIG); } catch {}
  return config;
}
