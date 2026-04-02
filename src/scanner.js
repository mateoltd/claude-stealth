import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';

export function scanWorkspace(scanPath) {
  const results = [];
  const seen = new Set();

  const add = (term, source, hint) => {
    const key = term.toLowerCase();
    if (seen.has(key) || isGeneric(key) || term.length < 2) return;
    seen.add(key);
    results.push({ term, source, hint });
  };

  scanGitRemotes(scanPath, add);
  scanVCSTree(scanPath, add);
  scanPackageJson(scanPath, add);
  scanEnvFiles(scanPath, add);
  scanGitAuthors(scanPath, add);

  return results;
}

export function findVCSRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 4; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    if (looksLikeVCSRoot(parent)) return parent;
    dir = parent;
  }
  return null;
}

function looksLikeVCSRoot(dir) {
  try {
    const entries = readdirSync(dir).filter((e) => {
      try {
        return statSync(join(dir, e)).isDirectory() && !e.startsWith('.');
      } catch {
        return false;
      }
    });
    let repoCount = 0;
    for (const e of entries) {
      const sub = join(dir, e);
      if (existsSync(join(sub, '.git'))) {
        repoCount++;
        continue;
      }
      try {
        const inner = readdirSync(sub);
        if (inner.some((s) => existsSync(join(sub, s, '.git')))) repoCount++;
      } catch {}
    }
    return repoCount >= 2;
  } catch {
    return false;
  }
}

function scanGitRemotes(dir, add) {
  try {
    const out = execSync('git remote -v', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of out.split('\n')) {
      const match = line.match(
        /(?:github|gitlab|bitbucket|codeberg)[^/:]*[/:]([^/\s]+)/i,
      );
      if (match?.[1]) {
        const org = match[1].replace(/\.git$/, '');
        add(org, 'git remote', `Organization from ${basename(dir)}`);
      }
    }
  } catch {}
}

function scanVCSTree(startDir, add) {
  const root = findVCSRoot(startDir);
  if (!root) return;

  try {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      try {
        if (!statSync(full).isDirectory() || entry.startsWith('.')) continue;
      } catch {
        continue;
      }

      if (existsSync(join(full, '.git'))) {
        scanGitRemotes(full, add);
        continue;
      }

      try {
        const inner = readdirSync(full);
        const hasRepos = inner.some((s) => existsSync(join(full, s, '.git')));
        if (hasRepos) {
          add(entry, 'workspace', `Organization folder in ${basename(root)}`);
          for (const repo of inner) {
            if (existsSync(join(full, repo, '.git'))) {
              scanGitRemotes(join(full, repo), add);
            }
          }
        }
      } catch {}
    }
  } catch {}
}

function scanPackageJson(dir, add) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name?.startsWith('@')) {
      const scope = pkg.name.split('/')[0].slice(1);
      if (!isPublicScope(scope)) add(scope, 'package.json', 'npm scope');
    }
    for (const deps of [pkg.dependencies, pkg.devDependencies].filter(Boolean)) {
      for (const name of Object.keys(deps)) {
        if (name.startsWith('@')) {
          const scope = name.split('/')[0].slice(1);
          if (!isPublicScope(scope))
            add(scope, 'package.json', `npm scope from ${name}`);
        }
      }
    }
  } catch {}
}

function scanEnvFiles(dir, add) {
  try {
    for (const file of readdirSync(dir).filter((f) => f.startsWith('.env'))) {
      try {
        const content = readFileSync(join(dir, file), 'utf8');
        const domains =
          content.match(
            /[\w-]+\.(?:internal|local|corp|private)(?:\.[\w.-]+)*/g,
          ) || [];
        for (const d of domains)
          add(d, 'env file', `Internal domain from ${file}`);
      } catch {}
    }
  } catch {}
}

function scanGitAuthors(dir, add) {
  try {
    const out = execSync('git log --format=%ae -50', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const domains = [
      ...new Set(
        out
          .trim()
          .split('\n')
          .map((e) => e.split('@')[1])
          .filter(Boolean),
      ),
    ];
    for (const d of domains) {
      if (!isPublicEmail(d)) add(d, 'git log', 'Author email domain');
    }
  } catch {}
}

const GENERIC = new Set([
  'main', 'master', 'dev', 'test', 'prod', 'staging', 'origin', 'upstream',
  'src', 'lib', 'app', 'bin', 'dist', 'build', 'docs', 'tmp', 'temp',
  'node_modules', 'vendor',
]);

const PUBLIC_SCOPES = new Set([
  'types', 'babel', 'rollup', 'eslint', 'typescript', 'vitejs', 'vue',
  'angular', 'react', 'svelte', 'emotion', 'mui', 'chakra-ui', 'radix-ui',
  'tanstack', 'trpc', 'prisma', 'nestjs', 'nuxt', 'vercel', 'supabase',
  'firebase', 'aws-sdk', 'azure', 'google-cloud', 'octokit', 'anthropic-ai',
  'openai', 'langchain', 'clack', 'isaacs', 'npmcli', 'nodelib',
  'sindresorhus', 'alloc', 'jridgewell', 'esbuild', 'swc', 'napi-rs',
  'parcel', 'csstools', 'fontsource', 'floating-ui', 'headlessui',
  'heroicons', 'tabler', 'mdi', 'iconify', 'changesets',
]);

const PUBLIC_EMAILS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  'proton.me', 'protonmail.com', 'users.noreply.github.com', 'github.com',
  'live.com', 'me.com', 'mail.com', 'aol.com', 'pm.me', 'hey.com',
  'fastmail.com', 'tutanota.com',
]);

function isGeneric(t) {
  return GENERIC.has(t);
}
function isPublicScope(s) {
  return PUBLIC_SCOPES.has(s);
}
function isPublicEmail(d) {
  return PUBLIC_EMAILS.has(d);
}
