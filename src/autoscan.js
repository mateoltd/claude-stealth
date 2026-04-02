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
    'You are scanning this workspace to find TRULY PRIVATE information that should be hidden from commits and PRs.',
    '',
    'Look for:',
    '- Internal domains (*.internal, *.corp, *.local, *.private, private VPN hostnames)',
    '- Secret project codenames that are not publicly visible anywhere',
    '- Private infrastructure names (internal service names, private API hostnames)',
    '- Internal tool names, private Slack channels, or internal team names referenced in code',
    '- Private npm scopes that are not published to the public registry',
    '- Credentials, API keys, or tokens that reveal organization identity',
    '',
    'DO NOT flag any of the following — these are PUBLIC and not sensitive:',
    '- GitHub/GitLab/Bitbucket usernames or organization names (publicly visible)',
    '- Public repository names (visible on GitHub)',
    '- Author names or emails from git log (publicly visible in commits)',
    '- Emails ending in @users.noreply.github.com',
    '- Open-source package names or well-known library names',
    '- The name of the current project/repo itself',
    '- Anything already publicly accessible on the internet',
    '',
    'DO NOT modify, create, or delete any files. Only read and analyze.',
    '',
    'If you find NOTHING truly private, that is a valid result — say so clearly.',
    '',
  ];

  if (hints) {
    lines.push(
      'A heuristic pre-scan flagged these, but many may be false positives. Evaluate each critically:',
      hints,
      '',
    );
  }

  lines.push(
    'Write a markdown report. For each term, explain why it is genuinely private (not just "found in git remote"). If nothing is truly private, say "No sensitive terms found."',
  );

  return lines.join('\n');
}

function buildApplyPrompt(findingsPath) {
  return [
    `Read the file at ${findingsPath} which contains a workspace scan report.`,
    '',
    'Based on those findings, output ONLY a valid JSON object (no markdown fences, no explanation) with this structure:',
    '',
    '{"terms":["term1","term2"],"versionPatterns":["pattern1"],"notes":[],"skipPermissions":true}',
    '',
    'Rules:',
    '- "terms": ONLY genuinely private/internal terms (internal domains, secret codenames, private infrastructure). Each must be 2+ characters.',
    '- Do NOT include: public GitHub usernames, public repo names, author names/emails, noreply emails, open-source package names.',
    '- If the report says nothing sensitive was found, output: {"terms":[],"versionPatterns":[],"notes":[],"skipPermissions":true}',
    '- "versionPatterns": internal version glob patterns, or empty array.',
    '- "notes": always empty array. "skipPermissions": always true.',
    '- Output ONLY the raw JSON. No markdown, no explanation.',
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
