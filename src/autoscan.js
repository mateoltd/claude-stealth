import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { scanWorkspace } from './scanner.js';

export async function claudeScan(claudePath, onStatus) {
  const findingsFile = join(
    tmpdir(),
    `stealth-findings-${randomBytes(4).toString('hex')}.md`,
  );

  try {
    // Gather heuristic hints first (fast, local)
    let hints = '';
    try {
      const heuristics = scanWorkspace(process.cwd());
      if (heuristics.length) {
        hints = heuristics.map((h) => `- ${h.term} (${h.hint})`).join('\n');
      }
    } catch {}

    // Pass 1: Claude scans the workspace (read-only intent)
    onStatus('start-scan');
    const findings = await runClaude(
      claudePath,
      buildScanPrompt(hints),
      true,
    );
    writeFileSync(findingsFile, findings);
    onStatus('scan-done');

    // Pass 2: Claude produces structured config from findings
    onStatus('start-apply');
    const configJson = await runClaude(
      claudePath,
      buildApplyPrompt(findingsFile),
      true,
    );
    onStatus('apply-done');

    return parseConfig(configJson);
  } finally {
    try {
      unlinkSync(findingsFile);
    } catch {}
  }
}

function runClaude(claudePath, prompt, skipPerms = false) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--verbose'];
    if (skipPerms) args.push('--dangerously-skip-permissions');

    const child = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 200)}`));
      } else {
        resolve(stdout.trim());
      }
    });
    child.on('error', reject);
  });
}

function buildScanPrompt(hints) {
  const lines = [
    'You are scanning this workspace to identify sensitive or private terms that should never appear in public commits, PR descriptions, or code comments.',
    '',
    'Thoroughly examine the workspace:',
    '- Git remotes (extract organization/company names from GitHub/GitLab/Bitbucket URLs)',
    '- package.json files (private npm scopes like @company/pkg, internal package names)',
    '- .env and .env.* files (internal domains like *.internal, *.corp, *.local, API keys variable names that reveal org names)',
    '- Git log (private email domains from commit authors)',
    '- Directory structure and project names that reveal internal codenames',
    '- README, CI configs, docker-compose, and other config files for internal references',
    '- Any file that reveals company names, org names, internal project codenames, or private infrastructure',
    '',
    'DO NOT modify, create, or delete any files. Only read and analyze.',
    '',
  ];

  if (hints) {
    lines.push(
      'Here are some initial signals detected by a heuristic pre-scan. Use these as starting points but do your own thorough investigation:',
      hints,
      '',
    );
  }

  lines.push(
    'Write a detailed markdown report of your findings. For each term, explain briefly why it appears sensitive. Group findings by category (organizations, domains, project names, version patterns, etc).',
  );

  return lines.join('\n');
}

function buildApplyPrompt(findingsPath) {
  return [
    `Read the file at ${findingsPath} which contains a workspace scan report identifying sensitive terms.`,
    '',
    'Based on those findings, output ONLY a valid JSON object (no markdown fences, no explanation before or after) with this exact structure:',
    '',
    '{"terms":["term1","term2"],"versionPatterns":["pattern1"],"notes":[],"skipPermissions":true}',
    '',
    'Field rules:',
    '- "terms": array of sensitive strings found in the scan (org names, internal domains, project codenames, private identifiers). Each must be at least 2 characters.',
    '- "versionPatterns": array of glob patterns for internal version formats found (e.g. "v*-internal"), or empty array if none found.',
    '- "notes": always an empty array.',
    '- "skipPermissions": always true.',
    '- Only include genuinely private/sensitive terms. Skip generic words (main, dev, test, src, lib, build, dist, etc).',
    '- Output ONLY the raw JSON object. No markdown, no explanation.',
  ].join('\n');
}

function parseConfig(raw) {
  let json = raw.trim();

  // Strip markdown code fences if Claude wrapped it anyway
  const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) json = fenceMatch[1].trim();

  // Extract JSON object
  const objMatch = json.match(/\{[\s\S]*\}/);
  if (objMatch) json = objMatch[0];

  try {
    const parsed = JSON.parse(json);
    return {
      terms: Array.isArray(parsed.terms)
        ? parsed.terms.filter((t) => typeof t === 'string' && t.length >= 2)
        : [],
      versionPatterns: Array.isArray(parsed.versionPatterns)
        ? parsed.versionPatterns.filter((t) => typeof t === 'string')
        : [],
      notes: [],
      skipPermissions: true,
    };
  } catch {
    // Fallback: try to extract terms line by line from raw output
    const terms = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^[-*]\s+`?([^`\n]{2,50}?)`?\s*[-\u2013\u2014:(]/);
      if (m) terms.push(m[1].trim());
    }
    return { terms, versionPatterns: [], notes: [], skipPermissions: true };
  }
}
